# Supabase Migration — Phase 2 (Quote Gateway) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete `src/lib/supabase.ts` with the quote gateway — `sb*` functions matching the `fb*` quote API exactly, backed by the Phase 0 shredded quote tables, with an atomic Postgres RPC for the deep decompose-write. After Phase 2 the gateway surface is complete (regular + DMC quotes).

**Architecture:** Three layers. (1) A pure **decompose** layer (`QuoteDraft` → a flat JSONB payload of parent columns + child-row arrays) and a pure **assemble** layer (child rows → `QuoteDraft`). (2) A single **atomic-save RPC** `save_quote_state(p jsonb)` (PL/pgSQL, one transaction) that upserts the `quotes` draft columns, replaces every child table for that quote, and appends a capped (≤20) JSONB version snapshot to `quote_versions`. (3) The `sb*` functions: the **history index** ones operate on `quotes` metadata columns (`sbSaveQuote`, `sbSubscribeQuoteHistory`, status/link/summary backfills); the **project** ones call the RPC (`sbSaveQuoteState`) or reassemble (`sbGetQuoteProject`). Regular and DMC are unified in the `quotes` table by the `template` discriminator; the `*DMC*` functions are thin variants differing only by the regular-vs-dmc filter.

**Tech Stack:** `@supabase/supabase-js`, PL/pgSQL RPC, Vitest integration tests against the local Supabase stack (Docker), TypeScript strict.

## Global Constraints

