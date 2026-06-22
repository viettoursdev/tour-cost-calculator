# Phase 8 — Remove Firebase, Supabase-only — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Firebase from the codebase entirely; build Supabase backing for the three features that were still Firebase-only; repoint the backup job to Cloudflare R2; update all wording to Supabase.

**Architecture:** Production already runs on Supabase (Phase 7 cutover done). The app currently keeps Firebase behind a flag-gated dual-backend seam (`src/lib/dataBackend.ts`, `src/auth/backend.ts`). This plan first adds Supabase implementations for the orphaned features (guide schedule, Outlook email links, public quote sharing) so nothing breaks, then deletes the Firebase half of every seam, renames `fb*`→`sb*`, removes the `firebase` dependency and `VITE_AUTH_BACKEND` flag, and rewrites Firebase-facing wording/docs.

**Tech Stack:** Vite 5 · React 18 · TypeScript 5 (strict) · Supabase (Postgres 17 + supabase-js) · Zustand 4 · Vitest · pgTAP · GitHub Actions · Cloudflare R2.

## Global Constraints

- TypeScript strict; `npm run lint` runs with `--max-warnings 0` — zero warnings allowed.
- UI language Vietnamese; code/identifiers English. Alerts/confirms Vietnamese.
- New Postgres tables: parity RLS via `public.is_viettours_user()` (auth + `@viettours.com.vn`), matching every existing table. The **only** exception is `public_quotes` SELECT (`using (true)`) + the anon-granted `accept_public_quote` RPC.
- Migrations are sequential, append-only; current head is `0028`. New files: `0029`, `0030`, `0031`. pgTAP tests live in `supabase/tests/<NNNN>_<name>_test.sql`.
- `sb*` gateway functions take an optional trailing `client: SupabaseClient = sb` argument (matches every existing `sb*`).
- Conventional Commits; one logical change per commit. Co-author trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Local DB work requires Docker + the Supabase CLI (`npx supabase`). pgTAP via `npx supabase test db`. Integration tests via `npm run test:integration` against the local stack.

## File-level map

**New files**
- `supabase/migrations/0029_guide_schedule.sql`, `supabase/tests/0029_guide_schedule_test.sql`
- `supabase/migrations/0030_email_links.sql`, `supabase/tests/0030_email_links_test.sql`
- `supabase/migrations/0031_public_quotes.sql`, `supabase/tests/0031_public_quotes_test.sql`
- `tests/supabase/guide_schedule.test.ts`, `tests/supabase/email_links.test.ts`, `tests/supabase/public_quotes.test.ts`
- `src/test/supabaseStub.ts` (replaces `src/test/firebaseStub.ts`)

**Modified**
- `src/lib/supabase.ts` — add the 11 new `sb*` functions; map `share` in `rowToCloudQuoteEntry` + `loadQuoteHistory`.
- `src/lib/supabase/helpers.ts` — export `Unsubscribe`.
- `src/stores/guideScheduleStore.ts`, `src/stores/emailStore.ts`, `src/components/quote/SharePublicQuoteModal.tsx`, `src/components/public/PublicQuoteView.tsx`, `src/lib/notifications.ts` — wire to new `sb*` (Phase A).
- ~37 consumer files — codemod `@/lib/dataBackend`→`@/lib/supabase`, `fb*`→`sb*` (Phase B).
- `src/auth/backend.ts` — collapse to Supabase-only.
- 19 stores — `Unsubscribe` import swap.
- ~30 test files — `vi.mock('@/lib/firebase')`→`vi.mock('@/lib/supabase')`.
- `package.json`, `vite.config.ts`, `.github/workflows/deploy.yml`, `.github/workflows/backup.yml`.
- `src/components/shell/LoginScreen.tsx`, `src/components/admin/RateCardSyncModal.tsx` — UI wording.
- `CLAUDE.md`.

**Deleted**
- `src/lib/firebase.ts`, `src/lib/dataBackend.ts`, `src/lib/dataBackend.test.ts`
- `src/auth/backends/firebaseBackend.ts`, `src/auth/backend.test.ts`, `src/test/firebaseStub.ts`
- `firestore.rules`, `scripts/firestore-export.mjs`, `scripts/firestore-import.mjs`
- `docs/firebase-setup.md`, `docs/firebase-migration.md`

---

# Phase A — Supabase backing for the orphaned features

Each task adds capability and wires its consumer, leaving Firebase intact. After each, the feature works on Supabase end-to-end.

---

### Task A1: Guide schedule on Supabase

**Files:**
- Create: `supabase/migrations/0029_guide_schedule.sql`
- Create: `supabase/tests/0029_guide_schedule_test.sql`
- Modify: `src/lib/supabase.ts` (add functions), `src/lib/supabase/helpers.ts` (export `Unsubscribe`)
- Create: `tests/supabase/guide_schedule.test.ts`
- Modify: `src/stores/guideScheduleStore.ts:3`

**Interfaces:**
- Produces:
  - `sbSubscribeGuideSchedule(cb: (d: GuideScheduleDoc) => void, client?: SupabaseClient): () => void`
  - `sbPushGuideSchedule(d: GuideScheduleDoc, pushedBy: { name: string; role: string }, client?: SupabaseClient): Promise<void>`

- [ ] **Step 1: Write the migration**

`supabase/migrations/0029_guide_schedule.sql`:
```sql
-- Lịch đi tour HDV: a single shared row (mirrors the Firestore viettours/guide_schedule doc).
create table public.guide_schedule (
  one_row     boolean primary key default true check (one_row),
  freelancers jsonb not null default '[]'::jsonb,
  assignments jsonb not null default '{}'::jsonb,
  updated_at  timestamptz,
  updated_by  text
);

alter table public.guide_schedule enable row level security;
create policy guide_schedule_read  on public.guide_schedule for select
  using (public.is_viettours_user());
create policy guide_schedule_write on public.guide_schedule for all
  using (public.is_viettours_user()) with check (public.is_viettours_user());

-- The store subscribes; emit live changes.
alter publication supabase_realtime add table public.guide_schedule;
```

