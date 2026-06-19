# Supabase Local Development Setup

Local workflow for the Supabase migration of the tour-cost-calculator project.

## Prerequisites

- **Docker Desktop** — must be running before any `supabase` command.
- **Node.js** (v18+) — Supabase CLI is invoked via `npx supabase`.
- No global install required; `npx supabase@latest` or `npx supabase` both resolve the pinned CLI version.

## Starting the local stack

```bash
npx supabase start
```

On first run this pulls Docker images (several minutes). Subsequent runs skip already-present images and take ~10–20 seconds.

On success, the CLI prints local URLs — note the Studio URL:

```
Studio  │ http://127.0.0.1:54323
DB URL  │ postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

## Stopping the local stack

```bash
npx supabase stop
```

Add `--no-backup` to skip saving the DB state (faster).

## Applying migrations

Migrations live in `supabase/migrations/`. Files are applied in lexicographic order.

To wipe the local DB and replay all migrations from scratch:

```bash
npx supabase db reset
```

This also runs `supabase/seed.sql` if it exists.

## Running tests

Tests live in `supabase/tests/`. Each file is a pgTAP test script.

```bash
npx supabase test db
```

This connects to the running local DB (started via `supabase start`) and runs all `*.sql` files in `supabase/tests/` through `pg_prove`.

Full cycle (reset then test):

```bash
npx supabase db reset && npx supabase test db
```

## Migration conventions

- **One table family per migration.** Each logical domain (e.g., `users`, `quotes`, `suppliers`) gets its own numbered migration file.
- Files are named `NNNN_descriptive_name.sql` (zero-padded 4-digit prefix).
- `0000_extensions_and_helpers.sql` — always runs first; installs `pgcrypto` and `pgtap`, and defines `public.is_viettours_user()`.

## RLS predicate helper

Every RLS policy in this project reuses:

```sql
public.is_viettours_user()
```

Defined in `0000_extensions_and_helpers.sql`:

```sql
create or replace function public.is_viettours_user()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'email') ilike '%@viettours.com.vn', false);
$$;
```

Use it in policies as:

```sql
using ( public.is_viettours_user() )
```

## Supabase Studio

Once the local stack is running, open http://127.0.0.1:54323 in a browser to inspect tables, run SQL, and view Auth/Storage.

---

## Cloud project provisioning

These are one-time steps before production cutover. Complete them before Phase 5 (worker JWT) or Phase 7 (cutover).

### 1. Create the project

1. Go to https://supabase.com/dashboard and click **New project**.
2. Choose the **Singapore (ap-southeast-1)** region — closest to Viettours users.
3. Save the generated database password securely (you will need it for `supabase link`).

### 2. Enable asymmetric (ES256) JWT signing

Supabase defaults to HS256 (symmetric). The Phase 5 Cloudflare Worker needs to verify JWTs without the shared secret, so asymmetric signing must be enabled before any users sign in.

1. In the dashboard, go to **Authentication → Configuration → JWT settings**.
2. Under **JWT signing algorithm**, select **ES256 (asymmetric)**.
3. Save changes. Supabase generates an RSA/EC key pair automatically.
4. Copy the **JWKS URL** — it is:
   ```
   https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
   ```
   Record this URL in the Phase 5 worker config. The worker will fetch this endpoint to validate incoming JWTs without holding any secret.

> **Do this before the first user signs in.** Changing the signing algorithm after users exist invalidates all existing sessions.

### 3. Restrict sign-ups to the company domain

1. In the dashboard, go to **Authentication → Configuration → Auth Providers → Email**.
2. In the **Allowed email domains** field, enter `viettours.com.vn`.
3. Save. Sign-up attempts from any other domain will be rejected at the Auth layer.

### 4. Link the local project and push migrations

```bash
# One-time: link this repo to the cloud project (prompts for project-ref and DB password)
npx supabase link --project-ref <project-ref>

