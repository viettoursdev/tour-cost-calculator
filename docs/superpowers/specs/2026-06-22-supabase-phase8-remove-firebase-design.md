# Phase 8 — Remove Firebase, Supabase-only

**Date:** 2026-06-22
**Status:** Design approved — pending implementation plan
**Context:** Phase 7 cutover is DONE and verified — production runs entirely on
Supabase (`VITE_AUTH_BACKEND=supabase` live, prod ETL complete). Firebase is no
longer the active backend. This phase removes Firebase from the codebase
entirely, builds Supabase backing for the few features that were still
Firebase-only, repoints the backup job to Cloudflare R2, and updates all wording
to reflect Supabase.

## Goal / End State

- No `firebase` npm dependency; no `VITE_FIREBASE_*` env; no `firebase/*` import
  anywhere under `src/`.
- Deleted: `src/lib/firebase.ts`, `src/lib/dataBackend.ts` (the fb*/sb* selector
  barrel), `src/auth/backend.ts` selector logic, `src/auth/backends/firebaseBackend.ts`.
- Consumers import `sb*` functions directly from `@/lib/supabase`; auth uses
  `supabaseBackend` directly.
- All three previously Firebase-only feature groups are backed by Supabase — **no
  feature is dropped**.
- `VITE_AUTH_BACKEND` flag removed everywhere (code, `deploy.yml`, repo variable);
  Supabase is hardwired.
- `backup.yml` repurposed to back up Supabase → Cloudflare R2.
- Wording — user-facing strings, identifiers (`fb*`→`sb*`), code comments, and
  `CLAUDE.md` + active docs — reflects Supabase.
- Old Firebase artifacts deleted: `firestore.rules`,
  `scripts/firestore-export.mjs`, `scripts/firestore-import.mjs`, `docs/firebase-setup.md`,
  `docs/firebase-migration.md`.

Non-goal: re-architecting any feature beyond what removal requires. Surgical.

## Background — why these pieces exist

The migration ran as a flag-gated dual backend. `src/lib/dataBackend.ts`
re-exports every data function under its `fb*` name, choosing the Supabase (`sb*`)
implementation when `VITE_AUTH_BACKEND === 'supabase'`, else Firebase. Auth routes
through `src/auth/backend.ts`, which selects `supabaseBackend` or `firebaseBackend`.
With the cutover complete the Firebase half of every selector is dead, but nine
functions never got a Supabase implementation and are re-exported pointing at
Firebase unconditionally — so three feature groups are, today, **still reading and
writing Firestore in production**:

| Feature | Functions | Consumers |
|---|---|---|
| Guide schedule (Lịch đi tour HDV) | `fbSubscribeGuideSchedule`, `fbPushGuideSchedule` | `guideScheduleStore` |
| Outlook email links | `fbSubscribeEmailLinks`, `fbPushEmailLinks` | `emailStore` |
| Public quote sharing | `fbPublishQuote`, `fbGetPublicQuote`, `fbAcceptPublicQuote`, `fbUnpublishQuote` | `SharePublicQuoteModal`, `PublicQuoteView`, `notifications.ts` |

(`fbSetQuoteShare` is an alias of `_regular.fbSetEntryShare` — an internal
quote-entry share setter, **not** a public-quotes function. Its `sb` parity
(`sbSetEntryShare`) is assumed to exist from Phase 2 and must be verified during
implementation.)

Removing Firebase therefore requires building Supabase backing for these three
groups first, or those features break.

## Design

### 1. Orphan features → Supabase

New SQL migrations (next sequential numbers after the current head), each with
parity RLS via `public.is_viettours_user()`, Realtime publication where the
feature subscribes, and pgTAP coverage.

**1a. Guide schedule — single-row table.** Mirrors the existing single-doc /
shared-JSONB pattern (e.g. rate card).

```
guide_schedule (
  id          int primary key default 1 check (id = 1),
  freelancers jsonb not null default '[]',
  assignments jsonb not null default '{}',
  updated_at  timestamptz,
  updated_by  text
)
```
- RLS: company read + write (`is_viettours_user`). Realtime ON.
- `sbSubscribeGuideSchedule(cb)` — subscribe to the single row (existing
  `subscribeTable` helper), emit defaults when absent.
- `sbPushGuideSchedule(doc, pushedBy)` — upsert `id = 1`, stamp `updated_at` /
  `updated_by` (`"${name} (${role})"`, matching current behaviour).