- [ ] **Step 2: Write the pgTAP test**

`supabase/tests/0029_guide_schedule_test.sql`:
```sql
begin;
select plan(3);
select has_table('public', 'guide_schedule', 'guide_schedule table exists');
select has_column('public', 'guide_schedule', 'assignments', 'assignments column exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.guide_schedule'::regclass),
  'RLS enabled on guide_schedule');
select * from finish();
rollback;
```

- [ ] **Step 3: Run the DB tests — expect the new test to pass after migration applies**

Run: `npx supabase test db`
Expected: all suites pass, including `0029_guide_schedule_test` (3 assertions).

- [ ] **Step 4: Export `Unsubscribe` from helpers** (needed by the subscribe signature and Phase B)

In `src/lib/supabase/helpers.ts`, ensure the `Unsubscribe` type is exported. If it is currently declared as a bare `type Unsubscribe = () => void;`, change it to:
```ts
export type Unsubscribe = () => void;
```
If `subscribeTable` already references an exported `Unsubscribe`, leave as-is.

- [ ] **Step 5: Add the gateway functions**

In `src/lib/supabase.ts`, near the other single-row shared-doc gateways (e.g. after `sbSubscribeFxRates`/`sbPushFxRates`), add — and add `GuideScheduleDoc` to the `@/types` type imports at the top:
```ts
// ── Lịch đi tour HDV (single-row, dùng chung) ──
export function sbSubscribeGuideSchedule(
  cb: (d: GuideScheduleDoc) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(client, 'guide_schedule', async (cl) => {
    const { data, error } = await cl
      .from('guide_schedule')
      .select('freelancers, assignments, updated_at, updated_by')
      .eq('one_row', true)
      .maybeSingle();
    if (error) throw new Error('sbSubscribeGuideSchedule: ' + error.message);
    return {
      freelancers: (data?.freelancers as GuideScheduleDoc['freelancers']) ?? [],
      assignments: (data?.assignments as GuideScheduleDoc['assignments']) ?? {},
      updatedAt: (data?.updated_at as string) ?? undefined,
      updatedBy: (data?.updated_by as string) ?? undefined,
    } as GuideScheduleDoc;
  }, cb);
}

export async function sbPushGuideSchedule(
  d: GuideScheduleDoc,
  pushedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('guide_schedule').upsert({
    one_row: true,
    freelancers: d.freelancers ?? [],
    assignments: d.assignments ?? {},
    updated_at: new Date().toISOString(),
    updated_by: `${pushedBy.name} (${pushedBy.role})`,
  }, { onConflict: 'one_row' });
  if (error) throw new Error('sbPushGuideSchedule: ' + error.message);
}
```

- [ ] **Step 6: Write the integration test**

`tests/supabase/guide_schedule.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbSubscribeGuideSchedule, sbPushGuideSchedule } from '../../src/lib/supabase';
import type { GuideScheduleDoc } from '@/types';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('guide schedule gateway', () => {
  beforeEach(async () => { await truncate(['guide_schedule']); });

  it('push then subscribe round-trips freelancers + assignments', async () => {
    const c = await getViettoursClient();
    const doc: GuideScheduleDoc = {
      freelancers: [{ id: 'g1', name: 'Anh A' } as GuideScheduleDoc['freelancers'][number]],
      assignments: { t1: { tourCloudId: 't1', tourName: 'Tour 1', guides: [], legs: [] } },
    };
    await sbPushGuideSchedule(doc, { name: 'Admin', role: 'CEO' }, c);
    const got = await once<GuideScheduleDoc>((cb) => sbSubscribeGuideSchedule(cb, c));
    expect(got.freelancers).toHaveLength(1);
    expect(got.assignments.t1.tourName).toBe('Tour 1');
    expect(got.updatedBy).toBe('Admin (CEO)');
  });

  it('subscribe on empty table yields defaults', async () => {
    const c = await getViettoursClient();
    const got = await once<GuideScheduleDoc>((cb) => sbSubscribeGuideSchedule(cb, c));
    expect(got.freelancers).toEqual([]);
    expect(got.assignments).toEqual({});
  });
});
```

- [ ] **Step 7: Run integration + typecheck**

Run: `npm run test:integration -- guide_schedule` then `npm run typecheck`
Expected: both green.

- [ ] **Step 8: Wire the store to Supabase**

In `src/stores/guideScheduleStore.ts:3`, split the import so the two guide-schedule functions come from `@/lib/supabase` (the third, `fbGetQuoteProject`, stays on the seam until Phase B):
```ts
import { sbSubscribeGuideSchedule, sbPushGuideSchedule } from '@/lib/supabase';
import { fbGetQuoteProject } from '@/lib/dataBackend';
```
Then rename the two call sites in this file: `fbSubscribeGuideSchedule` → `sbSubscribeGuideSchedule` (in `init`), `fbPushGuideSchedule` → `sbPushGuideSchedule` (in `push`).

- [ ] **Step 9: Verify + commit**

Run: `npm run typecheck && npm run lint`
Expected: clean.
```bash
git add supabase/migrations/0029_guide_schedule.sql supabase/tests/0029_guide_schedule_test.sql \
        src/lib/supabase.ts src/lib/supabase/helpers.ts tests/supabase/guide_schedule.test.ts \
        src/stores/guideScheduleStore.ts
git commit -m "feat(supabase): guide schedule table + gateway, wire store"
```

---

### Task A2: Outlook email links on Supabase

