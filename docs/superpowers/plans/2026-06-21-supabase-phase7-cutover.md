# Supabase Phase 7 — Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the pre-cutover code changes that are safe to ship while production still runs on Firebase, and document the full operator cutover runbook so the live hard-cutover can be executed in one maintenance window.

**Architecture:** Phase 7 is mostly **operational** (dashboard config, prod migration push, real ETL run, Worker redeploy, flag flip, smoke test) — those steps run against production and are captured as a runbook in `docs/supabase-setup.md`, not as code. The only code this session lands is: (1) a new migration `0028` that replaces the broken bootstrap-CEO GUC mechanism with a config-table read so first-login provisioning works on managed Supabase; (2) `deploy.yml` env wiring so the production build can be pointed at Supabase via a single GitHub repo variable; (3) the runbook itself. **Firebase stays fully intact as the read-only fallback** — the destructive cleanup (remove `firebase` dep, `VITE_FIREBASE_*`, retire `backup.yml`) is explicitly deferred to a future **Phase 8** to run only after Supabase is verified stable in production.

**Tech Stack:** Postgres 17 (Supabase cloud `zkzrvctqwnhzklvsoahk`), pgTAP, Supabase CLI, GitHub Actions, Vite.

## Global Constraints

- Production Supabase project ref: **`zkzrvctqwnhzklvsoahk`** ("viettoursdev's Project", Singapore `ap-southeast-1`, Postgres 17).
- Production Firestore source project (ETL source of truth): **`tour-cost-calculator-4336c`**; its service-account key is `prod-sa.json` — **never commit it**.
- **Do NOT edit any already-applied migration** (`0000`–`0027` are live on prod or merged). The bootstrap fix is an **additive** migration `0028`; the stale `ALTER DATABASE` block in `0001` is left as the harmless no-op it already is.
- **No production changes this session** — no dashboard config, no `db push`, no ETL run, no Worker deploy, no flag flip. Those are operator steps in the runbook.
- **Firebase is kept as the read-only fallback.** Do not remove the `firebase` dependency, `VITE_FIREBASE_*` secrets, or `backup.yml` in this phase.
- Lint runs with `--max-warnings 0`; `npm run build` runs `typecheck` first. The full gate must be green before commit: `npm run typecheck`, `npm run lint`, `npm test`, and `npx supabase test db` for the migration.
- Conventional Commits; co-author trailer `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Push to `origin/main` requires the `viettoursdev` gh account with the keychain helper cleared (see runbook "Push gotcha").

---

## Background: the two defects this code-prep closes

1. **Bootstrap-CEO GUC is a no-op on managed Supabase.** Migration `0001` sets `app.bootstrap_ceo_email` via `ALTER DATABASE ... SET`, which requires superuser. `supabase db push` does **not** run as superuser on Supabase cloud, so the statement raises `insufficient_privilege` and is swallowed. `handle_new_user()` then reads `current_setting('app.bootstrap_ceo_email', true)` → `NULL` → the bootstrap CEO would be provisioned as `Standard`. (Low blast radius — the ETL sets every migrated user's real role directly — but the first-login path must be correct and self-contained.)
2. **`deploy.yml` has no Supabase env.** The build step injects only `VITE_FIREBASE_*`. The production bundle cannot be pointed at Supabase, and there is no controlled, revertible switch to flip `VITE_AUTH_BACKEND` at cutover.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `supabase/migrations/0028_app_config_bootstrap_ceo.sql` | `app_config` key/value table seeded with `bootstrap_ceo_email`; `handle_new_user()` rewritten to read it (no GUC). | Create |
| `supabase/tests/0028_app_config_test.sql` | pgTAP: table+seed exist; CEO/Standard provisioning works **without** any `set_config` (proves the prod path). | Create |
| `.github/workflows/deploy.yml` | Inject `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (secrets) + `VITE_AUTH_BACKEND` (repo variable) into the build step. | Modify (lines 36–43) |
| `docs/supabase-setup.md` | Append the `## Phase 7 — Cutover` operator runbook + Phase 8 deferral note. | Modify (append after line 605) |

---

## Task 1: Migration 0028 — config-table bootstrap CEO

**Files:**
- Create: `supabase/migrations/0028_app_config_bootstrap_ceo.sql`
- Test: `supabase/tests/0028_app_config_test.sql`

