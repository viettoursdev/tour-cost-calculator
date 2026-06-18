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