**Files:**
- Create: `supabase/migrations/0030_email_links.sql`, `supabase/tests/0030_email_links_test.sql`
- Modify: `src/lib/supabase.ts`
- Create: `tests/supabase/email_links.test.ts`
- Modify: `src/stores/emailStore.ts:2`

**Interfaces:**
- Produces:
  - `sbSubscribeEmailLinks(cb: (list: EmailLink[]) => void, client?: SupabaseClient): () => void`
  - `sbPushEmailLinks(list: EmailLink[], pushedBy: { name: string; role: string }, client?: SupabaseClient): Promise<void>`

- [ ] **Step 1: Migration**

`supabase/migrations/0030_email_links.sql`:
```sql
-- Liên kết email Outlook ↔ khách hàng/báo giá: single shared row.
create table public.email_links (
  one_row    boolean primary key default true check (one_row),
  links      jsonb not null default '[]'::jsonb,
  updated_at timestamptz,
  updated_by text
);

alter table public.email_links enable row level security;
create policy email_links_read  on public.email_links for select
  using (public.is_viettours_user());
create policy email_links_write on public.email_links for all
  using (public.is_viettours_user()) with check (public.is_viettours_user());

alter publication supabase_realtime add table public.email_links;
```

- [ ] **Step 2: pgTAP**

`supabase/tests/0030_email_links_test.sql`:
```sql
begin;
select plan(3);
select has_table('public', 'email_links', 'email_links table exists');
select has_column('public', 'email_links', 'links', 'links column exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.email_links'::regclass),
  'RLS enabled on email_links');
select * from finish();
rollback;
```

- [ ] **Step 3: Run DB tests**

Run: `npx supabase test db`
Expected: pass including `0030_email_links_test` (3).

- [ ] **Step 4: Gateway functions**

In `src/lib/supabase.ts` (after the guide-schedule functions); add `EmailLink` to the `@/types` imports:
```ts
// ── Liên kết email Outlook (single-row, dùng chung) ──
export function sbSubscribeEmailLinks(
  cb: (list: EmailLink[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(client, 'email_links', async (cl) => {
    const { data, error } = await cl
      .from('email_links')
      .select('links')
      .eq('one_row', true)
      .maybeSingle();
    if (error) throw new Error('sbSubscribeEmailLinks: ' + error.message);
    return (data?.links as EmailLink[]) ?? [];
  }, cb);
}

export async function sbPushEmailLinks(
  list: EmailLink[],
  pushedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('email_links').upsert({
    one_row: true,
    links: list,
    updated_at: new Date().toISOString(),
    updated_by: `${pushedBy.name} (${pushedBy.role})`,
  }, { onConflict: 'one_row' });
  if (error) throw new Error('sbPushEmailLinks: ' + error.message);
}
```

- [ ] **Step 5: Integration test**

`tests/supabase/email_links.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbSubscribeEmailLinks, sbPushEmailLinks } from '../../src/lib/supabase';
import type { EmailLink } from '@/types';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

const mk = (id: string): EmailLink => ({
  id, emailId: 'e' + id, subject: 'S', fromName: 'N', fromAddress: 'a@x.com',
  receivedAt: '2026-01-01T00:00:00.000Z', targetType: 'customer', targetId: 'c1',
  linkedBy: 'admin', linkedAt: '2026-01-01T00:00:00.000Z',
});

describe('email links gateway', () => {
  beforeEach(async () => { await truncate(['email_links']); });

  it('push then subscribe round-trips the list', async () => {
    const c = await getViettoursClient();
    await sbPushEmailLinks([mk('1'), mk('2')], { name: 'Admin', role: 'CEO' }, c);
    const got = await once<EmailLink[]>((cb) => sbSubscribeEmailLinks(cb, c));
    expect(got).toHaveLength(2);
    expect(got[0].id).toBe('1');
  });

  it('subscribe on empty table yields []', async () => {
    const c = await getViettoursClient();
    const got = await once<EmailLink[]>((cb) => sbSubscribeEmailLinks(cb, c));
    expect(got).toEqual([]);
  });
});
```

- [ ] **Step 6: Run integration + typecheck**

Run: `npm run test:integration -- email_links` then `npm run typecheck`
Expected: green.

- [ ] **Step 7: Wire the store**

In `src/stores/emailStore.ts:2`, change:
```ts
import { sbSubscribeEmailLinks, sbPushEmailLinks } from '@/lib/supabase';
```
Rename the two call sites in the file: `fbSubscribeEmailLinks`→`sbSubscribeEmailLinks` (in `init`), `fbPushEmailLinks`→`sbPushEmailLinks` (two call sites).

- [ ] **Step 8: Verify + commit**

Run: `npm run typecheck && npm run lint`
```bash
git add supabase/migrations/0030_email_links.sql supabase/tests/0030_email_links_test.sql \
        src/lib/supabase.ts tests/supabase/email_links.test.ts src/stores/emailStore.ts
git commit -m "feat(supabase): email links table + gateway, wire store"
```

---

### Task A3: Public quote sharing on Supabase

**Files:**
- Create: `supabase/migrations/0031_public_quotes.sql`, `supabase/tests/0031_public_quotes_test.sql`
- Modify: `src/lib/supabase.ts` (functions + `share` mapping in `rowToCloudQuoteEntry` and `loadQuoteHistory`)
- Create: `tests/supabase/public_quotes.test.ts`
- Modify: `src/components/quote/SharePublicQuoteModal.tsx:12`, `src/components/public/PublicQuoteView.tsx:6`, `src/lib/notifications.ts:18`

**Interfaces:**
- Produces:
  - `sbPublishQuote(d: PublicQuoteDoc, client?: SupabaseClient): Promise<void>`
  - `sbGetPublicQuote(token: string, client?: SupabaseClient): Promise<PublicQuoteDoc | null>`
  - `sbAcceptPublicQuote(token: string, acceptance: PublicQuoteDoc['acceptance'], client?: SupabaseClient): Promise<void>`
  - `sbUnpublishQuote(token: string, client?: SupabaseClient): Promise<void>`
  - `sbSetQuoteShare(cloudId: string, share: CloudQuoteEntry['share'] | null, client?: SupabaseClient): Promise<void>`

