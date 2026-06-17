# Supabase Migration — Design

**Date:** 2026-06-17
**Status:** Approved (design); pending implementation plan
**Scope:** Replace Google Firestore + Firebase Auth with Supabase (Postgres + Supabase Auth). Cloudflare R2 file storage stays. Cloudflare Worker stays, but swaps its token verification from Firebase to Supabase.

## Goal

Migrate the data store from Firestore to a **fully normalized Postgres schema** on Supabase, and the authentication/login flow from Firebase Auth to Supabase Auth, in a **one-time hard cutover** that preserves all existing production data. Large files (PDF/report attachments) continue to live in Cloudflare R2, accessed through the existing AI Worker.

## Locked decisions

| Area | Decision |
|---|---|
| Data model | Fully normalized Postgres tables |
| Editing model | In-memory draft preserved; **decompose on save / reassemble on load** |
| Migration | Migrate all data, one-time hard cutover; Firebase left read-only as fallback |
| Identity | **Supabase UID (UUID)** is canonical; `profiles` keeps `username` + `email` for login/display; ETL remaps every username → UUID |
| Authorization | RLS enforces **auth + `@viettours.com.vn`** only; role logic stays in the client |
| Files | **Unchanged** — Cloudflare R2 via the Worker; Firestore stored only `{key,name}` refs, Postgres does the same |
| Worker | Swap Firebase-ID-token verification → Supabase JWT verification (asymmetric JWKS) |
| First-login provisioning | DB trigger auto-creates a default `profiles` row (role `Standard`; bootstrap CEO email → CEO) |

## Architecture: seams that contain the change

The migration is contained behind two seams so the rest of the app barely moves.

### 1. Data gateway: `src/lib/firebase.ts` → `src/lib/supabase.ts`

Every `fb*` function (~70) gets an `sb*` equivalent with the **identical signature and return type**. Stores call the gateway, never the SDK directly, so the ~20 Zustand stores change only their import line. **Preserving the gateway's public API is the single most important constraint of this migration.**

### 2. Mapping layer for shredded entities

For quotes / itineraries / menus / visa, the gateway gains private helpers:

- `assemble*(rows) → Draft` — runs after `SELECT`s; rebuilds the nested in-memory object the editors already expect.
- `decompose*(draft) → rows` — runs before save; shreds into child-table rows, written in **one transaction** via a Postgres RPC (`supabase.rpc`) so each save is atomic (no half-written quote).

The Zustand stores, `CostView`, `SummaryView`, `ItineraryApp`, `MenuApp`, and the per-user localStorage draft model are **untouched**.

### 3. Auth seam

`authStore.init()` keeps its shape — it subscribes to `supabase.auth.onAuthStateChange` instead of `onIdTokenChanged`, and resolves the session by **auth UID** (`SELECT * FROM profiles WHERE id = uid`) instead of pulling a user array and matching by email. `src/auth/sessionTimeout.ts` (the 48h idle sign-out) is IdP-agnostic and stays as-is.

### 4. Realtime

Supabase Realtime (Postgres Changes) replaces `onSnapshot` on the shared **list/index** tables that drive live collaboration: suppliers, customers, contracts, rate card, quote index, notifications, payment approvals, audit log, fx rates, restaurants, pois, itinerary/menu/visa indexes. The shredded **child** tables are **not** subscribed — quotes/itineraries/menus are reassembled on open, exactly as they are loaded on demand today.

### Unchanged infrastructure

GitHub Pages hosting, the Cloudflare Worker + R2, the Vite/React/MUI/Zustand stack, and the export generators (`src/lib/exports/`, which read in-memory data and never touch storage).

## Normalized schema (~40 tables)

### Shred-vs-keep boundary (the governing rule)

- **Shred into child tables** — sub-structures with identity, worth querying/reporting/FK integrity: line items, flights → segments → fares, workflow steps → logs, group variants, collaborators, attachments, payment instalments, itinerary days, menu courses, supplier-product prices.
- **Keep as columns / small JSONB on the parent row** — scalar config and value-blobs with no relational use: the `rates` currency map, `catEnabled` toggles, `pricingOptions`, `margin`/`vat`/`rounding`/`svcBasis`, `dmcPrices`/`dmcMargin`. A table keyed by (quote, currency) or (quote, category-bool) adds joins and buys nothing.
- **Version snapshots stay JSONB** — `quote_versions` (≤20/quote) are immutable historical states, never queried relationally: one row per version with `state jsonb`. Only the **current/live** state is shredded into relational tables.

### Table groups

