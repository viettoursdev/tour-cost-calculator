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

## Task 7: suppliers (`firebase.ts:535-554`; `src/types/ncc.ts:39-50`)

**Files:**
- Modify: `src/lib/supabase.ts`
- Test: `tests/supabase/suppliers.test.ts`

**Interfaces (match `firebase.ts:535-554`):**
- `sbSubscribeNcc(cb: (list: Ncc[]) => void, client?: SupabaseClient): Unsubscribe` — assembles `suppliers` + `supplier_contacts` into `Ncc[]`. `Ncc.sectors` maps to the `sectors text[]` column directly.
- `sbPushNcc(list: Ncc[], pushedBy: { name: string; role: string }, client?: SupabaseClient): Promise<void>` — upsert each supplier by `legacy_id`, `replaceChildren` for `supplier_contacts`, full-overwrite delete of removed parents.
- DB: `suppliers` (pk `id` uuid, `legacy_id` text unique, `name`, `sectors text[]`, `location`, `note`, `created_by_name`, `updated_by_name`, `created_at`, `updated_at`); `supplier_contacts` (pk `id`, `supplier_id` uuid FK, `name`, `phone`, `email`, `position`, `sort_order`).

- [ ] **Step 1: Write the failing test**

Create `tests/supabase/suppliers.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbPushNcc, sbSubscribeNcc } from '../../src/lib/supabase';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('suppliers gateway', () => {
  beforeEach(async () => { await truncate(['supplier_contacts', 'suppliers']); });

  it('round-trips a supplier with contacts and sectors', async () => {
    const c = await getViettoursClient();
    await sbPushNcc([{
      id: 'ncc-1',
      name: 'Khách sạn Sunrise',
      sectors: ['hotel', 'spa'],
      location: 'Đà Nẵng',
      contacts: [
        { name: 'Hoa', phone: '090', email: 'hoa@sunrise.vn', position: 'Sales' },
        { name: 'Minh', phone: '091', email: 'minh@sunrise.vn', position: 'Director' },
      ],
      note: 'Đối tác lâu năm',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'tester',
    }], { name: 'QA', role: 'Operations' }, c);

    const list = await once<any[]>((cb) => sbSubscribeNcc(cb as any, c));
    const ncc = list.find((x) => x.id === 'ncc-1')!;
    expect(ncc.name).toBe('Khách sạn Sunrise');
    expect(ncc.sectors).toEqual(['hotel', 'spa']);
    expect(ncc.location).toBe('Đà Nẵng');
    expect(ncc.note).toBe('Đối tác lâu năm');
    expect(ncc.contacts).toEqual([
      { name: 'Hoa', phone: '090', email: 'hoa@sunrise.vn', position: 'Sales' },
      { name: 'Minh', phone: '091', email: 'minh@sunrise.vn', position: 'Director' },
    ]);
  });

  it('full-overwrite: removes suppliers not in the new list', async () => {
    const c = await getViettoursClient();
    await sbPushNcc([
      { id: 'ncc-a', name: 'A', sectors: [], location: '', contacts: [], note: '', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'tester' },
      { id: 'ncc-b', name: 'B', sectors: [], location: '', contacts: [], note: '', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'tester' },
    ], { name: 'QA', role: 'Operations' }, c);
    await sbPushNcc([
      { id: 'ncc-a', name: 'A updated', sectors: ['transport'], location: 'HN', contacts: [], note: '', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'tester' },
    ], { name: 'QA', role: 'Operations' }, c);
    const list = await once<any[]>((cb) => sbSubscribeNcc(cb as any, c));
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('A updated');
    expect(list[0].sectors).toEqual(['transport']);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm run test:integration -- tests/supabase/suppliers.test.ts`
Expected: FAIL — `sbPushNcc`/`sbSubscribeNcc` not exported from `src/lib/supabase.ts`.

- [ ] **Step 3: Implement in `src/lib/supabase.ts`**

Append to `src/lib/supabase.ts`:
```ts
import type { Ncc } from '@/types';
import { subscribeTable, replaceChildren } from './supabase/helpers';

// ── Suppliers (NCC) ──

const rowToNcc = (r: Record<string, unknown>, contacts: Ncc['contacts']): Ncc => ({
  id: r.legacy_id as string,
  name: r.name as string,
  sectors: (r.sectors as string[]) ?? [],
  location: (r.location as string) ?? '',
  contacts,
  note: (r.note as string) ?? '',
  createdAt: r.created_at as string,
  createdBy: (r.created_by_name as string) ?? '',
  updatedAt: (r.updated_at as string) ?? undefined,
  updatedBy: (r.updated_by_name as string) ?? undefined,
});

export function sbSubscribeNcc(cb: (list: Ncc[]) => void, client: SupabaseClient = sb) {
  return subscribeTable(client, 'suppliers', async (cl) => {
    const { data: rows, error } = await cl
      .from('suppliers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const ids = (rows ?? []).map((r) => r.id as string);
    const { data: contacts } = ids.length
      ? await cl
          .from('supplier_contacts')
          .select('*')
          .in('supplier_id', ids)
          .order('sort_order')
      : { data: [] as Record<string, unknown>[] };
    const byParent = new Map<string, Ncc['contacts']>();
    for (const ct of contacts ?? []) {
      const arr = byParent.get(ct.supplier_id as string) ?? [];
      arr.push({
        name: ct.name as string,
        phone: ct.phone as string,
        email: ct.email as string,
        position: ct.position as string,
      });
      byParent.set(ct.supplier_id as string, arr);
    }
    return (rows ?? []).map((r) => rowToNcc(r, byParent.get(r.id as string) ?? []));
  }, cb);
}

export async function sbPushNcc(
  list: Ncc[],
  pushedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  const stamp = {
    updated_at: new Date().toISOString(),
    updated_by_name: `${pushedBy.name} (${pushedBy.role})`,
  };
  for (const ncc of list) {
    const { data: up, error: upErr } = await client
      .from('suppliers')
      .upsert(
        {
          legacy_id: ncc.id,
          name: ncc.name,
          sectors: ncc.sectors,
          location: ncc.location,
          note: ncc.note ?? '',
          created_by_name: ncc.createdBy,
          ...stamp,
        },
        { onConflict: 'legacy_id' },
      )
      .select('id')
      .single();
    if (upErr) throw new Error('sbPushNcc upsert: ' + upErr.message);
    await replaceChildren(
      client,
      'supplier_contacts',
      'supplier_id',
      up!.id,
      ncc.contacts.map((ct, i) => ({
        supplier_id: up!.id,
        name: ct.name,
        phone: ct.phone,
        email: ct.email,
        position: ct.position,
        sort_order: i,
      })),
    );
  }
  // full-overwrite: remove suppliers no longer in the list
  const keep = list.map((n) => `"${n.id}"`).join(',') || '""';
  const del = await client
    .from('suppliers')
    .delete()
    .not('legacy_id', 'in', `(${keep})`);
  if (del.error) throw new Error('sbPushNcc delete: ' + del.error.message);
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm run test:integration -- tests/supabase/suppliers.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```
Expected: no errors, no warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase.ts tests/supabase/suppliers.test.ts
git commit -m "feat(supabase): suppliers gateway (sbSubscribeNcc / sbPushNcc)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: ncc_products (`firebase.ts:1202-1217`; `src/types/ncc.ts:21-35`)

**Files:**
- Modify: `src/lib/supabase.ts`
- Test: `tests/supabase/ncc_products.test.ts`

**Interfaces (match `firebase.ts:1202-1217`):**
- `sbSubscribeNccProducts(cb: (list: NccProduct[]) => void, client?: SupabaseClient): Unsubscribe` — assembles `ncc_products` + `ncc_product_prices` + `attachments` (via `loadAttachments(client, 'ncc_product', legacy_id)`) into `NccProduct[]`.
- `sbPushNccProducts(list: NccProduct[], pushedBy: { name: string; role: string }, client?: SupabaseClient): Promise<void>` — upsert each product by `legacy_id`, `replaceChildren` for `ncc_product_prices`, `saveAttachments` for `files`, full-overwrite delete of removed products.
- DB: `ncc_products` (pk `id` uuid, `legacy_id` text unique, `supplier_id` uuid nullable FK→`suppliers(id)`, `ncc_name`, `category`, `name`, `description`, `note`, `created_by_name`, `updated_by_name`, `created_at`, `updated_at`); `ncc_product_prices` (pk `id`, `product_id` uuid FK, `label`, `amount`, `cur`, `unit`, `note`, `sort_order`); `attachments` (polymorphic: `parent_type='ncc_product'`, `parent_id=legacy_id`).
- The `nccId` field (nullable supplier reference) resolves to `supplier_id` by looking up the `suppliers` row whose `legacy_id = ncc.nccId`. When `nccId` is null or unresolvable, write `null` to `supplier_id`.

- [ ] **Step 1: Write the failing test**

Create `tests/supabase/ncc_products.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbPushNccProducts, sbSubscribeNccProducts } from '../../src/lib/supabase';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('ncc_products gateway', () => {
  beforeEach(async () => {
    await truncate(['attachments', 'ncc_product_prices', 'ncc_products', 'supplier_contacts', 'suppliers']);
  });

  it('round-trips a product with prices and a file attachment', async () => {
    const c = await getViettoursClient();
    await sbPushNccProducts([{
      id: 'prod-1',
      nccId: null,
      nccName: 'Sunrise Hotel',
      category: 'hotel',
      name: 'Phòng Deluxe',
      description: 'Hướng biển, tầng cao',
      prices: [
        { id: 'pr-1', label: 'Mùa cao điểm', amount: 2_500_000, cur: 'VND', unit: 'đêm', note: 'T6-T8' },
        { id: 'pr-2', label: 'Mùa thấp điểm', amount: 1_800_000, cur: 'VND', unit: 'đêm' },
      ],
      files: [
        { key: 'r2-prod-1-quote.pdf', name: 'báo giá.pdf', uploadedBy: 'Hoa', uploadedAt: '2026-03-01T08:00:00.000Z' },
      ],
      note: 'Giá chưa VAT',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'tester',
    }], { name: 'QA', role: 'Operations' }, c);

    const list = await once<any[]>((cb) => sbSubscribeNccProducts(cb as any, c));
    const prod = list.find((x) => x.id === 'prod-1')!;
    expect(prod.name).toBe('Phòng Deluxe');
    expect(prod.nccName).toBe('Sunrise Hotel');
    expect(prod.category).toBe('hotel');
    expect(prod.description).toBe('Hướng biển, tầng cao');
    expect(prod.note).toBe('Giá chưa VAT');
    expect(prod.prices).toEqual([
      { id: 'pr-1', label: 'Mùa cao điểm', amount: 2_500_000, cur: 'VND', unit: 'đêm', note: 'T6-T8' },
      { id: 'pr-2', label: 'Mùa thấp điểm', amount: 1_800_000, cur: 'VND', unit: 'đêm', note: undefined },
    ]);
    expect(prod.files).toEqual([
      { key: 'r2-prod-1-quote.pdf', name: 'báo giá.pdf', uploadedBy: 'Hoa', uploadedAt: '2026-03-01T08:00:00.000Z' },
    ]);
  });

  it('full-overwrite: removes products not in the new list', async () => {
    const c = await getViettoursClient();
    const base = { nccId: null, nccName: 'X', category: 'transport' as const, name: 'X', prices: [], files: [], createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'tester' };
    await sbPushNccProducts([
      { ...base, id: 'prod-a', name: 'A' },
      { ...base, id: 'prod-b', name: 'B' },
    ], { name: 'QA', role: 'Operations' }, c);
    await sbPushNccProducts([
      { ...base, id: 'prod-a', name: 'A v2' },
    ], { name: 'QA', role: 'Operations' }, c);
    const list = await once<any[]>((cb) => sbSubscribeNccProducts(cb as any, c));
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('A v2');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm run test:integration -- tests/supabase/ncc_products.test.ts`
Expected: FAIL — `sbPushNccProducts`/`sbSubscribeNccProducts` not exported from `src/lib/supabase.ts`.

- [ ] **Step 3: Implement in `src/lib/supabase.ts`**

Append to `src/lib/supabase.ts`:
```ts
import type { NccProduct, NccPrice } from '@/types';
import { subscribeTable, replaceChildren } from './supabase/helpers';
import { loadAttachments, saveAttachments } from './supabase'; // already in same file

// ── NCC Products ──

const rowToPrice = (r: Record<string, unknown>): NccPrice => ({
  id: r.id as string,
  label: r.label as string,
  amount: r.amount as number,
  cur: r.cur as string,
  unit: r.unit as string,
  note: (r.note as string) ?? undefined,
});

const rowToNccProduct = (
  r: Record<string, unknown>,
  prices: NccPrice[],
  files: import('@/types').FileAttachment[],
): NccProduct => ({
  id: r.legacy_id as string,
  nccId: (r.ncc_id_legacy as string) ?? null,
  nccName: (r.ncc_name as string) ?? '',
  category: r.category as NccProduct['category'],
  name: r.name as string,
  description: (r.description as string) ?? undefined,
  prices,
  files,
  note: (r.note as string) ?? undefined,
  createdAt: r.created_at as string,
  createdBy: (r.created_by_name as string) ?? '',
  updatedAt: (r.updated_at as string) ?? undefined,
  updatedBy: (r.updated_by_name as string) ?? undefined,
});

export function sbSubscribeNccProducts(
  cb: (list: NccProduct[]) => void,
  client: SupabaseClient = sb,
) {
  return subscribeTable(client, 'ncc_products', async (cl) => {
    const { data: rows, error } = await cl
      .from('ncc_products')
      .select('*, suppliers!ncc_products_supplier_id_fkey(legacy_id)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const productIds = (rows ?? []).map((r) => r.id as string);
    const { data: priceRows } = productIds.length
      ? await cl
          .from('ncc_product_prices')
          .select('*')
          .in('product_id', productIds)
          .order('sort_order')
      : { data: [] as Record<string, unknown>[] };
    const pricesByProduct = new Map<string, NccPrice[]>();
    for (const pr of priceRows ?? []) {
      const arr = pricesByProduct.get(pr.product_id as string) ?? [];
      arr.push(rowToPrice(pr));
      pricesByProduct.set(pr.product_id as string, arr);
    }
    return Promise.all(
      (rows ?? []).map(async (r) => {
        const legacyId = r.legacy_id as string;
        const files = await loadAttachments(cl, 'ncc_product', legacyId);
        // Recover nccId from the joined supplier row
        const nccIdLegacy: string | null =
          (r.suppliers as { legacy_id: string } | null)?.legacy_id ?? null;
        return rowToNccProduct(
          { ...r, ncc_id_legacy: nccIdLegacy },
          pricesByProduct.get(r.id as string) ?? [],
          files,
        );
      }),
    );
  }, cb);
}

export async function sbPushNccProducts(
  list: NccProduct[],
  pushedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  const stamp = {
    updated_at: new Date().toISOString(),
    updated_by_name: `${pushedBy.name} (${pushedBy.role})`,
  };

  // Resolve nccId (legacy_id on suppliers) → supplier uuid for FK
  const nccLegacyIds = Array.from(
    new Set(list.map((p) => p.nccId).filter(Boolean) as string[]),
  );
  let supplierIdMap = new Map<string, string>();
  if (nccLegacyIds.length) {
    const { data: sups, error: supErr } = await client
      .from('suppliers')
      .select('id, legacy_id')
      .in('legacy_id', nccLegacyIds);
    if (supErr) throw new Error('sbPushNccProducts resolve suppliers: ' + supErr.message);
    supplierIdMap = new Map((sups ?? []).map((s) => [s.legacy_id as string, s.id as string]));
  }

  for (const prod of list) {
    const { data: up, error: upErr } = await client
      .from('ncc_products')
      .upsert(
        {
          legacy_id: prod.id,
          supplier_id: prod.nccId ? (supplierIdMap.get(prod.nccId) ?? null) : null,
          ncc_name: prod.nccName,
          category: prod.category,
          name: prod.name,
          description: prod.description ?? null,
          note: prod.note ?? null,
          created_by_name: prod.createdBy,
          ...stamp,
        },
        { onConflict: 'legacy_id' },
      )
      .select('id')
      .single();
    if (upErr) throw new Error('sbPushNccProducts upsert: ' + upErr.message);
    await replaceChildren(
      client,
      'ncc_product_prices',
      'product_id',
      up!.id,
      prod.prices.map((pr, i) => ({
        product_id: up!.id,
        label: pr.label,
        amount: pr.amount,
        cur: pr.cur,
        unit: pr.unit,
        note: pr.note ?? null,
        sort_order: i,
      })),
    );
    await saveAttachments(client, 'ncc_product', prod.id, prod.files);
  }

  // full-overwrite: remove products no longer in the list
  const keep = list.map((p) => `"${p.id}"`).join(',') || '""';
  const del = await client
    .from('ncc_products')
    .delete()
    .not('legacy_id', 'in', `(${keep})`);
  if (del.error) throw new Error('sbPushNccProducts delete: ' + del.error.message);
}
```