- [ ] **Step 1: Migration** — table + `quotes.share` column + accept-once RPC + anon grants

`supabase/migrations/0031_public_quotes.sql`:
```sql
-- Báo giá chia sẻ công khai cho khách (mirrors Firestore public_quotes/{token}).
-- DELIBERATE divergence: anon read + anon "accept once". Everything else is company-only.
create table public.public_quotes (
  token               text primary key,
  payload             jsonb not null,                 -- PublicQuoteDoc minus acceptance
  acceptance          jsonb,                          -- set once by the customer
  created_by          uuid references public.profiles(id),
  created_by_username text,
  created_at          timestamptz not null default now()
);

-- Share marker ({token, publishedAt}) on the quote-history row, set independently
-- of save_quote_state (so re-saving a quote never clobbers it).
alter table public.quotes add column share jsonb;

alter table public.public_quotes enable row level security;

-- Anyone (incl. unauthenticated customers) may read a shared quote by token.
create policy public_quotes_read on public.public_quotes for select using (true);
-- Only company users publish / edit / unpublish.
create policy public_quotes_write on public.public_quotes for all
  using (public.is_viettours_user()) with check (public.is_viettours_user());

-- Anonymous "accept once": SECURITY DEFINER so anon writes ONLY acceptance, and
-- ONLY while it is still null. Mirrors the Firestore update rule
-- (hasOnly(['acceptance']) && !('acceptance' in resource.data)).
create or replace function public.accept_public_quote(p_token text, p_acceptance jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.public_quotes
     set acceptance = p_acceptance
   where token = p_token and acceptance is null;
$$;

-- 0017 grants cover only authenticated/service_role; grant anon explicitly.
grant select on public.public_quotes to anon;
grant execute on function public.accept_public_quote(text, jsonb) to anon;
```

- [ ] **Step 2: pgTAP** — existence, share column, accept-once semantics

`supabase/tests/0031_public_quotes_test.sql`:
```sql
begin;
select plan(6);
select has_table('public', 'public_quotes', 'public_quotes table exists');
select has_column('public', 'quotes', 'share', 'quotes.share column added');
select has_function('public', 'accept_public_quote', array['text', 'jsonb'], 'accept RPC exists');

insert into public.public_quotes (token, payload) values ('tok1', '{"tourName":"X"}'::jsonb);
select public.accept_public_quote('tok1', '{"name":"Khach"}'::jsonb);
select is(
  (select acceptance->>'name' from public.public_quotes where token = 'tok1'),
  'Khach', 'first accept writes acceptance');

select public.accept_public_quote('tok1', '{"name":"Khac2"}'::jsonb);
select is(
  (select acceptance->>'name' from public.public_quotes where token = 'tok1'),
  'Khach', 'second accept is a no-op (accept-once)');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.public_quotes'::regclass),
  'RLS enabled on public_quotes');
select * from finish();
rollback;
```

- [ ] **Step 3: Run DB tests**

Run: `npx supabase test db`
Expected: pass including `0031_public_quotes_test` (6).

- [ ] **Step 4: Map `share` into the quote-history list**

In `src/lib/supabase.ts`, in `rowToCloudQuoteEntry` (the returned object), add after the `paymentSummary` line:
```ts
    share: (r.share as CloudQuoteEntry['share']) ?? undefined,
```
And in `loadQuoteHistory`, append `share` to the `.select(...)` column string (e.g. end of the `linked_quote_template, ` segment): add `share, ` so the column is fetched.

- [ ] **Step 5: Add the public-quote gateway functions**

In `src/lib/supabase.ts`, near the end of the quote section; add `PublicQuoteDoc` to the `@/types` imports:
```ts
// ── Báo giá chia sẻ công khai cho khách (public_quotes/{token}) ──
export async function sbPublishQuote(d: PublicQuoteDoc, client: SupabaseClient = sb): Promise<void> {
  const { acceptance, ...rest } = d;
  const { error } = await client.from('public_quotes').upsert({
    token: d.token,
    payload: rest,
    acceptance: acceptance ?? null,
  }, { onConflict: 'token' });
  if (error) throw new Error('sbPublishQuote: ' + error.message);
}

export async function sbGetPublicQuote(token: string, client: SupabaseClient = sb): Promise<PublicQuoteDoc | null> {
  const { data, error } = await client
    .from('public_quotes')
    .select('payload, acceptance')
    .eq('token', token)
    .maybeSingle();
  if (error) throw new Error('sbGetPublicQuote: ' + error.message);
  if (!data) return null;
  return {
    ...(data.payload as Omit<PublicQuoteDoc, 'acceptance'>),
    acceptance: (data.acceptance as PublicQuoteDoc['acceptance']) ?? undefined,
  };
}

export async function sbAcceptPublicQuote(
  token: string,
  acceptance: PublicQuoteDoc['acceptance'],
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.rpc('accept_public_quote', { p_token: token, p_acceptance: acceptance });
  if (error) throw new Error('sbAcceptPublicQuote: ' + error.message);
}

export async function sbUnpublishQuote(token: string, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.from('public_quotes').delete().eq('token', token);
  if (error) throw new Error('sbUnpublishQuote: ' + error.message);
}

export async function sbSetQuoteShare(
  cloudId: string,
  share: CloudQuoteEntry['share'] | null,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('quotes').update({ share: share ?? null }).eq('cloud_id', cloudId);
  if (error) throw new Error('sbSetQuoteShare: ' + error.message);
}
```

- [ ] **Step 6: Integration test** — publish/get round-trip, share marker, anon read + accept-once