**1b. Email links — single-row table.**

```
email_links (
  id         int primary key default 1 check (id = 1),
  links      jsonb not null default '[]',
  updated_at timestamptz,
  updated_by text
)
```
- RLS company read + write. Realtime ON.
- `sbSubscribeEmailLinks(cb)` / `sbPushEmailLinks(list, pushedBy)` — same shape as
  guide schedule.

**1c. Public quote sharing — token-keyed table with anonymous read.** This is the
**one deliberate divergence** from the app's "auth + `@viettours.com.vn` on every
table" posture, mirroring today's Firestore rules
(`allow read: if true; allow update: hasOnly(['acceptance']) && !('acceptance' in resource.data)`).

```
public_quotes (
  token              text primary key,
  payload            jsonb not null,
  acceptance         jsonb,
  created_by         uuid references profiles(id),
  created_by_username text,
  created_at         timestamptz not null default now()
)
```
- RLS:
  - `SELECT using (true)` — an unauthenticated customer can read the shared link.
  - `INSERT` / `UPDATE` / `DELETE` — `is_viettours_user` only (employees
    publish / unpublish / edit).
- Anonymous "accept once" path = a `SECURITY DEFINER` RPC, `grant execute to anon`:
  ```
  accept_public_quote(p_token text, p_acceptance jsonb)
    -> update public_quotes set acceptance = p_acceptance
       where token = p_token and acceptance is null;
  ```
  This reproduces the Firestore rule (acceptance writable once, only the acceptance
  field) without a broad anonymous `UPDATE` policy.
- Functions: `sbPublishQuote(doc)` (upsert), `sbGetPublicQuote(token)` (anon
  select), `sbAcceptPublicQuote(token, acceptance)` (calls the RPC),
  `sbUnpublishQuote(token)` (delete).
- Verify `PublicQuoteView` operates on the **anonymous** Supabase client (the
  visitor has no session) — the `using (true)` SELECT policy + the `anon`-granted
  RPC cover it; confirm the public route does not gate on auth/`authStore.init`.

**1d. pgTAP** for the three tables (RLS allow/deny) + the accept-once RPC
(second accept is a no-op).

### 2. Seam collapse & rename (`fb*` → `sb*`)

- Codemod the ~37 consumer files (18 stores + 16 components + `assistant/tools.ts`,
  `audit.ts`, `notifications.ts`): change the import path
  `@/lib/dataBackend` → `@/lib/supabase` and rename each imported `fbX` → `sbX`
  (uniform prefix swap). `generateQuoteCode` / `dmChatId` are unprefixed and already
  exported by `supabase.ts`.
- `src/auth/backend.ts` collapses to a one-line re-export
  (`export { supabaseBackend as authBackend } from './backends/supabaseBackend'`),
  keeping the `AuthBackend` interface type and leaving `authStore.ts` untouched.
  Delete `src/auth/backends/firebaseBackend.ts`.
- The 19 stores that do `import type { Unsubscribe } from 'firebase/firestore'`:
  replace with a local `type Unsubscribe = () => void` (the actual return type of
  the `sb*` subscribe functions), or import an equivalent already exported by
  `@/lib/supabase`.
- Delete `src/lib/firebase.ts` and `src/lib/dataBackend.ts`.

### 3. Tests

- The ~30 test files that `vi.mock('@/lib/firebase')` repoint to
  `vi.mock('@/lib/supabase')`.
- Replace `src/test/firebaseStub.ts` with a Supabase stub covering the `sb*`
  surface (the eager-barrel lesson from Phase 4: the mock must cover every named
  export touched at module load).
- `dataBackend.test.ts` / `backend.test.ts` (selector tests) are deleted along with
  the selectors they cover.
- The existing `tests/supabase/` integration harness is unchanged.

### 4. CI / deps / config

- `deploy.yml`: remove the six `VITE_FIREBASE_*` lines and the `VITE_AUTH_BACKEND`
  line. Keep `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- `package.json`: remove the `firebase` dependency. `vite.config.ts`: drop the
  `firebase` entry from `manualChunks`.
- Remove all `VITE_AUTH_BACKEND` reads from `src` (selectors are gone; confirm no
  stray reads remain).

### 5. Backup job → Cloudflare R2

Rewrite `.github/workflows/backup.yml`:
- Trigger unchanged (hourly at `:17`, plus `workflow_dispatch`).
- Dump: `npx supabase db dump --db-url "$SUPABASE_DB_URL" -f dump.sql` (the CLI is
  version-aware for Postgres 17), then gzip.
- Upload to R2 bucket `viettours-db-backups` via the S3-compatible API
  (`aws s3 cp dump.sql.gz s3://viettours-db-backups/... --endpoint-url "$R2_ENDPOINT"`).