# Push all local migrations to the cloud DB
npx supabase db push --linked
```

`supabase db push --linked` applies every migration in `supabase/migrations/` that has not yet been applied to the linked project, in order.

### First-deploy verification

Run these checks immediately after the first `db push --linked`, before any users sign in.

#### Bootstrap CEO GUC

Migration `0001_profiles_and_provisioning.sql` sets `app.bootstrap_ceo_email` via `ALTER DATABASE SET`. In the cloud this runs under `supabase_admin` (a superuser), so it should succeed. Locally it intentionally no-ops (printed as a NOTICE during `db reset`).

After `db push`, verify the GUC was applied on the cloud DB. Use the Supabase SQL editor or any psql connection:

```sql
SHOW app.bootstrap_ceo_email;
-- or
SELECT current_setting('app.bootstrap_ceo_email', true);
```

If the result is empty, the first sign-in by the bootstrap CEO email will provision them as `Standard` instead of `CEO`. Fix by running the `ALTER DATABASE` statement manually on the cloud DB before that user signs in:

```sql
ALTER DATABASE postgres SET app.bootstrap_ceo_email = 'ceo@viettours.com.vn';
```

Then reload the configuration:

```sql
SELECT pg_reload_conf();
```

#### GUC connection-pool lag

`ALTER DATABASE ... SET` only takes effect for **new** connections. Connection poolers (PgBouncer, Supavisor) may have long-lived connections that do not pick up the new GUC immediately. The first sign-in attempt immediately after `db push` could hit a pre-existing pooled connection and see the empty GUC value.

Mitigation: wait 30–60 seconds after `db push` before the bootstrap CEO signs in for the first time, or bounce the pooler if the dashboard provides that option.

#### Payment-domain RLS hardening (deferred, recommended for Phase 2+)

Phase 0 uses parity-only RLS (auth + domain check) by design, matching today's Firestore model. The payment-approval tables (`payment_approvals`, `payment_approval_stages`, `payment_records`, `tour_payments`) therefore do **not** enforce approver identity, stage ordering, or status-tamper protection at the database layer — those invariants remain in the application layer.

A future hardening pass should consider:

- A `SECURITY DEFINER record_approval_stage()` RPC that checks the caller is the intended approver and enforces stage-1-before-stage-2 ordering.
- Column-level write restrictions on `final_status` and approver identity fields.
- A `created_by` ownership column on `payment_records`.
- Server-set `updated_at` / `updated_by` triggers on `tour_payments` to prevent client-side timestamp tampering.

---

## Phase 1 gateway: done; Phase 2: quotes

**Status (2026-06-18):** All 51 Phase-1 `sb*` gateway functions are implemented in `src/lib/supabase.ts` and verified by `tests/supabase/parity.test.ts`. Stores are **NOT** yet wired to Supabase — that is Phase 4.

### Migrations to push to prod cloud project

Migrations `0017` through `0020` have been added during Phase 1 and must be pushed to the production cloud project before cutover:

```bash
npx supabase db push --linked
```

### Phase-2 deferred: quote machinery

The following functions are deferred to Phase 2. They cover the quote save/load/subscribe lifecycle, DMC variants, and supporting indices:

**Regular quotes:**
- `sbSaveQuote` — save quote metadata + state (replaces `fbSaveQuote`)
- `sbSaveQuoteState` — upsert a versioned quote state document
- `sbGetQuoteProject` — fetch a single quote project by id
- `sbSubscribeQuoteHistory` — realtime quote history index subscription
- `sbDeleteQuote` — delete quote + all versions
- `sbUpdateCollaborators` — update the collaborator list on a quote
- `sbSetQuoteEntryLink` — set/clear a quote's entry link
- `sbSetLinkedDMCLink` — link a regular quote to a DMC quote
- `sbSetQuoteStatus` — update quote status field
- `sbBackfillWorkflowIndex` — one-time backfill for workflow index column
- `sbSetQuotePaymentSummary` — write payment summary onto quote metadata
- `sbBackfillPaymentIndex` — one-time backfill for payment index column
- `generateQuoteCode` — generate a deterministic quote code

**DMC quotes:**
- `sbSaveDMCQuote` — save DMC quote metadata + state
- `sbSaveDMCQuoteState` — upsert a versioned DMC quote state document
- `sbGetDMCQuoteProject` — fetch a single DMC quote project by id
- `sbSubscribeDMCQuoteHistory` — realtime DMC quote history subscription
- `sbDeleteDMCQuote` — delete DMC quote + all versions
- `sbUpdateDMCCollaborators` — update collaborator list on a DMC quote
- `sbSetDMCQuoteEntryLink` — set/clear a DMC quote's entry link
- `sbSetLinkedRegularLink` — link a DMC quote back to a regular quote
- `sbSetDMCQuoteStatus` — update DMC quote status field

### Phase 4: store wiring

No Zustand store has been modified. Each store currently imports from `src/lib/firebase.ts`. Phase 4 will update import lines to use the `sb*` equivalents from `src/lib/supabase.ts`, one store at a time, with feature-flag gating.

---

## Phase 2 (quotes) — done; gateway surface COMPLETE

**Status (2026-06-19):** All Phase-2 quote functions are implemented and the parity test is green. The gateway now covers every entity: users, fx-rates, POIs, audit-log, customers, NCC products, NCC master, contracts, rate-card, visa-products, visa-procs, visa-projects, itineraries, restaurants, menus, notifications, notif-threads, tour-payments, payment-approvals, **and quotes (regular + DMC)**.

### Quote gateway surface (20 functions + 1 utility)

| Function | Description |
|---|---|
| `generateQuoteCode` | Deterministic code generator (`NĐ/NN/DMC.seq.dd.mm.yy`) |
| `sbSaveQuote` | Upsert regular quote metadata index row |
| `sbSaveDMCQuote` | Upsert DMC quote metadata index row |
| `sbSubscribeQuoteHistory` | Realtime subscription to regular quote index |
| `sbSubscribeDMCQuoteHistory` | Realtime subscription to DMC quote index |
| `sbSaveQuoteState` | Atomic upsert of a versioned regular-quote state via `save_quote_state` RPC |
| `sbSaveDMCQuoteState` | Atomic upsert of a versioned DMC-quote state via `save_quote_state` RPC |
| `sbGetQuoteProject` | Fetch one regular-quote project by cloud_id |
| `sbGetDMCQuoteProject` | Fetch one DMC-quote project by cloud_id |
| `sbDeleteQuote` | Delete regular quote + all its version rows |
| `sbDeleteDMCQuote` | Delete DMC quote + all its version rows |
| `sbUpdateCollaborators` | Update collaborator array on regular quote |
| `sbUpdateDMCCollaborators` | Update collaborator array on DMC quote |
| `sbSetRegularEntryLink` | Set/clear entry-link on regular quote (cross-links to DMC) |
| `sbSetDMCEntryLink` | Set/clear entry-link on DMC quote (cross-links to regular) |
| `sbSetQuoteStatus` | Update `status` column on regular quote |
| `sbSetDMCQuoteStatus` | Update `status` column on DMC quote |
| `sbBackfillWorkflowIndex` | One-time backfill: writes `workflow_last_updated` from stored state |
| `sbSetQuotePaymentSummary` | Write `total_paid`/`total_cost`/`payment_status` onto quote metadata |
| `sbBackfillPaymentIndex` | One-time backfill: propagates payment summary from stored state |

### Key design notes

- **Atomic save via RPC.** `sbSaveQuoteState` / `sbSaveDMCQuoteState` call the `save_quote_state` Postgres function (migration 0021) which upserts both the `quote_projects` row and updates the `quotes` index in one transaction. This eliminates the partial-write race that existed in the Firestore dual-write pattern.
- **Version cap ≤ 20 retained.** The `save_quote_state` RPC enforces `MAX_VERSIONS = 20`, deleting the oldest excess versions automatically. The Firestore ≤ 500-history cap and ≤ 1 MB document limit are **not applicable** in Postgres — these constraints are dropped.
- **Firestore caps dropped:** The Firestore ≤ 500 quote-history-entries limit and the 1 MB single-document cap do not apply to the Supabase schema. Row count and document size are unbounded within normal Postgres limits.

### Prod-push migrations (Phase 2 complete set)

| Migration | Description |
|---|---|
| 0017 | RLS grants for Phase-1 tables |
| 0018 | `pois.legacy_id` column |
| 0019 | `created_by_username` on visa-procs / visa-projects |
| 0020 | Realtime notification tables |
| 0021 | `save_quote_state` RPC + `loss_reason` / `workflow_due` columns |
| 0022 | `created_by_username` on quote tables |

To apply: `supabase db push` (or `psql -f supabase/migrations/00{17..22}_*.sql` against the production DB).

### What is NOT yet wired (Phase 4)

No Zustand store (`quoteHistoryStore`, `quoteStore`, etc.) has been modified to call the `sb*` functions. All stores still import from `src/lib/firebase.ts`. Phase 4 will swap the import lines one store at a time, behind a feature flag.