`tests/supabase/public_quotes.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { getViettoursClient, truncate } from './_setup';
import {
  sbPublishQuote, sbGetPublicQuote, sbAcceptPublicQuote, sbUnpublishQuote,
} from '../../src/lib/supabase';
import type { PublicQuoteDoc } from '@/types';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const anonClient = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const mk = (token: string): PublicQuoteDoc => ({
  token, quoteCloudId: 'q1', tourName: 'Tour X', pax: 2, days: 3, nights: 2,
  pricePerPax: 1000, totalPrice: 2000, inclusions: [], exclusions: [], payments: [],
  publishedAt: '2026-01-01T00:00:00.000Z', publishedBy: 'Admin',
});

describe('public quotes gateway', () => {
  beforeEach(async () => { await truncate(['public_quotes']); });

  it('publish then get round-trips the doc', async () => {
    const c = await getViettoursClient();
    await sbPublishQuote(mk('tokA'), c);
    const got = await sbGetPublicQuote('tokA', c);
    expect(got?.tourName).toBe('Tour X');
    expect(got?.acceptance).toBeUndefined();
  });

  it('anonymous client can READ but not publish', async () => {
    const c = await getViettoursClient();
    await sbPublishQuote(mk('tokB'), c);
    const anon = anonClient();
    const got = await sbGetPublicQuote('tokB', anon);
    expect(got?.tourName).toBe('Tour X');
    // anon insert is denied by RLS
    const ins = await anon.from('public_quotes').insert({ token: 'tokX', payload: {} });
    expect(ins.error).toBeTruthy();
  });

  it('accept-once: anon accepts, second accept is a no-op', async () => {
    const c = await getViettoursClient();
    await sbPublishQuote(mk('tokC'), c);
    const anon = anonClient();
    await sbAcceptPublicQuote('tokC', { name: 'Khach', at: '2026-01-02T00:00:00.000Z' }, anon);
    let got = await sbGetPublicQuote('tokC', c);
    expect(got?.acceptance?.name).toBe('Khach');
    await sbAcceptPublicQuote('tokC', { name: 'Khac2', at: '2026-01-03T00:00:00.000Z' }, anon);
    got = await sbGetPublicQuote('tokC', c);
    expect(got?.acceptance?.name).toBe('Khach'); // unchanged
  });

  it('unpublish deletes the doc', async () => {
    const c = await getViettoursClient();
    await sbPublishQuote(mk('tokD'), c);
    await sbUnpublishQuote('tokD', c);
    expect(await sbGetPublicQuote('tokD', c)).toBeNull();
  });
});
```

- [ ] **Step 7: Run integration + typecheck**

Run: `npm run test:integration -- public_quotes` then `npm run typecheck`
Expected: green.

- [ ] **Step 8: Wire the three consumers**

`src/components/quote/SharePublicQuoteModal.tsx:12` — change:
```ts
import { sbPublishQuote, sbUnpublishQuote, sbSetQuoteShare, sbGetPublicQuote } from '@/lib/supabase';
```
Rename the call sites in this file: `fbPublishQuote`→`sbPublishQuote`, `fbUnpublishQuote`→`sbUnpublishQuote`, `fbSetQuoteShare`→`sbSetQuoteShare`, `fbGetPublicQuote`→`sbGetPublicQuote`.

`src/components/public/PublicQuoteView.tsx:6` — change:
```ts
import { sbGetPublicQuote, sbAcceptPublicQuote } from '@/lib/supabase';
```
Rename `fbGetPublicQuote`→`sbGetPublicQuote` (line ~21) and `fbAcceptPublicQuote`→`sbAcceptPublicQuote` (line ~144).

`src/lib/notifications.ts:18` — split the import so the public-quote read comes from `@/lib/supabase`:
```ts
import { fbGetContracts, fbSendNotification } from '@/lib/dataBackend';
import { sbGetPublicQuote } from '@/lib/supabase';
```
Rename the call site at line ~274: `fbGetPublicQuote`→`sbGetPublicQuote`.

- [ ] **Step 9: Verify + commit**

Run: `npm run typecheck && npm run lint`
```bash
git add supabase/migrations/0031_public_quotes.sql supabase/tests/0031_public_quotes_test.sql \
        src/lib/supabase.ts tests/supabase/public_quotes.test.ts \
        src/components/quote/SharePublicQuoteModal.tsx src/components/public/PublicQuoteView.tsx \
        src/lib/notifications.ts
git commit -m "feat(supabase): public quote sharing (anon read + accept-once RPC), wire consumers"
```

---

# Phase B — Remove Firebase, collapse the seam, rename `fb*`→`sb*`

After Phase A, the only remaining Firebase usage is via `@/lib/dataBackend` (data) and `@/auth/backend` (auth selector). This phase removes it.

---

### Task B1: Collapse the auth seam

**Files:**
- Modify: `src/auth/backend.ts`
- Delete: `src/auth/backends/firebaseBackend.ts`, `src/auth/backend.test.ts`

**Interfaces:**
- Produces: `authBackend: AuthBackend` (now always `supabaseBackend`). Public shape unchanged — `authStore.ts` is untouched.

- [ ] **Step 1: Rewrite `src/auth/backend.ts` to Supabase-only**

Replace the whole file with:
```ts
import type { User } from '@/types';
import { supabaseBackend } from './backends/supabaseBackend';

export type AuthSession = { uid: string; email: string };

export type Resolution =
  | { kind: 'ok'; user: User; users: User[] }
  | { kind: 'rejected'; users: User[] };

export interface AuthBackend {
  sendSignInLink(email: string): Promise<void>;
  isSignInLink(url: string): boolean;
  completeSignInLink(email: string, url: string): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  subscribe(cb: (session: AuthSession | null) => void): void;
  resolve(session: AuthSession): Promise<Resolution>;
  pushUsers(users: User[]): Promise<void>;
  purgeLegacyPasswords(): Promise<void>;
  getAccessToken(): Promise<string | null>;
}

export const authBackend: AuthBackend = supabaseBackend;
```

