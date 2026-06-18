# Supabase Migration — Phase 1 (Data Gateway) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `src/lib/supabase.ts` — a data gateway exposing `sb*` functions with **signatures and return types identical** to the `fb*` functions in `src/lib/firebase.ts`, backed by Supabase queries against the Phase 0 normalized schema, so that in Phase 4 the ~20 Zustand stores can switch backends by changing only their import line.

**Architecture:** A single Supabase client singleton (`@supabase/supabase-js`) plus small shared helpers (a Realtime "subscribe to table → reassemble → callback" wrapper, and a "replace child rows" helper for shallow parent→child entities). Each entity family gets its `sb*` functions that decompose the app's array/object shapes into parent+child rows on write and reassemble them on read — preserving the exact data shapes the stores already consume. Tested with **integration tests** that run against the local Supabase stack (Docker) as a signed-in `@viettours.com.vn` user, asserting round-trip parity.

**Tech Stack:** `@supabase/supabase-js` (new), Vitest (already installed), local Supabase CLI stack (Docker), TypeScript strict.

## Global Constraints

- **Do NOT modify `src/lib/firebase.ts` or wire any store to the gateway.** Stores keep using `fb*` until Phase 4. This phase only ADDS `src/lib/supabase.ts`, its tests, env, and deps.
- **Signature parity is the contract:** every `sb*` function must have the same parameters and return type as its `fb*` twin in `src/lib/firebase.ts`. The return *shapes* (e.g. `Customer[]`, `RateCardDoc`, `Notification[]`) must be byte-equivalent to what `fb*` returns, so stores are indifferent to the backend. When in doubt, open `src/lib/firebase.ts` and match it exactly.
- **Identity is canonical UUID** (Phase 0): `created_by`/owner columns are `uuid → profiles(id)`. The gateway maps between the app's username-based shapes and UUIDs using the `profiles` table. Where a historical username can't resolve to a UUID, write `null` to the uuid column and preserve the display-name/username text column (never drop attribution).
- **Add `@supabase/supabase-js` to `dependencies`.** Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to `.env.example`.
- **Env access:** the client reads `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (mirrors the `VITE_FIREBASE_*` pattern at `src/lib/firebase.ts:20-28`).
- **Integration tests need Docker + a running local Supabase** (`npx supabase start`). They live under `tests/supabase/**` and run via a dedicated `npm run test:integration` so they don't break the existing unit `npm test`.
- **Commits:** Conventional Commits. Co-author trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Lint/typecheck gates:** `npm run lint` (`--max-warnings 0`) and `npm run typecheck` must stay green; run them before each commit that touches `.ts`.

## Scope — Phase 1 vs Phase 2

**In Phase 1 (this plan)** — gateway functions for every entity whose persistence is a single row or a parent with at most one shallow child level (+ JSONB):
profiles/users, fx_rates, pois, audit_log, restaurants, customers(+contacts), suppliers(+contacts), ncc_products(+prices, files), contracts(+payments, cancels), rate card (jsonb sections), visa_products(+fees, meta/versions), visa_procedures (jsonb sections/versions), visa_projects (jsonb milestones/applicants), itineraries(+days), menus(+days), notifications, notification_threads(+members, comments), payment_approvals(+stages), tour_payments(+records, custom_items), attachments (polymorphic helper).

**Deferred to Phase 2** — the quote machinery (regular **and** DMC), because it needs version snapshots, the ≤500/≤20 size-capping, cross-quote links, workflow/payment summary backfills, and a deep multi-level shred written atomically via a Postgres RPC:
`sbSaveQuote`, `sbSaveQuoteState`, `sbGetQuoteProject`, `sbSubscribeQuoteHistory`, `sbDeleteQuote`, `sbUpdateCollaborators`, `sbSetRegularEntryLink`/`sbSetDMCEntryLink`, `sbSetQuoteStatus`/`sbSetDMCQuoteStatus`, `sbBackfillWorkflowIndex`, `sbSetQuotePaymentSummary`, `sbBackfillPaymentIndex`, `generateQuoteCode`, and all `*DMC*` variants. (This is a refinement of the spec's phase grouping: itineraries/menus/visa are only shallow, so they land in Phase 1; only quotes are deep enough to require the Phase 2 RPC.)

---

## File Structure

```
src/lib/supabase.ts                  # the gateway: client singleton + all Phase 1 sb* functions
src/lib/supabase/helpers.ts          # shared: subscribeTable(), replaceChildren(), profileMaps, errors
tests/supabase/_setup.ts             # service client, signed-in @viettours test client, truncate helper
tests/supabase/<entity>.test.ts      # one integration test file per entity family
vitest.integration.config.ts         # vitest config scoped to tests/supabase (separate from unit tests)
.env.example                         # + VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
package.json                         # + @supabase/supabase-js dep, + test:integration script
```

`src/lib/supabase.ts` mirrors the one-file shape of `src/lib/firebase.ts` (the project's established pattern), with the cross-cutting plumbing factored into `src/lib/supabase/helpers.ts` to keep the main file focused on per-entity functions.

---

## Task 1: Dependency + integration-test harness

**Files:**
- Modify: `package.json` (add dep + script)
- Create: `vitest.integration.config.ts`
- Create: `tests/supabase/_setup.ts`
- Create: `tests/supabase/smoke.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `getServiceClient(): SupabaseClient` (service-role, bypasses RLS — for truncation/seeding), `getViettoursClient(): Promise<SupabaseClient>` (signed in as `tester@viettours.com.vn`, exercises RLS), `truncateAll(): Promise<void>`. Local stack values: URL `http://127.0.0.1:54321`; the demo anon/service keys are the Supabase-CLI well-known local defaults (not secrets).

- [ ] **Step 1: Install the client**

Run:
```bash
npm install @supabase/supabase-js@^2
```
Expected: `@supabase/supabase-js` appears under `dependencies` in `package.json`.

- [ ] **Step 2: Add the integration test script**

Edit `package.json` scripts, add:
```json
"test:integration": "vitest run --config vitest.integration.config.ts"
```

- [ ] **Step 3: Create the integration vitest config**

Create `vitest.integration.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/supabase/**/*.test.ts'],
    environment: 'node',
    hookTimeout: 30_000,
    testTimeout: 30_000,
    fileParallelism: false, // shared DB — run files serially to avoid cross-test interference
  },
});
```

- [ ] **Step 4: Create the test harness**

Create `tests/supabase/_setup.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Well-known Supabase-CLI local dev values (identical across all local installs; not secret).
const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const TEST_EMAIL = 'tester@viettours.com.vn';
const TEST_PASSWORD = 'test-password-12345';