- Retention via an **R2 bucket lifecycle rule** set to **14 days**, not workflow logic.
- Secrets scrubbed on exit (`if: always()`).
- New repo secrets (operator): `SUPABASE_DB_URL`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`. Remove `FIREBASE_BACKUP_SRC_SA_JSON` /
  `FIREBASE_BACKUP_DEST_SA_JSON`.

### 6. Wording sweep

- **User-facing strings:**
  - `LoginScreen.tsx` — `"Mật khẩu (Firebase Auth)"` and the "Tài khoản được tạo
    trong Firebase Console…" help text.
  - `RateCardSyncModal.tsx` — `"Đồng bộ real-time qua Firebase"`,
    `"☁️ Dữ liệu trên Cloud (Firebase)"`.
  - Reword to Supabase, or to a backend-neutral "Cloud" where the brand is
    incidental.
- **Comments:** inline comments / JSDoc describing Firebase/Firestore mechanics →
  describe Supabase/Postgres.
- **Docs:** rewrite the Firebase sections of `CLAUDE.md` to describe Supabase as the
  sole backend (Firestore Document Map → Postgres tables, Auth section, backup
  section, localStorage notes that reference Firebase). Delete `docs/firebase-setup.md`
  and `docs/firebase-migration.md`. Historical plan/spec docs under
  `docs/superpowers/` are left as-is for the record.

### 7. Old Firebase artifacts — delete

- `firestore.rules`
- `scripts/firestore-export.mjs`, `scripts/firestore-import.mjs`
- `docs/firebase-setup.md`, `docs/firebase-migration.md`

**Flagged, confirm at implementation (related dead code):** the one-time ETL
(`scripts/supabase-etl.mjs`, `scripts/etl/*`, `tests/etl/*`) depends on the
now-deleted `firestore-export.mjs` and is spent now that the cutover is complete.
Recommend deleting it in the same sweep; not assumed here.

## Sequencing

Each step compiles and keeps the gate green; no feature breaks mid-flight.

1. Add migrations + `sb*` functions for the three orphan groups; wire
   `guideScheduleStore`, `emailStore`, and the public-quote consumers to the new
   `sb*` (Firebase still present).
2. Codemod the seam collapse + `fb*`→`sb*` rename; collapse `auth/backend.ts`;
   delete `firebase.ts`, `dataBackend.ts`, `firebaseBackend.ts`; replace the
   `Unsubscribe` type import.
3. Repoint tests to `@/lib/supabase` + new stub; delete selector tests.
4. Remove `firebase` dep, `VITE_FIREBASE_*`, `VITE_AUTH_BACKEND`, the vite chunk.
5. Backup job → R2.
6. Wording sweep + docs; delete old Firebase artifacts.

## Verification

- `npm run typecheck` clean.
- `npm run lint` (`--max-warnings 0`) clean.
- `npm test` green (unit + integration).
- `npx supabase test db` (pgTAP) green, including the new tests.
- `npm run build` clean (no `firebase` chunk).
- `grep -ri "firebase\|firestore" src` returns zero (or only intentional,
  documented residue).
- Manual smoke (per `docs/run`): publish a quote → open the public link in a
  logged-out browser → accept; guide schedule edit syncs; email link add syncs.

## Operator steps (out of scope for the code change)

- **Push the new migrations to prod Supabase** `zkzrvctqwnhzklvsoahk`
  (`supabase db push --linked`) — the new orphan-feature tables/RPC do not exist in
  prod until this runs.
- Create the R2 bucket `viettours-db-backups` + a 14-day retention lifecycle rule; add the
  new repo secrets; delete `FIREBASE_BACKUP_*` and `VITE_FIREBASE_*` secrets and the
  `VITE_AUTH_BACKEND` repo variable.
- Confirm / enable the Supabase platform backup tier (daily backups / PITR add-on).
- Decommission the retired Firebase project(s) + service accounts on Google's side;
  rotate/disable the legacy Supabase `anon`/`service_role` JWT keys exposed during
  cutover prep (pre-existing deferred item).