**Identity & shared**
- `profiles` — `id uuid PK FK→auth.users`, `username`, `email`, `role`, `name`, `color`, `phone`
- `audit_log` — actor `created_by uuid` (nullable) + `actor_name` display string
- `fx_rates` — `currency`, `rate_to_vnd`, meta
- `pois`
- `attachments` — polymorphic: `parent_type`, `parent_id`, `r2_key`, `name`, `uploaded_by`, `uploaded_at` (R2 keys, files themselves stay in R2)

**Rate card** (edited in modals; shredded by section)
- `rate_card_hotels`, `rate_card_visa`, `rate_card_other`

**Suppliers / products**
- `suppliers`, `ncc_products`, `ncc_product_prices`

**Customers / contracts**
- `customers`, `contracts` (+ `contract_items` if the contract type carries line arrays — confirm against `src/types/contract.ts` during Phase 0)

**Quotes** (regular + DMC unified, discriminated by `template`)
- `quotes` — index columns: `quote_code`, `name`, `template`, `pax`, `total_cost`, `status`, `customer_id FK`, `depart_date`, `created_by FK→profiles` (+ `created_by_name`), link fields (`linked_quote_id/name/template`); JSONB columns for `rates`, `cat_enabled`, `pricing_options`, `dmc_prices`, `dmc_margin`, `info`
- `quote_line_items` — FK→quotes, category, all `Item` fields
- `quote_flights` → `quote_flight_segments` → `quote_flight_fares`
- `quote_workflow_steps` → `quote_workflow_logs`
- `quote_groups` (+ their items; group variants carry their own items/catEnabled)
- `quote_collaborators` — FK→quotes, `user_id uuid` (+ display name)
- `quote_payments` — instalments
- `quote_versions` — `version_no`, `saved_at`, `saved_by`, `note`, `state jsonb`

**Itineraries / menus**
- `itineraries` → `itinerary_days` (+ day items)
- `menus` → `menu_courses`
- `restaurants`

**Visa**
- `visa_products`, `visa_product_prices`
- `visa_procedures` (+ sections)
- `visa_projects`

**Payments / notifications**
- `tour_payments` → `payment_records`, `custom_cost_items`
- `payment_approvals` (+ stage rows: stage1/stage2 with approver UID + intended-name strings)
- `notifications` — `user_id uuid` owner (replaces `user_notifications/{username}`)
- `notification_threads` → `notification_thread_members` (`user_id uuid`), `notification_comments`

### Index columns derived on save

The Firestore design maintains denormalized summaries on history entries (`workflowSummary`, `paymentSummary`, `workflowDue`). In Postgres these become either columns on `quotes` updated within the save transaction, or SQL views/computed reads. Default: keep them as columns written by the save RPC (parity with today, no read-time recompute); revisit as views only if they drift.

## Authentication

### Sign-in (UX unchanged)

- **Magic link (prod):** `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: <Pages URL>?mode=auth, shouldCreateUser: true } })`. Client still gates the email to `@viettours.com.vn` before sending. The `?mode=auth` redirect maps onto Supabase's detect-session-in-URL.
- **DEV password:** `supabase.auth.signInWithPassword({ email, password })`, behind the same `import.meta.env.DEV` accordion.

### Session resolution (`authStore.init`)

Subscribe to `supabase.auth.onAuthStateChange`. On a session, resolve `currentUser` by **auth UID**: `SELECT * FROM profiles WHERE id = <uid>`. `sessionTimeout.ts` (48h idle, link sessions only) is untouched; DEV password sessions stay exempt. Supabase refresh-token rotation replaces `onIdTokenChanged`'s refresh; the Worker always gets a fresh token via `supabase.auth.getSession()`.

### Defense at the door (three layers, same as Firebase posture)

1. Supabase Auth email-domain allowlist = `viettours.com.vn` (rejects non-company sign-ups server-side).
2. RLS domain check on every table.
3. Existing client-side gate before sending the link.

### First-login provisioning (DB trigger)

A Postgres trigger on `auth.users` INSERT creates a `profiles` row:
- bootstrap CEO email → role `CEO`
- otherwise → role `Standard`, `name` derived from the email local-part

An admin promotes the role afterward in the existing user-management panel (which now writes to `profiles`). Self-service first login works; no one is locked out.

## Cloudflare Worker & client token

The Worker already does JWKS-based asymmetric verification for Firebase (fetches Google X.509 certs, verifies RS256, checks `aud`/`iss`/`exp` + email-domain regex). This is a swap, not a rewrite:

- **Verification source → Supabase JWKS.** Enable asymmetric (ES256/RSA) JWT signing keys on the Supabase project; point the Worker at `https://<project>.supabase.co/auth/v1/.well-known/jwks.json`. The Worker holds **no shared secret** (preserves today's posture). Existing cert-cache + signature-verify scaffolding stays; only the JWKS URL, `iss` (`https://<project>.supabase.co/auth/v1`), `aud` (`authenticated`), and the email-claim location change. The `@viettours.com.vn` domain check stays at the same spot.
- **Env:** `FIREBASE_PROJECT_ID` → `SUPABASE_PROJECT_REF`; same optional-gating behavior (unset = open, for safe rollback).
- **Client (`src/lib/aiWorker.ts`):** `authHeaders()` switches from `auth.currentUser?.getIdToken()` to `(await supabase.auth.getSession()).data.session?.access_token`. `uploadFileToWorker()` and `workerFileUrl()` unchanged. R2, `/upload`, `/file/<key>`, and `{key,name}` references untouched.
- **Manual redeploy** — CI does not deploy the Worker; the cutover runbook flags this, since a stale Worker would reject every Supabase token.

Rationale for asymmetric JWKS over the legacy HS256 shared secret: keeps secrets out of the Worker and reuses the existing verification code path.

## ETL (Firestore → normalized Postgres)

A Node script reads the existing Firestore export (`backup.yml` already produces `firestore-dump.json`) and writes to Supabase via the service-role client. **Idempotent** (truncate-and-reload) so dry-run and real run share one path.

Strict ordering:

1. **`profiles` first — the keystone.** For each user in `user_accounts`: `auth.admin.createUser` (email pre-confirmed), capture returned UUID, insert `profiles`, build the **`username → UUID` map**. Everything downstream depends on this map.
2. **Independent entities:** customers, suppliers, ncc_products, contracts, rate card, fx_rates, restaurants, pois, visa_products.
3. **Quotes** (regular + DMC → unified tables): insert `quotes` (resolve `created_by`, `customer_id`), shred `currentState` into child tables, load `versions` as JSONB snapshots, insert collaborators / attachments / payments.
4. Itineraries (+days), menus (+courses), visa_procedures, visa_projects.
5. tour_payments (+records / custom items), payment_approvals, notifications (per user), notification_threads (+members / comments), audit_log.

**Re-keying safety net:** every username reference resolves through the map; an **unmapped username fails the ETL loudly** (no silent orphans). For references to deleted users, keep the existing `*Name` / `updatedBy` **display strings** alongside a **nullable** `created_by` FK — historical attribution survives even with no profile.

**Verification:** dry-run into a staging Supabase, then compare per-table row counts and checksums (`count(quotes)`, `sum(total_cost)`, notifications per user, etc.) against Firestore. Numbers must match before the real run.

## Cutover runbook (maintenance window)

1. Apply schema migrations + RLS + provisioning trigger + Realtime publication to prod Supabase; enable asymmetric JWT keys + domain allowlist.
2. Announce freeze → final Firestore export → run ETL into prod → verify counts/totals.
3. Deploy frontend with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (replacing `VITE_FIREBASE_*` in `deploy.yml` secrets).
4. **Redeploy the Worker** with Supabase verification (manual — flagged because a stale Worker rejects every token).
5. Smoke test: login → open quote → save (shred/reassemble round-trip) → realtime → file upload → AI endpoints.
6. Firebase left **read-only** as fallback; retire the `backup.yml` Firestore mirror afterward (Supabase provides daily backups / PITR).

## Build phasing

All phases built and tested against a **staging Supabase**, then cut over atomically (hard cutover). Dev uses a Supabase dev project + DEV password login during the build.

| Phase | Scope |
|---|---|
| 0 | Supabase project, schema migrations, RLS, provisioning trigger, Realtime publication, env scaffolding |
| 1 | `src/lib/supabase.ts` gateway — `sb*` functions with **identical signatures** to `fb*` |
| 2 | Mapping layer: `assemble*` / `decompose*` + atomic-save RPCs for shredded entities |
| 3 | Auth: authStore, LoginScreen, sessionTimeout wiring, profiles resolution |
| 4 | Realtime subscriptions on list/index tables; swap store imports `fb*` → `sb*` |
| 5 | Worker verification swap + client `authHeaders()` |
| 6 | ETL script + staging dry-run + verification harness |
| 7 | Cutover + cleanup (remove `firebase` dep, `VITE_FIREBASE_*`, retire backup workflow) |

## Out of scope

- Cloudflare R2 / file storage changes (explicitly retained).
- Normalizing the rate card beyond its three sections, or any reporting/BI layer (the normalized schema enables it later, but no BI work is in this migration).
- Pushing role logic into RLS (parity-only RLS now; can tighten later).
- Live row-level collaborative editing (editing stays in-memory).

## Open items to confirm during Phase 0

- Exact column lists per table, validated against each `src/types/*.ts`.
- Whether `contracts` needs a `contract_items` child table (depends on `src/types/contract.ts`).
- Supabase project region (Singapore, closest to current `asia-southeast1`).
- Whether denormalized quote summaries (`workflowSummary`, `paymentSummary`) are columns-on-save vs. SQL views.