export function getServiceClient(): SupabaseClient {
  return createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
}

let viettoursClient: SupabaseClient | null = null;

/** A client signed in as a @viettours.com.vn user, so RLS (auth + domain) passes. */
export async function getViettoursClient(): Promise<SupabaseClient> {
  if (viettoursClient) return viettoursClient;
  const admin = getServiceClient();
  // Idempotent: create the test auth user if absent (trigger auto-makes its profile).
  await admin.auth.admin.createUser({
    email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true,
  }).catch(() => {/* already exists */});
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  if (error) throw new Error('test sign-in failed: ' + error.message);
  viettoursClient = c;
  return c;
}

/** Delete all rows from the given tables (service role bypasses RLS). Children first. */
export async function truncate(tables: string[]): Promise<void> {
  const admin = getServiceClient();
  for (const t of tables) {
    const { error } = await admin.from(t).delete().not('id', 'is', null);
    if (error && !/no rows/i.test(error.message)) throw new Error(`truncate ${t}: ${error.message}`);
  }
}
```

- [ ] **Step 5: Write a smoke test**

Create `tests/supabase/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getViettoursClient } from './_setup';

describe('supabase harness', () => {
  it('signs in a @viettours user and reads under RLS', async () => {
    const c = await getViettoursClient();
    const { error } = await c.from('fx_rates').select('currency').limit(1);
    expect(error).toBeNull(); // RLS allows the company-domain user
  });
});
```

- [ ] **Step 6: Run it (Docker + local Supabase must be up)**

Run:
```bash
npx supabase start >/dev/null 2>&1 || true
npm run test:integration -- tests/supabase/smoke.test.ts
```
Expected: 1 passed. If sign-in fails, confirm `npx supabase status` shows the stack running.

- [ ] **Step 7: Update `.env.example`**

Append to `.env.example`:
```
# Supabase (Phase 1+). Public anon key — access control is via RLS + Auth domain allowlist.
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.integration.config.ts tests/supabase/_setup.ts tests/supabase/smoke.test.ts .env.example
git commit -m "feat(supabase): add supabase-js + local integration-test harness"
```

---

## Task 2: Gateway client singleton + shared helpers

**Files:**
- Create: `src/lib/supabase.ts` (client singleton + re-exports)
- Create: `src/lib/supabase/helpers.ts`
- Test: `tests/supabase/helpers.test.ts`

**Interfaces:**
- Produces:
  - `export const sb: SupabaseClient` — singleton from `VITE_SUPABASE_*`.
  - `subscribeTable<T>(table, assemble: (client) => Promise<T>, cb: (v:T)=>void): () => void` — initial load + Realtime re-fetch on any change to `table`; returns an unsubscribe fn (matches the `Unsubscribe` shape stores expect from `fb*`).
  - `replaceChildren(client, table, parentCol, parentId, rows): Promise<void>` — delete existing children for a parent then insert the new set (the shallow decompose primitive).
  - `usernamesToIds(client, usernames): Promise<Map<string,string>>` and `idsToUsernames(client, ids)` — profile lookups for UUID mapping.

- [ ] **Step 1: Write the failing test**

Create `tests/supabase/helpers.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getServiceClient, getViettoursClient, truncate } from './_setup';
import { replaceChildren } from '../../src/lib/supabase/helpers';