- [ ] **Step 2: Delete the Firebase auth backend + its selector test**
```bash
git rm src/auth/backends/firebaseBackend.ts src/auth/backend.test.ts
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: clean (no remaining import of `firebaseBackend`). If a test imports `backend.test.ts` helpers, none should — it is standalone.

- [ ] **Step 4: Commit**
```bash
git add src/auth/backend.ts
git commit -m "refactor(auth): collapse backend seam to Supabase-only, drop firebaseBackend"
```

---

### Task B2: Codemod data consumers `dataBackend`→`supabase`, `fb*`→`sb*`

**Files:** every non-test file still importing from `@/lib/dataBackend` (the stores/components/lib that Phase A did not already fully migrate). Find them with:
```bash
grep -rl "@/lib/dataBackend" src --include="*.ts" --include="*.tsx" | grep -v ".test."
```

**Interfaces:** consumes the `sb*` functions from `@/lib/supabase` (same signatures the `fb*` names had — the seam asserted parity).

- [ ] **Step 1: Repoint import paths**

For every file the grep above lists, change the import specifier `from '@/lib/dataBackend'` to `from '@/lib/supabase'`. (The two unprefixed helpers `generateQuoteCode`/`dmChatId` are exported by `@/lib/supabase` too.)
```bash
grep -rl "@/lib/dataBackend" src --include="*.ts" --include="*.tsx" | grep -v ".test." \
  | xargs sed -i '' -e "s#from '@/lib/dataBackend'#from '@/lib/supabase'#g"
```

- [ ] **Step 2: Rename `fb*`→`sb*` identifiers in those same files**

Every `fb`-prefixed identifier in `src` is a data-layer function (verified: 109 distinct, all `fb[A-Z]…` data functions). Rename the prefix in non-test source, EXCLUDING the files being deleted:
```bash
grep -rl "\bfb[A-Z]" src --include="*.ts" --include="*.tsx" \
  | grep -v ".test." | grep -v "src/lib/firebase.ts" | grep -v "src/lib/dataBackend.ts" \
  | xargs sed -i '' -E "s/\bfb([A-Z][A-Za-z0-9]*)/sb\1/g"
```

- [ ] **Step 3: Typecheck — this is the safety net for the codemod**

Run: `npm run typecheck`
Expected: clean. Any error here means a renamed name has no `sb*` export (investigate that specific symbol — every data function has an `sb*` twin from the gateway). Fix the offending line.

- [ ] **Step 4: Swap the `Unsubscribe` type import in 19 stores**

Replace the Firestore type import with the helpers one:
```bash
grep -rl "from 'firebase/firestore'" src/stores --include="*.ts" \
  | xargs sed -i '' -e "s#import type { Unsubscribe } from 'firebase/firestore';#import type { Unsubscribe } from '@/lib/supabase/helpers';#g"
```

- [ ] **Step 5: Delete the data-layer Firebase files**
```bash
git rm src/lib/firebase.ts src/lib/dataBackend.ts src/lib/dataBackend.test.ts
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint`
Expected: clean. Then: `grep -rn "firebase\|firestore" src --include="*.ts" --include="*.tsx" | grep -v ".test."` — expected: zero matches outside test files (UI-string matches handled in Phase C; if any code matches remain, resolve them now).

- [ ] **Step 7: Commit**
```bash
git add -A src
git commit -m "refactor: import sb* directly from supabase, delete firebase.ts + dataBackend seam"
```

---

### Task B3: Repoint tests off `@/lib/firebase`

**Files:**
- Rename: `src/test/firebaseStub.ts` → `src/test/supabaseStub.ts`
- Modify: ~30 `*.test.ts` files under `src/` that `vi.mock('@/lib/firebase')`.

- [ ] **Step 1: Build the Supabase stub from the Firebase stub**

The stores now import from `@/lib/supabase`, so the mock surface is the `sb*` names. Create the new stub by renaming the file and its exported names:
```bash
git mv src/test/firebaseStub.ts src/test/supabaseStub.ts
sed -i '' -E "s/\bfb([A-Z][A-Za-z0-9]*)/sb\1/g" src/test/supabaseStub.ts
```
Then open `src/test/supabaseStub.ts` and confirm it exports the names the tests mock (the `sb*` data functions + `generateQuoteCode`/`dmChatId`). Add any `sb*` names introduced in Phase A that tests reference (`sbSubscribeGuideSchedule`, `sbPushGuideSchedule`, `sbSubscribeEmailLinks`, `sbPushEmailLinks`, `sbPublishQuote`, `sbGetPublicQuote`, `sbAcceptPublicQuote`, `sbUnpublishQuote`, `sbSetQuoteShare`) as no-op stubs if a test touches them at module load.

- [ ] **Step 2: Repoint the mocks**

In the ~30 test files, change the mock target and the stub import:
```bash
grep -rl "@/lib/firebase" src --include="*.test.ts" \
  | xargs sed -i '' \
    -e "s#vi.mock('@/lib/firebase')#vi.mock('@/lib/supabase')#g" \
    -e "s#@/lib/firebase#@/lib/supabase#g" \
    -e "s#firebaseStub#supabaseStub#g"
```
Then rename `fb*`→`sb*` identifiers inside the test files:
```bash
grep -rl "\bfb[A-Z]" src --include="*.test.ts" \
  | xargs sed -i '' -E "s/\bfb([A-Z][A-Za-z0-9]*)/sb\1/g"