**Interfaces:**
- Produces: table `public.app_config(key text pk, value text not null)`; seed row `('bootstrap_ceo_email','developer@viettours.com.vn')`; `public.handle_new_user()` trigger function now reads the seed instead of `current_setting('app.bootstrap_ceo_email')`. The `on_auth_user_created` trigger from `0001` is unchanged (it already points at `handle_new_user`, which `CREATE OR REPLACE` updates in place).

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/0028_app_config_test.sql`. The decisive assertion: provisioning yields `CEO` for the seeded email **with no `set_config` call at all** — that is exactly what was impossible under the GUC on cloud.

```sql
begin;
select plan(4);

select has_table('public', 'app_config', 'app_config table exists');
select is(
  (select value from public.app_config where key = 'bootstrap_ceo_email'),
  'developer@viettours.com.vn', 'bootstrap_ceo_email seeded');

-- NO set_config here — the trigger must read the seed from app_config.
-- This is the regression guard for the cloud GUC no-op.
insert into auth.users (id, email, instance_id, aud, role)
values (gen_random_uuid(), 'someone@viettours.com.vn', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
select is(
  (select role from public.profiles where email = 'someone@viettours.com.vn'),
  'Standard', 'non-bootstrap user gets Standard without any GUC');

insert into auth.users (id, email, instance_id, aud, role)
values (gen_random_uuid(), 'developer@viettours.com.vn', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
select is(
  (select role from public.profiles where email = 'developer@viettours.com.vn'),
  'CEO', 'bootstrap email gets CEO from app_config (no GUC)');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `app_config` does not exist; the `someone@`/`developer@` provisioning still depends on the GUC (with no `set_config`, the seeded-CEO assertion fails). Confirms the test exercises the new mechanism.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0028_app_config_bootstrap_ceo.sql`:

```sql
-- App-level config readable by the provisioning trigger (SECURITY DEFINER).
-- Replaces the bootstrap-CEO GUC (`app.bootstrap_ceo_email`) from 0001, which
-- no-ops on managed Supabase because `ALTER DATABASE ... SET` needs superuser
-- and `db push` does not run as one. A row in this table works on any role.
create table public.app_config (
  key   text primary key,
  value text not null
);

alter table public.app_config enable row level security;

-- Company users may read config; no client write policy (service-role /
-- migrations only). The provisioning trigger is SECURITY DEFINER so it reads
-- this table regardless of RLS.
create policy app_config_company_read on public.app_config
  for select using (public.is_viettours_user());

insert into public.app_config (key, value)
  values ('bootstrap_ceo_email', 'developer@viettours.com.vn')
  on conflict (key) do nothing;

-- Re-point the trigger function at app_config. Body is otherwise identical to
-- 0001 (same insert columns, same on conflict do nothing, same search_path).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ceo_email text := (select value from public.app_config where key = 'bootstrap_ceo_email');
begin
  insert into public.profiles (id, email, username, name, role)
  values (
    new.id,
    new.email,
    split_part(new.email, '@', 1),
    split_part(new.email, '@', 1),
    case when new.email = ceo_email then 'CEO' else 'Standard' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase test db`
Expected: PASS — `0028_app_config_test.sql` passes all 4 assertions. `0001_profiles_test.sql` still passes (its `set_config` line is now inert but harmless; the seed drives the branch).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0028_app_config_bootstrap_ceo.sql supabase/tests/0028_app_config_test.sql
git commit -m "feat(supabase): Phase 7 — config-table bootstrap CEO (replace cloud-broken GUC)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: deploy.yml — Supabase build env + flag switch

**Files:**
- Modify: `.github/workflows/deploy.yml:36-43`

**Interfaces:**
- Consumes: GitHub **secrets** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (operator adds before cutover) and GitHub **repo variable** `VITE_AUTH_BACKEND` (unset until cutover).
- Produces: a production build whose backend is selected by `vars.VITE_AUTH_BACKEND`. Unset/blank → the `src/auth/backend.ts` + `src/lib/dataBackend.ts` selectors treat any value ≠ `'supabase'` as firebase, so prod keeps running on Firebase until the variable is set to `supabase`.

**Why a repo *variable* for the flag (not a code edit):** the cutover flip and any rollback become a one-click GitHub Settings change + re-run of Deploy — no commit, no PR, instantly revertible. That matches the "hard cutover, Firebase as fallback" posture: set `VITE_AUTH_BACKEND=supabase` to go live, blank it to fall back.

**Why inject the Supabase secrets unconditionally:** harmless while on Firebase — `src/lib/supabase.ts` (post Phase-4 hotfix) only hard-fails when Supabase is the **active** backend; on Firebase the gateway builds a never-called placeholder client. Injecting them now means cutover needs only the variable flip, not a workflow edit under time pressure.

- [ ] **Step 1: Make the edit**

In `.github/workflows/deploy.yml`, replace the build step's `env:` block (currently lines 37–43) so it also passes the Supabase URL/anon-key and the backend flag:

```yaml
      - run: npm run build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
          # Supabase: dormant until VITE_AUTH_BACKEND is set to 'supabase'.
          # Cutover = set the VITE_AUTH_BACKEND repo variable to 'supabase' and
          # re-run Deploy; rollback = blank the variable and re-run.
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
          VITE_AUTH_BACKEND: ${{ vars.VITE_AUTH_BACKEND }}
```

- [ ] **Step 2: Validate the workflow YAML**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy.yml')); print('yaml ok')"`
Expected: `yaml ok`

- [ ] **Step 3: Confirm no behavior change while the variable is unset**

Reason about it, no command: with `vars.VITE_AUTH_BACKEND` unset, GitHub injects an empty string; `selectAuthBackend`/`dataBackend` map `'' !== 'supabase'` → firebase. The Supabase secrets, if also unset, inject empty strings into the placeholder-client path, which is never invoked on Firebase. Prod build output is functionally identical to today. (No automated test asserts CI env wiring; this is a reasoned check.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci(supabase): Phase 7 — inject Supabase build env behind VITE_AUTH_BACKEND var

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Cutover runbook in docs/supabase-setup.md

**Files:**
- Modify: `docs/supabase-setup.md` (append after line 605, after the Phase 6 section)

**Interfaces:**
- Consumes: nothing in code. This is operator documentation.
- Produces: the authoritative ordered cutover procedure + the explicit Phase 8 cleanup deferral.

- [ ] **Step 1: Append the Phase 7 section**

Append the following to `docs/supabase-setup.md`:

````markdown
## Phase 7 — Cutover (operator runbook)

A one-time hard cutover. Firebase is left **read-only as the fallback** (no data is deleted, `backup.yml` keeps running). Run every step in one maintenance window. **Prerequisite committed (this phase):** migration `0028` (config-table bootstrap CEO) and the `deploy.yml` Supabase env wiring.

### Pre-flight (do once, before the window)

1. **Add GitHub repo secrets** (Settings → Secrets and variables → Actions → Secrets):
   - `VITE_SUPABASE_URL` = `https://zkzrvctqwnhzklvsoahk.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = the project's anon/public key (Supabase dashboard → Project Settings → API).
2. **Do NOT yet create** the `VITE_AUTH_BACKEND` repo variable — that flip is the go-live switch (step 6).
3. **Supabase dashboard config** (Authentication settings):
   - Enable **asymmetric JWT signing keys (ES256)** — required by the Phase 5 Worker (`verifySupabaseToken` defaults to ES256/EC-P256). Copy the JWKS URL.
   - Set the **allowed email domain** to `viettours.com.vn`.
4. **Push migrations `0017`–`0028` to prod** (the prod schema has `0000`–`0016`; everything since must land). The re-edited `0021` (passengers/save-quote RPC) must be included:
   ```bash
   gh auth switch --user viettoursdev   # org push access; see "Push gotcha"
   supabase db push --linked            # project linked to zkzrvctqwnhzklvsoahk
   supabase migration list              # confirm Local == Remote through 0028
   ```
5. **Full-data ETL dry-run** against a throwaway/local stack first, using a **real prod export**, and verify counts/totals before touching prod:
   ```bash
   SA_PATH=prod-sa.json node scripts/firestore-export.mjs   # → firestore-dump.json
   DUMP_PATH=firestore-dump.json npm run etl                # local stack
   ```
   Resolve any unmapped-username failures (deleted users) by confirming they should null their `created_by` FK, then re-run with `ALLOW_UNMAPPED=1`.

### Cutover window (atomic)

1. **Announce a write freeze.** Users stop editing in the live (Firebase) app.
2. **Final Firestore export** from production:
   ```bash
   SA_PATH=prod-sa.json node scripts/firestore-export.mjs   # → firestore-dump.json
   ```
3. **Run the ETL into prod Supabase** (idempotent truncate-and-reload):
   ```bash
   SUPABASE_URL=https://zkzrvctqwnhzklvsoahk.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=<prod-service-role-key> \
   DUMP_PATH=firestore-dump.json \
   npm run etl
   ```
   Add `ALLOW_UNMAPPED=1` only if the unmapped list was reviewed in pre-flight.
4. **Verify** prod counts + financial checksums against the export (same assertions the `tests/etl/` harness runs: per-table row counts, `sum(total_cost)`, notifications-per-user, full username→UUID coverage). Numbers must match before proceeding.
5. **Redeploy the Cloudflare Worker** with Supabase verification (manual — CI never deploys it):
   - Set Worker var `SUPABASE_PROJECT_REF=zkzrvctqwnhzklvsoahk`.
   - Deploy `cloudflare-worker/viettours-ai-worker.js`. A stale Worker rejects every Supabase token, so this must land before the frontend flip.
6. **Flip the frontend** — set GitHub repo **variable** `VITE_AUTH_BACKEND=supabase`, then re-run the **Deploy** workflow (`workflow_dispatch`). The build now selects Supabase for both auth and data.
7. **Smoke test on the live URL:** magic-link login → open a quote → save (shred/reassemble round-trip) → realtime update in a second tab → file upload → AI endpoint. Cross-reference the Phase 3/4 browser smoke checklists above.

### Rollback

If smoke test fails: **blank the `VITE_AUTH_BACKEND` repo variable** and re-run Deploy. The bundle reverts to Firebase (still authoritative — Firestore was never written during cutover). Optionally revert the Worker `SUPABASE_PROJECT_REF`. No data restore needed; the freeze + read-only Firebase guarantee no lost writes.

### Bootstrap CEO on prod

Migration `0028` seeds `app_config.bootstrap_ceo_email = developer@viettours.com.vn`. To change it, `update public.app_config set value = '<email>' where key = 'bootstrap_ceo_email';` (service-role / SQL editor). The ETL sets every **migrated** user's real role from Firestore, so this seed only governs a genuinely-new first sign-in.

### Phase 8 — deferred cleanup (NOT in Phase 7)

Run only **after Supabase is verified stable in production** (Firebase stays the read-only fallback until then):

- Remove the `firebase` dependency and all `VITE_FIREBASE_*` from `deploy.yml` + repo secrets.
- Delete the dual-backend seams now that one backend remains: `src/auth/backend.ts` indirection, `src/lib/dataBackend.ts` barrel, `firebaseBackend`, and the `fb*` gateway in `src/lib/firebase.ts`.
- Retire `.github/workflows/backup.yml` (Firestore mirror) — Supabase provides daily backups / PITR.
- Make `VITE_AUTH_BACKEND=supabase` the build default and drop the variable indirection.
````

- [ ] **Step 2: Verify it renders**

Run: `grep -n "Phase 7 — Cutover\|Phase 8 — deferred" docs/supabase-setup.md`
Expected: both headings print.

- [ ] **Step 3: Commit**

```bash
git add docs/supabase-setup.md
git commit -m "docs(supabase): Phase 7 cutover runbook + Phase 8 cleanup deferral

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Final gate (after all tasks)

- [ ] `npm run typecheck` → no errors
- [ ] `npm run lint` → 0 warnings
- [ ] `npm test` → unit suite green (no code paths changed; expect 590 unit as in Phase 6)
- [ ] `npx supabase test db` → pgTAP green incl. new `0028` test
- [ ] Push to `origin/main` (viettoursdev account; clear keychain helper — see memory "Push gotcha")
- [ ] Update the `supabase-migration` memory: Phase 7 code-prep done; remaining carry-forward is the operator runbook steps + Phase 8 cleanup.

## Self-Review notes

- **Spec coverage:** runbook covers spec lines 161–168 (schema/dashboard, freeze/export/ETL/verify, frontend deploy, Worker redeploy, smoke, Firebase-fallback). Cleanup (spec line 183 "Phase 7: Cutover + cleanup") is intentionally split to Phase 8 per the locked decision this session — noted explicitly so the split is traceable to the spec.
- **No applied-migration edits:** `0028` is additive; `0001`'s GUC block stays as a documented no-op.
- **Type consistency:** `handle_new_user` keeps the exact insert column list/signature from `0001`; only the `ceo_email` source changes.
