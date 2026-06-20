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

---

## Phase 1.5 (drift reconciliation) — complete (2026-06-20)

Phase 1.5 audited every entity for data-loss gaps between the Firestore schema and the Supabase gateway, then closed each one. All gaps identified in the audit (`sdd/phase-1.5-audit.md`) are now resolved.

### Audit gaps closed

| Gap | Resolution |
|---|---|
| **Customer CRM fields** — `source`, `tags`, `interactions[]`, `nextFollowUp` were not persisted to any Supabase table | Migration 0023 adds `source`, `tags`, `next_follow_up`, `interactions` JSONB columns to `customers`; gateway reads/writes them via `sbSubscribeCustomers` / `sbPushCustomers` |
| **Notification fields** — `priority`, `reminderAt`, `attachments[]` were silently dropped | Migration 0024 adds `priority`, `reminder_at`, `attachments` JSONB to `notifications`; gateway round-trips them |
| **Itinerary `startDate`** — not mapped to any column | Migration 0025 adds `start_date DATE` to `itineraries`; `sbSaveItinerary` now persists it |
| **Quote `passengers`** — `PassengerInfo` object was not in the `quotes` index row or the `save_quote_state` RPC | Migration 0026 adds `passengers` JSONB to `quotes` / `dmc_quotes`; the RPC in 0021 was edited to write it in the passengers block; migration 0021 must be re-applied when deploying 0026 |
| **WorkflowStep `attachments[]` + `assignee` UUID** — `workflow_steps.attachments` JSONB column was missing; `assignee` was stored as display name, not UUID | Migration 0027 (chat DDL) does not touch this; addressed inside the Phase-1.5 task-5 migration (0026); gateway serialises `assigneeId` uuid alongside `assignee` display name |
| **Chat feature** — no Supabase tables or gateway functions existed for the in-app chat | Migration 0027 creates `chats`, `chat_messages`, `chat_reactions` tables with RLS; 8 new `sb*` functions implement the full feature (see table below) |

### Chat gateway surface (8 functions — Phase 1.5 Tasks 6–8)

| Function | Firebase twin | Description |
|---|---|---|
| `sbSubscribeChats` | `fbSubscribeChats` | Realtime subscription to all chats visible to a user |
| `sbSubscribeChat` | `fbSubscribeChat` | Realtime subscription to a single chat (messages + reactions) |
| `sbEnsureChat` | `fbEnsureChat` | Upsert chat header row; idempotent |
| `sbSendChatMessage` | `fbSendChatMessage` | Insert a new message into `chat_messages` |
| `sbEditChatMessage` | `fbEditChatMessage` | Update `content` + set `edited_at` on an existing message |
| `sbDeleteChatMessage` | `fbDeleteChatMessage` | Soft-delete a message (`deleted = true`) |
| `sbToggleChatReaction` | `fbToggleChatReaction` | Insert or delete a reaction row in `chat_reactions` |
| `sbMarkChatRead` | `fbMarkChatRead` | Update `last_read_at` for a participant in `chats.participants` JSONB |

### Prod-push migrations (Phase 1.5 additions)

The complete prod-push set is now **0017–0027**. Migrations added in Phase 1.5:

| Migration | Description |
|---|---|
| 0023 | `customers` CRM columns — `source`, `tags`, `next_follow_up`, `interactions` JSONB |
| 0024 | `notifications` fields — `priority`, `reminder_at`, `attachments` JSONB |
| 0025 | `itineraries.start_date DATE` column |
| 0026 | `quotes` / `dmc_quotes` `passengers` JSONB; `workflow_steps.attachments` JSONB + `assignee_id` |
| 0027 | Chat schema — `chats`, `chat_messages`, `chat_reactions` tables + RLS policies |

**Re-apply 0021:** The `save_quote_state` RPC (migration 0021) was edited during Phase 1.5 to include the `passengers` write block. When deploying to production after Phase 1.5, push 0021 again alongside 0026 (or use `supabase db reset` on a fresh environment, which replays all migrations in order).

To apply: `supabase db push` (or `psql -f supabase/migrations/00{23..27}_*.sql` against the production DB; re-push 0021 first).

### Gateway type coverage — Phase 4 wiring is safe