```

- [ ] **Step 3: Run the full unit suite**

Run: `npm test`
Expected: green. Failures here are almost always a stub missing an `sb*` name a store touches at import — add it to `supabaseStub.ts`. Iterate until green.

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**
```bash
git add -A src
git commit -m "test: mock @/lib/supabase, rename stub fb*→sb*"
```

---

### Task B4: Remove the `firebase` dependency, env, and flag

**Files:** `package.json`, `vite.config.ts`, `.github/workflows/deploy.yml`

- [ ] **Step 1: Confirm nothing imports `firebase` anymore**

Run: `grep -rn "from 'firebase" src ; grep -rn "VITE_AUTH_BACKEND\|VITE_FIREBASE" src`
Expected: zero matches. (If `VITE_AUTH_BACKEND` still appears in `src`, it is a leftover selector read — remove it; Supabase is hardwired.)

- [ ] **Step 2: Remove the dependency**

In `package.json`, delete the `"firebase": "^10.14.1",` line. Leave `firebase-admin` only if a kept script still uses it (the export/import scripts are deleted in Phase C; if `firebase-admin` has no remaining importer after Phase C, remove it then). Then:
```bash
npm install
```
Expected: lockfile updates, `firebase` removed from `node_modules`.

- [ ] **Step 3: Drop the vite chunk**

In `vite.config.ts`, delete the line:
```ts
          if (id.includes('node_modules/firebase')) return 'firebase';
```

- [ ] **Step 4: Clean `deploy.yml`**

In `.github/workflows/deploy.yml`, delete the six `VITE_FIREBASE_*` env lines (38–43), the `VITE_AUTH_BACKEND` line (49), and the now-stale Supabase "dormant until…" comment (44–46). Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: typecheck + vite build succeed; no `firebase` chunk emitted.

- [ ] **Step 6: Commit**
```bash
git add package.json package-lock.json vite.config.ts .github/workflows/deploy.yml
git commit -m "chore: drop firebase dependency, VITE_FIREBASE_* env, VITE_AUTH_BACKEND flag"
```

---

# Phase C — Backup job, wording, docs, cleanup

---

### Task C1: Repurpose `backup.yml` → Supabase `pg_dump` to R2

**Files:** `.github/workflows/backup.yml`

**Operator prerequisites (NOT done by this task — documented for the runbook):** repo secrets `SUPABASE_DB_URL` (direct Postgres connection string), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`; an R2 bucket `viettours-db-backups` with a 14-day lifecycle (expiry) rule; delete the old `FIREBASE_BACKUP_SRC_SA_JSON` / `FIREBASE_BACKUP_DEST_SA_JSON` secrets.

- [ ] **Step 1: Replace the workflow**

Replace `.github/workflows/backup.yml` with:
```yaml
# backup.yml
#
# Hourly Supabase backup: pg_dump (custom format, compressed) uploaded to the
# Cloudflare R2 bucket `viettours-db-backups`. Retention is enforced by an R2
# bucket lifecycle rule (14 days), not by this workflow.
#
# Secrets (GitHub repo → Settings → Secrets and variables → Actions):
#   SUPABASE_DB_URL      — direct Postgres connection string for production.
#   R2_ACCESS_KEY_ID     — R2 S3 API access key id.
#   R2_SECRET_ACCESS_KEY — R2 S3 API secret.
#   R2_ENDPOINT          — https://<accountid>.r2.cloudflarestorage.com

name: Supabase Backup

on:
  schedule:
    - cron: '17 * * * *'  # :17 of every hour, UTC
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: supabase-backup
  cancel-in-progress: false

jobs:
  backup:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Dump Supabase
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: |
          STAMP="$(date -u +%Y/%m/%d/%H%M%SZ)"
          echo "OBJECT_KEY=$STAMP/supabase-dump.dump" >> "$GITHUB_ENV"
          npx --yes supabase db dump --db-url "$SUPABASE_DB_URL" -f dump.sql
          gzip -9 dump.sql

      - name: Upload to R2
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_ENDPOINT: ${{ secrets.R2_ENDPOINT }}
        run: |
          aws s3 cp dump.sql.gz "s3://viettours-db-backups/${OBJECT_KEY}.gz" \
            --endpoint-url "$R2_ENDPOINT"

      - name: Scrub
        if: always()
        run: rm -f dump.sql dump.sql.gz
```

- [ ] **Step 2: Validate YAML**

Run: `npx --yes js-yaml .github/workflows/backup.yml > /dev/null && echo OK`
Expected: `OK` (well-formed YAML). Runtime correctness is verified by the operator via a manual `workflow_dispatch` after secrets are set — note this in the commit body.

- [ ] **Step 3: Commit**
```bash
git add .github/workflows/backup.yml
git commit -m "ci: back up Supabase (pg_dump) to R2 instead of mirroring Firestore"
```

---

### Task C2: User-facing wording + code comments

**Files:** `src/components/shell/LoginScreen.tsx`, `src/components/admin/RateCardSyncModal.tsx`, plus comment sweep.

- [ ] **Step 1: LoginScreen strings**

In `src/components/shell/LoginScreen.tsx`:
- Line ~215: change `label="Mật khẩu (Firebase Auth)"` → `label="Mật khẩu (Supabase Auth)"`.
- Line ~231: replace the help text `Tài khoản được tạo trong Firebase Console (Authentication → Users). Khác với cột "Mật khẩu" plaintext cũ — đó là legacy, sẽ xoá ở Phase 4.` with: `Tài khoản được tạo trong Supabase (Authentication → Users).`

- [ ] **Step 2: RateCardSyncModal strings**

In `src/components/admin/RateCardSyncModal.tsx`:
- Line ~195: `Đồng bộ real-time qua Firebase · hoặc xuất/nhập file` → `Đồng bộ real-time qua Supabase · hoặc xuất/nhập file`.
- Line ~217: `☁️ Dữ liệu trên Cloud (Firebase)` → `☁️ Dữ liệu trên Cloud (Supabase)`.