> Note on price `id` round-trip: `ncc_product_prices` has its own uuid `id` generated by Postgres, not the app-level `NccPrice.id`. To preserve the app's price `id` across round-trips, either (a) store it in an additional `legacy_id text` column (requires a migration) or (b) accept that price ids are regenerated on each push — the stores currently do not use price ids for cross-referencing, so option (b) is safe for Phase 1. The test above asserts the price `id` values returned by `sbSubscribeNccProducts`; if the migration lacks a `legacy_id` column on `ncc_product_prices`, remove the `id` field from the `rowToPrice` return and the test's expected `prices` array accordingly. Add the column in a follow-up migration if the app later needs stable price ids.

- [ ] **Step 4: Run, expect PASS**

Run: `npm run test:integration -- tests/supabase/ncc_products.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```
Expected: no errors, no warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase.ts tests/supabase/ncc_products.test.ts
git commit -m "feat(supabase): ncc_products gateway (sbSubscribeNccProducts / sbPushNccProducts)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: contracts (`firebase.ts:558-586`; `src/types/contract.ts`)

**Files:**
- Modify: `src/lib/supabase.ts`
- Test: `tests/supabase/contracts.test.ts`

**Interfaces (match `firebase.ts:558-586`):**
- `sbSubscribeContracts(cb: (list: Contract[]) => void, client?: SupabaseClient)` — Realtime subscribe; assembles `contracts` + `contract_payments` + `contract_cancels` into `Contract[]`. Maps `when_text` → `when` on `ContractCancel`.
- `sbGetContracts(client?: SupabaseClient): Promise<Contract[]>` — one-time pull of the same assembled shape.
- `sbPushContracts(list: Contract[], pushedBy: { name: string; role: string }, client?: SupabaseClient): Promise<void>` — full-overwrite: upsert each contract parent (by `legacy_id`), `replaceChildren` its payments and cancels, then delete any contracts not in the new list.
- `Contract`, `ContractPartyB`, `ContractPayment`, `ContractCancel` from `src/types/contract.ts`. `party_b` is stored as jsonb. `includes`/`excludes` are `text[]`. `ContractCancel.when` maps to the `when_text` column (reserved word). `ContractPayment.id` is the app-level id, stored in a `legacy_id` column on `contract_payments` (or can be preserved as-is via sort_order; the test round-trips it).

- [ ] **Step 1: Write the failing test**

Create `tests/supabase/contracts.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbPushContracts, sbGetContracts, sbSubscribeContracts } from '../../src/lib/supabase';
import type { Contract } from '../../src/types/contract';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

const BASE: Contract = {
  id: 'ct-1',
  contractNo: 'HD-001',
  contractDate: '2026-01-01',
  contractStatus: 'signed',
  tourName: 'Hà Nội 3N2Đ',
  tourDest: 'HN',
  tourDays: 3,
  tourNights: 2,
  tourStartDate: '2026-03-01',
  departure: 'HCM',
  contractPax: 20,
  pricePerPax: 3_500_000,
  partyB: { name: 'Công ty ABC', address: '123 HN', tel: '024-1234', rep: 'Nguyễn A', title: 'GĐ', taxCode: '0123456789', email: 'abc@example.com' },
  includes: ['Xe đưa đón', 'Khách sạn 3*'],
  excludes: ['Vé máy bay', 'Bảo hiểm'],
  payments: [
    { id: 'pay-1', label: 'Đặt cọc 30%', mode: 'percent', percent: 30, amount: 2_100_000, dueDate: '2026-02-01', note: '', status: 'paid', paidDate: '2026-02-02', receivedAmount: 2_100_000 },
    { id: 'pay-2', label: 'Thanh toán cuối', mode: 'percent', percent: 70, amount: 4_900_000, dueDate: '2026-03-01', note: 'Trước khởi hành', status: 'pending' },
  ],
  cancels: [
    { when: 'Trước 15 ngày', penalty: 30 },
    { when: 'Trước 7 ngày', penalty: 50 },
  ],
  bondPercent: 30,
  hasAcceptance: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'tester',
};

describe('contracts gateway', () => {
  beforeEach(async () => {
    await truncate(['contract_cancels', 'contract_payments', 'contracts']);
  });

  it('round-trips a contract with 2 payments + 1 cancel + partyB via sbPushContracts / sbGetContracts', async () => {
    const c = await getViettoursClient();
    const contract: Contract = { ...BASE, cancels: [{ when: 'Trước 10 ngày', penalty: 40 }] };
    await sbPushContracts([contract], { name: 'QA', role: 'Sales' }, c);

    const list = await sbGetContracts(c);
    const got = list.find((x) => x.id === 'ct-1')!;
    expect(got).toBeDefined();
    expect(got.contractNo).toBe('HD-001');
    expect(got.partyB.name).toBe('Công ty ABC');
    expect(got.includes).toEqual(['Xe đưa đón', 'Khách sạn 3*']);
    expect(got.excludes).toEqual(['Vé máy bay', 'Bảo hiểm']);
    expect(got.payments).toHaveLength(2);
    expect(got.payments[0].label).toBe('Đặt cọc 30%');
    expect(got.payments[0].status).toBe('paid');
    expect(got.payments[1].label).toBe('Thanh toán cuối');
    expect(got.cancels).toHaveLength(1);
    expect(got.cancels[0].when).toBe('Trước 10 ngày');
    expect(got.cancels[0].penalty).toBe(40);
  });

  it('subscribe fires with assembled Contract[]', async () => {
    const c = await getViettoursClient();
    await sbPushContracts([BASE], { name: 'QA', role: 'Sales' }, c);
    const list = await once<Contract[]>((cb) => sbSubscribeContracts(cb, c));
    expect(list.some((x) => x.id === 'ct-1')).toBe(true);
  });

  it('full-overwrite removes contracts not in the new list', async () => {
    const c = await getViettoursClient();
    await sbPushContracts([BASE, { ...BASE, id: 'ct-2', contractNo: 'HD-002' }], { name: 'QA', role: 'Sales' }, c);
    await sbPushContracts([BASE], { name: 'QA', role: 'Sales' }, c);
    const list = await sbGetContracts(c);
    expect(list.map((x) => x.id)).not.toContain('ct-2');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm run test:integration -- tests/supabase/contracts.test.ts`
Expected: FAIL — `sbSubscribeContracts`, `sbGetContracts`, `sbPushContracts` not exported.

- [ ] **Step 3: Implement in `src/lib/supabase.ts`**

Append to `src/lib/supabase.ts`:
```ts
import type { Contract, ContractPayment, ContractCancel } from '@/types/contract';
import { subscribeTable, replaceChildren } from './supabase/helpers';

// ── Helpers ──

function rowToPayment(r: Record<string, unknown>): ContractPayment {
  return {
    id: (r.legacy_id as string) ?? (r.id as string),
    label: (r.label as string) ?? '',
    mode: (r.mode as ContractPayment['mode']) ?? 'percent',
    percent: (r.percent as number) ?? undefined,
    amount: (r.amount as number) ?? 0,
    dueDate: (r.due_date as string) ?? '',
    note: (r.note as string) ?? '',
    status: (r.status as ContractPayment['status']) ?? 'pending',
    paidDate: (r.paid_date as string) ?? undefined,
    receivedAmount: (r.received_amount as number) ?? undefined,
    approvalRequested: (r.approval_requested as boolean) ?? undefined,
  };
}

function rowToCancel(r: Record<string, unknown>): ContractCancel {
  return {
    when: (r.when_text as string) ?? '',
    penalty: (r.penalty as number) ?? 0,
  };
}

function rowToContract(
  r: Record<string, unknown>,
  payments: ContractPayment[],
  cancels: ContractCancel[],
): Contract {
  return {
    id: (r.legacy_id as string) ?? (r.id as string),
    contractNo: (r.contract_no as string) ?? '',
    contractDate: (r.contract_date as string) ?? '',
    contractStatus: (r.contract_status as Contract['contractStatus']) ?? 'draft',
    tourName: (r.tour_name as string) ?? '',
    tourDest: (r.tour_dest as string) ?? undefined,
    tourDays: (r.tour_days as number) ?? 0,
    tourNights: (r.tour_nights as number) ?? 0,
    tourStartDate: (r.tour_start_date as string) ?? undefined,
    departure: (r.departure as string) ?? undefined,
    contractPax: (r.contract_pax as number) ?? 0,
    pricePerPax: (r.price_per_pax as number) ?? 0,
    partyB: (r.party_b as Contract['partyB']) ?? { name: '', address: '', tel: '', rep: '', title: '', taxCode: '', email: '' },
    includes: (r.includes as string[]) ?? [],
    excludes: (r.excludes as string[]) ?? [],
    payments,
    cancels,
    bondPercent: (r.bond_percent as number) ?? 0,
    hasAcceptance: (r.has_acceptance as boolean) ?? false,
    acceptanceDate: (r.acceptance_date as string) ?? undefined,
    acceptanceNote: (r.acceptance_note as string) ?? undefined,
    createdAt: (r.created_at as string) ?? '',
    createdBy: (r.created_by_name as string) ?? '',
    updatedAt: (r.updated_at as string) ?? undefined,
    updatedBy: (r.updated_by_name as string) ?? undefined,
    _tourKey: (r.tour_key as string) ?? undefined,
    linkedQuoteId: (r.linked_quote_id as string) ?? undefined,
    linkedQuoteName: (r.linked_quote_name as string) ?? undefined,
  };
}

async function assembleContracts(client: SupabaseClient): Promise<Contract[]> {
  const { data: rows, error } = await client
    .from('contracts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error('assembleContracts: ' + error.message);
  if (!rows || rows.length === 0) return [];

  const ids = rows.map((r) => r.id as string);
  const [{ data: payments, error: pErr }, { data: cancels, error: cErr }] = await Promise.all([
    client.from('contract_payments').select('*').in('contract_id', ids).order('sort_order'),
    client.from('contract_cancels').select('*').in('contract_id', ids).order('sort_order'),
  ]);
  if (pErr) throw new Error('assembleContracts payments: ' + pErr.message);
  if (cErr) throw new Error('assembleContracts cancels: ' + cErr.message);

  const paysByContract = new Map<string, ContractPayment[]>();
  for (const p of payments ?? []) {
    const arr = paysByContract.get(p.contract_id as string) ?? [];
    arr.push(rowToPayment(p as Record<string, unknown>));
    paysByContract.set(p.contract_id as string, arr);
  }
  const cancelsByContract = new Map<string, ContractCancel[]>();
  for (const cc of cancels ?? []) {
    const arr = cancelsByContract.get(cc.contract_id as string) ?? [];
    arr.push(rowToCancel(cc as Record<string, unknown>));
    cancelsByContract.set(cc.contract_id as string, arr);
  }

  return rows.map((r) =>
    rowToContract(
      r as Record<string, unknown>,
      paysByContract.get(r.id as string) ?? [],
      cancelsByContract.get(r.id as string) ?? [],
    ),
  );
}

// ── Public API ──

/** Subscribe to the contract list. Mirrors fbSubscribeContracts (firebase.ts:562). */
export function sbSubscribeContracts(
  cb: (list: Contract[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(client, 'contracts', assembleContracts, cb);
}

/** One-time pull. Mirrors fbGetContracts (firebase.ts:572). */
export async function sbGetContracts(client: SupabaseClient = sb): Promise<Contract[]> {
  return assembleContracts(client);
}

/** Full-overwrite push. Mirrors fbPushContracts (firebase.ts:581). */
export async function sbPushContracts(
  list: Contract[],
  pushedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  const stamp = {
    updated_at: new Date().toISOString(),
    updated_by_name: `${pushedBy.name} (${pushedBy.role})`,
  };

  for (const contract of list) {
    // Upsert parent by legacy_id, capture uuid for child FKs.
    const { data: up, error: upErr } = await client
      .from('contracts')
      .upsert(
        {
          legacy_id: contract.id,
          contract_no: contract.contractNo,
          contract_date: contract.contractDate,
          contract_status: contract.contractStatus,
          tour_name: contract.tourName,
          tour_dest: contract.tourDest ?? null,
          tour_days: contract.tourDays,
          tour_nights: contract.tourNights,
          tour_start_date: contract.tourStartDate ?? null,
          departure: contract.departure ?? null,
          contract_pax: contract.contractPax,
          price_per_pax: contract.pricePerPax,
          party_b: contract.partyB,
          includes: contract.includes,
          excludes: contract.excludes,
          bond_percent: contract.bondPercent,
          has_acceptance: contract.hasAcceptance,
          acceptance_date: contract.acceptanceDate ?? null,
          acceptance_note: contract.acceptanceNote ?? null,
          tour_key: contract._tourKey ?? null,
          linked_quote_id: contract.linkedQuoteId ?? null,
          linked_quote_name: contract.linkedQuoteName ?? null,
          created_by_name: contract.createdBy,
          created_at: contract.createdAt,
          ...stamp,
        },
        { onConflict: 'legacy_id' },
      )
      .select('id')
      .single();
    if (upErr) throw new Error('sbPushContracts upsert: ' + upErr.message);

    const parentId = up!.id as string;

    // Replace child payments.
    await replaceChildren(
      client,
      'contract_payments',
      'contract_id',
      parentId,
      contract.payments.map((p, i) => ({
        contract_id: parentId,
        legacy_id: p.id,
        label: p.label,
        mode: p.mode ?? 'percent',
        percent: p.percent ?? null,
        amount: p.amount,
        due_date: p.dueDate,
        note: p.note,
        status: p.status,
        paid_date: p.paidDate ?? null,
        received_amount: p.receivedAmount ?? null,
        approval_requested: p.approvalRequested ?? false,
        sort_order: i,
      })),
    );

    // Replace child cancels (map `when` → `when_text`).
    await replaceChildren(
      client,
      'contract_cancels',
      'contract_id',
      parentId,
      contract.cancels.map((cc, i) => ({
        contract_id: parentId,
        when_text: cc.when,
        penalty: cc.penalty,
        sort_order: i,
      })),
    );
  }

  // Full-overwrite: delete contracts no longer in the list.
  if (list.length === 0) {
    const del = await client.from('contracts').delete().not('id', 'is', null);
    if (del.error) throw new Error('sbPushContracts delete-all: ' + del.error.message);
  } else {
    const keep = list.map((c) => c.id);
    const del = await client.from('contracts').delete().not('legacy_id', 'in', `(${keep.map((k) => `"${k}"`).join(',')})`);
    if (del.error) throw new Error('sbPushContracts delete: ' + del.error.message);
  }
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm run test:integration -- tests/supabase/contracts.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/lib/supabase.ts tests/supabase/contracts.test.ts
git commit -m "feat(supabase): contracts gateway (sbSubscribeContracts/sbGetContracts/sbPushContracts)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: rate card (`firebase.ts:146-195`; `src/types/rates.ts`)

**Files:**
- Modify: `src/lib/supabase.ts`
- Test: `tests/supabase/rate_card.test.ts`

**Interfaces (match `firebase.ts:155-195`):**
- `sbPullMasterRC(client?: SupabaseClient): Promise<RateCardDoc | null>` — reads `rate_card_hotels`, `rate_card_other`, `rate_card_visa`, `rate_card_meta`; strips `vte_visa_rates` from the returned `otherRates` (mirrors `stripVisaMirror` at `firebase.ts:146-153`).
- `sbPushMasterRC(rc: RateCard, pushedBy: string, client?: SupabaseClient): Promise<string>` — writes `rc.visaRates` into both `rate_card_visa` AND mirrors it into `rate_card_other` under key `vte_visa_rates` (mirrors `fbPushMasterRC`'s `otherRatesWithVisaMirror` at `firebase.ts:161-188`); performs a full-overwrite on hotels (delete cities absent from new set, then upsert) and on otherRates (delete rkeys absent from new set, then upsert); upserts the visa singleton and meta singleton. Returns `pushedAt` ISO string.
- `sbSubscribeMasterRC(cb: (rc: RateCardDoc) => void, client?: SupabaseClient)` — Realtime subscribe via `subscribeTable` on `rate_card_hotels`; reassembles from all four tables on each change; strips the `vte_visa_rates` mirror before calling `cb`.
- `RateCard`, `RateCardDoc`, `RateCardMeta` from `src/types/rates.ts`. Table layout from `supabase/migrations/0006_rate_card.sql`: `rate_card_hotels(city text PK, entries jsonb)`, `rate_card_other(rkey text PK, entry jsonb)`, `rate_card_visa(one_row boolean PK, data jsonb)`, `rate_card_meta(one_row boolean PK, version text, type text, pushed_at timestamptz, pushed_by text, app text, auto_sync boolean)`.

- [ ] **Step 1: Write the failing test**

Create `tests/supabase/rate_card.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbPullMasterRC, sbPushMasterRC, sbSubscribeMasterRC } from '../../src/lib/supabase';
import type { RateCard } from '../../src/types/rates';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

const SAMPLE_RC: RateCard = {
  hotels: {
    'ha-noi': [{ name: 'Lotte', stars: 5, price: 2_500_000 }],
    'da-nang': [{ name: 'Furama', stars: 4, price: 1_800_000 }],
  },
  visaRates: { vietnam_30d_single: 50, china_15d: 120 },
  otherRates: {
    'vte_rate_transport_hcm': { label: 'Xe 45 chỗ HCM', price: 3_000_000 },
  },
};