describe('replaceChildren', () => {
  beforeEach(async () => { await truncate(['customer_contacts', 'customers']); });

  it('replaces the child set for a parent', async () => {
    const admin = getServiceClient();
    const { data: cust } = await admin.from('customers')
      .insert({ name: 'Acme', type: 'company' }).select('id').single();
    const c = await getViettoursClient();
    await replaceChildren(c, 'customer_contacts', 'customer_id', cust!.id, [
      { customer_id: cust!.id, name: 'A', phone: '1', email: '', position: '', sort_order: 0 },
      { customer_id: cust!.id, name: 'B', phone: '2', email: '', position: '', sort_order: 1 },
    ]);
    const { data } = await c.from('customer_contacts').select('name').eq('customer_id', cust!.id).order('sort_order');
    expect(data!.map((r) => r.name)).toEqual(['A', 'B']);
    // replacing again with one row leaves exactly one
    await replaceChildren(c, 'customer_contacts', 'customer_id', cust!.id, [
      { customer_id: cust!.id, name: 'C', phone: '3', email: '', position: '', sort_order: 0 },
    ]);
    const { data: after } = await c.from('customer_contacts').select('name').eq('customer_id', cust!.id);
    expect(after!.map((r) => r.name)).toEqual(['C']);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm run test:integration -- tests/supabase/helpers.test.ts`
Expected: FAIL — cannot import `replaceChildren` (module/file missing).

- [ ] **Step 3: Implement the client + helpers**

Create `src/lib/supabase.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anon) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see .env.example).');
}

export const sb: SupabaseClient = createClient(url, anon);
```

Create `src/lib/supabase/helpers.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type Unsubscribe = () => void;

/**
 * Initial load + live re-fetch. Mirrors the fb* onSnapshot subscribe contract:
 * calls `cb` once with the assembled value, then again whenever any row in
 * `table` changes. Returns an unsubscribe fn. Swallows transient errors quietly.
 */
export function subscribeTable<T>(
  client: SupabaseClient,
  table: string,
  assemble: (client: SupabaseClient) => Promise<T>,
  cb: (v: T) => void,
): Unsubscribe {
  let active = true;
  const load = () => assemble(client).then((v) => { if (active) cb(v); }).catch((e) => {
    console.warn(`Supabase ${table} load error:`, (e as Error).message);
  });
  load();
  const channel = client
    .channel(`tbl:${table}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, () => { load(); })
    .subscribe();
  return () => { active = false; client.removeChannel(channel); };
}

/** Delete all child rows for a parent, then insert the provided set. */
export async function replaceChildren(
  client: SupabaseClient,
  table: string,
  parentCol: string,
  parentId: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  const del = await client.from(table).delete().eq(parentCol, parentId);
  if (del.error) throw new Error(`replaceChildren delete ${table}: ${del.error.message}`);
  if (rows.length) {
    const ins = await client.from(table).insert(rows);
    if (ins.error) throw new Error(`replaceChildren insert ${table}: ${ins.error.message}`);
  }
}

/** Map usernames → profile UUIDs (unmapped usernames are absent from the result). */
export async function usernamesToIds(
  client: SupabaseClient, usernames: string[],
): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(usernames.filter(Boolean)));
  if (!uniq.length) return new Map();
  const { data, error } = await client.from('profiles').select('id, username').in('username', uniq);
  if (error) throw new Error('usernamesToIds: ' + error.message);
  return new Map((data ?? []).map((r) => [r.username as string, r.id as string]));
}

/** Map profile UUIDs → usernames. */
export async function idsToUsernames(
  client: SupabaseClient, ids: string[],
): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (!uniq.length) return new Map();
  const { data, error } = await client.from('profiles').select('id, username').in('id', uniq);
  if (error) throw new Error('idsToUsernames: ' + error.message);
  return new Map((data ?? []).map((r) => [r.id as string, r.username as string]));
}
```

- [ ] **Step 4: Point the test at the real client**

The helper test uses the test client (`getViettoursClient`) directly, so `src/lib/supabase.ts`'s env-based singleton isn't exercised here. Confirm `helpers.ts` imports only types from `@supabase/supabase-js` (no import of `src/lib/supabase.ts`), so the test runs without `VITE_SUPABASE_*` set.

- [ ] **Step 5: Run, expect PASS**

Run: `npm run test:integration -- tests/supabase/helpers.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
npm run typecheck
git add src/lib/supabase.ts src/lib/supabase/helpers.ts tests/supabase/helpers.test.ts
git commit -m "feat(supabase): gateway client singleton + shared helpers (subscribeTable, replaceChildren, profile maps)"
```

---

## Task 3: Attachments polymorphic helper

**Files:**
- Modify: `src/lib/supabase.ts`
- Test: `tests/supabase/attachments.test.ts`

**Interfaces:**
- Consumes: `sb`, `replaceChildren` (Task 2).
- Produces (internal, used by ncc_products / visa / payments later): `loadAttachments(client, parentType, parentId): Promise<FileAttachment[]>` and `saveAttachments(client, parentType, parentId, atts: FileAttachment[]): Promise<void>`. `FileAttachment` is `{ key, name, uploadedBy?, uploadedAt? }` from `src/types/quote.ts:10-15`. DB columns: `r2_key` ← `key`, `name`, `uploaded_by_name` ← `uploadedBy`, `uploaded_at` ← `uploadedAt`.

- [ ] **Step 1: Write the failing test**

Create `tests/supabase/attachments.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { loadAttachments, saveAttachments } from '../../src/lib/supabase';

describe('attachments helper', () => {
  beforeEach(async () => { await truncate(['attachments']); });
  it('round-trips FileAttachment[] for a parent', async () => {
    const c = await getViettoursClient();
    await saveAttachments(c, 'ncc_product', 'p1', [
      { key: 'r2-abc', name: 'quote.pdf', uploadedBy: 'Linh', uploadedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    const got = await loadAttachments(c, 'ncc_product', 'p1');
    expect(got).toEqual([
      { key: 'r2-abc', name: 'quote.pdf', uploadedBy: 'Linh', uploadedAt: '2026-01-01T00:00:00.000Z' },
    ]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`loadAttachments`/`saveAttachments` not exported).

Run: `npm run test:integration -- tests/supabase/attachments.test.ts`

- [ ] **Step 3: Implement in `src/lib/supabase.ts`**

Append:
```ts
import type { FileAttachment } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { replaceChildren } from './supabase/helpers';

export async function loadAttachments(
  client: SupabaseClient, parentType: string, parentId: string,
): Promise<FileAttachment[]> {
  const { data, error } = await client.from('attachments')
    .select('r2_key, name, uploaded_by_name, uploaded_at')
    .eq('parent_type', parentType).eq('parent_id', parentId)
    .order('uploaded_at', { ascending: true });
  if (error) throw new Error('loadAttachments: ' + error.message);
  return (data ?? []).map((r) => ({
    key: r.r2_key as string,
    name: r.name as string,
    uploadedBy: (r.uploaded_by_name as string) ?? undefined,
    uploadedAt: (r.uploaded_at as string) ?? undefined,
  }));
}

export async function saveAttachments(
  client: SupabaseClient, parentType: string, parentId: string, atts: FileAttachment[],
): Promise<void> {
  await replaceChildren(client, 'attachments', 'parent_id', parentId,
    atts.map((a) => ({
      parent_type: parentType, parent_id: parentId,
      r2_key: a.key, name: a.name,
      uploaded_by_name: a.uploadedBy ?? null,
      uploaded_at: a.uploadedAt ?? null,
    })),
  );
}
```
Note: `replaceChildren` here filters by `parent_id` only — acceptable because `parent_id` values are globally unique app ids; if a future parent reuses an id across types, add a `.eq('parent_type', …)` guarded delete instead.

- [ ] **Step 4: Run, expect PASS.** `npm run test:integration -- tests/supabase/attachments.test.ts`
- [ ] **Step 5: Typecheck + commit**
```bash
npm run typecheck
git add src/lib/supabase.ts tests/supabase/attachments.test.ts
git commit -m "feat(supabase): polymorphic attachments load/save helper"
```

---

## Task 4: Profiles / users gateway

**Files:**
- Modify: `src/lib/supabase.ts`
- Test: `tests/supabase/users.test.ts`

**Interfaces (match `src/lib/firebase.ts:117-139`):**
- Produces: `sbPullUsers(): Promise<User[]>`, `sbPushUsers(users: User[]): Promise<void>`, `sbPurgeLegacyPasswords(): Promise<number>`.
- `User` is `{ u, email?, phone?, p?, role, name, color }` (`src/types/user.ts:12-25`). DB `profiles` columns: `username`←`u`, `email`, `phone`, `role`, `name`, `color`. There is no `p` column (legacy plaintext does not exist in Supabase) — `sbPurgeLegacyPasswords` returns `0` (nothing to purge; kept for signature parity).
- **Constraint:** `sbPushUsers` UPSERTs profile *fields* for users that already have an `auth.users` row (matched by `email`); it does NOT create `auth.users` (that needs the admin API and is Phase 3). Users with no matching profile are skipped and logged — document this in the function's JSDoc.

- [ ] **Step 1: Write the failing test**

Create `tests/supabase/users.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getServiceClient, getViettoursClient } from './_setup';
import { sbPullUsers, sbPushUsers, sbPurgeLegacyPasswords } from '../../src/lib/supabase';

describe('users gateway', () => {
  it('pulls profiles as User[] and upserts editable fields by email', async () => {
    const c = await getViettoursClient(); // ensures tester@viettours.com.vn profile exists
    const before = await sbPullUsers.call({ client: c });
    expect(before.some((u) => u.email === 'tester@viettours.com.vn')).toBe(true);

    await sbPushUsers.call({ client: c }, before.map((u) =>
      u.email === 'tester@viettours.com.vn' ? { ...u, name: 'QA Bot', color: '#123456' } : u));
    const after = await sbPullUsers.call({ client: c });
    const t = after.find((u) => u.email === 'tester@viettours.com.vn')!;
    expect(t.name).toBe('QA Bot');
    expect(t.color).toBe('#123456');

    expect(await sbPurgeLegacyPasswords.call({ client: c })).toBe(0);
  });
});
```
> Test-invocation note: the production `sb*` functions use the module singleton `sb`. To run them against the test client, each `sb*` function takes an **optional** trailing `client` parameter defaulting to `sb` (e.g. `export async function sbPullUsers(client: SupabaseClient = sb)`). The tests pass the signed-in test client; stores in Phase 4 call with no client arg. Use this pattern for **every** `sb*` function in this plan. (Rewrite the `.call(...)` above as `sbPullUsers(c)` — the optional-arg form.)

- [ ] **Step 2: Run, expect FAIL.** `npm run test:integration -- tests/supabase/users.test.ts`

- [ ] **Step 3: Implement in `src/lib/supabase.ts`**

```ts
import type { User, Role } from '@/types';
import { sb } from './supabase'; // (already in this file; shown for clarity)

const profileToUser = (r: Record<string, unknown>): User => ({
  u: (r.username as string) ?? '',
  email: (r.email as string) ?? undefined,
  phone: (r.phone as string) ?? undefined,
  role: (r.role as Role),
  name: (r.name as string) ?? '',
  color: (r.color as string) ?? '#888888',
});

export async function sbPullUsers(client: SupabaseClient = sb): Promise<User[]> {
  const { data, error } = await client.from('profiles')
    .select('username, email, phone, role, name, color');
  if (error) throw new Error('sbPullUsers: ' + error.message);
  return (data ?? []).map(profileToUser);
}

/**
 * Upserts editable profile fields (role/name/color/phone/username) for users
 * whose email already has an auth.users+profile row. Does NOT create auth users
 * (admin API; Phase 3). Unmatched emails are skipped + warned.
 */
export async function sbPushUsers(users: User[], client: SupabaseClient = sb): Promise<void> {
  const emails = users.map((u) => u.email).filter(Boolean) as string[];
  const { data: existing, error } = await client.from('profiles').select('id, email').in('email', emails);
  if (error) throw new Error('sbPushUsers: ' + error.message);
  const idByEmail = new Map((existing ?? []).map((r) => [r.email as string, r.id as string]));
  const updates = users
    .filter((u) => u.email && idByEmail.has(u.email))
    .map((u) => ({
      id: idByEmail.get(u.email as string)!,
      username: u.u, email: u.email, phone: u.phone ?? null,
      role: u.role, name: u.name, color: u.color, updated_at: new Date().toISOString(),
    }));
  const skipped = users.filter((u) => !u.email || !idByEmail.has(u.email));
  if (skipped.length) console.warn(`sbPushUsers: skipped ${skipped.length} user(s) with no auth account (create via admin in Phase 3).`);
  if (updates.length) {
    const up = await client.from('profiles').upsert(updates, { onConflict: 'id' });
    if (up.error) throw new Error('sbPushUsers upsert: ' + up.error.message);
  }
}

/** No-op in Supabase (no plaintext password column exists). Kept for signature parity. */
export async function sbPurgeLegacyPasswords(_client: SupabaseClient = sb): Promise<number> {
  return 0;
}
```

- [ ] **Step 4: Run, expect PASS** (after rewriting the test to the optional-arg form). `npm run test:integration -- tests/supabase/users.test.ts`
- [ ] **Step 5: Typecheck, lint, commit**
```bash
npm run typecheck && npm run lint
git add src/lib/supabase.ts tests/supabase/users.test.ts
git commit -m "feat(supabase): users/profiles gateway (sbPullUsers/sbPushUsers/sbPurgeLegacyPasswords)"
```

---

## Task 5: fx_rates, pois, audit_log

**Files:** Modify `src/lib/supabase.ts`; Test `tests/supabase/simple.test.ts`

**Interfaces (match `src/lib/firebase.ts`):**
- `sbSubscribeFxRates(cb: (doc: FxRatesDoc) => void, client?)` → reads `fx_rates` rows into `{ rates: Record<string,number>, _meta? }` (the `FxRatesDoc` shape, `firebase.ts:638-641`). `sbPushFxRates(rates: Record<string,number>, pushedBy: string, client?): Promise<string>` → upsert one row per currency; returns ISO `pushedAt`.
- `sbSubscribePois(cb: (list: PoiEntry[]) => void, client?)`, `sbPushPois(list: PoiEntry[], pushedBy: {name,role}, client?)` (`firebase.ts:1123-1138`). `PoiEntry` per `src/types/itinerary.ts:109-118`.
- `sbLogAudit(entry: AuditEntry, client?): Promise<void>`, `sbSubscribeAuditLog(cb: (entries: AuditEntry[]) => void, client?)` (`firebase.ts:718-727`). `AuditEntry` per `src/types/audit.ts:4-13`; map `byU`→`created_by` (resolve username→uuid; null if unmapped) + `actor_name`←`byName`.

- [ ] **Step 1: Write the failing test**

Create `tests/supabase/simple.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import {
  sbPushFxRates, sbSubscribeFxRates, sbPushPois, sbSubscribePois, sbLogAudit, sbSubscribeAuditLog,
} from '../../src/lib/supabase';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('fx_rates / pois / audit_log', () => {
  beforeEach(async () => { await truncate(['fx_rates', 'pois', 'audit_log']); });

  it('fx round-trips', async () => {
    const c = await getViettoursClient();
    await sbPushFxRates({ USD: 25000, EUR: 27000 }, 'Tony', c);
    const doc = await once<{ rates: Record<string, number> }>((cb) => sbSubscribeFxRates(cb, c));
    expect(doc.rates).toMatchObject({ USD: 25000, EUR: 27000 });
  });

  it('pois round-trip', async () => {
    const c = await getViettoursClient();
    await sbPushPois([{ id: 'p1', place: 'Hạ Long', commentary: 'Vịnh đẹp' }], { name: 'Tony', role: 'CEO' }, c);
    const list = await once<PoiEntry[]>((cb) => sbSubscribePois(cb as any, c));
    expect(list.map((p) => p.place)).toContain('Hạ Long');
  });

  it('audit appends + reads newest-first', async () => {
    const c = await getViettoursClient();
    await sbLogAudit({ id: 'a1', at: '2026-01-01T00:00:00Z', byU: 'tester', byName: 'QA', action: 'create', entity: 'Báo giá', name: 'X' }, c);
    const entries = await once<any[]>((cb) => sbSubscribeAuditLog(cb as any, c));
    expect(entries[0].name).toBe('X');
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** in `src/lib/supabase.ts`:
```ts
import type { FxRatesDoc } from './firebase'; // FxRatesDoc type is exported there; or redeclare identically
import type { PoiEntry, AuditEntry } from '@/types';
import { subscribeTable, usernamesToIds } from './supabase/helpers';

// ── fx_rates ──
export function sbSubscribeFxRates(cb: (doc: FxRatesDoc) => void, client: SupabaseClient = sb) {
  return subscribeTable(client, 'fx_rates', async (cl) => {
    const { data, error } = await cl.from('fx_rates').select('currency, rate_to_vnd, pushed_at, pushed_by');
    if (error) throw error;
    const rates: Record<string, number> = {};
    let meta: FxRatesDoc['_meta'];
    for (const r of data ?? []) {
      rates[r.currency as string] = r.rate_to_vnd as number;
      if (r.pushed_at) meta = { pushedAt: r.pushed_at as string, pushedBy: (r.pushed_by as string) ?? undefined };
    }
    return { rates, _meta: meta } as FxRatesDoc;
  }, cb);
}

export async function sbPushFxRates(rates: Record<string, number>, pushedBy: string, client: SupabaseClient = sb): Promise<string> {
  const pushedAt = new Date().toISOString();
  const rows = Object.entries(rates).map(([currency, rate]) => ({
    currency, rate_to_vnd: rate, pushed_at: pushedAt, pushed_by: pushedBy,
  }));
  // full overwrite semantics: delete currencies no longer present, then upsert
  const del = await client.from('fx_rates').delete().not('currency', 'in', `(${Object.keys(rates).map((k) => `"${k}"`).join(',') || '""'})`);
  if (del.error) throw new Error('sbPushFxRates delete: ' + del.error.message);
  const up = await client.from('fx_rates').upsert(rows, { onConflict: 'currency' });
  if (up.error) throw new Error('sbPushFxRates: ' + up.error.message);
  return pushedAt;
}

// ── pois ──
const rowToPoi = (r: Record<string, unknown>): PoiEntry => ({
  id: r.id as string, place: r.place as string,
  destination: (r.destination as string) ?? undefined,
  commentary: (r.commentary as string) ?? '',
  createdBy: (r.created_by_name as string) ?? undefined,
});
export function sbSubscribePois(cb: (list: PoiEntry[]) => void, client: SupabaseClient = sb) {
  return subscribeTable(client, 'pois', async (cl) => {
    const { data, error } = await cl.from('pois').select('*').order('place');
    if (error) throw error;
    return (data ?? []).map(rowToPoi);
  }, cb);
}
export async function sbPushPois(list: PoiEntry[], pushedBy: { name: string; role: string }, client: SupabaseClient = sb): Promise<void> {
  const rows = list.map((p) => ({
    id: p.id, place: p.place, destination: p.destination ?? null,
    commentary: p.commentary ?? '', created_by_name: pushedBy.name,
    updated_at: new Date().toISOString(), updated_by_name: `${pushedBy.name} (${pushedBy.role})`,
  }));
  // full-overwrite: delete ids not in the new set, then upsert
  const keep = list.map((p) => `"${p.id}"`).join(',') || '""';
  const del = await client.from('pois').delete().not('id', 'in', `(${keep})`);
  if (del.error) throw new Error('sbPushPois delete: ' + del.error.message);
  const up = await client.from('pois').upsert(rows, { onConflict: 'id' });
  if (up.error) throw new Error('sbPushPois: ' + up.error.message);
}

// ── audit_log ──
export async function sbLogAudit(entry: AuditEntry, client: SupabaseClient = sb): Promise<void> {
  const idMap = await usernamesToIds(client, [entry.byU]);
  const { error } = await client.from('audit_log').insert({
    at: entry.at, created_by: idMap.get(entry.byU) ?? null, actor_name: entry.byName,
    action: entry.action, entity: entry.entity, name: entry.name, note: entry.note ?? null,
  });
  if (error) throw new Error('sbLogAudit: ' + error.message);
}
export function sbSubscribeAuditLog(cb: (entries: AuditEntry[]) => void, client: SupabaseClient = sb) {
  return subscribeTable(client, 'audit_log', async (cl) => {
    const { data, error } = await cl.from('audit_log').select('*').order('at', { ascending: false }).limit(2000);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id as string, at: r.at as string, byU: '', byName: (r.actor_name as string) ?? '',
      action: r.action as AuditEntry['action'], entity: r.entity as string, name: r.name as string,
      note: (r.note as string) ?? undefined,
    }));
  }, cb);
}
```
> If `PoiEntry`/`AuditEntry` lack `createdBy`/`byU` round-trip fields, match exactly what `firebase.ts` returns — the display name is the load-bearing field; `byU` may be left `''` on read (the app renders `byName`).

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Typecheck, lint, commit**
```bash
npm run typecheck && npm run lint
git add src/lib/supabase.ts tests/supabase/simple.test.ts
git commit -m "feat(supabase): fx_rates, pois, audit_log gateway"
```

---

## Task 6: customers (reference pattern for parent + shallow child)

**Files:** Modify `src/lib/supabase.ts`; Test `tests/supabase/customers.test.ts`

**Interfaces (match `firebase.ts:502-523`):**
- `sbSubscribeCustomers(cb: (list: Customer[]) => void, client?)` — assembles `customers` + `customer_contacts` into `Customer[]` (`src/types/customer.ts:8-20`; contacts = `CustomerContact[]`).
- `sbPushCustomers(list: Customer[], pushedBy: {name,role}, client?): Promise<void>` — upsert customers (mapping `id`→`legacy_id`, generating a uuid pk on first insert), replace each customer's `customer_contacts`.

- [ ] **Step 1: Write the failing test**

Create `tests/supabase/customers.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbPushCustomers, sbSubscribeCustomers } from '../../src/lib/supabase';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('customers gateway', () => {
  beforeEach(async () => { await truncate(['customer_contacts', 'customers']); });

  it('round-trips a customer with contacts', async () => {
    const c = await getViettoursClient();
    await sbPushCustomers([{
      id: 'cust-1', name: 'Acme Co', type: 'company', address: 'HN', taxCode: '123',
      contacts: [{ name: 'Linh', phone: '09', email: 'l@x.vn', position: 'PM' }],
      note: 'vip', createdAt: '2026-01-01T00:00:00Z', createdBy: 'tester',
    }], { name: 'QA', role: 'Sales' }, c);

    const list = await once<any[]>((cb) => sbSubscribeCustomers(cb as any, c));
    const cu = list.find((x) => x.id === 'cust-1')!;
    expect(cu.name).toBe('Acme Co');
    expect(cu.contacts).toEqual([{ name: 'Linh', phone: '09', email: 'l@x.vn', position: 'PM' }]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** in `src/lib/supabase.ts`:
```ts
import type { Customer } from '@/types';

const rowToCustomer = (r: Record<string, unknown>, contacts: Customer['contacts']): Customer => ({
  id: r.legacy_id as string, name: r.name as string, type: r.type as Customer['type'],
  address: (r.address as string) ?? undefined, taxCode: (r.tax_code as string) ?? undefined,
  contacts, note: (r.note as string) ?? '',
  createdAt: r.created_at as string, createdBy: (r.created_by_name as string) ?? '',
  updatedAt: (r.updated_at as string) ?? undefined, updatedBy: (r.updated_by_name as string) ?? undefined,
});

export function sbSubscribeCustomers(cb: (list: Customer[]) => void, client: SupabaseClient = sb) {
  return subscribeTable(client, 'customers', async (cl) => {
    const { data: rows, error } = await cl.from('customers').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    const ids = (rows ?? []).map((r) => r.id as string);
    const { data: contacts } = ids.length
      ? await cl.from('customer_contacts').select('*').in('customer_id', ids).order('sort_order')
      : { data: [] as Record<string, unknown>[] };
    const byParent = new Map<string, Customer['contacts']>();
    for (const ct of contacts ?? []) {
      const arr = byParent.get(ct.customer_id as string) ?? [];
      arr.push({ name: ct.name as string, phone: ct.phone as string, email: ct.email as string, position: ct.position as string });
      byParent.set(ct.customer_id as string, arr);
    }
    return (rows ?? []).map((r) => rowToCustomer(r, byParent.get(r.id as string) ?? []));
  }, cb);
}

export async function sbPushCustomers(list: Customer[], pushedBy: { name: string; role: string }, client: SupabaseClient = sb): Promise<void> {
  const stamp = { updated_at: new Date().toISOString(), updated_by_name: `${pushedBy.name} (${pushedBy.role})` };
  for (const cust of list) {
    // upsert parent by legacy_id, capture uuid
    const { data: up, error: upErr } = await client.from('customers').upsert({
      legacy_id: cust.id, name: cust.name, type: cust.type,
      address: cust.address ?? null, tax_code: cust.taxCode ?? null, note: cust.note ?? '',
      created_by_name: cust.createdBy, ...stamp,
    }, { onConflict: 'legacy_id' }).select('id').single();
    if (upErr) throw new Error('sbPushCustomers upsert: ' + upErr.message);
    await replaceChildren(client, 'customer_contacts', 'customer_id', up!.id, cust.contacts.map((ct, i) => ({
      customer_id: up!.id, name: ct.name, phone: ct.phone, email: ct.email, position: ct.position, sort_order: i,
    })));
  }
  // delete customers removed from the list (full-overwrite parity with fbPushCustomers)
  const keep = list.map((c) => `"${c.id}"`).join(',') || '""';
  const del = await client.from('customers').delete().not('legacy_id', 'in', `(${keep})`);
  if (del.error) throw new Error('sbPushCustomers delete: ' + del.error.message);
}
```

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Typecheck, lint, commit**
```bash
npm run typecheck && npm run lint
git add src/lib/supabase.ts tests/supabase/customers.test.ts
git commit -m "feat(supabase): customers gateway (parent + contacts)"
```

---

## Tasks 7–17: remaining entity families (same pattern as Task 6)

Each task below follows the **exact pattern established in Task 6**: a `subscribe*` that joins parent + child rows and reassembles the app shape, and a `push`/`save` that upserts the parent (by `legacy_id`/natural key), `replaceChildren` for each child set, and deletes removed parents for full-overwrite parity. For each, **open the matching `fb*` function in `src/lib/firebase.ts` and match its signature and return shape exactly**, write the round-trip integration test first (FAIL), implement, run (PASS), `npm run typecheck && npm run lint`, then commit.

> These are listed as separate tasks (separate reviews/commits) but share the Task 6 mechanics. Each implementer MUST read the cited `fb*` source lines and the cited `src/types` file to get column/field mapping exact — do not infer.

### Task 7: suppliers (`firebase.ts:531-550`; `src/types/ncc.ts:39-50`)
`sbSubscribeNcc(cb: (list: Ncc[]) => void, client?)`, `sbPushNcc(list, pushedBy, client?)`. Parent `suppliers` + child `supplier_contacts`; `sectors` is `text[]`. Test: round-trip a supplier with 2 contacts + sectors array.

### Task 8: ncc_products (`firebase.ts:1143-1158`; `src/types/ncc.ts:21-35`)
`sbSubscribeNccProducts(cb, client?)`, `sbPushNccProducts(list, pushedBy, client?)`. Parent `ncc_products` + child `ncc_product_prices`; `files: FileAttachment[]` via `saveAttachments`/`loadAttachments(parentType='ncc_product', parentId=legacy_id)`. Test: round-trip a product with 2 prices + 1 file.

### Task 9: contracts (`firebase.ts:558-586`; `src/types/contract.ts`)
`sbSubscribeContracts(cb, client?)`, `sbGetContracts(client?): Promise<Contract[]>`, `sbPushContracts(list, pushedBy, client?)`. Parent `contracts` (`party_b` jsonb, `includes`/`excludes` text[]) + children `contract_payments`, `contract_cancels` (map `when`→`when_text`). Test: round-trip a contract with 2 payments + 1 cancel + party_b.

### Task 10: rate card (`firebase.ts:155-195`; `src/types/rates.ts`)
`sbPullMasterRC(client?): Promise<RateCardDoc | null>`, `sbPushMasterRC(rc: RateCard, pushedBy: string, client?): Promise<string>`, `sbSubscribeMasterRC(cb, client?)`. Map: `rc.hotels` (Record<city, HotelEntry[]>) → `rate_card_hotels` rows `(city, entries jsonb)`; `rc.otherRates` → `rate_card_other` rows `(rkey, entry jsonb)`; `rc.visaRates` → `rate_card_visa` singleton `data jsonb`; meta → `rate_card_meta`. **Preserve the `vte_visa_rates` mirror logic** exactly as `fbPushMasterRC`/`stripVisaMirror` do (`firebase.ts:146-153,161-189`). Test: round-trip hotels for 2 cities + visaRates + otherRates, and assert the visa mirror is stripped on read.

### Task 11: visa_products (`firebase.ts:1001-1034`; `src/types/visa.ts:13-41`)
`sbSubscribeVisaProducts(cb: (doc: VisaProductsDoc | null) => void, client?)`, `sbSaveVisaProducts(data: {products, rates}, savedBy, client?)`. Parent rows `visa_products` + child `visa_product_fees`; `visa_products_meta` singleton holds `rates jsonb` + `versions jsonb` (push a new version snapshot, cap 20 — replicate `firebase.ts:1018-1033`). Test: save products+rates, reload, assert a version was appended.

### Task 12: visa_procedures (`firebase.ts:1045-1095`; `src/types/visa.ts:71-105`)
`sbSubscribeVisaProcs(cb: (list: VisaProcIndexEntry[]) => void, client?)` (select metadata cols only), `sbGetVisaProc(id, client?): Promise<VisaProcDoc | null>` (full row), `sbSaveVisaProc(d, savedBy, client?)`, `sbDeleteVisaProc(id, client?)`. `sections`/`versions` are jsonb; `collaborators` → `uuid[]` + `collaborator_usernames text[]` (resolve via `usernamesToIds`); attachments via helper. The Firestore "index doc" becomes a metadata SELECT — no separate index table. Test: save a proc, list shows its index entry, get returns full sections, delete removes it.

### Task 13: visa_projects (`firebase.ts:1103-1118`; `src/types/visa.ts:160-193`)
`sbSubscribeVisaProjects(cb: (list: VisaProjectDoc[]) => void, client?)`, `sbPushVisaProjects(list, pushedBy, client?)`. One `visa_projects` row per project; `milestones`/`applicants` jsonb; `main_staff`/`support_staff`/`collaborators` → `uuid[]` + `*_usernames text[]`; `linked_proc_ids text[]`; attachments via helper. Test: round-trip a project with milestones + applicants + staff arrays.

### Task 14: itineraries (`firebase.ts:846-907`; `src/types/itinerary.ts:82-133`)
`sbSubscribeItineraries(cb: (list: ItineraryIndexEntry[]) => void, client?)` (metadata SELECT), `sbGetItinerary(id, client?): Promise<Itinerary | null>`, `sbSaveItinerary(itin, savedBy, client?)`, `sbDeleteItinerary(id, client?)`. Parent `itineraries` (`includes`/`excludes` text[], `exec` jsonb) + child `itinerary_days` (`meals`/`segments` jsonb) + child `itinerary_flights`. Reassemble `schedule: Day[]` from `itinerary_days` ordered by `sort_order`. Test: save itinerary with 2 days + flights, get reassembles schedule, list shows index entry, delete removes it.

### Task 15: menus + restaurants (`firebase.ts:917-991`; `src/types/menu.ts`)
`sbSubscribeRestaurants(cb, client?)` / `sbSaveRestaurants(list, savedBy, client?)` (parent `restaurants` + child `restaurant_menus`); `sbSubscribeMenus(cb: (list: MenuIndexEntry[]) => void, client?)` / `sbGetMenu(id, client?)` / `sbSaveMenu(m, savedBy, client?)` / `sbDeleteMenu(id, client?)` (parent `menus` + child `menu_days` with `meals` jsonb). Test: round-trip a restaurant w/ menus, and a menu w/ 2 days; list + get + delete.

### Task 16: notifications + threads (`firebase.ts:594-709`; `src/types/notification.ts`)
`sbSendNotification(targetUsername, notif, client?)`, `sbSubscribeNotifications(username, cb, client?)`, `sbPushNotifications(username, notifications, client?)`, `sbSendNotificationMany(targets, notif, client?)`; `sbEnsureNotifThread(thread, client?)`, `sbSubscribeNotifThread(id, cb, client?)`, `sbAddThreadComment(id, comment, client?)`, `sbSetThreadStatus(id, status, updatedByName, client?)`. Map notification owner `username`→`user_id` (resolve uuid; the owning row's `user_id`), `link`/`data` jsonb. Threads: `notification_threads` (text PK = threadId) + `notification_thread_members` + `notification_comments`. Realtime: subscribe per-user (filter `user_id`) and per-thread (filter `thread_id`). Test: send to a user → subscribe yields it; ensure thread + add comment → subscribe yields comment; mark read via push.

### Task 17: payment_approvals + tour_payments (`firebase.ts:735-835`; `src/types/payment.ts`)
`sbSetApprovalStage(key, stage, status, approverUsername, approverName, note, intended, client?)`, `sbSubscribePaymentApprovals(cb: (doc: PaymentApprovalDoc) => void, client?)` (assemble `payment_approvals` + `payment_approval_stages` into the `key → entry` map shape); `sbSaveTourPayments(tourKey, payments, customItems, savedBy, client?)`, `sbGetTourPayments(tourKey, client?)`, `sbSubscribeTourPayments(tourKey, cb, client?)` (parent `tour_payments` + children `payment_records` (installments jsonb) + `custom_cost_items`). Replicate the finalStatus rules at `firebase.ts:810-811`. Test: set stage 1 approved → entry finalStatus `pending_stage2`; save tour payments → get/subscribe round-trips records + custom items.

---

## Task 18: Phase-1 surface verification + Phase-2 boundary doc

**Files:** Modify `src/lib/supabase.ts` (ensure all Phase 1 `sb*` are exported); Create `tests/supabase/parity.test.ts`; Modify `docs/supabase-setup.md`.

**Interfaces:** Produces a parity check asserting every Phase-1 `sb*` name exists and a documented list of the Phase-2-deferred quote functions.

- [ ] **Step 1: Write a name-parity test**

Create `tests/supabase/parity.test.ts` listing every Phase-1 `sb*` name and asserting it is a function:
```ts
import { describe, it, expect } from 'vitest';
import * as gw from '../../src/lib/supabase';

const PHASE1 = [
  'sbPullUsers','sbPushUsers','sbPurgeLegacyPasswords',
  'sbSubscribeFxRates','sbPushFxRates','sbSubscribePois','sbPushPois','sbLogAudit','sbSubscribeAuditLog',
  'sbSubscribeCustomers','sbPushCustomers','sbSubscribeNcc','sbPushNcc','sbSubscribeNccProducts','sbPushNccProducts',
  'sbSubscribeContracts','sbGetContracts','sbPushContracts',
  'sbPullMasterRC','sbPushMasterRC','sbSubscribeMasterRC',
  'sbSubscribeVisaProducts','sbSaveVisaProducts','sbSubscribeVisaProcs','sbGetVisaProc','sbSaveVisaProc','sbDeleteVisaProc',
  'sbSubscribeVisaProjects','sbPushVisaProjects',
  'sbSubscribeItineraries','sbGetItinerary','sbSaveItinerary','sbDeleteItinerary',
  'sbSubscribeRestaurants','sbSaveRestaurants','sbSubscribeMenus','sbGetMenu','sbSaveMenu','sbDeleteMenu',
  'sbSendNotification','sbSubscribeNotifications','sbPushNotifications','sbSendNotificationMany',
  'sbEnsureNotifThread','sbSubscribeNotifThread','sbAddThreadComment','sbSetThreadStatus',
  'sbSetApprovalStage','sbSubscribePaymentApprovals','sbSaveTourPayments','sbGetTourPayments','sbSubscribeTourPayments',
];
describe('Phase-1 gateway surface', () => {
  it('exports every Phase-1 sb* function', () => {
    for (const name of PHASE1) expect(typeof (gw as Record<string, unknown>)[name], name).toBe('function');
  });
});
```

- [ ] **Step 2: Run it; fix any missing exports until PASS.** `npm run test:integration -- tests/supabase/parity.test.ts`
- [ ] **Step 3: Document the Phase-2 boundary** — append a "Phase 1 gateway: done; Phase 2: quotes" section to `docs/supabase-setup.md` listing the deferred quote functions (from this plan's Scope section) and that stores are NOT yet wired (Phase 4).
- [ ] **Step 4: Full gate** — run `npm run typecheck && npm run lint && npm test && npm run test:integration` (unit + integration). All green.
- [ ] **Step 5: Commit**
```bash
git add src/lib/supabase.ts tests/supabase/parity.test.ts docs/supabase-setup.md
git commit -m "feat(supabase): Phase-1 gateway surface complete + Phase-2 boundary doc"
```

---

## Self-Review

**Spec coverage (against the migration design spec + this phase's scope):**
- Gateway with identical `fb*` signatures → Tasks 4–17 each cite the `firebase.ts` source lines to match; Task 18 asserts the name surface. ✔
- "Preserve gateway public API; stores change only import line later" → optional trailing `client` param keeps the production signature identical to `fb*` (stores call with no client arg). ✔
- Realtime parity (`onSnapshot` → Supabase Realtime) → `subscribeTable` (Task 2). ✔
- UUID identity mapping → `usernamesToIds`/`idsToUsernames` (Task 2), applied in audit/visa/notifications/approvals. ✔
- Files stay in R2; only refs stored → `attachments` helper (Task 3), used by ncc_products/visa. ✔
- Don't touch `firebase.ts` / don't wire stores → stated in Global Constraints; no task modifies stores or firebase.ts. ✔
- TDD with a real test runner → Vitest already present; integration harness (Task 1). ✔
- Quote machinery deferred → Scope section + Task 18 doc. ✔

**Placeholder scan:** every code step has real code; the repetitive families (Tasks 7–17) cite exact `fb*` source lines + `src/types` files and reuse the fully-worked Task 6 pattern rather than restating boilerplate — each is still an independently testable, committable deliverable. No "TBD"/"add error handling". ✔

**Type consistency:** `sb*` names in Task 18's parity list match the names defined in Tasks 4–17; `replaceChildren`/`subscribeTable`/`usernamesToIds`/`loadAttachments`/`saveAttachments` are defined in Tasks 2–3 and consumed by later tasks under the same names. The optional-`client` convention is uniform. ✔

**Known risk to watch during execution:** the `.not('col','in', '(...)')` full-overwrite delete pattern (fx/pois/customers) must quote string ids correctly for PostgREST; if a family's ids contain commas/quotes, switch to fetching existing ids and deleting the set difference. Flagged for implementers of Tasks 5–17.