- [ ] **Step 3: Comment sweep**

Run: `grep -rn "[Ff]irebase\|[Ff]irestore" src --include="*.ts" --include="*.tsx"`
For each remaining match (all should now be comments/JSDoc), reword to describe the Supabase/Postgres mechanism, or delete the comment if it only described the old dual-backend seam. Do not change behavior.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: green. Then re-run the grep from Step 3 — expected: zero matches (or only an intentional, documented mention).

- [ ] **Step 5: Commit**
```bash
git add -A src
git commit -m "refactor: reword Firebase→Supabase in UI strings and comments"
```

---

### Task C3: Docs + delete old Firebase artifacts

**Files:** `CLAUDE.md`; delete `firestore.rules`, `scripts/firestore-export.mjs`, `scripts/firestore-import.mjs`, `docs/firebase-setup.md`, `docs/firebase-migration.md`.

- [ ] **Step 1: Delete dead Firebase artifacts**
```bash
git rm firestore.rules scripts/firestore-export.mjs scripts/firestore-import.mjs \
       docs/firebase-setup.md docs/firebase-migration.md
```

- [ ] **Step 2: Handle the now-orphaned ETL (confirm before deleting)**

The one-time ETL depends on the just-deleted `firestore-export.mjs` and is spent (cutover complete). Confirm it has no other use, then:
```bash
grep -rn "supabase-etl\|scripts/etl" package.json   # check the `etl` npm script + any references
git rm -r scripts/supabase-etl.mjs scripts/etl tests/etl
```
Also remove the `etl` script line from `package.json` if present, and `firebase-admin` from `package.json` if nothing else imports it (`grep -rn "firebase-admin" scripts package.json`). Run `npm install` if `package.json` changed.

- [ ] **Step 3: Rewrite the Firebase sections of `CLAUDE.md`**

Edit `CLAUDE.md` so it describes Supabase as the sole backend. Concretely:
- Stack line: `Firebase 10 (Firestore, default DB)` → `Supabase (Postgres 17 + Supabase Auth)`.
- Replace the **Firebase** heading/section (project id, database, auth domain, document map, hourly mirror) with a **Supabase** section: project ref `zkzrvctqwnhzklvsoahk`, Postgres 17, region `ap-southeast-1`; auth = Supabase magic link restricted to `@viettours.com.vn`; RLS parity model via `public.is_viettours_user()`; the R2 `pg_dump` backup (`backup.yml`, 14-day R2 lifecycle).
- Replace the **Firestore Document Map** table with the equivalent Postgres tables (normalized schema; rate-card JSONB; quotes + shredded children; the new `guide_schedule`, `email_links`, `public_quotes`).
- Update the **localStorage Keys** / auth notes that reference Firebase Auth/Firestore to Supabase Auth.
- Remove the **48h inactivity** and per-quote-draft notes only where they name Firebase mechanics that no longer exist; keep behavior descriptions that are still true (they are backend-agnostic).
- Remove the `firebase-setup.md` / `firebase-migration.md` doc references.

Keep edits surgical and factual; do not invent features.

- [ ] **Step 4: Final full verification**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Run: `npx supabase test db`
Run: `grep -rni "firebase\|firestore" src` (expect zero) and `grep -rni "firebase" package.json vite.config.ts .github/workflows` (expect zero).
Expected: all green; greps clean.

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "docs: Supabase-only CLAUDE.md; delete Firestore rules/scripts/docs (+spent ETL)"
```

---

## Operator steps (out of band — not code, do at/after merge)

1. **Push the new migrations to prod Supabase** `zkzrvctqwnhzklvsoahk`:
   `npx supabase db push --linked` (applies `0029`, `0030`, `0031`). The orphan-feature tables/RPC do not exist in prod until this runs — guide schedule, email links, and public sharing will error in prod otherwise.
2. **R2 backup setup:** create bucket `viettours-db-backups` + a 14-day expiry lifecycle rule; add repo secrets `SUPABASE_DB_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`; run `backup.yml` once via `workflow_dispatch` to confirm; delete `FIREBASE_BACKUP_SRC_SA_JSON` / `FIREBASE_BACKUP_DEST_SA_JSON` and the `VITE_FIREBASE_*` repo secrets + the `VITE_AUTH_BACKEND` repo variable.
3. **Confirm/enable** the Supabase platform backup tier (daily backups / PITR add-on).
4. **Decommission** the retired Firebase project(s) + service accounts on Google's side; rotate/disable the legacy Supabase `anon`/`service_role` JWT keys exposed during cutover prep.

## Smoke test (post-deploy, per `docs/run`)

- Sign in (magic link) — app loads on Supabase.
- Open a quote → Share → "Tạo link chia sẻ" → copy the link → open it in a **logged-out** browser → it renders → click "Đồng ý" → reopen the Share modal as staff → acceptance shows. Re-publish → link unchanged. "Gỡ chia sẻ" → public link 404s.
- Guide schedule: add a freelancer / assignment → reload → persists; second browser sees the change (realtime).
- Outlook email link: add a link → persists across reload.

## Self-Review (completed during planning)

- **Spec coverage:** orphan features → A1/A2/A3; seam collapse + rename → B1/B2; tests → B3; deps/env/flag → B4; backup → C1; wording → C2; docs + artifact deletion → C3. The spec's "verify `fbSetQuoteShare` parity" item resolved to **no parity exists** → built as `sbSetQuoteShare` + `quotes.share` column in A3 (and confirmed `save_quote_state` does not touch the new `share` column, so re-saving never clobbers it).
- **Placeholder scan:** none — migrations, functions, tests, and edits are concrete.
- **Type consistency:** `sb*` names match between producing tasks (A1–A3) and the codemod/stub tasks (B2/B3); `Unsubscribe` sourced from `@/lib/supabase/helpers` in both the gateway and the stores.