All entity types now have full column coverage in the gateway. No Firestore→Supabase field is silently dropped. Phase 4 (wiring Zustand stores to `sb*` functions instead of `fb*` functions) can proceed without further schema changes.

---

## Phase 3 — Auth

**Status (2026-06-20):** Supabase Auth sign-in path implemented behind a feature flag. Production stays on Firebase until a coordinated cutover.

### `VITE_AUTH_BACKEND` flag

| Value | Behaviour |
|---|---|
| `firebase` (default) | Production magic-link + DEV password via Firebase Auth — unchanged from today |
| `supabase` | Supabase Auth magic-link + DEV password via `sb*` gateway functions (Tasks 1–5) |

Production `.env` and the CI secret stay `firebase`. Set `VITE_AUTH_BACKEND=supabase` only in a dev `.env` while testing against a dev Supabase project. Flip it to `supabase` in production only at the Phase 6 cutover.

### One-time dashboard config (before flipping)

Complete these steps in the Supabase dashboard **before** setting `VITE_AUTH_BACKEND=supabase` in production:

1. **Enable Email provider** — Authentication → Providers → Email → toggle on.
2. **Site URL + Redirect URLs** — Authentication → URL Configuration:
   - Site URL: `https://viettoursdev.github.io/tour-cost-calculator/?mode=auth`
   - Add to Redirect URLs: `https://viettoursdev.github.io/tour-cost-calculator/?mode=auth`
   - The `?mode=auth` suffix marks the auth callback (it is the redirect target Supabase appends `?code=` to). On load, `authStore.init()` → `sbIsSignInLink()` detects the callback by the presence of the `?code=` parameter and `sbCompleteSignInLink()` exchanges it via `exchangeCodeForSession`.
3. **Restrict sign-ups to company domain** — Authentication → Providers → Email → Allowed email domains: `viettours.com.vn`. Sign-up attempts from any other domain are rejected at the Auth layer (matches the three-layer defence: client gate in `authStore`, Auth allowlist here, RLS `is_viettours_user()` predicate).
4. **Email template action URL** — the magic-link email template must use the PKCE redirect URL above as the action link target so the link lands on the app with a `?code=` parameter, not a raw token.

> The ES256 JWT signing algorithm change (step 2 of "Cloud project provisioning") must already be done — it is required by Phase 5 (Worker JWT verification) and must be set before the first user signs in.

### First-login provisioning

When a new user signs in for the first time, the `handle_new_user()` trigger (migration `0001_profiles_and_provisioning.sql`) fires on `auth.users` INSERT and creates a `profiles` row automatically:

- **Role:** reads `app.bootstrap_ceo_email` GUC; if the signing-in email matches, role = `CEO`; otherwise `Standard`.
- **username / name:** set to the email local-part (e.g. `nguyen.van.a` from `nguyen.van.a@viettours.com.vn`).

**Known caveats — tracked for cutover:**

- **(a) Bootstrap-CEO GUC unset in prod.** `supabase db push` runs as `supabase_admin`, which lacks superuser privilege to run `ALTER DATABASE ... SET app.bootstrap_ceo_email`. The GUC will be empty until manually applied. A fresh bootstrap user signs in as `Standard`. Fix before that user signs in using the SQL editor (see "Bootstrap CEO GUC" in the "First-deploy verification" section above).
- **(b) username = email local-part, not historical username.** The trigger derives `username` from the email because no mapping table exists yet. The Phase 6 ETL backfills real usernames into `profiles` before the Supabase path goes live.

### Worker token routing