- **Do NOT modify `src/lib/firebase.ts` or wire any store** (Phase 4). Append to `src/lib/supabase.ts`; add the RPC migration + tests.
- **Signature parity:** every `sb*` quote function has the same params + return type as its `fb*` twin in `src/lib/firebase.ts` (see exact line refs per task), plus an optional trailing `client: SupabaseClient = sb`.
- **Atomic save:** the decompose-write goes through `supabase.rpc('save_quote_state', { p })` — never multiple separate `.from().upsert()`/`replaceChildren` calls for a single quote save (a partial failure must not leave a half-written quote). The RPC body is one implicit transaction.
- **Regular + DMC unified** in `quotes` (`template` discriminator). Regular history filter: `template <> 'dmc'`; DMC filter: `template = 'dmc'`. The `*DMC*` `sb*` functions share the unified impl, differing only by that filter.
- **≤20 versions** retained per quote (parity with `fbSaveQuoteState`'s Firestore cap); the RPC trims oldest. **≤500** history entries / 1 MB caps from `fb*` are Firestore artifacts and do NOT apply (Postgres rows) — drop them; note this in the doc.
- **Reassemble currentState from the shredded child tables** (not from the latest version snapshot). Version snapshots are JSONB in `quote_versions`.
- **created_at preserved** on the `quotes` upsert; **timestamps normalized** on read via `new Date(...).toISOString()` (matches Phase 1). Username↔uuid via the existing `usernamesToIds`/`idsToUsernames` helpers; collaborators store both `user_id` and `username`.
- **Cross-quote links** by `cloud_id` (text), matching `fbSet*EntryLink`.
- Conventional Commits; body ends `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. `npm run typecheck && npm run lint` (0 warnings) and `npm run test:integration` green before each commit.
- **New migration `0021_save_quote_state_rpc.sql` must be added to the prod-push list** (joins 0017–0020, pending push to project `zkzrvctqwnhzklvsoahk`).

## Scope

**In Phase 2** (the deferred quote functions from Phase 1), unified regular+DMC:
`generateQuoteCode`; `sbSaveQuote`/`sbSaveDMCQuote`; `sbSubscribeQuoteHistory`/`sbSubscribeDMCQuoteHistory`; `sbSaveQuoteState`/`sbSaveDMCQuoteState`; `sbGetQuoteProject`/`sbGetDMCQuoteProject`; `sbDeleteQuote`/`sbDeleteDMCQuote`; `sbUpdateCollaborators`/`sbUpdateDMCCollaborators`; `sbSetRegularEntryLink`/`sbSetDMCEntryLink`; `sbSetQuoteStatus`/`sbSetDMCQuoteStatus`; `sbBackfillWorkflowIndex`; `sbSetQuotePaymentSummary`; `sbBackfillPaymentIndex`.

**Reference:** `src/lib/firebase.ts:204-494` (the `makeQuoteHistoryApi` factory + `generateQuoteCode`), `src/types/quote.ts` (`QuoteDraft`, `CloudQuoteEntry`, `CloudQuoteProject`, `QuoteVersion`, `Item`, `QuoteFlight`/`FlightSegment`/`FlightFare`, `WorkflowStep`/`WorkflowLogEntry`, `QuoteGroup`, `QuotePayment`, `Collaborator`, `FileAttachment`). Quote child tables: migrations `0007`–`0010`.

**Out of scope:** wiring stores (Phase 4); the workflow-step attachments deep-dive (store step attachments via the existing `attachments` table with `parent_type='quote_workflow_step'`, `parent_id=<quote cloud_id>:<step legacy id>` — covered in the decompose/assemble tasks).

---

## File Structure

```
supabase/migrations/0021_save_quote_state_rpc.sql   # atomic save_quote_state(p jsonb) PL/pgSQL fn
supabase/tests/0021_save_quote_state_test.sql        # pgTAP: RPC writes parent+children+version atomically
src/lib/supabase/quoteMap.ts                          # pure decompose(draft)→payload + assemble(rows)→draft
src/lib/supabase.ts                                   # the quote sb* functions (append)
tests/supabase/quotes.test.ts                         # integration: save/get/version/delete/collab/link/status/backfill round-trips
tests/supabase/quoteMap.test.ts                        # unit: decompose/assemble round-trip (no DB)
```

`quoteMap.ts` is a separate focused module (the mapping is the most intricate logic and benefits from isolated unit tests with no DB). The `sb*` functions stay in `supabase.ts` with the rest of the gateway.

---

## Task 1: The atomic-save RPC (`save_quote_state`)

**Files:**
- Create: `supabase/migrations/0021_save_quote_state_rpc.sql`
- Create: `supabase/tests/0021_save_quote_state_test.sql`

**Interfaces:**
- Produces: SQL function `public.save_quote_state(p jsonb) returns void` — one transaction that, for the quote identified by `p->>'cloud_id'`: (a) upserts the `quotes` row's draft columns from `p->'quote'`; (b) deletes + re-inserts all child rows (`quote_line_items`, `quote_flights`(+segments+fares), `quote_workflow_steps`(+logs), `quote_groups`(+group_items), `quote_payments`) from the arrays in `p`; (c) appends `p->'version'` to `quote_versions` and trims to the newest 20. Collaborators and the index metadata are NOT touched here (that's `sbSaveQuote`).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0021_save_quote_state_rpc.sql`:
```sql
-- Atomic quote-state save: upsert the quote's draft columns, replace all child
-- rows, append a version snapshot (cap 20) — all in one transaction so a quote
-- is never half-written. Called by the gateway via supabase.rpc('save_quote_state', { p }).
-- SECURITY INVOKER (default): runs as the calling authenticated user; RLS applies
-- (the per-table policies already allow @viettours users), and 0017 grants cover DML.
create or replace function public.save_quote_state(p jsonb)
returns void
language plpgsql
as $$
declare
  v_quote_id uuid;
  v_cloud_id text := p->>'cloud_id';
  q jsonb := p->'quote';
  elem jsonb;
  child jsonb;
  v_flight_id uuid;
  v_group_id uuid;
begin
  if v_cloud_id is null then raise exception 'save_quote_state: cloud_id required'; end if;

  -- (a) upsert the quotes row draft columns (metadata like quote_code/name/customer
  -- are owned by sbSaveQuote; here we only write the draft-derived columns + ensure row exists)
  insert into public.quotes (cloud_id, template, name, pax, total_cost, status,
      info, rates, rate_base, margin, vat, svc_basis, rounding, cat_enabled,
      pricing_options, inclusions, exclusions, output_currency, dmc_prices, dmc_margin,
      active_group_id, depart_date, created_at, created_by_name, updated_at, updated_by_name)
  values (v_cloud_id,
      coalesce(q->>'template',''), coalesce(q->>'name',''),
      coalesce((q->>'pax')::int,0), coalesce((q->>'total_cost')::double precision,0),
      q->>'status', coalesce(q->'info','{}'::jsonb), coalesce(q->'rates','{}'::jsonb),
      q->>'rate_base', coalesce((q->>'margin')::double precision,0),
      coalesce((q->>'vat')::double precision,0), coalesce((q->>'svc_basis')::double precision,0),
      coalesce((q->>'rounding')::double precision,0), coalesce(q->'cat_enabled','{}'::jsonb),
      q->'pricing_options',
      case when q ? 'inclusions' then array(select jsonb_array_elements_text(q->'inclusions')) else null end,
      case when q ? 'exclusions' then array(select jsonb_array_elements_text(q->'exclusions')) else null end,
      q->>'output_currency', q->'dmc_prices', q->'dmc_margin', q->>'active_group_id',
      nullif(q->>'depart_date','')::date,
      coalesce(nullif(q->>'created_at','')::timestamptz, now()), q->>'created_by_name',
      now(), q->>'updated_by_name')
  on conflict (cloud_id) do update set
      template = excluded.template, name = excluded.name, pax = excluded.pax,
      total_cost = excluded.total_cost, status = excluded.status, info = excluded.info,
      rates = excluded.rates, rate_base = excluded.rate_base, margin = excluded.margin,
      vat = excluded.vat, svc_basis = excluded.svc_basis, rounding = excluded.rounding,
      cat_enabled = excluded.cat_enabled, pricing_options = excluded.pricing_options,
      inclusions = excluded.inclusions, exclusions = excluded.exclusions,
      output_currency = excluded.output_currency, dmc_prices = excluded.dmc_prices,
      dmc_margin = excluded.dmc_margin, active_group_id = excluded.active_group_id,
      depart_date = excluded.depart_date, updated_at = now(),
      updated_by_name = excluded.updated_by_name
  returning id into v_quote_id;

  -- (b) replace children. Delete all, then re-insert from payload arrays.
  delete from public.quote_line_items where quote_id = v_quote_id;
  delete from public.quote_flights where quote_id = v_quote_id;     -- cascades segments+fares
  delete from public.quote_workflow_steps where quote_id = v_quote_id; -- cascades logs
  delete from public.quote_groups where quote_id = v_quote_id;      -- cascades group_items
  delete from public.quote_payments where quote_id = v_quote_id;

  -- line items
  for elem in select * from jsonb_array_elements(coalesce(p->'line_items','[]'::jsonb)) loop
    insert into public.quote_line_items (quote_id, category, legacy_item_id, name, note, cur,
        price, times, qty_mode, custom_qty, unit, enabled, foc, optional, included, sort_order)
    values (v_quote_id, elem->>'category', nullif(elem->>'legacy_item_id','')::bigint,
        coalesce(elem->>'name',''), coalesce(elem->>'note',''), coalesce(elem->>'cur','VND'),
        coalesce((elem->>'price')::double precision,0), coalesce((elem->>'times')::double precision,1),
        coalesce(elem->>'qty_mode','per_pax'), coalesce((elem->>'custom_qty')::double precision,0),
        coalesce(elem->>'unit',''), coalesce((elem->>'enabled')::boolean,true),
        coalesce((elem->>'foc')::boolean,false), (elem->>'optional')::boolean,
        (elem->>'included')::boolean, coalesce((elem->>'sort_order')::int,0));
  end loop;

  -- flights + segments + fares
  for elem in select * from jsonb_array_elements(coalesce(p->'flights','[]'::jsonb)) loop
    insert into public.quote_flights (quote_id, legacy_flight_id, note, sort_order)
    values (v_quote_id, elem->>'legacy_flight_id', elem->>'note', coalesce((elem->>'sort_order')::int,0))
    returning id into v_flight_id;
    for child in select * from jsonb_array_elements(coalesce(elem->'segments','[]'::jsonb)) loop
      insert into public.quote_flight_segments (flight_id, date, flight_no, airline_code, airline_name,
          dep_airport, arr_airport, dep_city, arr_city, dep_time, arr_time, dep_day_offset, arr_day_offset, sort_order)
      values (v_flight_id, child->>'date', child->>'flight_no', child->>'airline_code', child->>'airline_name',
          child->>'dep_airport', child->>'arr_airport', child->>'dep_city', child->>'arr_city',
          child->>'dep_time', child->>'arr_time', (child->>'dep_day_offset')::int, (child->>'arr_day_offset')::int,
          coalesce((child->>'sort_order')::int,0));
    end loop;
    for child in select * from jsonb_array_elements(coalesce(elem->'fares','[]'::jsonb)) loop
      insert into public.quote_flight_fares (flight_id, legacy_fare_id, label, amount, cur, sort_order)
      values (v_flight_id, child->>'legacy_fare_id', coalesce(child->>'label',''),
          coalesce((child->>'amount')::double precision,0), coalesce(child->>'cur','VND'),
          coalesce((child->>'sort_order')::int,0));
    end loop;
  end loop;

  -- workflow steps + logs
  for elem in select * from jsonb_array_elements(coalesce(p->'workflow','[]'::jsonb)) loop
    insert into public.quote_workflow_steps (quote_id, legacy_step_id, label, status, step_key,
        due_offset, start_date, due_date, done_date, assignee_username, note, sort_order)
    values (v_quote_id, elem->>'legacy_step_id', coalesce(elem->>'label',''),
        coalesce(elem->>'status','todo'), elem->>'step_key', (elem->>'due_offset')::int,
        nullif(elem->>'start_date','')::date, nullif(elem->>'due_date','')::date,
        nullif(elem->>'done_date','')::date, elem->>'assignee_username', elem->>'note',
        coalesce((elem->>'sort_order')::int,0))
    returning id into v_flight_id;  -- reuse var as step id
    for child in select * from jsonb_array_elements(coalesce(elem->'logs','[]'::jsonb)) loop
      insert into public.quote_workflow_logs (step_id, at, by_name, action, sort_order)
      values (v_flight_id, coalesce(nullif(child->>'at','')::timestamptz, now()),
          coalesce(child->>'by_name',''), coalesce(child->>'action',''),
          coalesce((child->>'sort_order')::int,0));
    end loop;
  end loop;

  -- groups + group_items
  for elem in select * from jsonb_array_elements(coalesce(p->'groups','[]'::jsonb)) loop
    insert into public.quote_groups (quote_id, legacy_group_id, label, pax, cat_enabled, sort_order)
    values (v_quote_id, elem->>'legacy_group_id', coalesce(elem->>'label',''),
        coalesce((elem->>'pax')::int,0), coalesce(elem->'cat_enabled','{}'::jsonb),
        coalesce((elem->>'sort_order')::int,0))
    returning id into v_group_id;
    for child in select * from jsonb_array_elements(coalesce(elem->'items','[]'::jsonb)) loop
      insert into public.quote_group_items (group_id, category, legacy_item_id, name, note, cur,
          price, times, qty_mode, custom_qty, unit, enabled, foc, optional, included, sort_order)
      values (v_group_id, child->>'category', nullif(child->>'legacy_item_id','')::bigint,
          coalesce(child->>'name',''), coalesce(child->>'note',''), coalesce(child->>'cur','VND'),
          coalesce((child->>'price')::double precision,0), coalesce((child->>'times')::double precision,1),
          coalesce(child->>'qty_mode','per_pax'), coalesce((child->>'custom_qty')::double precision,0),
          coalesce(child->>'unit',''), coalesce((child->>'enabled')::boolean,true),
          coalesce((child->>'foc')::boolean,false), (child->>'optional')::boolean,
          (child->>'included')::boolean, coalesce((child->>'sort_order')::int,0));
    end loop;
  end loop;

  -- payments
  for elem in select * from jsonb_array_elements(coalesce(p->'payments','[]'::jsonb)) loop
    insert into public.quote_payments (quote_id, legacy_payment_id, label, amount, note, sort_order)
    values (v_quote_id, elem->>'legacy_payment_id', coalesce(elem->>'label',''),
        coalesce((elem->>'amount')::double precision,0), coalesce(elem->>'note',''),
        coalesce((elem->>'sort_order')::int,0));
  end loop;

  -- (c) append version snapshot, trim to newest 20
  if p ? 'version' then
    insert into public.quote_versions (quote_id, version_no, saved_at, saved_by, note, state)
    values (v_quote_id, coalesce((p->'version'->>'version_no')::int, 1),
        coalesce(nullif(p->'version'->>'saved_at','')::timestamptz, now()),
        coalesce(p->'version'->>'saved_by',''), coalesce(p->'version'->>'note',''),
        coalesce(p->'version'->'state','{}'::jsonb));
    delete from public.quote_versions where quote_id = v_quote_id and id not in (
      select id from public.quote_versions where quote_id = v_quote_id
      order by version_no desc limit 20);
  end if;
end;
$$;
```

- [ ] **Step 2: Write the failing pgTAP test**

Create `supabase/tests/0021_save_quote_state_test.sql`:
```sql
begin;
select plan(5);
select has_function('public', 'save_quote_state', array['jsonb'], 'RPC exists');

-- Call with a minimal payload: one line item, one version.
select public.save_quote_state($$ {
  "cloud_id": "q-test-1",
  "quote": {"template":"domestic","name":"T","pax":10,"total_cost":1000,"created_at":"2026-01-01T00:00:00Z"},
  "line_items": [{"category":"hotel","name":"Hotel A","price":500,"sort_order":0}],
  "version": {"version_no":1,"saved_at":"2026-01-01T00:00:00Z","saved_by":"QA","note":"v1","state":{"x":1}}
} $$::jsonb);

select is((select name from public.quotes where cloud_id='q-test-1'), 'T', 'quote upserted');
select is((select count(*)::int from public.quote_line_items li join public.quotes q on q.id=li.quote_id where q.cloud_id='q-test-1'), 1, 'line item inserted');
select is((select count(*)::int from public.quote_versions v join public.quotes q on q.id=v.quote_id where q.cloud_id='q-test-1'), 1, 'version appended');
-- re-save replaces children (not duplicates)
select public.save_quote_state($$ {"cloud_id":"q-test-1","quote":{"template":"domestic","name":"T2"},"line_items":[]} $$::jsonb);
select is((select count(*)::int from public.quote_line_items li join public.quotes q on q.id=li.quote_id where q.cloud_id='q-test-1'), 0, 're-save replaced line items');

select * from finish();
rollback;
```

- [ ] **Step 3: Run, expect FAIL** (`npx supabase test db` → function missing).
- [ ] **Step 4: Apply + re-run** (`npx supabase db reset && npx supabase test db` → `0021` 5/5; all prior green).
- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/0021_save_quote_state_rpc.sql supabase/tests/0021_save_quote_state_test.sql
git commit -m "feat(supabase): atomic save_quote_state RPC (parent+children+version in one txn)"
```

---

## Task 2: `quoteMap.ts` — decompose (`QuoteDraft` → RPC payload)

**Files:**
- Create: `src/lib/supabase/quoteMap.ts`
- Test: `tests/supabase/quoteMap.test.ts`

**Interfaces:**
- Produces: `decomposeQuote(cloudId: string, draft: QuoteDraft, meta: { createdAt?: string; createdByName?: string; updatedByName?: string }): Record<string, unknown>` — the JSONB payload shape the `save_quote_state` RPC consumes (keys: `cloud_id`, `quote`, `line_items`, `flights`, `workflow`, `groups`, `payments`). Pure (no DB). The `version` key is added by the caller (`sbSaveQuoteState`).

- [ ] **Step 1: Write the failing test**

Create `tests/supabase/quoteMap.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { decomposeQuote } from '../../src/lib/supabase/quoteMap';
import type { QuoteDraft } from '../../src/types/quote';

const draft = (): QuoteDraft => ({
  template: 'domestic', info: { name: 'Trip', dest: 'HN', days: 3, nights: 2, startDate: '2026-03-01' },
  pax: 10, rates: { USD: 25000 }, margin: 10, vat: 8, svcBasis: 0, rounding: 1000,
  items: { hotel: [{ id: 1, name: 'Hotel', note: '', cur: 'VND', price: 500, times: 1, qtyMode: 'per_pax', customQty: 0, unit: '', enabled: true, foc: false }] },
  catEnabled: { hotel: true } as QuoteDraft['catEnabled'], currentQuoteId: null,
  flights: [{ id: 'f1', segments: [{ date: '20NOV', flightNo: 'QR1', depAirport: 'HAN', arrAirport: 'DOH', depTime: '01:00', arrTime: '05:00' }], fares: [{ id: 'fa1', label: 'Y', amount: 100, cur: 'USD' }] }],
  payments: [{ id: 'p1', label: 'Đợt 1', amount: 5000000, note: 'deposit' }],
});

describe('decomposeQuote', () => {
  it('maps draft → RPC payload with shredded children', () => {
    const p = decomposeQuote('q1', draft(), { createdByName: 'QA' });
    expect(p.cloud_id).toBe('q1');
    expect((p.quote as Record<string, unknown>).template).toBe('domestic');
    expect((p.line_items as unknown[]).length).toBe(1);
    expect((p.line_items as Record<string, unknown>[])[0]).toMatchObject({ category: 'hotel', name: 'Hotel', legacy_item_id: 1, sort_order: 0 });
    expect((p.flights as Record<string, unknown>[])[0].legacy_flight_id).toBe('f1');
    expect(((p.flights as Record<string, unknown>[])[0].segments as unknown[]).length).toBe(1);
    expect(((p.flights as Record<string, unknown>[])[0].fares as Record<string, unknown>[])[0].label).toBe('Y');
    expect((p.payments as Record<string, unknown>[])[0].legacy_payment_id).toBe('p1');
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `npm run test:integration -- tests/supabase/quoteMap.test.ts`
- [ ] **Step 3: Implement**

Create `src/lib/supabase/quoteMap.ts`:
```ts
import type {
  QuoteDraft, Item, CategoryId, QuoteFlight, WorkflowStep, QuoteGroup, QuotePayment,
} from '@/types/quote';

const itemRow = (it: Item, category: string, i: number) => ({
  category, legacy_item_id: it.id, name: it.name, note: it.note, cur: it.cur,
  price: it.price, times: it.times, qty_mode: it.qtyMode, custom_qty: it.customQty,
  unit: it.unit, enabled: it.enabled, foc: it.foc, optional: it.optional ?? null,
  included: it.included ?? null, sort_order: i,
});

const itemsToRows = (items: Partial<Record<CategoryId, Item[]>> | undefined) => {
  const rows: ReturnType<typeof itemRow>[] = [];
  let i = 0;
  for (const [cat, arr] of Object.entries(items ?? {})) {
    for (const it of (arr ?? [])) rows.push(itemRow(it, cat, i++));
  }
  return rows;
};

const flightRows = (flights: QuoteFlight[] | undefined) =>
  (flights ?? []).map((f, i) => ({
    legacy_flight_id: f.id, note: f.note ?? null, sort_order: i,
    segments: (f.segments ?? []).map((s, j) => ({
      date: s.date, flight_no: s.flightNo, airline_code: s.airlineCode ?? null,
      airline_name: s.airlineName ?? null, dep_airport: s.depAirport, arr_airport: s.arrAirport,
      dep_city: s.depCity ?? null, arr_city: s.arrCity ?? null, dep_time: s.depTime, arr_time: s.arrTime,
      dep_day_offset: s.depDayOffset ?? null, arr_day_offset: s.arrDayOffset ?? null, sort_order: j,
    })),
    fares: (f.fares ?? []).map((fa, j) => ({
      legacy_fare_id: fa.id, label: fa.label, amount: fa.amount, cur: fa.cur, sort_order: j,
    })),
  }));

const workflowRows = (steps: WorkflowStep[] | undefined) =>
  (steps ?? []).map((s, i) => ({
    legacy_step_id: s.id, label: s.label, status: s.status, step_key: s.key ?? null,
    due_offset: s.dueOffset ?? null, start_date: s.startDate ?? null, due_date: s.dueDate ?? null,
    done_date: s.doneDate ?? null, assignee_username: s.assignee ?? null, note: s.note ?? null, sort_order: i,
    logs: (s.log ?? []).map((l, j) => ({ at: l.at, by_name: l.by, action: l.action, sort_order: j })),
  }));

const groupRows = (groups: QuoteGroup[] | undefined) =>
  (groups ?? []).map((g, i) => ({
    legacy_group_id: g.id, label: g.label, pax: g.pax, cat_enabled: g.catEnabled, sort_order: i,
    items: itemsToRows(g.items),
  }));

const paymentRows = (payments: QuotePayment[] | undefined) =>
  (payments ?? []).map((p, i) => ({ legacy_payment_id: p.id, label: p.label, amount: p.amount, note: p.note, sort_order: i }));

export function decomposeQuote(
  cloudId: string, d: QuoteDraft,
  meta: { createdAt?: string; createdByName?: string; updatedByName?: string } = {},
): Record<string, unknown> {
  return {
    cloud_id: cloudId,
    quote: {
      template: d.template ?? '', name: d.info?.name ?? '', pax: d.pax ?? 0,
      total_cost: 0, // index metadata owns total_cost via sbSaveQuote; RPC keeps prior on conflict if 0 — see note
      status: d.status ?? null, info: d.info ?? {}, rates: d.rates ?? {}, rate_base: d.rateBase ?? null,
      margin: d.margin ?? 0, vat: d.vat ?? 0, svc_basis: d.svcBasis ?? 0, rounding: d.rounding ?? 0,
      cat_enabled: d.catEnabled ?? {}, pricing_options: d.pricingOptions ?? null,
      inclusions: d.inclusions ?? null, exclusions: d.exclusions ?? null,
      output_currency: d.outputCurrency ?? null, dmc_prices: d.dmcPrices ?? null, dmc_margin: d.dmcMargin ?? null,
      active_group_id: d.activeGroupId ?? null,
      depart_date: d.info?.startDate ?? null,
      created_at: meta.createdAt ?? null, created_by_name: meta.createdByName ?? null,
      updated_by_name: meta.updatedByName ?? null,
    },
    line_items: itemsToRows(d.items),
    flights: flightRows(d.flights),
    workflow: workflowRows(d.workflow),
    groups: groupRows(d.groups),
    payments: paymentRows(d.payments),
  };
}
```
> **Note on `total_cost`:** the draft doesn't carry a precomputed total; `total_cost` (and `quote_code`, `customer_id`, `name` for the index) are owned by `sbSaveQuote` (the history entry). The RPC's `total_cost` is set from `sbSaveQuoteState`'s caller if available, else left to the index path. Task 5 passes the caller-provided `totalCost` into the payload's `quote.total_cost`; if absent, the RPC's `on conflict` still overwrites it — so Task 5 MUST include the real total in the payload (the store has it at save time). Document this in Task 5.

- [ ] **Step 4: Run, expect PASS.** `npm run test:integration -- tests/supabase/quoteMap.test.ts`
- [ ] **Step 5: Typecheck + commit**
```bash
npm run typecheck && npm run lint
git add src/lib/supabase/quoteMap.ts tests/supabase/quoteMap.test.ts
git commit -m "feat(supabase): decomposeQuote — QuoteDraft → atomic-save RPC payload"
```

---

## Task 3: `quoteMap.ts` — assemble (child rows → `QuoteDraft`)

**Files:**
- Modify: `src/lib/supabase/quoteMap.ts`
- Test: `tests/supabase/quoteMap.test.ts`

**Interfaces:**
- Produces: `assembleQuote(rows: AssembleInput): QuoteDraft` where `AssembleInput` = `{ quote: Record<string,unknown>; lineItems: Record<string,unknown>[]; flights: …; segments: …; fares: …; workflow: …; logs: …; groups: …; groupItems: …; payments: … }` (the raw rows the gateway SELECTs). Reverses `decomposeQuote`: groups line items by `category`, nests segments/fares under flights by `flight_id`, logs under steps, items under groups; rebuilds the scalar/JSONB draft fields. Pure (no DB).

- [ ] **Step 1: Write the failing test** — extend `quoteMap.test.ts` with a round-trip: take the rows that `decomposeQuote` would produce (flatten the payload into the row shapes the DB returns, assigning fake uuids for flight/group/step ids), pass to `assembleQuote`, assert the resulting `QuoteDraft` deep-equals the original draft's meaningful fields (items by category, flights with segments/fares, payments). Full test code:
```ts
import { assembleQuote } from '../../src/lib/supabase/quoteMap';
// ... (in the same describe) build rows from draft() and assert round-trip:
it('assembleQuote reverses decomposeQuote', () => {
  const d = draft();
  const p = decomposeQuote('q1', d, {});
  // simulate DB rows (assign synthetic ids; nest flatten)
  const flights = (p.flights as Record<string, unknown>[]).map((f, i) => ({ id: `F${i}`, legacy_flight_id: f.legacy_flight_id, note: f.note, sort_order: f.sort_order }));
  const segments = (p.flights as Record<string, unknown>[]).flatMap((f, i) => (f.segments as Record<string, unknown>[]).map((s) => ({ ...s, flight_id: `F${i}` })));
  const fares = (p.flights as Record<string, unknown>[]).flatMap((f, i) => (f.fares as Record<string, unknown>[]).map((fa) => ({ ...fa, flight_id: `F${i}` })));
  const asm = assembleQuote({
    quote: p.quote as Record<string, unknown>,
    lineItems: p.line_items as Record<string, unknown>[],
    flights, segments, fares,
    workflow: [], logs: [], groups: [], groupItems: [],
    payments: p.payments as Record<string, unknown>[],
  });
  expect(asm.items.hotel?.[0]).toMatchObject({ id: 1, name: 'Hotel', price: 500 });
  expect(asm.flights?.[0].segments[0].flightNo).toBe('QR1');
  expect(asm.flights?.[0].fares[0].label).toBe('Y');
  expect(asm.payments?.[0].label).toBe('Đợt 1');
  expect(asm.template).toBe('domestic');
});
```

- [ ] **Step 2: Run, expect FAIL** (`assembleQuote` not exported).
- [ ] **Step 3: Implement** `assembleQuote` in `quoteMap.ts` (append). It maps each row back to its `Item`/`QuoteFlight`/`WorkflowStep`/`QuoteGroup`/`QuotePayment` shape (reverse of the `*Row` mappers: `legacy_item_id`→`id`, `qty_mode`→`qtyMode`, `flight_no`→`flightNo`, etc.), groups line items into `Partial<Record<CategoryId, Item[]>>` by `category` (ordered by `sort_order`), nests `segments`/`fares` under flights matching `flight_id`, `logs` under steps, `items` under groups; rebuilds scalars from `quote` (`info`, `rates`, `margin`, `catEnabled`, `status`, `inclusions`, `exclusions`, `pricingOptions`, `outputCurrency`, `dmcPrices`, `dmcMargin`, `activeGroupId`, `rateBase`, `pax`, `template`). Set `currentQuoteId: null`. (Write the full reverse-mapper code — mirror each field from Task 2's `*Row` functions.)
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Typecheck + commit**
```bash
npm run typecheck && npm run lint
git add src/lib/supabase/quoteMap.ts tests/supabase/quoteMap.test.ts
git commit -m "feat(supabase): assembleQuote — child rows → QuoteDraft (reverses decompose)"
```

---

## Task 4: History index — `generateQuoteCode`, `sbSaveQuote`/`sbSaveDMCQuote`, `sbSubscribeQuoteHistory`/`sbSubscribeDMCQuoteHistory`

**Files:** Modify `src/lib/supabase.ts`; Test `tests/supabase/quotes.test.ts`

**Interfaces (match `firebase.ts:204-216` + the factory's `fbSubscribeQuoteHistory`/`fbSaveQuote`):**
- `generateQuoteCode(template, existing): string` — copy `firebase.ts:204-216` verbatim (pure; identical).
- `sbSaveQuote(entry: SaveEntry, savedBy: SavedBy, client?): Promise<CloudQuoteEntry>` and `sbSaveDMCQuote(...)` — upsert the `quotes` row's INDEX metadata (quote_code, name, template, pax, total_cost, status, customer_id, customer_name, depart_date, links, attachments→`attachments` table, workflowSummary/paymentSummary if present) by `cloud_id`; generate `quote_code` via `generateQuoteCode` (counting existing rows of the same template family) on first insert; upsert `quote_collaborators`. Returns the assembled `CloudQuoteEntry`. Both share one impl; DMC differs only in that it counts/filters `template = 'dmc'`.
- `sbSubscribeQuoteHistory(cb, client?)` filters `template <> 'dmc'`; `sbSubscribeDMCQuoteHistory(cb, client?)` filters `template = 'dmc'`. Assemble `CloudQuoteEntry[]` from `quotes` metadata + `quote_collaborators` (newest first by `created_at`). Use `subscribeTable` on `quotes`.

The implementer reads `firebase.ts:246-324` (`fbSaveQuote`) + `fbSubscribeQuoteHistory:252-256` for exact `CloudQuoteEntry` field mapping. Full code per the customers/visa reference patterns; `created_at` preserved; timestamps normalized; safe child handling for collaborators.

- [ ] Steps 1–5: write failing integration test (save a regular + a DMC entry; assert each appears only in its own history subscribe with a generated quote_code, pax, totalCost, collaborators), run FAIL, implement full code, run PASS, `typecheck && lint`, commit (`feat(supabase): quote history index — save + subscribe (regular + DMC)`).

---

## Task 5: Project state — `sbSaveQuoteState`/`sbSaveDMCQuoteState`, `sbGetQuoteProject`/`sbGetDMCQuoteProject`

**Files:** Modify `src/lib/supabase.ts`; Test `tests/supabase/quotes.test.ts`

**Interfaces (match `firebase.ts:327-360` `fbSaveQuoteState` + `fbGetQuoteProject:398-401`):**
- `sbSaveQuoteState(cloudId, state: QuoteDraft, note: string | undefined, savedBy: { name; role }, client?): Promise<void>` (and DMC variant) — compute the next `version_no` (read max for this quote +1), build the payload via `decomposeQuote(cloudId, state, meta)`, attach `version = { version_no, saved_at: now, saved_by: '<name> (<role>)', note: note||'Phiên bản N', state: <full QuoteDraft JSON> }`, then `await client.rpc('save_quote_state', { p: payload })`. **MUST set `payload.quote.total_cost`** from the caller — since `QuoteDraft` has no total, the store passes the computed total; here, derive it the same way the index does, or accept it via the draft — confirm against how `quoteStore` calls `fbSaveQuoteState` (it pairs with `fbSaveQuote` which has `totalCost`). For Phase 2 parity, `sbSaveQuoteState` reads the existing `quotes.total_cost` and preserves it (don't zero it): in `decomposeQuote`, omit `total_cost` and have the RPC's upsert NOT overwrite it — adjust the RPC `on conflict` to `total_cost = coalesce(excluded.total_cost, quotes.total_cost)` and have decompose pass `null`. (Implementer: make this adjustment to migration 0021 + re-run its test; document it.)
- `sbGetQuoteProject(cloudId, client?): Promise<CloudQuoteProject | null>` (and DMC) — SELECT the `quotes` row + all child rows + `quote_versions` (+ `quote_collaborators`); `assembleQuote(...)` → `currentState`; map versions (JSONB `state`) → `QuoteVersion[]`; return `{ versions, currentState, collaborators, updatedAt, updatedBy }`. Null if no row.

- [ ] Steps 1–5: failing test (save a full draft via `sbSaveQuoteState`, `sbGetQuoteProject` reassembles `currentState` deep-equal to the saved draft's items/flights/workflow/groups/payments; save again → versions length 2, capped at 20 over many saves; DMC variant round-trips under `template='dmc'`), run FAIL, implement, run PASS (+ adjust 0021 RPC for `total_cost` coalesce and re-run `0021` pgTAP), `typecheck && lint`, commit (`feat(supabase): quote project state — atomic save via RPC + reassemble`).

---

## Task 6: `sbDeleteQuote`/DMC, `sbUpdateCollaborators`/DMC

**Files:** Modify `src/lib/supabase.ts`; Test `tests/supabase/quotes.test.ts`

**Interfaces (match `firebase.ts:362-396`):**
- `sbDeleteQuote(id: number, cloudId: string, client?): Promise<void>` (+DMC) — delete the `quotes` row by `cloud_id` (children + versions cascade). (`id` is the legacy numeric id, accepted for signature parity; delete is by cloud_id.)
- `sbUpdateCollaborators(id, cloudId, collaborators: Collaborator[], client?): Promise<void>` (+DMC) — `replaceChildren('quote_collaborators', 'quote_id', <quote uuid>, …)` resolving `u`→`user_id` via `usernamesToIds`, storing `username`+`name`. (Resolve the quote uuid from cloud_id first.)

- [ ] Steps 1–5: failing test (save a quote, update collaborators → subscribe/get reflects them; delete → gone, children gone), run FAIL, implement, run PASS, `typecheck && lint`, commit (`feat(supabase): quote delete + collaborators (regular + DMC)`).

---

## Task 7: Cross-links + status — `sbSetRegularEntryLink`/`sbSetDMCEntryLink`, `sbSetQuoteStatus`/`sbSetDMCQuoteStatus`

**Files:** Modify `src/lib/supabase.ts`; Test `tests/supabase/quotes.test.ts`

**Interfaces (match `firebase.ts:405-413, 461-469`):**
- `sbSetRegularEntryLink(cloudId, link: { linkedQuoteId?; linkedQuoteName?; linkedQuoteTemplate? }, client?): Promise<void>` (+DMC) — update `quotes.linked_quote_id/name/template` by cloud_id.
- `sbSetQuoteStatus(cloudId, status: QuoteStatus, client?): Promise<void>` (+DMC) — update `quotes.status` by cloud_id.

- [ ] Steps 1–5: failing test (set link + status, subscribe/get reflects), run FAIL, implement, run PASS, `typecheck && lint`, commit (`feat(supabase): quote cross-links + status (regular + DMC)`).

---

## Task 8: Backfills — `sbBackfillWorkflowIndex`, `sbSetQuotePaymentSummary`, `sbBackfillPaymentIndex`

**Files:** Modify `src/lib/supabase.ts`; Test `tests/supabase/quotes.test.ts`

**Interfaces (match `firebase.ts:417-458`):**
- `sbBackfillWorkflowIndex(updates: Record<cloudId, Pick<CloudQuoteEntry,'workflowDue'|'workflowSummary'|'departDate'>>, client?): Promise<number>` — for each cloud_id, update `quotes.workflow_summary` (jsonb), `depart_date`, and a `workflow_due` jsonb (add column? `quotes` has `workflow_summary` jsonb but no `workflow_due`/`workflowDue` — store `workflowDue` inside `workflow_summary` jsonb OR add a column). **Confirm:** `quotes` has `workflow_summary jsonb` only. Store `workflowDue` as a key within a combined jsonb, OR add `workflow_due jsonb` via a tiny migration `0022`. Decide in implementation: simplest is to fold `workflowDue` into the `workflow_summary` object shape the index reads — but `CloudQuoteEntry` has them as separate fields. **Add `workflow_due jsonb` + `depart_date` is already a column.** If a column is missing, add migration `0022_quote_index_cols.sql` (and flag for prod-push). Returns count updated.
- `sbSetQuotePaymentSummary(cloudId, paymentSummary, client?): Promise<void>` — update `quotes.payment_summary` jsonb.
- `sbBackfillPaymentIndex(updates: Record<cloudId, paymentSummary>, client?): Promise<number>` — batch update `quotes.payment_summary`.

- [ ] Steps 1–5: failing test (save quotes, backfill workflow/payment summaries, subscribe shows them; assert returned counts), run FAIL, implement (+ migration 0022 if a column is needed), run PASS, `typecheck && lint`, commit (`feat(supabase): quote workflow/payment index backfills`).

---

## Task 9: Surface parity + full gate + Phase-2-complete doc

**Files:** Modify `tests/supabase/parity.test.ts` (extend); Modify `docs/supabase-setup.md`

- [ ] **Step 1:** Extend the parity test's list with all Phase-2 quote `sb*` names (the 20 functions in Scope) + `generateQuoteCode`; assert each is a function.
- [ ] **Step 2:** Run `npm run test:integration -- tests/supabase/parity.test.ts` → fix any missing/renamed export until green.
- [ ] **Step 3:** Append to `docs/supabase-setup.md`: "Phase 2 (quotes) done — gateway surface complete." List the prod-push migrations now **0017–0021 (+0022 if added)**. Note the dropped Firestore caps (≤500 history / 1 MB) and retained ≤20 versions. Note stores still not wired (Phase 4).
- [ ] **Step 4: Full gate** — `npm run typecheck && npm run lint && npm test && npm run test:integration`. All green; capture totals.
- [ ] **Step 5: Commit** (`feat(supabase): Phase-2 quote gateway surface complete + docs`).

---

## Self-Review

**Spec coverage:** every deferred quote function from Phase 1's scope has a task (Task 4 index save/subscribe; Task 5 state save/get; Task 6 delete/collab; Task 7 link/status; Task 8 backfills; `generateQuoteCode` Task 4). Atomic-save RPC (Task 1). Decompose/assemble (Tasks 2–3). Regular+DMC unified throughout. Version cap ≤20 (Task 1 RPC + Task 5). Cross-links by cloud_id (Task 7). created_at/timestamp parity (Tasks 4–5). ✔

**Placeholder scan:** Tasks 1–3 carry full code; Tasks 4–8 give exact interfaces + `firebase.ts` line refs + the reference pattern (customers/visa from Phase 1) + a complete test description, and are bite-sized — but they do NOT inline every line of the wrapper code. **If the executor wants the same full-inline treatment Phase 1 used, expand Tasks 4–8 before execution** (controller decision at pre-flight, as in Phase 1). The hard/novel logic (RPC, decompose, assemble) IS fully inlined here; Tasks 4–8 are mechanical applications of the established Phase-1 gateway pattern against the cited `fb*` source.

**Type consistency:** `decomposeQuote`/`assembleQuote` payload keys match the RPC's `jsonb` reads (`cloud_id`, `quote`, `line_items`, `flights`[.segments/.fares], `workflow`[.logs], `groups`[.items], `payments`, `version`). `save_quote_state` signature matches the `supabase.rpc('save_quote_state', { p })` call. Column names verified against migrations 0007–0010.

**Open item flagged for pre-flight:** the `total_cost` ownership between `sbSaveQuote` (index) and `sbSaveQuoteState` (RPC) — Task 2's note + Task 5 resolve it via `coalesce(excluded.total_cost, quotes.total_cost)` in the RPC. Confirm the RPC adjustment lands in Task 5 (with a re-run of the 0021 pgTAP).
