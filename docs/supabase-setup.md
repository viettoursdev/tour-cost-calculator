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