describe('rate card gateway', () => {
  beforeEach(async () => {
    await truncate(['rate_card_hotels', 'rate_card_other', 'rate_card_visa', 'rate_card_meta']);
  });

  it('returns null when no data exists', async () => {
    const c = await getViettoursClient();
    const result = await sbPullMasterRC(c);
    expect(result).toBeNull();
  });

  it('round-trips hotels for 2 cities + visaRates + otherRates via push/pull', async () => {
    const c = await getViettoursClient();
    const pushedAt = await sbPushMasterRC(SAMPLE_RC, 'Tony', c);
    expect(typeof pushedAt).toBe('string');

    const doc = await sbPullMasterRC(c);
    expect(doc).not.toBeNull();

    // hotels — both cities preserved
    expect(doc!.hotels['ha-noi']).toEqual([{ name: 'Lotte', stars: 5, price: 2_500_000 }]);
    expect(doc!.hotels['da-nang']).toEqual([{ name: 'Furama', stars: 4, price: 1_800_000 }]);

    // visaRates round-trip
    expect(doc!.visaRates).toEqual({ vietnam_30d_single: 50, china_15d: 120 });

    // otherRates — user-defined keys preserved
    expect(doc!.otherRates['vte_rate_transport_hcm']).toEqual({ label: 'Xe 45 chỗ HCM', price: 3_000_000 });

    // visa mirror is stripped — must NOT appear in otherRates
    expect('vte_visa_rates' in (doc!.otherRates ?? {})).toBe(false);

    // meta written
    expect(doc!._meta?.pushedBy).toBe('Tony');
    expect(doc!._meta?.pushedAt).toBe(pushedAt);
  });

  it('full-overwrite removes cities not in the new push', async () => {
    const c = await getViettoursClient();
    await sbPushMasterRC(SAMPLE_RC, 'Tony', c);
    // push again with only one city
    await sbPushMasterRC(
      { ...SAMPLE_RC, hotels: { 'ha-noi': SAMPLE_RC.hotels['ha-noi'] } },
      'Tony', c,
    );
    const doc = await sbPullMasterRC(c);
    expect('da-nang' in doc!.hotels).toBe(false);
  });

  it('subscribe assembles RateCardDoc and strips the visa mirror', async () => {
    const c = await getViettoursClient();
    await sbPushMasterRC(SAMPLE_RC, 'Tony', c);
    const doc = await once<any>((cb) => sbSubscribeMasterRC(cb as any, c));
    expect(doc.hotels['ha-noi']).toBeDefined();
    expect(doc.visaRates).toEqual({ vietnam_30d_single: 50, china_15d: 120 });
    expect('vte_visa_rates' in (doc.otherRates ?? {})).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm run test:integration -- tests/supabase/rate_card.test.ts`
Expected: FAIL — `sbPullMasterRC`, `sbPushMasterRC`, `sbSubscribeMasterRC` not exported.

- [ ] **Step 3: Implement in `src/lib/supabase.ts`**

Append to `src/lib/supabase.ts`:
```ts
import type { RateCard, RateCardDoc, RateCardMeta } from '@/types/rates';
import { subscribeTable } from './supabase/helpers';

// ── Rate Card ──
// Strip the vte_visa_rates mirror that sbPushMasterRC writes into rate_card_other.
// The canonical source for visa rates is the top-level visaRates field; the mirror
// is for legacy _applyRC() compatibility only and must not leak into the store.
// Mirrors stripVisaMirror (firebase.ts:146-153).
function stripVisaMirror(doc: RateCardDoc): RateCardDoc {
  if (!doc.otherRates || !('vte_visa_rates' in doc.otherRates)) return doc;
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.otherRates)) {
    if (k !== 'vte_visa_rates') cleaned[k] = v;
  }
  return { ...doc, otherRates: cleaned as RateCardDoc['otherRates'] };
}

async function assembleRC(client: SupabaseClient): Promise<RateCardDoc | null> {
  const [
    { data: hotelRows, error: hErr },
    { data: otherRows, error: oErr },
    { data: visaRow, error: vErr },
    { data: metaRow, error: mErr },
  ] = await Promise.all([
    client.from('rate_card_hotels').select('city, entries'),
    client.from('rate_card_other').select('rkey, entry'),
    client.from('rate_card_visa').select('data').eq('one_row', true).maybeSingle(),
    client.from('rate_card_meta').select('*').eq('one_row', true).maybeSingle(),
  ]);
  if (hErr) throw new Error('assembleRC hotels: ' + hErr.message);
  if (oErr) throw new Error('assembleRC other: ' + oErr.message);
  if (vErr) throw new Error('assembleRC visa: ' + vErr.message);
  if (mErr) throw new Error('assembleRC meta: ' + mErr.message);

  // If all tables are empty, return null (mirrors fbPullMasterRC returning null when doc doesn't exist).
  if (!hotelRows?.length && !otherRows?.length && !visaRow && !metaRow) return null;

  const hotels: RateCard['hotels'] = {};
  for (const r of hotelRows ?? []) {
    hotels[r.city as string] = r.entries as RateCardDoc['hotels'][string];
  }
  const otherRates: RateCard['otherRates'] = {};
  for (const r of otherRows ?? []) {
    otherRates[r.rkey as string] = r.entry as RateCardDoc['otherRates'][string];
  }
  const visaRates: RateCard['visaRates'] = (visaRow?.data as RateCard['visaRates']) ?? {};

  let _meta: RateCardMeta | undefined;
  if (metaRow) {
    _meta = {
      version: (metaRow.version as string) ?? '2.0',
      type: (metaRow.type as string) ?? 'viettours_ratecard_master',
      pushedAt: (metaRow.pushed_at as string) ?? '',
      pushedBy: (metaRow.pushed_by as string) ?? '',
      app: (metaRow.app as string) ?? 'Viettours Tour Cost Calculator',
      autoSync: (metaRow.auto_sync as boolean) ?? true,
    };
  }

  return stripVisaMirror({ hotels, visaRates, otherRates, _meta });
}

/** One-time pull. Mirrors fbPullMasterRC (firebase.ts:155). */
export async function sbPullMasterRC(client: SupabaseClient = sb): Promise<RateCardDoc | null> {
  return assembleRC(client);
}

/** Full-overwrite push. Mirrors fbPushMasterRC (firebase.ts:161). Returns pushedAt ISO string. */
export async function sbPushMasterRC(
  rc: RateCard,
  pushedBy: string,
  client: SupabaseClient = sb,
): Promise<string> {
  const pushedAt = new Date().toISOString();

  // Mirror vte_visa_rates into otherRates for legacy _applyRC() compatibility,
  // exactly as fbPushMasterRC does (firebase.ts:168-171).
  const otherRatesWithVisaMirror: RateCard['otherRates'] = {
    ...rc.otherRates,
    vte_visa_rates: rc.visaRates as unknown as RateCardDoc['otherRates'][string],
  };

  // ── Hotels: full overwrite (delete absent cities, upsert present ones) ──
  const newCities = Object.keys(rc.hotels);
  if (newCities.length === 0) {
    const del = await client.from('rate_card_hotels').delete().not('city', 'is', null);
    if (del.error) throw new Error('sbPushMasterRC hotels delete-all: ' + del.error.message);
  } else {
    const delH = await client
      .from('rate_card_hotels')
      .delete()
      .not('city', 'in', `(${newCities.map((k) => `"${k}"`).join(',')})`);
    if (delH.error) throw new Error('sbPushMasterRC hotels delete: ' + delH.error.message);
  }
  if (newCities.length > 0) {
    const hotelRows = newCities.map((city) => ({ city, entries: rc.hotels[city] }));
    const upH = await client.from('rate_card_hotels').upsert(hotelRows, { onConflict: 'city' });
    if (upH.error) throw new Error('sbPushMasterRC hotels upsert: ' + upH.error.message);
  }

  // ── OtherRates (including visa mirror): full overwrite ──
  const newRkeys = Object.keys(otherRatesWithVisaMirror);
  if (newRkeys.length === 0) {
    const del = await client.from('rate_card_other').delete().not('rkey', 'is', null);
    if (del.error) throw new Error('sbPushMasterRC other delete-all: ' + del.error.message);
  } else {
    const delO = await client
      .from('rate_card_other')
      .delete()
      .not('rkey', 'in', `(${newRkeys.map((k) => `"${k}"`).join(',')})`);
    if (delO.error) throw new Error('sbPushMasterRC other delete: ' + delO.error.message);
  }
  if (newRkeys.length > 0) {
    const otherRows = newRkeys.map((rkey) => ({ rkey, entry: otherRatesWithVisaMirror[rkey] }));
    const upO = await client.from('rate_card_other').upsert(otherRows, { onConflict: 'rkey' });
    if (upO.error) throw new Error('sbPushMasterRC other upsert: ' + upO.error.message);
  }

  // ── Visa singleton ──
  const upV = await client
    .from('rate_card_visa')
    .upsert({ one_row: true, data: rc.visaRates }, { onConflict: 'one_row' });
  if (upV.error) throw new Error('sbPushMasterRC visa upsert: ' + upV.error.message);

  // ── Meta singleton ──
  const upM = await client.from('rate_card_meta').upsert(
    {
      one_row: true,
      version: '2.0',
      type: 'viettours_ratecard_master',
      pushed_at: pushedAt,
      pushed_by: pushedBy,
      app: 'Viettours Tour Cost Calculator',
      auto_sync: true,
    },
    { onConflict: 'one_row' },
  );
  if (upM.error) throw new Error('sbPushMasterRC meta upsert: ' + upM.error.message);

  return pushedAt;
}

/** Realtime subscribe. Mirrors fbSubscribeMasterRC (firebase.ts:191). */
export function sbSubscribeMasterRC(
  cb: (rc: RateCardDoc) => void,
  client: SupabaseClient = sb,
): () => void {
  // Subscribe on rate_card_hotels as the trigger table; assembleRC reads all four tables.
  return subscribeTable(
    client,
    'rate_card_hotels',
    async (cl) => {
      const doc = await assembleRC(cl);
      // If tables are empty after a truncate (rare in prod), emit an empty doc rather than null.
      return doc ?? { hotels: {}, visaRates: {}, otherRates: {} };
    },
    cb as (v: RateCardDoc) => void,
  );
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm run test:integration -- tests/supabase/rate_card.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/lib/supabase.ts tests/supabase/rate_card.test.ts
git commit -m "feat(supabase): rate card gateway (sbPullMasterRC/sbPushMasterRC/sbSubscribeMasterRC) with visa mirror

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: visa_products

**Files:**
- Modify: `src/lib/supabase.ts`
- Test: `tests/supabase/visa_products.test.ts`

**Interfaces (match `firebase.ts:1060-1093`):**
- `sbSubscribeVisaProducts(cb: (doc: VisaProductsDoc | null) => void, client?: SupabaseClient)` — assembles `visa_products` rows + their `visa_product_fees` children + the `visa_products_meta` singleton into the `VisaProductsDoc` shape (`src/types/visa.ts:35-41`). Returns the Realtime unsubscribe fn.
- `sbSaveVisaProducts(data: { products: VisaProduct[]; rates: Record<string, number> }, savedBy: string, client?: SupabaseClient): Promise<void>` — full-overwrite of `visa_products` + `visa_product_fees`; reads the current `visa_products_meta` row to build the next `VisaProductVersion` snapshot (incrementing `versionNo`, prepending, capping to 20), then upserts `visa_products_meta` with new `rates`, `versions`, `updated_at`, `updated_by`. Replicates `firebase.ts:1075-1092` exactly.

- [ ] **Step 1: Write the failing test**

Create `tests/supabase/visa_products.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbSaveVisaProducts, sbSubscribeVisaProducts } from '../../src/lib/supabase';
import type { VisaProductsDoc } from '../../src/types/visa';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('visa_products gateway', () => {
  beforeEach(async () => {
    await truncate(['visa_product_fees', 'visa_products', 'visa_products_meta']);
  });

  it('saves products+rates and appends a version snapshot on each save', async () => {
    const c = await getViettoursClient();

    const products = [
      {
        id: 'vp-1', country: 'Japan', visaType: 'Tourist', validity: '90 days',
        location: 'HN', markupType: 'percent' as const, markupValue: 10,
        markupCur: 'VND', note: '', active: true,
        fees: [
          { id: 'f-1', name: 'Phí visa', amount: 50, cur: 'USD', perPax: true },
        ],
      },
    ];
    const rates = { USD: 25000, EUR: 27000 };

    // First save — creates version 1
    await sbSaveVisaProducts({ products, rates }, 'tester', c);

    const doc1 = await once<VisaProductsDoc | null>((cb) => sbSubscribeVisaProducts(cb, c));
    expect(doc1).not.toBeNull();
    expect(doc1!.products).toHaveLength(1);
    expect(doc1!.products[0].country).toBe('Japan');
    expect(doc1!.products[0].fees).toHaveLength(1);
    expect(doc1!.products[0].fees[0].amount).toBe(50);
    expect(doc1!.rates).toMatchObject({ USD: 25000, EUR: 27000 });
    expect(doc1!.versions).toHaveLength(1);
    expect(doc1!.versions![0].versionNo).toBe(1);
    expect(doc1!.versions![0].savedBy).toBe('tester');

    // Second save — appends version 2 (total 2 versions, newest first)
    await sbSaveVisaProducts({ products, rates: { USD: 26000 } }, 'tester', c);
    const doc2 = await once<VisaProductsDoc | null>((cb) => sbSubscribeVisaProducts(cb, c));
    expect(doc2!.versions).toHaveLength(2);
    expect(doc2!.versions![0].versionNo).toBe(2);
    expect(doc2!.versions![1].versionNo).toBe(1);
    expect(doc2!.rates).toMatchObject({ USD: 26000 });
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm run test:integration -- tests/supabase/visa_products.test.ts
```
Expected: FAIL — `sbSaveVisaProducts`/`sbSubscribeVisaProducts` not exported.

- [ ] **Step 3: Implement in `src/lib/supabase.ts`**

```ts
import type { VisaProduct, VisaProductsDoc, VisaProductVersion } from '@/types/visa';
import { subscribeTable, replaceChildren } from './supabase/helpers';

// ── visa_products ──

async function assembleVisaProducts(client: SupabaseClient): Promise<VisaProductsDoc | null> {
  const { data: products, error: pe } = await client
    .from('visa_products')
    .select('id, legacy_id, country, visa_type, validity, location, markup_type, markup_value, markup_cur, note, active')
    .order('country');
  if (pe) throw new Error('assembleVisaProducts products: ' + pe.message);
  if (!products || products.length === 0) {
    // Check if meta exists to determine whether the doc exists at all
    const { data: meta } = await client.from('visa_products_meta').select('rates, versions, updated_at, updated_by').maybeSingle();
    if (!meta) return null;
    return { products: [], rates: (meta.rates as Record<string, number>) ?? {}, versions: (meta.versions as VisaProductVersion[]) ?? [], updatedAt: meta.updated_at ?? undefined, updatedBy: meta.updated_by ?? undefined };
  }
  const ids = products.map((r) => r.id as string);
  const { data: fees, error: fe } = await client
    .from('visa_product_fees')
    .select('product_id, legacy_fee_id, name, amount, cur, per_pax, sort_order')
    .in('product_id', ids)
    .order('sort_order');
  if (fe) throw new Error('assembleVisaProducts fees: ' + fe.message);
  const feesByProduct = new Map<string, typeof fees>();
  for (const f of fees ?? []) {
    const arr = feesByProduct.get(f.product_id as string) ?? [];
    arr.push(f);
    feesByProduct.set(f.product_id as string, arr);
  }
  const { data: meta } = await client.from('visa_products_meta').select('rates, versions, updated_at, updated_by').maybeSingle();
  const assembled: VisaProduct[] = products.map((r) => ({
    id: (r.legacy_id as string) ?? (r.id as string),
    country: r.country as string,
    visaType: r.visa_type as string,
    validity: (r.validity as string) ?? '',
    location: (r.location as string) ?? '',
    markupType: r.markup_type as VisaProduct['markupType'],
    markupValue: r.markup_value as number,
    markupCur: r.markup_cur as string,
    note: (r.note as string) ?? '',
    active: r.active as boolean,
    fees: (feesByProduct.get(r.id as string) ?? []).map((f) => ({
      id: (f.legacy_fee_id as string) ?? (f as any).id,
      name: f.name as string,
      amount: f.amount as number,
      cur: f.cur as string,
      perPax: f.per_pax as boolean,
    })),
  }));
  return {
    products: assembled,
    rates: (meta?.rates as Record<string, number>) ?? {},
    versions: (meta?.versions as VisaProductVersion[]) ?? [],
    updatedAt: meta?.updated_at ?? undefined,
    updatedBy: meta?.updated_by ?? undefined,
  };
}

export function sbSubscribeVisaProducts(
  cb: (doc: VisaProductsDoc | null) => void,
  client: SupabaseClient = sb,
) {
  return subscribeTable(client, 'visa_products', assembleVisaProducts, cb);
}

export async function sbSaveVisaProducts(
  data: { products: VisaProduct[]; rates: Record<string, number> },
  savedBy: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const now = new Date().toISOString();

  // Read current meta to build next version snapshot (mirrors firebase.ts:1078-1085)
  const { data: prevMeta } = await client.from('visa_products_meta').select('versions').maybeSingle();
  const prevVersions: VisaProductVersion[] = (prevMeta?.versions as VisaProductVersion[]) ?? [];
  const versionNo = (prevVersions[0]?.versionNo ?? 0) + 1;
  const versions: VisaProductVersion[] = [
    { versionNo, savedAt: now, savedBy: savedBy || '', products: data.products },
    ...prevVersions,
  ].slice(0, 20);

  // Full-overwrite: delete all existing products (fees cascade), then insert new set
  const { error: delErr } = await client.from('visa_products').delete().not('id', 'is', null);
  if (delErr) throw new Error('sbSaveVisaProducts delete: ' + delErr.message);

  for (const p of data.products) {
    const { data: row, error: insErr } = await client
      .from('visa_products')
      .insert({
        legacy_id: p.id,
        country: p.country,
        visa_type: p.visaType,
        validity: p.validity ?? null,
        location: p.location ?? null,
        markup_type: p.markupType,
        markup_value: p.markupValue,
        markup_cur: p.markupCur,
        note: p.note ?? '',
        active: p.active,
      })
      .select('id')
      .single();
    if (insErr) throw new Error('sbSaveVisaProducts insert product: ' + insErr.message);
    if (p.fees.length) {
      await replaceChildren(client, 'visa_product_fees', 'product_id', row!.id, p.fees.map((f, i) => ({
        product_id: row!.id,
        legacy_fee_id: f.id,
        name: f.name,
        amount: f.amount,
        cur: f.cur,
        per_pax: f.perPax,
        sort_order: i,
      })));
    }
  }

  // Upsert visa_products_meta singleton
  const { error: metaErr } = await client.from('visa_products_meta').upsert({
    one_row: true,
    rates: data.rates,
    versions,
    updated_at: now,
    updated_by: savedBy || '',
  }, { onConflict: 'one_row' });
  if (metaErr) throw new Error('sbSaveVisaProducts meta upsert: ' + metaErr.message);
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm run test:integration -- tests/supabase/visa_products.test.ts
```
Expected: 1 passed.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/lib/supabase.ts tests/supabase/visa_products.test.ts
git commit -m "feat(supabase): visa_products gateway (products+fees+meta/versions, cap 20)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: visa_procedures

**Files:**
- Modify: `src/lib/supabase.ts`
- Test: `tests/supabase/visa_procedures.test.ts`

**Interfaces (match `firebase.ts:1104-1154`):**
- `sbSubscribeVisaProcs(cb: (list: VisaProcIndexEntry[]) => void, client?: SupabaseClient)` — SELECT metadata columns only (no `sections`/`versions`), ordered by `updated_at DESC`. Returns unsubscribe fn. The Firestore separate index doc becomes a metadata-column SELECT — no separate index table in Supabase.
- `sbGetVisaProc(id: string, client?: SupabaseClient): Promise<VisaProcDoc | null>` — full row including `sections`/`versions` jsonb + attached files via `loadAttachments(client, 'visa_proc', legacyId)`. Resolves `collaborator_usernames` back to `collaborators: string[]`.
- `sbSaveVisaProc(d: VisaProcDoc, savedBy: string, client?: SupabaseClient): Promise<void>` — upsert by `legacy_id`; stores `sections`/`versions` as jsonb; resolves `d.collaborators` (usernames) → `uuid[]` via `usernamesToIds` and stores both `collaborators uuid[]` and `collaborator_usernames text[]`; saves attachments via `saveAttachments(client, 'visa_proc', d.id, d.attachments ?? [])`.
- `sbDeleteVisaProc(id: string, client?: SupabaseClient): Promise<void>` — DELETE by `legacy_id`; attachments cascade via `attachments` table parent-id match.

- [ ] **Step 1: Write the failing test**

Create `tests/supabase/visa_procedures.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, getServiceClient, truncate } from './_setup';
import {
  sbSaveVisaProc, sbGetVisaProc, sbSubscribeVisaProcs, sbDeleteVisaProc,
} from '../../src/lib/supabase';
import type { VisaProcDoc } from '../../src/types/visa';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

const sampleProc = (): VisaProcDoc => ({
  id: 'proc-1',
  code: 'JP-001',
  title: 'Hồ sơ xin visa Nhật',
  country: 'Japan',
  visaType: 'Tourist',
  isTemplate: false,
  linkedQuoteId: null,
  linkedQuoteName: '',
  createdByUsername: 'tester',
  createdByName: 'QA Bot',
  collaborators: ['tester'],
  sections: [
    {
      id: 's1', kind: 'enterprise', title: 'Thông tin doanh nghiệp',
      repeatable: false,
      fieldDefs: [{ id: 'f1', label: 'Tên công ty' }],
      rows: [{ id: 'r1', values: { f1: 'Viettours' } }],
    },
  ],
  versions: [],
  attachments: [
    { key: 'r2-proc-file', name: 'checklist.pdf', uploadedBy: 'tester', uploadedAt: '2026-01-01T00:00:00.000Z' },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: undefined,
  updatedBy: undefined,
});

describe('visa_procedures gateway', () => {
  beforeEach(async () => {
    await truncate(['attachments', 'visa_procedures']);
  });

  it('save → list (index) → get (full) → delete', async () => {
    const c = await getViettoursClient();

    await sbSaveVisaProc(sampleProc(), 'tester', c);

    // List returns index entry (no sections)
    const list = await once<any[]>((cb) => sbSubscribeVisaProcs(cb as any, c));
    expect(list).toHaveLength(1);
    const entry = list[0];
    expect(entry.id).toBe('proc-1');
    expect(entry.code).toBe('JP-001');
    expect(entry.country).toBe('Japan');
    expect(entry.collaborators).toContain('tester');
    expect(entry).not.toHaveProperty('sections'); // metadata only

    // Get returns full doc with sections + attachments
    const full = await sbGetVisaProc('proc-1', c);
    expect(full).not.toBeNull();
    expect(full!.sections).toHaveLength(1);
    expect(full!.sections[0].rows[0].values.f1).toBe('Viettours');
    expect(full!.attachments).toHaveLength(1);
    expect(full!.attachments![0].key).toBe('r2-proc-file');
    expect(full!.collaborators).toContain('tester');

    // Delete removes the row
    await sbDeleteVisaProc('proc-1', c);
    const listAfter = await once<any[]>((cb) => sbSubscribeVisaProcs(cb as any, c));
    expect(listAfter).toHaveLength(0);
    const gotAfter = await sbGetVisaProc('proc-1', c);
    expect(gotAfter).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm run test:integration -- tests/supabase/visa_procedures.test.ts
```
Expected: FAIL — `sbSaveVisaProc`/`sbGetVisaProc`/`sbSubscribeVisaProcs`/`sbDeleteVisaProc` not exported.

- [ ] **Step 3: Implement in `src/lib/supabase.ts`**

```ts
import type { VisaProcDoc, VisaProcIndexEntry } from '@/types/visa';
import { subscribeTable, usernamesToIds } from './supabase/helpers';
import { loadAttachments, saveAttachments } from './supabase'; // self-import pattern; use module-level fns

// ── visa_procedures ──

export function sbSubscribeVisaProcs(
  cb: (list: VisaProcIndexEntry[]) => void,
  client: SupabaseClient = sb,
) {
  return subscribeTable(client, 'visa_procedures', async (cl) => {
    const { data, error } = await cl
      .from('visa_procedures')
      .select(
        'legacy_id, code, title, country, visa_type, is_template, linked_quote_name, ' +
        'collaborator_usernames, created_by_name, created_at, updated_at, updated_by_name',
      )
      .order('updated_at', { ascending: false, nullsFirst: false });
    if (error) throw new Error('sbSubscribeVisaProcs: ' + error.message);
    return (data ?? []).map((r) => ({
      id: (r.legacy_id as string) ?? '',
      code: (r.code as string) ?? '',
      title: (r.title as string) ?? '',
      country: (r.country as string) ?? '',
      visaType: (r.visa_type as string) ?? undefined,
      isTemplate: (r.is_template as boolean) ?? false,
      linkedQuoteName: (r.linked_quote_name as string) ?? '',
      collaborators: (r.collaborator_usernames as string[]) ?? [],
      createdByUsername: '',   // not stored in metadata columns; omit safely
      createdByName: (r.created_by_name as string) ?? '',
      createdAt: (r.created_at as string) ?? undefined,
      updatedAt: (r.updated_at as string) ?? '',
      updatedBy: (r.updated_by_name as string) ?? '',
    })) as VisaProcIndexEntry[];
  }, cb);
}

export async function sbGetVisaProc(
  id: string,
  client: SupabaseClient = sb,
): Promise<VisaProcDoc | null> {
  const { data, error } = await client
    .from('visa_procedures')
    .select('*')
    .eq('legacy_id', id)
    .maybeSingle();
  if (error) throw new Error('sbGetVisaProc: ' + error.message);
  if (!data) return null;
  const attachments = await loadAttachments(client, 'visa_proc', id);
  return {
    id: (data.legacy_id as string) ?? id,
    code: (data.code as string) ?? '',
    title: (data.title as string) ?? '',
    country: (data.country as string) ?? '',
    visaType: (data.visa_type as string) ?? undefined,
    isTemplate: (data.is_template as boolean) ?? false,
    linkedQuoteId: (data.linked_quote_id as string) ?? null,
    linkedQuoteName: (data.linked_quote_name as string) ?? '',
    createdByUsername: (data.created_by_name as string) ?? '', // no separate username col in meta
    createdByName: (data.created_by_name as string) ?? '',
    collaborators: (data.collaborator_usernames as string[]) ?? [],
    sections: (data.sections as VisaProcDoc['sections']) ?? [],
    versions: (data.versions as VisaProcDoc['versions']) ?? [],
    attachments,
    createdAt: (data.created_at as string) ?? undefined,
    updatedAt: (data.updated_at as string) ?? undefined,
    updatedBy: (data.updated_by_name as string) ?? undefined,
  };
}

export async function sbSaveVisaProc(
  d: VisaProcDoc,
  savedBy: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const now = new Date().toISOString();
  const idMap = await usernamesToIds(client, d.collaborators ?? []);
  const collaboratorIds = (d.collaborators ?? []).map((u) => idMap.get(u)).filter(Boolean) as string[];

  const { error } = await client.from('visa_procedures').upsert({
    legacy_id: d.id,
    code: d.code ?? '',
    title: d.title ?? '',
    country: d.country ?? '',
    visa_type: d.visaType ?? null,
    is_template: d.isTemplate ?? false,
    sections: d.sections ?? [],
    versions: d.versions ?? [],
    collaborators: collaboratorIds,
    collaborator_usernames: d.collaborators ?? [],
    linked_quote_id: d.linkedQuoteId ?? null,
    linked_quote_name: d.linkedQuoteName ?? '',
    created_by_name: d.createdByName ?? '',
    updated_at: now,
    updated_by_name: savedBy || '',
  }, { onConflict: 'legacy_id' });
  if (error) throw new Error('sbSaveVisaProc: ' + error.message);

  await saveAttachments(client, 'visa_proc', d.id, d.attachments ?? []);
}

export async function sbDeleteVisaProc(
  id: string,
  client: SupabaseClient = sb,
): Promise<void> {
  // Attachments: delete by parent_id before row (no FK cascade on attachments table)
  const { error: attErr } = await client
    .from('attachments')
    .delete()
    .eq('parent_type', 'visa_proc')
    .eq('parent_id', id);
  if (attErr) throw new Error('sbDeleteVisaProc attachments: ' + attErr.message);
  const { error } = await client.from('visa_procedures').delete().eq('legacy_id', id);
  if (error) throw new Error('sbDeleteVisaProc: ' + error.message);
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm run test:integration -- tests/supabase/visa_procedures.test.ts
```
Expected: 1 passed.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/lib/supabase.ts tests/supabase/visa_procedures.test.ts
git commit -m "feat(supabase): visa_procedures gateway (sections/versions jsonb, collaborator uuid[], attachments)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: visa_projects

**Files:**
- Modify: `src/lib/supabase.ts`
- Test: `tests/supabase/visa_projects.test.ts`

**Interfaces (match `firebase.ts:1162-1177`):**
- `sbSubscribeVisaProjects(cb: (list: VisaProjectDoc[]) => void, client?: SupabaseClient)` — full SELECT of `visa_projects` + `loadAttachments` per project; reads `main_staff_usernames`/`support_staff_usernames`/`collaborator_usernames` for the `string[]` fields; `milestones`/`applicants` from jsonb columns. Returns unsubscribe fn.
- `sbPushVisaProjects(list: VisaProjectDoc[], pushedBy: { name: string; role: string }, client?: SupabaseClient): Promise<void>` — full-overwrite semantics matching `fbPushVisaProjects` (`firebase.ts:1168-1177`): upsert each project by `legacy_id` (resolving `mainStaff`/`supportStaff`/`collaborators` username arrays → `uuid[]` + `*_usernames text[]`; saving attachments); delete rows whose `legacy_id` is not in the new list.

- [ ] **Step 1: Write the failing test**

Create `tests/supabase/visa_projects.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbPushVisaProjects, sbSubscribeVisaProjects } from '../../src/lib/supabase';
import type { VisaProjectDoc } from '../../src/types/visa';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

const sampleProject = (): VisaProjectDoc => ({
  id: 'proj-1',
  code: 'VISA-2026-001',
  name: 'Đoàn Nhật Bản tháng 3',
  country: 'Japan',
  status: 'in_progress',
  mainStaff: ['tester'],
  supportStaff: [],
  documentsSummary: 'Passport + đơn xin visa',
  linkedQuoteId: null,
  linkedQuoteName: '',
  linkedProcIds: ['proc-1'],
  attachments: [
    { key: 'r2-proj-file', name: 'danh-sach.xlsx', uploadedBy: 'tester', uploadedAt: '2026-01-01T00:00:00.000Z' },
  ],
  applyCount: 12,
  passedCount: 10,
  failedCount: 1,
  haveVisaCount: 1,
  pendingCount: 0,
  startDate: '2026-03-01',
  departureDate: '2026-03-05',
  endDate: '2026-03-15',
  milestones: [
    { id: 'm1', label: 'Nộp hồ sơ', date: '2026-02-15', done: true, note: 'Đã nộp' },
    { id: 'm2', label: 'Nhận visa', date: '2026-03-01', done: false },
  ],
  applicants: [
    {
      id: 'a1', name: 'Nguyễn Văn A', gender: 'Nam', dob: '1990-01-01',
      passport: 'B123456', passportIssue: '2020-01-01', passportExpiry: '2030-01-01',
      docStatus: 'complete', result: 'passed',
    },
  ],
  collaborators: ['tester'],
  createdByUsername: 'tester',
  createdByName: 'QA Bot',
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('visa_projects gateway', () => {
  beforeEach(async () => {
    await truncate(['attachments', 'visa_projects']);
  });

  it('round-trips a project with milestones, applicants, and staff arrays', async () => {
    const c = await getViettoursClient();

    await sbPushVisaProjects([sampleProject()], { name: 'QA Bot', role: 'Operations' }, c);

    const list = await once<VisaProjectDoc[]>((cb) => sbSubscribeVisaProjects(cb, c));
    expect(list).toHaveLength(1);
    const p = list[0];

    // Identity + scalar fields
    expect(p.id).toBe('proj-1');
    expect(p.code).toBe('VISA-2026-001');
    expect(p.name).toBe('Đoàn Nhật Bản tháng 3');
    expect(p.country).toBe('Japan');
    expect(p.status).toBe('in_progress');
    expect(p.applyCount).toBe(12);
    expect(p.passedCount).toBe(10);
    expect(p.startDate).toBe('2026-03-01');
    expect(p.departureDate).toBe('2026-03-05');
    expect(p.linkedProcIds).toEqual(['proc-1']);
    expect(p.documentsSummary).toBe('Passport + đơn xin visa');

    // Username arrays (returned from *_usernames columns)
    expect(p.mainStaff).toContain('tester');
    expect(p.collaborators).toContain('tester');

    // JSONB round-trips
    expect(p.milestones).toHaveLength(2);
    expect(p.milestones[0].label).toBe('Nộp hồ sơ');
    expect(p.milestones[0].done).toBe(true);
    expect(p.milestones[1].done).toBe(false);
    expect(p.applicants).toHaveLength(1);
    expect(p.applicants![0].name).toBe('Nguyễn Văn A');
    expect(p.applicants![0].docStatus).toBe('complete');
    expect(p.applicants![0].result).toBe('passed');

    // Attachments
    expect(p.attachments).toHaveLength(1);
    expect(p.attachments[0].key).toBe('r2-proj-file');

    // Full-overwrite: push empty list removes the project
    await sbPushVisaProjects([], { name: 'QA Bot', role: 'Operations' }, c);
    const listAfter = await once<VisaProjectDoc[]>((cb) => sbSubscribeVisaProjects(cb, c));
    expect(listAfter).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm run test:integration -- tests/supabase/visa_projects.test.ts
```
Expected: FAIL — `sbPushVisaProjects`/`sbSubscribeVisaProjects` not exported.

- [ ] **Step 3: Implement in `src/lib/supabase.ts`**

```ts
import type { VisaProjectDoc } from '@/types/visa';
import { subscribeTable, usernamesToIds } from './supabase/helpers';
import { loadAttachments, saveAttachments } from './supabase'; // module-level fns

// ── visa_projects ──

async function assembleVisaProjects(client: SupabaseClient): Promise<VisaProjectDoc[]> {
  const { data, error } = await client
    .from('visa_projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error('assembleVisaProjects: ' + error.message);
  const rows = data ?? [];
  return Promise.all(rows.map(async (r) => {
    const attachments = await loadAttachments(client, 'visa_project', (r.legacy_id as string) ?? r.id as string);
    return {
      id: (r.legacy_id as string) ?? (r.id as string),
      code: (r.code as string) ?? '',
      name: (r.name as string) ?? '',
      country: (r.country as string) ?? '',
      status: r.status as VisaProjectDoc['status'],
      mainStaff: (r.main_staff_usernames as string[]) ?? [],
      supportStaff: (r.support_staff_usernames as string[]) ?? [],
      documentsSummary: (r.documents_summary as string) ?? '',
      linkedQuoteId: (r.linked_quote_id as string) ?? null,
      linkedQuoteName: (r.linked_quote_name as string) ?? '',
      linkedProcIds: (r.linked_proc_ids as string[]) ?? [],
      attachments,
      applyCount: (r.apply_count as number) ?? 0,
      passedCount: (r.passed_count as number) ?? 0,
      failedCount: (r.failed_count as number) ?? 0,
      haveVisaCount: (r.have_visa_count as number) ?? 0,
      pendingCount: (r.pending_count as number) ?? 0,
      startDate: (r.start_date as string) ?? null,
      departureDate: (r.departure_date as string) ?? null,
      endDate: (r.end_date as string) ?? null,
      milestones: (r.milestones as VisaProjectDoc['milestones']) ?? [],
      applicants: (r.applicants as VisaProjectDoc['applicants']) ?? [],
      collaborators: (r.collaborator_usernames as string[]) ?? [],
      createdByUsername: (r.created_by_name as string) ?? '',
      createdByName: (r.created_by_name as string) ?? '',
      createdAt: (r.created_at as string) ?? undefined,
      updatedAt: (r.updated_at as string) ?? undefined,
      updatedBy: (r.updated_by_name as string) ?? undefined,
    } as VisaProjectDoc;
  }));
}

export function sbSubscribeVisaProjects(
  cb: (list: VisaProjectDoc[]) => void,
  client: SupabaseClient = sb,
) {
  return subscribeTable(client, 'visa_projects', assembleVisaProjects, cb);
}

export async function sbPushVisaProjects(
  list: VisaProjectDoc[],
  pushedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  const now = new Date().toISOString();

  for (const p of list) {
    // Resolve all username arrays in one batch per project
    const allUsernames = [...(p.mainStaff ?? []), ...(p.supportStaff ?? []), ...(p.collaborators ?? [])];
    const idMap = await usernamesToIds(client, allUsernames);
    const toIds = (names: string[]) => names.map((u) => idMap.get(u)).filter(Boolean) as string[];

    const { error } = await client.from('visa_projects').upsert({
      legacy_id: p.id,
      code: p.code ?? '',
      name: p.name ?? '',
      country: p.country ?? '',
      status: p.status ?? 'planning',
      main_staff: toIds(p.mainStaff ?? []),
      main_staff_usernames: p.mainStaff ?? [],
      support_staff: toIds(p.supportStaff ?? []),
      support_staff_usernames: p.supportStaff ?? [],
      documents_summary: p.documentsSummary ?? '',
      linked_quote_id: p.linkedQuoteId ?? null,
      linked_quote_name: p.linkedQuoteName ?? '',
      linked_proc_ids: p.linkedProcIds ?? [],
      apply_count: p.applyCount ?? 0,
      passed_count: p.passedCount ?? 0,
      failed_count: p.failedCount ?? 0,
      have_visa_count: p.haveVisaCount ?? 0,
      pending_count: p.pendingCount ?? 0,
      start_date: p.startDate ?? null,
      departure_date: p.departureDate ?? null,
      end_date: p.endDate ?? null,
      milestones: p.milestones ?? [],
      applicants: p.applicants ?? [],
      collaborators: toIds(p.collaborators ?? []),
      collaborator_usernames: p.collaborators ?? [],
      created_by_name: p.createdByName ?? '',
      updated_at: now,
      updated_by_name: `${pushedBy.name} (${pushedBy.role})`,
    }, { onConflict: 'legacy_id' });
    if (error) throw new Error('sbPushVisaProjects upsert: ' + error.message);

    await saveAttachments(client, 'visa_project', p.id, p.attachments ?? []);
  }

  // Full-overwrite: delete projects removed from the list (mirrors fbPushVisaProjects setDoc semantics)
  if (list.length > 0) {
    const keepIds = list.map((p) => p.id);
    const { error: delErr } = await client
      .from('visa_projects')
      .delete()
      .not('legacy_id', 'in', `(${keepIds.map((id) => `"${id}"`).join(',')})`);
    if (delErr) throw new Error('sbPushVisaProjects delete stale: ' + delErr.message);
  } else {
    // Push of empty list = delete all
    const { error: delErr } = await client.from('visa_projects').delete().not('id', 'is', null);
    if (delErr) throw new Error('sbPushVisaProjects delete all: ' + delErr.message);
  }
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm run test:integration -- tests/supabase/visa_projects.test.ts
```
Expected: 1 passed.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/lib/supabase.ts tests/supabase/visa_projects.test.ts
git commit -m "feat(supabase): visa_projects gateway (milestones/applicants jsonb, staff uuid arrays, attachments)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: itineraries (`firebase.ts:896-966`; `src/types/itinerary.ts:82-133`)

**Files:**
- Modify: `src/lib/supabase.ts`
- Test: `tests/supabase/itineraries.test.ts`

**Interfaces (match `firebase.ts:905-966`):**
- `sbSaveItinerary(itin: Itinerary, savedBy: string, client?: SupabaseClient): Promise<void>` — upsert parent `itineraries` by `legacy_id`, capture uuid, `replaceChildren` for `itinerary_days` (jsonb `meals`/`segments`) ordered by `sort_order`, `replaceChildren` for `itinerary_flights` ordered by `sort_order`. Mirrors `fbSaveItinerary` (`firebase.ts:905-926`).
- `sbGetItinerary(id: string, client?: SupabaseClient): Promise<Itinerary | null>` — fetch parent row + `itinerary_days` (ordered `sort_order`) + `itinerary_flights` (ordered `sort_order`), reassemble `schedule: Day[]` and `flights: Flight[]`. Mirrors `fbGetItinerary` (`firebase.ts:933-935`).
- `sbDeleteItinerary(id: string, client?: SupabaseClient): Promise<void>` — delete parent by `legacy_id`; cascade handles children. Mirrors `fbDeleteItinerary` (`firebase.ts:943-953`).
- `sbSubscribeItineraries(cb: (list: ItineraryIndexEntry[]) => void, client?: SupabaseClient): () => void` — `subscribeTable` over `itineraries`, SELECT metadata columns only, return `ItineraryIndexEntry[]` sorted newest-first. Mirrors `fbSubscribeItineraries` (`firebase.ts:960-965`).

- [ ] **Step 1: Write the failing test**

Create `tests/supabase/itineraries.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import {
  sbSaveItinerary, sbGetItinerary, sbDeleteItinerary, sbSubscribeItineraries,
} from '../../src/lib/supabase';
import type { Itinerary } from '../../src/types/itinerary';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

const ITIN: Itinerary = {
  id: 'itin-t14',
  code: 'T14',
  type: 'ND',
  continent: 'Asia',
  country: 'Vietnam',
  seq: 1,
  title: 'Hà Nội 3N2Đ',
  destination: 'Hà Nội',
  days: 3,
  nights: 2,
  intro: 'Giới thiệu',
  includes: ['Bữa sáng', 'Xe đưa đón'],
  excludes: ['Vé máy bay'],
  linkedQuoteId: null,
  linkedQuoteName: '',
  flights: [
    {
      id: 'f1', group: 'A', leg: '1', flightNo: 'VN123',
      dep: 'SGN 06:00', arr: 'HAN 08:00',
      depAirport: 'SGN', depTime: '06:00', arrAirport: 'HAN', arrTime: '08:00',
      depDayOffset: 0, arrDayOffset: 0,
    },
  ],
  schedule: [
    {
      id: 'd1', dayNum: 1, date: '2026-07-01', title: 'Ngày 1',
      meals: { B: true, L: true, D: false }, mealNote: '',
      segments: [{ id: 's1', groupLabel: 'Sáng', transport: 'Xe', activities: [{ id: 'a1', time: '08:00', text: 'Khởi hành' }] }],
    },
    {
      id: 'd2', dayNum: 2, date: '2026-07-02', title: 'Ngày 2',
      meals: { B: true, L: false, D: true }, mealNote: 'Tối nhà hàng',
      segments: [{ id: 's2', groupLabel: 'Chiều', transport: 'Tàu', activities: [{ id: 'a2', time: '14:00', text: 'Tham quan' }] }],
    },
  ],
  createdAt: '2026-07-01T00:00:00.000Z',
  createdBy: 'tester',
};

describe('itineraries gateway', () => {
  beforeEach(async () => {
    await truncate(['itinerary_flights', 'itinerary_days', 'itineraries']);
  });

  it('saves, gets, lists, and deletes an itinerary', async () => {
    const c = await getViettoursClient();

    // save
    await sbSaveItinerary(ITIN, 'tester', c);

    // get reassembles schedule + flights
    const got = await sbGetItinerary('itin-t14', c);
    expect(got).not.toBeNull();
    expect(got!.title).toBe('Hà Nội 3N2Đ');
    expect(got!.includes).toEqual(['Bữa sáng', 'Xe đưa đón']);
    expect(got!.excludes).toEqual(['Vé máy bay']);
    expect(got!.schedule).toHaveLength(2);
    expect(got!.schedule[0].dayNum).toBe(1);
    expect(got!.schedule[0].meals).toEqual({ B: true, L: true, D: false });
    expect(got!.schedule[0].segments).toHaveLength(1);
    expect(got!.schedule[1].dayNum).toBe(2);
    expect(got!.schedule[1].mealNote).toBe('Tối nhà hàng');
    expect(got!.flights).toHaveLength(1);
    expect(got!.flights[0].flightNo).toBe('VN123');
    expect(got!.flights[0].depAirport).toBe('SGN');

    // list returns index entry
    const list = await once<any[]>((cb) => sbSubscribeItineraries(cb as any, c));
    const entry = list.find((x) => x.id === 'itin-t14');
    expect(entry).toBeDefined();
    expect(entry!.title).toBe('Hà Nội 3N2Đ');
    expect(entry!.days).toBe(3);
    expect(entry!.nights).toBe(2);
    expect(entry!.destination).toBe('Hà Nội');

    // delete removes parent (children cascade)
    await sbDeleteItinerary('itin-t14', c);
    const after = await sbGetItinerary('itin-t14', c);
    expect(after).toBeNull();
    const listAfter = await once<any[]>((cb) => sbSubscribeItineraries(cb as any, c));
    expect(listAfter.find((x) => x.id === 'itin-t14')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm run test:integration -- tests/supabase/itineraries.test.ts
```
Expected: FAIL — `sbSaveItinerary` / `sbGetItinerary` / `sbDeleteItinerary` / `sbSubscribeItineraries` not exported.

- [ ] **Step 3: Implement in `src/lib/supabase.ts`**

Append to `src/lib/supabase.ts`:
```ts
import type { Itinerary, ItineraryIndexEntry, Day, Flight } from '@/types/itinerary';
import { subscribeTable, replaceChildren } from './supabase/helpers';

// ── row assemblers ──

const rowToDay = (r: Record<string, unknown>): Day => ({
  id: (r.id as string),
  dayNum: r.day_num as number,
  date: (r.date as string) ?? '',
  title: (r.title as string) ?? '',
  meals: r.meals as Day['meals'],
  mealNote: (r.meal_note as string) ?? '',
  segments: r.segments as Day['segments'],
});

const rowToFlight = (r: Record<string, unknown>): Flight => ({
  id: (r.legacy_flight_id as string) ?? (r.id as string),
  group: (r.group_text as string) ?? '',
  leg: (r.leg as string) ?? '',
  flightNo: (r.flight_no as string) ?? '',
  dep: (r.dep as string) ?? '',
  arr: (r.arr as string) ?? '',
  depAirport: (r.dep_airport as string) ?? undefined,
  depTime: (r.dep_time as string) ?? undefined,
  arrAirport: (r.arr_airport as string) ?? undefined,
  arrTime: (r.arr_time as string) ?? undefined,
  depDayOffset: (r.dep_day_offset as number) ?? undefined,
  arrDayOffset: (r.arr_day_offset as number) ?? undefined,
});

const rowToItineraryIndex = (r: Record<string, unknown>): ItineraryIndexEntry => ({
  id: (r.legacy_id as string) ?? (r.id as string),
  code: (r.code as string) ?? '',
  title: (r.title as string) ?? '',
  destination: (r.destination as string) ?? '',
  days: r.days as number,
  nights: r.nights as number,
  linkedQuoteId: (r.linked_quote_id as string) ?? null,
  linkedQuoteName: (r.linked_quote_name as string) ?? '',
  createdAt: (r.created_at as string) ?? undefined,
  createdBy: (r.created_by_name as string) ?? undefined,
  updatedAt: (r.updated_at as string) ?? '',
  updatedBy: (r.updated_by_name as string) ?? '',
});

// ── gateway functions ──

/**
 * Subscribe to the itinerary metadata index (lightweight list).
 * Mirrors fbSubscribeItineraries (firebase.ts:960-965).
 */
export function sbSubscribeItineraries(
  cb: (list: ItineraryIndexEntry[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(
    client,
    'itineraries',
    async (cl) => {
      const { data, error } = await cl
        .from('itineraries')
        .select('id, legacy_id, code, title, destination, days, nights, linked_quote_id, linked_quote_name, created_at, created_by_name, updated_at, updated_by_name')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToItineraryIndex);
    },
    cb,
  );
}

/**
 * One-time fetch of a full itinerary, reassembling schedule + flights from child tables.
 * Mirrors fbGetItinerary (firebase.ts:933-935).
 */
export async function sbGetItinerary(
  id: string,
  client: SupabaseClient = sb,
): Promise<Itinerary | null> {
  const { data: row, error } = await client
    .from('itineraries')
    .select('*')
    .eq('legacy_id', id)
    .maybeSingle();
  if (error) throw new Error('sbGetItinerary: ' + error.message);
  if (!row) return null;

  const { data: days, error: dErr } = await client
    .from('itinerary_days')
    .select('*')
    .eq('itinerary_id', row.id as string)
    .order('sort_order', { ascending: true });
  if (dErr) throw new Error('sbGetItinerary days: ' + dErr.message);

  const { data: flights, error: fErr } = await client
    .from('itinerary_flights')
    .select('*')
    .eq('itinerary_id', row.id as string)
    .order('sort_order', { ascending: true });
  if (fErr) throw new Error('sbGetItinerary flights: ' + fErr.message);

  return {
    id: (row.legacy_id as string) ?? (row.id as string),
    code: (row.code as string) ?? undefined,
    type: row.type as Itinerary['type'],
    continent: (row.continent as string) ?? '',
    country: (row.country as string) ?? '',
    seq: (row.seq as number) ?? 0,
    title: (row.title as string) ?? '',
    destination: (row.destination as string) ?? '',
    days: row.days as number,
    nights: row.nights as number,
    intro: (row.intro as string) ?? '',
    includes: (row.includes as string[]) ?? [],
    excludes: (row.excludes as string[]) ?? [],
    exec: (row.exec as Itinerary['exec']) ?? undefined,
    linkedQuoteId: (row.linked_quote_id as string) ?? null,
    linkedQuoteName: (row.linked_quote_name as string) ?? '',
    schedule: (days ?? []).map(rowToDay),
    flights: (flights ?? []).map(rowToFlight),
    createdAt: (row.created_at as string) ?? undefined,
    createdBy: (row.created_by_name as string) ?? undefined,
    updatedAt: (row.updated_at as string) ?? undefined,
    updatedBy: (row.updated_by_name as string) ?? undefined,
  };
}

/**
 * Save itinerary: upsert parent by legacy_id, replace days and flights children.
 * Mirrors fbSaveItinerary (firebase.ts:905-926).
 */
export async function sbSaveItinerary(
  itin: Itinerary,
  savedBy: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const now = new Date().toISOString();
  const { data: up, error: upErr } = await client
    .from('itineraries')
    .upsert(
      {
        legacy_id: itin.id,
        code: itin.code ?? null,
        type: itin.type,
        continent: itin.continent,
        country: itin.country,
        seq: itin.seq ?? 0,
        title: itin.title,
        destination: itin.destination ?? null,
        days: itin.days,
        nights: itin.nights,
        intro: itin.intro ?? '',
        includes: itin.includes ?? [],
        excludes: itin.excludes ?? [],
        exec: itin.exec ?? null,
        linked_quote_id: itin.linkedQuoteId ?? null,
        linked_quote_name: itin.linkedQuoteName ?? '',
        created_by_name: itin.createdBy ?? savedBy,
        updated_at: now,
        updated_by_name: savedBy,
      },
      { onConflict: 'legacy_id' },
    )
    .select('id')
    .single();
  if (upErr) throw new Error('sbSaveItinerary upsert: ' + upErr.message);

  const parentUuid = up!.id as string;

  await replaceChildren(
    client,
    'itinerary_days',
    'itinerary_id',
    parentUuid,
    itin.schedule.map((day, i) => ({
      itinerary_id: parentUuid,
      day_num: day.dayNum,
      date: day.date ?? null,
      title: day.title ?? '',
      meals: day.meals,
      meal_note: day.mealNote ?? '',
      segments: day.segments,
      sort_order: i,
    })),
  );

  await replaceChildren(
    client,
    'itinerary_flights',
    'itinerary_id',
    parentUuid,
    itin.flights.map((f, i) => ({
      itinerary_id: parentUuid,
      legacy_flight_id: f.id,
      group_text: f.group ?? '',
      leg: f.leg ?? '',
      flight_no: f.flightNo ?? '',
      dep: f.dep ?? '',
      arr: f.arr ?? '',
      dep_airport: f.depAirport ?? null,
      dep_time: f.depTime ?? null,
      arr_airport: f.arrAirport ?? null,
      arr_time: f.arrTime ?? null,
      dep_day_offset: f.depDayOffset ?? null,
      arr_day_offset: f.arrDayOffset ?? null,
      sort_order: i,
    })),
  );
}

/**
 * Delete itinerary by legacy_id. Cascade rules drop days + flights automatically.
 * Mirrors fbDeleteItinerary (firebase.ts:943-953).
 */
export async function sbDeleteItinerary(
  id: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('itineraries').delete().eq('legacy_id', id);
  if (error) throw new Error('sbDeleteItinerary: ' + error.message);
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm run test:integration -- tests/supabase/itineraries.test.ts
```
Expected: PASS — all 4 assertions (save, get, list, delete) green.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/lib/supabase.ts tests/supabase/itineraries.test.ts
git commit -m "feat(supabase): itineraries gateway (sbSaveItinerary/sbGetItinerary/sbDeleteItinerary/sbSubscribeItineraries)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: menus + restaurants (`firebase.ts:968-1049`; `src/types/menu.ts`)

**Files:**
- Modify: `src/lib/supabase.ts`
- Test: `tests/supabase/menus.test.ts`

**Interfaces (match `firebase.ts:968-1049`):**
- `sbSubscribeRestaurants(cb: (list: Restaurant[]) => void, client?: SupabaseClient): () => void` — `subscribeTable` over `restaurants`, SELECT parent + `restaurant_menus` children (`sort_order`), assemble `menus: RestaurantMenu[]`. Mirrors `fbSubscribeRestaurants` (`firebase.ts:976-979`).
- `sbSaveRestaurants(list: Restaurant[], savedBy: string, client?: SupabaseClient): Promise<void>` — full-overwrite: delete restaurants whose `legacy_id` is not in the new list, upsert parents, `replaceChildren` for `restaurant_menus` per restaurant. Mirrors `fbSaveRestaurants` (`firebase.ts:986-992`).
- `sbSubscribeMenus(cb: (list: MenuIndexEntry[]) => void, client?: SupabaseClient): () => void` — `subscribeTable` over `menus`, SELECT metadata columns only, return `MenuIndexEntry[]` newest-first. Mirrors `fbSubscribeMenus` (`firebase.ts:1046-1049`).
- `sbGetMenu(id: string, client?: SupabaseClient): Promise<Menu | null>` — fetch parent + `menu_days` (ordered `sort_order`), reassemble `schedule: MenuDay[]` (each with `meals: MenuMeal[]` from jsonb). Mirrors `fbGetMenu` (`firebase.ts:1028-1030`).
- `sbSaveMenu(m: Menu, savedBy: string, client?: SupabaseClient): Promise<void>` — upsert parent `menus` by `legacy_id`, capture uuid, `replaceChildren` for `menu_days` (jsonb `meals` column). Mirrors `fbSaveMenu` (`firebase.ts:1003-1025`).
- `sbDeleteMenu(id: string, client?: SupabaseClient): Promise<void>` — delete parent by `legacy_id`; cascade drops `menu_days`. Mirrors `fbDeleteMenu` (`firebase.ts:1033-1043`).

- [ ] **Step 1: Write the failing test**

Create `tests/supabase/menus.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import {
  sbSaveRestaurants, sbSubscribeRestaurants,
  sbSaveMenu, sbGetMenu, sbDeleteMenu, sbSubscribeMenus,
} from '../../src/lib/supabase';
import type { Restaurant } from '../../src/types/menu';
import type { Menu } from '../../src/types/menu';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

const RESTAURANT: Restaurant = {
  id: 'rest-t15',
  name: 'Nhà hàng Ngon',
  continent: 'Asia',
  country: 'Vietnam',
  city: 'Hà Nội',
  website: 'https://ngon.vn',
  menuLink: '',
  contact: '024 1234 5678',
  note: 'Vị trí đẹp',
  rating: 4.5,
  review: 'Rất ngon',
  menus: [
    { id: 'rm1', name: 'Set A', dishes: 'Phở, Bún', price: 150000, cur: 'VND', rating: 4, review: 'OK' },
    { id: 'rm2', name: 'Set B', dishes: 'Cơm, Canh', price: 200000, cur: 'VND', rating: 5, review: 'Xuất sắc' },
  ],
};

const MENU: Menu = {
  id: 'menu-t15',
  code: 'M15',
  type: 'ND',
  continent: 'Asia',
  country: 'Vietnam',
  seq: 1,
  title: 'Thực đơn HN 2N',
  destination: 'Hà Nội',
  days: 2,
  linkedItineraryId: null,
  linkedItineraryName: '',
  linkedQuoteId: null,
  linkedQuoteName: '',
  schedule: [
    {
      id: 'md1', dayNum: 1, date: '2026-08-01', city: 'Hà Nội',
      meals: [
        {
          id: 'mm1', mealType: 'B', restaurantId: 'rest-t15', restaurantName: 'Nhà hàng Ngon',
          city: 'Hà Nội', restMenuId: 'rm1', suggestedDishes: 'Phở', suggestedPrice: 150000,
          suggestedCur: 'VND', adjustedDishes: 'Phở đặc biệt', adjustedPrice: 160000,
          adjustedCur: 'VND', cur: 'VND', note: '',
        },
      ],
    },
    {
      id: 'md2', dayNum: 2, date: '2026-08-02', city: 'Hà Nội',
      meals: [
        {
          id: 'mm2', mealType: 'L', restaurantId: 'rest-t15', restaurantName: 'Nhà hàng Ngon',
          city: 'Hà Nội', restMenuId: 'rm2', suggestedDishes: 'Cơm', suggestedPrice: 200000,
          suggestedCur: 'VND', adjustedDishes: 'Cơm tấm', adjustedPrice: 210000,
          adjustedCur: 'VND', cur: 'VND', note: 'Thêm rau',
        },
      ],
    },
  ],
  createdAt: '2026-08-01T00:00:00.000Z',
  createdBy: 'tester',
};

describe('restaurants gateway', () => {
  beforeEach(async () => {
    await truncate(['restaurant_menus', 'restaurants']);
  });

  it('round-trips a restaurant with menus', async () => {
    const c = await getViettoursClient();

    await sbSaveRestaurants([RESTAURANT], 'tester', c);

    const list = await once<Restaurant[]>((cb) => sbSubscribeRestaurants(cb, c));
    const r = list.find((x) => x.id === 'rest-t15');
    expect(r).toBeDefined();
    expect(r!.name).toBe('Nhà hàng Ngon');
    expect(r!.rating).toBe(4.5);
    expect(r!.menus).toHaveLength(2);
    expect(r!.menus[0].name).toBe('Set A');
    expect(r!.menus[1].price).toBe(200000);

    // full-overwrite: saving empty list removes the restaurant
    await sbSaveRestaurants([], 'tester', c);
    const listAfter = await once<Restaurant[]>((cb) => sbSubscribeRestaurants(cb, c));
    expect(listAfter.find((x) => x.id === 'rest-t15')).toBeUndefined();
  });
});

describe('menus gateway', () => {
  beforeEach(async () => {
    await truncate(['menu_days', 'menus']);
  });

  it('saves, gets, lists, and deletes a menu with 2 days', async () => {
    const c = await getViettoursClient();

    // save
    await sbSaveMenu(MENU, 'tester', c);

    // get reassembles schedule with meals
    const got = await sbGetMenu('menu-t15', c);
    expect(got).not.toBeNull();
    expect(got!.title).toBe('Thực đơn HN 2N');
    expect(got!.days).toBe(2);
    expect(got!.schedule).toHaveLength(2);
    expect(got!.schedule[0].dayNum).toBe(1);
    expect(got!.schedule[0].city).toBe('Hà Nội');
    expect(got!.schedule[0].meals).toHaveLength(1);
    expect(got!.schedule[0].meals[0].mealType).toBe('B');
    expect(got!.schedule[1].dayNum).toBe(2);
    expect(got!.schedule[1].meals[0].note).toBe('Thêm rau');

    // list returns index entry
    const list = await once<any[]>((cb) => sbSubscribeMenus(cb as any, c));
    const entry = list.find((x) => x.id === 'menu-t15');
    expect(entry).toBeDefined();
    expect(entry!.title).toBe('Thực đơn HN 2N');
    expect(entry!.days).toBe(2);
    expect(entry!.destination).toBe('Hà Nội');

    // delete removes parent (children cascade)
    await sbDeleteMenu('menu-t15', c);
    const after = await sbGetMenu('menu-t15', c);
    expect(after).toBeNull();
    const listAfter = await once<any[]>((cb) => sbSubscribeMenus(cb as any, c));
    expect(listAfter.find((x) => x.id === 'menu-t15')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm run test:integration -- tests/supabase/menus.test.ts
```
Expected: FAIL — `sbSaveRestaurants` / `sbSubscribeRestaurants` / `sbSaveMenu` / `sbGetMenu` / `sbDeleteMenu` / `sbSubscribeMenus` not exported.

- [ ] **Step 3: Implement in `src/lib/supabase.ts`**

Append to `src/lib/supabase.ts`:
```ts
import type { Restaurant, RestaurantMenu, Menu, MenuDay, MenuIndexEntry } from '@/types/menu';
import { subscribeTable, replaceChildren } from './supabase/helpers';

// ── row assemblers ──

const rowToRestaurantMenu = (r: Record<string, unknown>): RestaurantMenu => ({
  id: (r.legacy_menu_id as string) ?? (r.id as string),
  name: (r.name as string) ?? '',
  dishes: (r.dishes as string) ?? '',
  price: (r.price as number) ?? 0,
  cur: (r.cur as string) ?? 'VND',
  rating: (r.rating as number) ?? 0,
  review: (r.review as string) ?? '',
});

const rowToMenuIndex = (r: Record<string, unknown>): MenuIndexEntry => ({
  id: (r.legacy_id as string) ?? (r.id as string),
  code: (r.code as string) ?? '',
  title: (r.title as string) ?? '',
  destination: (r.destination as string) ?? '',
  days: r.days as number,
  linkedItineraryId: (r.linked_itinerary_id as string) ?? null,
  linkedItineraryName: (r.linked_itinerary_name as string) ?? '',
  linkedQuoteId: (r.linked_quote_id as string) ?? null,
  linkedQuoteName: (r.linked_quote_name as string) ?? '',
  createdAt: (r.created_at as string) ?? undefined,
  createdBy: (r.created_by_name as string) ?? undefined,
  updatedAt: (r.updated_at as string) ?? '',
  updatedBy: (r.updated_by_name as string) ?? '',
});

const rowToMenuDay = (r: Record<string, unknown>): MenuDay => ({
  id: (r.id as string),
  dayNum: r.day_num as number,
  date: (r.date as string) ?? '',
  city: (r.city as string) ?? '',
  meals: r.meals as MenuDay['meals'],
});

// ── restaurants ──

/**
 * Subscribe to the shared restaurant library (parent + restaurant_menus children).
 * Mirrors fbSubscribeRestaurants (firebase.ts:976-979).
 */
export function sbSubscribeRestaurants(
  cb: (list: Restaurant[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(
    client,
    'restaurants',
    async (cl) => {
      const { data: rows, error } = await cl
        .from('restaurants')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;

      const ids = (rows ?? []).map((r) => r.id as string);
      const { data: rmRows, error: rmErr } = ids.length
        ? await cl
            .from('restaurant_menus')
            .select('*')
            .in('restaurant_id', ids)
            .order('sort_order', { ascending: true })
        : { data: [] as Record<string, unknown>[], error: null };
      if (rmErr) throw rmErr;

      const byParent = new Map<string, RestaurantMenu[]>();
      for (const rm of rmRows ?? []) {
        const arr = byParent.get(rm.restaurant_id as string) ?? [];
        arr.push(rowToRestaurantMenu(rm as Record<string, unknown>));
        byParent.set(rm.restaurant_id as string, arr);
      }

      return (rows ?? []).map((r) => ({
        id: (r.legacy_id as string) ?? (r.id as string),
        name: (r.name as string) ?? '',
        continent: (r.continent as string) ?? '',
        country: (r.country as string) ?? '',
        city: (r.city as string) ?? '',
        website: (r.website as string) ?? undefined,
        menuLink: (r.menu_link as string) ?? undefined,
        contact: (r.contact as string) ?? undefined,
        note: (r.note as string) ?? undefined,
        rating: (r.rating as number) ?? 0,
        review: (r.review as string) ?? '',
        menus: byParent.get(r.id as string) ?? [],
      })) as Restaurant[];
    },
    cb,
  );
}

/**
 * Full-overwrite push of the restaurant library.
 * Mirrors fbSaveRestaurants (firebase.ts:986-992).
 */
export async function sbSaveRestaurants(
  list: Restaurant[],
  savedBy: string,
  client: SupabaseClient = sb,
): Promise<void> {
  // delete restaurants removed from the list
  const keep = list.map((r) => `"${r.id}"`).join(',') || '""';
  const del = await client
    .from('restaurants')
    .delete()
    .not('legacy_id', 'in', `(${keep})`);
  if (del.error) throw new Error('sbSaveRestaurants delete: ' + del.error.message);

  for (const rest of list) {
    const { data: up, error: upErr } = await client
      .from('restaurants')
      .upsert(
        {
          legacy_id: rest.id,
          name: rest.name,
          continent: rest.continent ?? null,
          country: rest.country ?? null,
          city: rest.city ?? null,
          website: rest.website ?? null,
          menu_link: rest.menuLink ?? null,
          contact: rest.contact ?? null,
          note: rest.note ?? null,
          rating: rest.rating ?? 0,
          review: rest.review ?? '',
        },
        { onConflict: 'legacy_id' },
      )
      .select('id')
      .single();
    if (upErr) throw new Error('sbSaveRestaurants upsert: ' + upErr.message);

    await replaceChildren(
      client,
      'restaurant_menus',
      'restaurant_id',
      up!.id as string,
      rest.menus.map((m, i) => ({
        restaurant_id: up!.id,
        legacy_menu_id: m.id,
        name: m.name,
        dishes: m.dishes ?? null,
        price: m.price ?? 0,
        cur: m.cur ?? 'VND',
        rating: m.rating ?? 0,
        review: m.review ?? null,
        sort_order: i,
      })),
    );
  }
}

// ── menus ──

/**
 * Subscribe to the menu metadata index (lightweight list).
 * Mirrors fbSubscribeMenus (firebase.ts:1046-1049).
 */
export function sbSubscribeMenus(
  cb: (list: MenuIndexEntry[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(
    client,
    'menus',
    async (cl) => {
      const { data, error } = await cl
        .from('menus')
        .select(
          'id, legacy_id, code, title, destination, days, linked_itinerary_id, linked_itinerary_name, linked_quote_id, linked_quote_name, created_at, created_by_name, updated_at, updated_by_name',
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToMenuIndex);
    },
    cb,
  );
}

/**
 * One-time fetch of a full menu, reassembling schedule from menu_days.
 * Mirrors fbGetMenu (firebase.ts:1028-1030).
 */
export async function sbGetMenu(
  id: string,
  client: SupabaseClient = sb,
): Promise<Menu | null> {
  const { data: row, error } = await client
    .from('menus')
    .select('*')
    .eq('legacy_id', id)
    .maybeSingle();
  if (error) throw new Error('sbGetMenu: ' + error.message);
  if (!row) return null;

  const { data: days, error: dErr } = await client
    .from('menu_days')
    .select('*')
    .eq('menu_id', row.id as string)
    .order('sort_order', { ascending: true });
  if (dErr) throw new Error('sbGetMenu days: ' + dErr.message);

  return {
    id: (row.legacy_id as string) ?? (row.id as string),
    code: (row.code as string) ?? undefined,
    type: row.type as Menu['type'],
    continent: (row.continent as string) ?? '',
    country: (row.country as string) ?? '',
    seq: (row.seq as number) ?? 0,
    title: (row.title as string) ?? '',
    destination: (row.destination as string) ?? '',
    days: row.days as number,
    linkedItineraryId: (row.linked_itinerary_id as string) ?? null,
    linkedItineraryName: (row.linked_itinerary_name as string) ?? '',
    linkedQuoteId: (row.linked_quote_id as string) ?? null,
    linkedQuoteName: (row.linked_quote_name as string) ?? '',
    schedule: (days ?? []).map(rowToMenuDay),
    createdAt: (row.created_at as string) ?? undefined,
    createdBy: (row.created_by_name as string) ?? undefined,
    updatedAt: (row.updated_at as string) ?? undefined,
    updatedBy: (row.updated_by_name as string) ?? undefined,
  };
}

/**
 * Save menu: upsert parent by legacy_id, replace menu_days children.
 * Mirrors fbSaveMenu (firebase.ts:1003-1025).
 */
export async function sbSaveMenu(
  m: Menu,
  savedBy: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const now = new Date().toISOString();
  const { data: up, error: upErr } = await client
    .from('menus')
    .upsert(
      {
        legacy_id: m.id,
        code: m.code ?? null,
        type: m.type,
        continent: m.continent,
        country: m.country,
        seq: m.seq ?? 0,
        title: m.title,
        destination: m.destination ?? null,
        days: m.days,
        linked_itinerary_id: m.linkedItineraryId ?? null,
        linked_itinerary_name: m.linkedItineraryName ?? '',
        linked_quote_id: m.linkedQuoteId ?? null,
        linked_quote_name: m.linkedQuoteName ?? '',
        created_by_name: m.createdBy ?? savedBy,
        updated_at: now,
        updated_by_name: savedBy,
      },
      { onConflict: 'legacy_id' },
    )
    .select('id')
    .single();
  if (upErr) throw new Error('sbSaveMenu upsert: ' + upErr.message);

  const parentUuid = up!.id as string;

  await replaceChildren(
    client,
    'menu_days',
    'menu_id',
    parentUuid,
    m.schedule.map((day, i) => ({
      menu_id: parentUuid,
      day_num: day.dayNum,
      date: day.date ?? null,
      city: day.city ?? null,
      meals: day.meals,
      sort_order: i,
    })),
  );
}

/**
 * Delete menu by legacy_id. Cascade drops menu_days automatically.
 * Mirrors fbDeleteMenu (firebase.ts:1033-1043).
 */
export async function sbDeleteMenu(
  id: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('menus').delete().eq('legacy_id', id);
  if (error) throw new Error('sbDeleteMenu: ' + error.message);
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm run test:integration -- tests/supabase/menus.test.ts
```
Expected: PASS — both `restaurants gateway` and `menus gateway` describe blocks green (3 assertions total).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/lib/supabase.ts tests/supabase/menus.test.ts
git commit -m "feat(supabase): menus + restaurants gateway (sbSaveRestaurants/sbSubscribeRestaurants/sbSubscribeMenus/sbGetMenu/sbSaveMenu/sbDeleteMenu)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: notifications + threads (`firebase.ts:594-768`; `src/types/notification.ts`)

**Files:** Modify `src/lib/supabase.ts`; Test `tests/supabase/notifications.test.ts`

**Interfaces (match `firebase.ts:598-768`):**
- `sbSendNotification(targetUsername: string, notif: Omit<Notification, 'id' | 'read' | 'createdAt'>, client?: SupabaseClient): Promise<void>` — resolve `targetUsername` → `user_id` via `usernamesToIds`; insert one row into `notifications`; cap at 100 rows per user (delete oldest beyond cap).
- `sbSubscribeNotifications(username: string, cb: (list: Notification[]) => void, client?: SupabaseClient): Unsubscribe` — `subscribeTable` filtering `notifications` by `user_id` for that username; result ordered newest-first.
- `sbPushNotifications(username: string, notifications: Notification[], client?: SupabaseClient): Promise<void>` — full-overwrite (delete all rows for `user_id`, re-insert); used for mark-read.
- `sbSendNotificationMany(targets: string[], notif: Omit<Notification, 'id' | 'read' | 'createdAt'>, client?: SupabaseClient): Promise<void>` — deduplicate targets, call `sbSendNotification` for each in parallel.
- `sbEnsureNotifThread(thread: NotifThread, client?: SupabaseClient): Promise<void>` — upsert `notification_threads` row (text PK = `thread.id`); merge new members into `notification_thread_members` (upsert by `(thread_id, username)`); resolve member usernames → `user_id` via `usernamesToIds` (null if unmapped).
- `sbSubscribeNotifThread(id: string, cb: (t: NotifThread | null) => void, client?: SupabaseClient): Unsubscribe` — `subscribeTable` on `notification_threads` filtering by `id`; reassemble members from `notification_thread_members` + comments from `notification_comments` ordered by `sort_order`.
- `sbAddThreadComment(id: string, comment: NotifComment, client?: SupabaseClient): Promise<void>` — insert one row into `notification_comments`; `sort_order` = current max + 1 for that thread.
- `sbSetThreadStatus(id: string, status: ActivityStatus, updatedByName: string, client?: SupabaseClient): Promise<void>` — update `notification_threads` row: set `status`, `updated_at`, `updated_by_name`.

- [ ] **Step 1: Write the failing test**

Create `tests/supabase/notifications.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import {
  sbSendNotification, sbSubscribeNotifications, sbPushNotifications,
  sbSendNotificationMany, sbEnsureNotifThread, sbSubscribeNotifThread,
  sbAddThreadComment, sbSetThreadStatus,
} from '../../src/lib/supabase';
import type { Notification, NotifThread } from '@/types';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('notifications gateway', () => {
  beforeEach(async () => {
    await truncate([
      'notification_comments', 'notification_thread_members',
      'notification_threads', 'notifications',
    ]);
  });

  it('send to a user → subscribe yields it', async () => {
    const c = await getViettoursClient();
    await sbSendNotification('tester', {
      type: 'announcement', title: 'Hello', message: 'World',
      createdBy: 'admin',
    }, c);
    const list = await once<Notification[]>((cb) => sbSubscribeNotifications('tester', cb, c));
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Hello');
    expect(list[0].read).toBe(false);
    expect(list[0].id).toBeTruthy();
    expect(list[0].createdAt).toBeTruthy();
  });

  it('push (mark-read) round-trips read flag', async () => {
    const c = await getViettoursClient();
    await sbSendNotification('tester', {
      type: 'task', title: 'Task', message: 'Do it', createdBy: 'admin',
    }, c);
    let list = await once<Notification[]>((cb) => sbSubscribeNotifications('tester', cb, c));
    expect(list[0].read).toBe(false);
    await sbPushNotifications('tester', [{ ...list[0], read: true }], c);
    list = await once<Notification[]>((cb) => sbSubscribeNotifications('tester', cb, c));
    expect(list[0].read).toBe(true);
  });

  it('sendNotificationMany deduplicates and sends to all targets', async () => {
    const c = await getViettoursClient();
    // send to same user twice (dedup) and once to tester
    await sbSendNotificationMany(['tester', 'tester'], {
      type: 'announcement', title: 'Broadcast', message: 'Hi all', createdBy: 'admin',
    }, c);
    const list = await once<Notification[]>((cb) => sbSubscribeNotifications('tester', cb, c));
    // dedup → only 1 notification, not 2
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Broadcast');
  });

  it('ensure thread + add comment → subscribe yields comment', async () => {
    const c = await getViettoursClient();
    const thread: NotifThread = {
      id: 'thread-1', title: 'Test Thread', members: ['tester'],
      comments: [], createdAt: new Date().toISOString(), createdBy: 'tester',
      status: 'pending',
    };
    await sbEnsureNotifThread(thread, c);
    await sbAddThreadComment('thread-1', {
      id: 'cmt-1', by: 'tester', byName: 'QA Bot', text: 'LGTM', at: new Date().toISOString(),
    }, c);
    const t = await once<NotifThread | null>((cb) => sbSubscribeNotifThread('thread-1', cb, c));
    expect(t).not.toBeNull();
    expect(t!.title).toBe('Test Thread');
    expect(t!.members).toContain('tester');
    expect(t!.comments).toHaveLength(1);
    expect(t!.comments[0].text).toBe('LGTM');
  });

  it('ensure thread is idempotent and merges new members', async () => {
    const c = await getViettoursClient();
    const base: NotifThread = {
      id: 'thread-2', title: 'Original', members: ['tester'],
      comments: [], createdAt: new Date().toISOString(), createdBy: 'tester',
    };
    await sbEnsureNotifThread(base, c);
    // call again with extra member
    await sbEnsureNotifThread({ ...base, members: ['tester', 'admin'] }, c);
    const t = await once<NotifThread | null>((cb) => sbSubscribeNotifThread('thread-2', cb, c));
    expect(t!.members).toContain('tester');
    expect(t!.members).toContain('admin');
    expect(t!.title).toBe('Original'); // title must not be overwritten on re-ensure
  });

  it('setThreadStatus updates status field', async () => {
    const c = await getViettoursClient();
    await sbEnsureNotifThread({
      id: 'thread-3', title: 'Status Test', members: ['tester'],
      comments: [], createdAt: new Date().toISOString(), createdBy: 'tester',
      status: 'pending',
    }, c);
    await sbSetThreadStatus('thread-3', 'approved', 'Boss', c);
    const t = await once<NotifThread | null>((cb) => sbSubscribeNotifThread('thread-3', cb, c));
    expect(t!.status).toBe('approved');
    expect(t!.updatedByName).toBe('Boss');
    expect(t!.updatedAt).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm run test:integration -- tests/supabase/notifications.test.ts`
Expected: FAIL — `sbSendNotification` and siblings not exported from `src/lib/supabase.ts`.

- [ ] **Step 3: Implement in `src/lib/supabase.ts`**

Append:
```ts
import type { Notification, NotifThread, NotifComment, ActivityStatus } from '@/types';
import { subscribeTable, usernamesToIds } from './supabase/helpers';

// ── helpers ──

/** Resolve username → user_id; throws if not found (send requires a real target). */
async function resolveUserId(client: SupabaseClient, username: string): Promise<string> {
  const map = await usernamesToIds(client, [username]);
  const id = map.get(username);
  if (!id) throw new Error(`sbNotifications: no profile for username "${username}"`);
  return id;
}

const rowToNotif = (r: Record<string, unknown>): Notification => ({
  id: (r.legacy_id as string) || (r.id as string),
  type: r.type as Notification['type'],
  title: r.title as string,
  message: r.message as string,
  createdBy: (r.created_by_name as string) ?? '',
  createdAt: r.created_at as string,
  read: (r.read as boolean) ?? false,
  link: (r.link as Notification['link']) ?? undefined,
  threadId: (r.thread_id as string) ?? undefined,
  data: (r.data as Record<string, unknown>) ?? undefined,
});

// ── Notifications ──

/**
 * Send a notification to a target user. Resolves username → user_id; inserts
 * one row; caps the user's notification list at 100 by deleting oldest excess.
 * Mirrors fbSendNotification (firebase.ts:598-615).
 */
export async function sbSendNotification(
  targetUsername: string,
  notif: Omit<Notification, 'id' | 'read' | 'createdAt'>,
  client: SupabaseClient = sb,
): Promise<void> {
  const userId = await resolveUserId(client, targetUsername);
  const legacyId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const { error } = await client.from('notifications').insert({
    legacy_id: legacyId,
    user_id: userId,
    type: notif.type,
    title: notif.title,
    message: notif.message,
    created_by_name: notif.createdBy,
    read: false,
    link: notif.link ?? null,
    thread_id: notif.threadId ?? null,
    data: notif.data ?? null,
  });
  if (error) throw new Error('sbSendNotification: ' + error.message);
  // cap at 100: delete oldest beyond limit
  const { data: all } = await client.from('notifications')
    .select('id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  const excess = (all ?? []).slice(100);
  if (excess.length) {
    await client.from('notifications').delete().in('id', excess.map((r) => r.id as string));
  }
}

/**
 * Subscribe to a user's notifications (newest-first).
 * Mirrors fbSubscribeNotifications (firebase.ts:621-628).
 */
export function sbSubscribeNotifications(
  username: string,
  cb: (list: Notification[]) => void,
  client: SupabaseClient = sb,
): Unsubscribe {
  return subscribeTable(client, 'notifications', async (cl) => {
    const map = await usernamesToIds(cl, [username]);
    const userId = map.get(username);
    if (!userId) { cb([]); return []; }
    const { data, error } = await cl.from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToNotif);
  }, cb);
}

/**
 * Full-overwrite push of a user's notification list (used for mark-read).
 * Mirrors fbPushNotifications (firebase.ts:633-638).
 */
export async function sbPushNotifications(
  username: string,
  notifications: Notification[],
  client: SupabaseClient = sb,
): Promise<void> {
  const userId = await resolveUserId(client, username);
  // delete all existing
  const del = await client.from('notifications').delete().eq('user_id', userId);
  if (del.error) throw new Error('sbPushNotifications delete: ' + del.error.message);
  if (!notifications.length) return;
  const rows = notifications.map((n) => ({
    legacy_id: n.id,
    user_id: userId,
    type: n.type,
    title: n.title,
    message: n.message,
    created_by_name: n.createdBy,
    created_at: n.createdAt,
    read: n.read,
    link: n.link ?? null,
    thread_id: n.threadId ?? null,
    data: n.data ?? null,
  }));
  const ins = await client.from('notifications').insert(rows);
  if (ins.error) throw new Error('sbPushNotifications insert: ' + ins.error.message);
}

/**
 * Send the same notification to multiple recipients (deduplicated).
 * Mirrors fbSendNotificationMany (firebase.ts:763-768).
 */
export async function sbSendNotificationMany(
  targets: string[],
  notif: Omit<Notification, 'id' | 'read' | 'createdAt'>,
  client: SupabaseClient = sb,
): Promise<void> {
  await Promise.all(Array.from(new Set(targets)).map((u) => sbSendNotification(u, notif, client)));
}

// ── Notification threads ──

/**
 * Create the thread if missing; else merge in newly-added members and update link/title.
 * Mirrors fbEnsureNotifThread (firebase.ts:719-730).
 */
export async function sbEnsureNotifThread(
  thread: NotifThread,
  client: SupabaseClient = sb,
): Promise<void> {
  // upsert the thread row (text PK — on conflict, keep existing title/created_at)
  const { data: existing } = await client.from('notification_threads')
    .select('id, title')
    .eq('id', thread.id)
    .maybeSingle();

  if (existing) {
    // merge: update link (if provided) but don't overwrite title
    await client.from('notification_threads')
      .update({
        link: thread.link ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', thread.id);
  } else {
    const creatorMap = await usernamesToIds(client, [thread.createdBy]);
    const { error } = await client.from('notification_threads').insert({
      id: thread.id,
      title: thread.title,
      link: thread.link ?? null,
      act_type: thread.actType ?? null,
      status: thread.status ?? null,
      created_by: creatorMap.get(thread.createdBy) ?? null,
      created_by_name: thread.createdBy,
      created_at: thread.createdAt,
      data: thread.data ?? null,
    });
    if (error) throw new Error('sbEnsureNotifThread insert: ' + error.message);
  }
  // merge members (upsert by PK (thread_id, username))
  if (thread.members.length) {
    const memberMap = await usernamesToIds(client, thread.members);
    const memberRows = thread.members.map((uname) => ({
      thread_id: thread.id,
      user_id: memberMap.get(uname) ?? null,
      username: uname,
    }));
    const up = await client.from('notification_thread_members')
      .upsert(memberRows, { onConflict: 'thread_id,username' });
    if (up.error) throw new Error('sbEnsureNotifThread members: ' + up.error.message);
  }
}

const assembleThread = async (cl: SupabaseClient, id: string): Promise<NotifThread | null> => {
  const { data: row } = await cl.from('notification_threads')
    .select('*').eq('id', id).maybeSingle();
  if (!row) return null;
  const { data: memberRows } = await cl.from('notification_thread_members')
    .select('username').eq('thread_id', id);
  const { data: commentRows } = await cl.from('notification_comments')
    .select('*').eq('thread_id', id).order('sort_order', { ascending: true });
  const members = (memberRows ?? []).map((r) => r.username as string).filter(Boolean);
  const comments: NotifComment[] = (commentRows ?? []).map((r) => ({
    id: (r.legacy_id as string) || (r.id as string),
    by: (r.by_username as string) ?? '',
    byName: r.by_name as string,
    text: r.text as string,
    at: r.at as string,
  }));
  return {
    id: row.id as string,
    title: row.title as string,
    members,
    link: (row.link as NotifThread['link']) ?? undefined,
    comments,
    createdAt: row.created_at as string,
    createdBy: (row.created_by_name as string) ?? '',
    actType: (row.act_type as NotifThread['actType']) ?? undefined,
    status: (row.status as NotifThread['status']) ?? undefined,
    updatedAt: (row.updated_at as string) ?? undefined,
    updatedByName: (row.updated_by_name as string) ?? undefined,
    data: (row.data as Record<string, unknown>) ?? undefined,
  };
};

/**
 * Subscribe to a shared thread (members + comments reassembled).
 * Mirrors fbSubscribeNotifThread (firebase.ts:732-734).
 */
export function sbSubscribeNotifThread(
  id: string,
  cb: (t: NotifThread | null) => void,
  client: SupabaseClient = sb,
): Unsubscribe {
  return subscribeTable(client, 'notification_threads', (cl) => assembleThread(cl, id), cb);
}

/**
 * Append a comment to a thread. sort_order = current max + 1.
 * Mirrors fbAddThreadComment (firebase.ts:737-742).
 */
export async function sbAddThreadComment(
  id: string,
  comment: NotifComment,
  client: SupabaseClient = sb,
): Promise<void> {
  const { data: maxRow } = await client.from('notification_comments')
    .select('sort_order')
    .eq('thread_id', id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = maxRow ? ((maxRow.sort_order as number) + 1) : 0;
  const byMap = await usernamesToIds(client, [comment.by]);
  const { error } = await client.from('notification_comments').insert({
    thread_id: id,
    legacy_id: comment.id,
    by_user_id: byMap.get(comment.by) ?? null,
    by_username: comment.by,
    by_name: comment.byName,
    text: comment.text,
    at: comment.at,
    sort_order: sortOrder,
  });
  if (error) throw new Error('sbAddThreadComment: ' + error.message);
}

/**
 * Update the live status of a shared thread.
 * Mirrors fbSetThreadStatus (firebase.ts:749-760).
 */
export async function sbSetThreadStatus(
  id: string,
  status: ActivityStatus,
  updatedByName: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('notification_threads')
    .update({ status, updated_at: new Date().toISOString(), updated_by_name: updatedByName })
    .eq('id', id);
  if (error) throw new Error('sbSetThreadStatus: ' + error.message);
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm run test:integration -- tests/supabase/notifications.test.ts`
Expected: all 5 tests pass.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/lib/supabase.ts tests/supabase/notifications.test.ts
git commit -m "feat(supabase): notifications + threads gateway (send/subscribe/push/thread/comment/status)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: payment_approvals + tour_payments (`firebase.ts:788-894`; `src/types/payment.ts`)

**Files:** Modify `src/lib/supabase.ts`; Test `tests/supabase/payments.test.ts`

**Interfaces (match `firebase.ts:794-894`):**
- `sbSaveTourPayments(tourKey: string, payments: Record<string, PaymentRecord>, customItems: CustomCostItem[], savedBy: string, client?: SupabaseClient): Promise<void>` — upsert `tour_payments` row (by `tour_key`); `replaceChildren` `payment_records` (installments as jsonb) + `custom_cost_items`. Mirrors `fbSaveTourPayments` (firebase.ts:794-806).
- `sbGetTourPayments(tourKey: string, client?: SupabaseClient): Promise<TourPayments | null>` — one-time fetch; reassemble `payments` map + `customItems` array. Mirrors `fbGetTourPayments` (firebase.ts:809-817).
- `sbSubscribeTourPayments(tourKey: string, cb: (data: TourPayments | null) => void, client?: SupabaseClient): Unsubscribe` — `subscribeTable` on `tour_payments` filtered by `tour_key`; reassemble same shape. Mirrors `fbSubscribeTourPayments` (firebase.ts:823-835).
- `sbSetApprovalStage(key: string, stage: 1 | 2, status: 'approved' | 'rejected', approverUsername: string, approverName: string, note: string, intended: { intendedApprover1Name?: string; intendedApprover2Name?: string }, client?: SupabaseClient): Promise<void>` — upsert `payment_approvals` row (by `approval_key`); upsert `payment_approval_stages` row (by `approval_id, stage`). Final status rules (firebase.ts:869-870): `status === 'rejected'` → `'rejected'`; `stage === 2` → `'approved'`; else → `'pending_stage2'`. Mirrors `fbSetApprovalStage` (firebase.ts:850-882).
- `sbSubscribePaymentApprovals(cb: (doc: PaymentApprovalDoc) => void, client?: SupabaseClient): Unsubscribe` — `subscribeTable` on `payment_approvals`; reassemble all rows + their stages into the `key → PaymentApprovalEntry` map. Mirrors `fbSubscribePaymentApprovals` (firebase.ts:888-894).

- [ ] **Step 1: Write the failing test**

Create `tests/supabase/payments.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import {
  sbSaveTourPayments, sbGetTourPayments, sbSubscribeTourPayments,
  sbSetApprovalStage, sbSubscribePaymentApprovals,
} from '../../src/lib/supabase';
import type { PaymentRecord, CustomCostItem, TourPayments, PaymentApprovalDoc } from '@/types';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('tour payments gateway', () => {
  beforeEach(async () => {
    await truncate(['payment_records', 'custom_cost_items', 'tour_payments']);
  });

  it('save → get round-trips payments + customItems', async () => {
    const c = await getViettoursClient();
    const payments: Record<string, PaymentRecord> = {
      'hotel-1': { supplier: 'Sheraton', tracked: true, customAmount: 5_000_000 },
      'bus-1': {
        supplier: 'Xe Minh', tracked: false,
        installments: [
          { label: 'Đợt 1', amount: 1_000_000, status: 'paid', paidDate: '2026-06-01' },
          { label: 'Đợt 2', amount: 500_000, status: 'unpaid', paidDate: '' },
        ],
      },
    };
    const customItems: CustomCostItem[] = [
      { key: 'ci-1', catId: 'hotel', catLabel: 'Khách sạn', catIcon: '🏨', catColor: '#f00', name: 'Extra Room', amount: 800_000 },
    ];
    await sbSaveTourPayments('tour-abc', payments, customItems, 'tester', c);

    const got = await sbGetTourPayments('tour-abc', c);
    expect(got).not.toBeNull();
    expect(got!.payments['hotel-1'].supplier).toBe('Sheraton');
    expect(got!.payments['bus-1'].installments).toHaveLength(2);
    expect(got!.payments['bus-1'].installments![0].status).toBe('paid');
    expect(got!.customItems).toHaveLength(1);
    expect(got!.customItems[0].name).toBe('Extra Room');
  });

  it('subscribe yields the same assembled shape', async () => {
    const c = await getViettoursClient();
    await sbSaveTourPayments(
      'tour-sub',
      { 'visa-1': { supplier: 'Embassy', tracked: true } },
      [],
      'tester',
      c,
    );
    const data = await once<TourPayments | null>((cb) => sbSubscribeTourPayments('tour-sub', cb, c));
    expect(data).not.toBeNull();
    expect(data!.payments['visa-1'].supplier).toBe('Embassy');
    expect(data!.customItems).toEqual([]);
  });

  it('save overwrites previous records (full-overwrite parity)', async () => {
    const c = await getViettoursClient();
    await sbSaveTourPayments('tour-over', { 'old-key': { supplier: 'Old' } }, [], 'tester', c);
    await sbSaveTourPayments('tour-over', { 'new-key': { supplier: 'New' } }, [], 'tester', c);
    const got = await sbGetTourPayments('tour-over', c);
    expect(Object.keys(got!.payments)).toEqual(['new-key']);
    expect(got!.payments['new-key'].supplier).toBe('New');
  });
});

describe('payment approvals gateway', () => {
  beforeEach(async () => {
    await truncate(['payment_approval_stages', 'payment_approvals']);
  });

  it('stage 1 approved → finalStatus is pending_stage2', async () => {
    const c = await getViettoursClient();
    await sbSetApprovalStage(
      'appr-key-1', 1, 'approved', 'tester', 'QA Bot', 'Looks good',
      { intendedApprover1Name: 'Boss1', intendedApprover2Name: 'Boss2' }, c,
    );
    const doc = await once<PaymentApprovalDoc>((cb) => sbSubscribePaymentApprovals(cb, c));
    expect(doc['appr-key-1']).toBeDefined();
    expect(doc['appr-key-1'].finalStatus).toBe('pending_stage2');
    expect(doc['appr-key-1'].currentStage).toBe(1);
    expect(doc['appr-key-1'].stage1!.approverName).toBe('QA Bot');
    expect(doc['appr-key-1'].intendedApprover1Name).toBe('Boss1');
    expect(doc['appr-key-1'].intendedApprover2Name).toBe('Boss2');
  });

  it('stage 2 approved → finalStatus is approved', async () => {
    const c = await getViettoursClient();
    await sbSetApprovalStage('appr-key-2', 1, 'approved', 'tester', 'QA', '', {}, c);
    await sbSetApprovalStage('appr-key-2', 2, 'approved', 'tester', 'QA', 'All good', {}, c);
    const doc = await once<PaymentApprovalDoc>((cb) => sbSubscribePaymentApprovals(cb, c));
    expect(doc['appr-key-2'].finalStatus).toBe('approved');
    expect(doc['appr-key-2'].currentStage).toBe(2);
    expect(doc['appr-key-2'].stage2!.status).toBe('approved');
  });

  it('rejected at any stage → finalStatus is rejected', async () => {
    const c = await getViettoursClient();
    await sbSetApprovalStage('appr-key-3', 1, 'rejected', 'tester', 'QA', 'No', {}, c);
    const doc = await once<PaymentApprovalDoc>((cb) => sbSubscribePaymentApprovals(cb, c));
    expect(doc['appr-key-3'].finalStatus).toBe('rejected');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm run test:integration -- tests/supabase/payments.test.ts`
Expected: FAIL — `sbSaveTourPayments` and siblings not exported from `src/lib/supabase.ts`.

- [ ] **Step 3: Implement in `src/lib/supabase.ts`**

Append:
```ts
import type {
  PaymentRecord, CustomCostItem, TourPayments,
  PaymentApprovalStage, PaymentApprovalEntry, PaymentApprovalDoc,
} from '@/types';
import { replaceChildren, subscribeTable, usernamesToIds } from './supabase/helpers';

// ── Tour Payments ──

const assembleTourPayments = async (
  cl: SupabaseClient,
  tourKey: string,
): Promise<TourPayments | null> => {
  const { data: parent } = await cl.from('tour_payments')
    .select('id').eq('tour_key', tourKey).maybeSingle();
  if (!parent) return null;
  const parentId = parent.id as string;

  const { data: recRows, error: recErr } = await cl.from('payment_records')
    .select('*').eq('tour_payment_id', parentId);
  if (recErr) throw recErr;

  const { data: ciRows, error: ciErr } = await cl.from('custom_cost_items')
    .select('*').eq('tour_payment_id', parentId).order('sort_order', { ascending: true });
  if (ciErr) throw ciErr;

  const payments: Record<string, PaymentRecord> = {};
  for (const r of recRows ?? []) {
    payments[r.record_key as string] = {
      supplier: (r.supplier as string) ?? undefined,
      tracked: (r.tracked as boolean) ?? undefined,
      customAmount: (r.custom_amount as number) ?? undefined,
      installments: (r.installments as PaymentRecord['installments']) ?? undefined,
      note: (r.note as string) ?? undefined,
    };
  }

  const customItems: CustomCostItem[] = (ciRows ?? []).map((r) => ({
    key: r.item_key as string,
    catId: r.cat_id as CustomCostItem['catId'],
    catLabel: (r.cat_label as string) ?? '',
    catIcon: (r.cat_icon as string) ?? '',
    catColor: (r.cat_color as string) ?? '',
    name: r.name as string,
    amount: r.amount as number,
  }));

  return { payments, customItems };
};

/**
 * Full-overwrite push of a tour's payments + customItems.
 * Mirrors fbSaveTourPayments (firebase.ts:794-806).
 */
export async function sbSaveTourPayments(
  tourKey: string,
  payments: Record<string, PaymentRecord>,
  customItems: CustomCostItem[],
  savedBy: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const now = new Date().toISOString();
  // upsert tour_payments parent
  const { data: parent, error: upErr } = await client.from('tour_payments')
    .upsert({ tour_key: tourKey, updated_at: now, updated_by: savedBy || 'unknown' }, { onConflict: 'tour_key' })
    .select('id').single();
  if (upErr) throw new Error('sbSaveTourPayments upsert parent: ' + upErr.message);
  const parentId = parent!.id as string;

  // replace payment_records
  await replaceChildren(client, 'payment_records', 'tour_payment_id', parentId,
    Object.entries(payments).map(([key, rec]) => ({
      tour_payment_id: parentId,
      record_key: key,
      supplier: rec.supplier ?? null,
      tracked: rec.tracked ?? null,
      custom_amount: rec.customAmount ?? null,
      installments: rec.installments ?? [],
      note: rec.note ?? null,
    })),
  );

  // replace custom_cost_items
  await replaceChildren(client, 'custom_cost_items', 'tour_payment_id', parentId,
    customItems.map((ci, i) => ({
      tour_payment_id: parentId,
      item_key: ci.key,
      cat_id: ci.catId,
      cat_label: ci.catLabel,
      cat_icon: ci.catIcon,
      cat_color: ci.catColor,
      name: ci.name,
      amount: ci.amount,
      sort_order: i,
    })),
  );
}

/**
 * One-time fetch of a tour's payment doc.
 * Mirrors fbGetTourPayments (firebase.ts:809-817).
 */
export async function sbGetTourPayments(
  tourKey: string,
  client: SupabaseClient = sb,
): Promise<TourPayments | null> {
  return assembleTourPayments(client, tourKey);
}

/**
 * Subscribe to a tour's payment doc.
 * Mirrors fbSubscribeTourPayments (firebase.ts:823-835).
 */
export function sbSubscribeTourPayments(
  tourKey: string,
  cb: (data: TourPayments | null) => void,
  client: SupabaseClient = sb,
): Unsubscribe {
  return subscribeTable(client, 'tour_payments', (cl) => assembleTourPayments(cl, tourKey), cb);
}

// ── Payment Approvals ──

const assembleApprovals = async (cl: SupabaseClient): Promise<PaymentApprovalDoc> => {
  const { data: approvals, error } = await cl.from('payment_approvals').select('*');
  if (error) throw error;
  if (!approvals?.length) return {};

  const ids = approvals.map((a) => a.id as string);
  const { data: stageRows, error: stErr } = await cl.from('payment_approval_stages')
    .select('*').in('approval_id', ids);
  if (stErr) throw stErr;

  // group stages by approval_id
  const stagesByApproval = new Map<string, typeof stageRows>();
  for (const s of stageRows ?? []) {
    const arr = stagesByApproval.get(s.approval_id as string) ?? [];
    arr.push(s);
    stagesByApproval.set(s.approval_id as string, arr);
  }

  const doc: PaymentApprovalDoc = {};
  for (const a of approvals) {
    const stages = stagesByApproval.get(a.id as string) ?? [];
    const entry: PaymentApprovalEntry = {
      currentStage: (a.current_stage as 1 | 2) ?? undefined,
      finalStatus: (a.final_status as PaymentApprovalEntry['finalStatus']) ?? undefined,
      intendedApprover1Name: (a.intended_approver1_name as string) ?? undefined,
      intendedApprover2Name: (a.intended_approver2_name as string) ?? undefined,
    };
    for (const s of stages) {
      const stageKey = `stage${s.stage as number}` as 'stage1' | 'stage2';
      entry[stageKey] = {
        status: s.status as PaymentApprovalStage['status'],
        approverUsername: (s.approver_username as string) ?? '',
        approverName: (s.approver_name as string) ?? '',
        note: (s.note as string) ?? '',
        updatedAt: s.updated_at as string,
      };
    }
    doc[a.approval_key as string] = entry;
  }
  return doc;
};

/**
 * Write a single stage of an approval (1 or 2).
 * Final status rules (firebase.ts:869-870):
 *   rejected at any stage  → 'rejected'
 *   approved at stage 2    → 'approved'
 *   approved at stage 1    → 'pending_stage2'
 * Mirrors fbSetApprovalStage (firebase.ts:850-882).
 */
export async function sbSetApprovalStage(
  key: string,
  stage: 1 | 2,
  status: 'approved' | 'rejected',
  approverUsername: string,
  approverName: string,
  note: string,
  intended: { intendedApprover1Name?: string; intendedApprover2Name?: string } = {},
  client: SupabaseClient = sb,
): Promise<void> {
  const finalStatus: PaymentApprovalEntry['finalStatus'] =
    status === 'rejected' ? 'rejected' : stage === 2 ? 'approved' : 'pending_stage2';

  // upsert payment_approvals
  const { data: approval, error: upErr } = await client.from('payment_approvals')
    .upsert({
      approval_key: key,
      current_stage: stage,
      final_status: finalStatus,
      ...(intended.intendedApprover1Name
        ? { intended_approver1_name: intended.intendedApprover1Name } : {}),
      ...(intended.intendedApprover2Name
        ? { intended_approver2_name: intended.intendedApprover2Name } : {}),
    }, { onConflict: 'approval_key' })
    .select('id').single();
  if (upErr) throw new Error('sbSetApprovalStage upsert approval: ' + upErr.message);
  const approvalId = approval!.id as string;

  // resolve approver uuid
  const approverMap = await usernamesToIds(client, [approverUsername]);

  // upsert payment_approval_stages (unique on approval_id, stage)
  const { error: stErr } = await client.from('payment_approval_stages')
    .upsert({
      approval_id: approvalId,
      stage,
      status,
      approver_user_id: approverMap.get(approverUsername) ?? null,
      approver_username: approverUsername || '',
      approver_name: approverName || '',
      note: note || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'approval_id,stage' });
  if (stErr) throw new Error('sbSetApprovalStage upsert stage: ' + stErr.message);
}

/**
 * Subscribe to the full payment-approvals document (key → entry map).
 * Mirrors fbSubscribePaymentApprovals (firebase.ts:888-894).
 */
export function sbSubscribePaymentApprovals(
  cb: (doc: PaymentApprovalDoc) => void,
  client: SupabaseClient = sb,
): Unsubscribe {
  return subscribeTable(client, 'payment_approvals', (cl) => assembleApprovals(cl), cb);
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm run test:integration -- tests/supabase/payments.test.ts`
Expected: all 6 tests pass (3 tour payments + 3 approval stages).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/lib/supabase.ts tests/supabase/payments.test.ts
git commit -m "feat(supabase): payment_approvals + tour_payments gateway (save/get/subscribe/stage)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

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