The Cloudflare Worker currently verifies Firebase JWTs (or passes requests through if no auth header is set). Phase 3 only changed which token the **client** sends — the Worker-side JWT verification swap is **Phase 5** and is not done here. Until Phase 5 ships, a Supabase-issued JWT sent to the Worker behaves the same as today (unauthenticated from the Worker's perspective). This is acceptable for the dev-testing period; do not flip `VITE_AUTH_BACKEND=supabase` in production until Phase 5 is deployed.

### Data layer is still Firestore — the Supabase flag swaps auth ONLY

Phase 3 swaps **authentication only**. Every Zustand store still reads and writes **Firestore** (none import `@/lib/supabase` yet — that is the Phase 4 store cutover). Firestore Rules require a Firebase Auth token (`request.auth != null` + `@viettours.com.vn`). Under `VITE_AUTH_BACKEND=supabase` the user holds a Supabase session but **no Firebase session**, so every Firestore read/write is denied: you can sign in, but data sync, quotes, rate cards, notifications, etc. stay dead until Phase 4.

This is expected, not a bug. Do not expect a working app under the Supabase flag before Phase 4, and do not flip `VITE_AUTH_BACKEND=supabase` in production until both Phase 4 (store wiring) and Phase 5 (Worker JWT) ship. The smoke checklist below verifies the **auth** path in isolation; a blank/error-laden data UI under the flag is the Firestore denial described here, not an auth failure.

### Manual browser smoke checklist

Run these checks with `VITE_AUTH_BACKEND=supabase` against a dev Supabase project (`npm run dev` with a local `.env` override). No automated test covers the browser-side PKCE redirect.

- [ ] **Request magic link** — enter a `@viettours.com.vn` email on the login screen and click send. The app shows the "check your email" prompt.
- [ ] **Email arrives** — open the inbox; confirm the magic-link email was sent by Supabase (not Firebase).
- [ ] **Click the link on the same device** — the link must be opened in the same browser that requested it (PKCE code-verifier is stored in that browser's session storage). The app URL should contain `?code=`.
- [ ] **Session completes** — `authStore.init()` exchanges the `?code=` parameter, `onAuthStateChange` fires, `sbGetProfileById` resolves the `profiles` row, and `currentUser` is set. The main app loads.
- [ ] **Reload keeps the session** — hard-reload the page; the user remains signed in (Supabase persists the session in `localStorage`).
- [ ] **Sign out clears the session** — click sign-out; `currentUser` is null, localStorage Supabase keys are cleared, the login screen appears.
- [ ] **DEV password panel** — in a DEV build (`import.meta.env.DEV = true`), expand the password accordion and sign in with a test user. `sbSignInWithPassword` should authenticate and resolve `currentUser` from `profiles`.

**Cross-device limitation (known, deferred):** PKCE stores the code-verifier in the browser that requested the link. Opening the magic-link email on a different device (e.g. phone → desktop) will fail with an exchange error. This is parity with the existing Firebase behaviour ("different device → re-enter email") and is tracked for a post-cutover UX improvement.

---

## Phase 4 — Store/component wiring + realtime (2026-06-20)

The data layer now follows the **same `VITE_AUTH_BACKEND` flag** as auth. One flag flips both — this closes the Phase-3 gotcha where the Supabase flag swapped auth only and left every Firestore read/write denied.

### The data-gateway selector

`src/lib/dataBackend.ts` is a flag-gated barrel that re-exports all **75 data `fb*` functions** (plus the two pure helpers `generateQuoteCode`/`dmChatId`) under their **same names**, choosing the `sb*` implementation when `VITE_AUTH_BACKEND === 'supabase'` and the `fb*` implementation otherwise (selector mirrors `src/auth/backend.ts`). Each export casts the Supabase side to the Firebase type (`sb.sbX as typeof fb.fbX`), which collapses the conditional to the production signature and **fails typecheck if any `sb*` signature diverges** from its `fb*` twin.

All **37 non-test consumers** (18 stores + 16 components + 3 lib modules: `assistant/tools.ts`, `audit.ts`, `notifications.ts`) import from `@/lib/dataBackend` instead of `@/lib/firebase` — import path only; call sites are unchanged. After Phase 4, no non-test source outside `firebase.ts`/`firebaseBackend.ts` imports the Firestore gateway directly.

### Realtime ships inside the gateway

There is **no separate realtime wiring**. The `sb*` subscribe functions already implement Supabase Realtime (Postgres Changes via `subscribeTable` in `src/lib/supabase/helpers.ts`, built in Phase 1/1.5). Flipping the import activates it; the shredded child tables stay reassembled-on-open exactly as today.

### Test infrastructure

The barrel eagerly re-exports the entire gateway surface at module load, so any test that mocks `@/lib/firebase` must expose every name. `src/test/firebaseStub.ts` was completed to the full surface (added the chat / notif-thread / fx / quote-status / dmc-link functions + `dmChatId`); the one inline firebase mock (`assistant/tools.test.ts`) now spreads the stub. `vitest.config.ts` gained dummy `VITE_FIREBASE_*` defines so `dataBackend.test.ts` can import the real `firebase.ts`. Store/component tests otherwise required **no changes** — with the flag unset (test default) the barrel re-exports the mocked Firebase refs.

### Production stays on Firebase

`VITE_AUTH_BACKEND` is unset in prod, so the barrel selects `fb*` and the app runs on Firestore exactly as before. **Do not flip `VITE_AUTH_BACKEND=supabase` in production** until Phase 5 (Worker JWT) and Phase 6 ETL ship. (See also the Phase-4 hotfix: `src/lib/supabase.ts` no longer throws at module load when Supabase is dormant — it only hard-fails when Supabase is the active backend — because the gateway is imported eagerly at startup.)

### Manual browser smoke (deferred to pre-cutover)

The function-level gateway + realtime are covered by the integration suite (`npm run test:integration`, 116 tests against the local stack). An end-to-end browser smoke under the flag still needs the local Supabase stack + a seeded `@viettours.com.vn` profile + a DEV build:

- [ ] `VITE_AUTH_BACKEND=supabase npm run dev`; sign in via the DEV password panel with a seeded `@viettours.com.vn` user → `currentUser` resolves.
- [ ] A synced list (NCC suppliers / customers) loads from Postgres — previously empty/denied under the flag.
- [ ] Create/edit a record, reload → it persists.
- [ ] **Realtime:** create a supplier in a second tab → it appears in the first without reload.
- [ ] Open a quote, save, reopen → reassembles correctly (`save_quote_state` RPC + `assemble*`/`decompose*`).
- [ ] Flag off (`npm run dev`) → behaves exactly as today on Firebase.

---

## Phase 5 — Cloudflare Worker JWT verification swap (2026-06-20)

The client side was already done in Phase 3: `src/lib/aiWorker.ts:authHeaders()` reads the token via `authBackend.getAccessToken()`, so the Bearer token follows the active auth backend automatically. Phase 5 is **worker-only**.

### What changed in `cloudflare-worker/viettours-ai-worker.js`

A clean **swap** (not a rewrite) of the verification path, per the design spec:

- **Removed** the Firebase path: Google X.509 cert fetch/cache (`CERT_URL`, `getGoogleCerts`) and the DER/SPKI parsing helpers (`pemToDer`, `readTLV`, `tlvContentStart`, `extractSPKI`, `verifyFirebaseToken`). The shared `b64urlBytes`/`jsonFromB64url` helpers stay.
- **Added** `verifySupabaseToken(token, ref)` + `getSupabaseJWKS(ref)`:
  - JWKS from `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` (cached per `cache-control`, default 10 min), keyed by the token header `kid`.
  - Imports the JWK and verifies — **ES256** (EC P-256, Supabase's asymmetric default) or RS256 if the project uses RSA keys (branch on `jwk.kty`). The JWT ES256 signature is raw `r‖s` (IEEE P1363), exactly what Web Crypto ECDSA verify expects — no DER conversion.
  - Claims: `aud === 'authenticated'`, `iss === https://<ref>.supabase.co/auth/v1`, `exp`, and the same `@viettours.com.vn` email-domain check.
- **Env rename:** `FIREBASE_PROJECT_ID` → `SUPABASE_PROJECT_REF`. Same optional gating — **unset = open** (safe rollback). The Worker holds no shared secret.

### Verification done

No CI harness covers the Worker (plain JS, manually deployed). Validated by: `node --check` (syntax) + an offline self-test that mints an ES256 JWT with a generated P-256 key and runs it through the exact verify logic — a valid token is accepted, a tampered signature is rejected, and an out-of-domain email is rejected.

### ⚠️ Do NOT deploy until cutover

Production runs Firebase Auth; this Worker no longer verifies Firebase ID tokens. Deploying it (with `SUPABASE_PROJECT_REF` set) before the frontend cutover would 401 every AI/translate/upload call. Keep the currently-deployed Firebase Worker live until the frontend is on Supabase, then (cutover runbook step 4): enable asymmetric **ES256** signing keys in the Supabase dashboard, paste the new Worker, and set `SUPABASE_PROJECT_REF=zkzrvctqwnhzklvsoahk`. Rollback = delete that variable.
