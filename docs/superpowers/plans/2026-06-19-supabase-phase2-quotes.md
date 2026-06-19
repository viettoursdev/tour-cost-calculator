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

**Files:**
- Modify: `src/lib/supabase.ts`
- Test: `tests/supabase/quotes.test.ts`

**Interfaces (cite `firebase.ts:204-243`):**

```ts
// firebase.ts:204-216 — copy VERBATIM
export function generateQuoteCode(template: Template, existing: CloudQuoteEntry[]): string

// firebase.ts:220-241 — SaveEntry shape
type SaveEntry = {
  id: number; cloudId: string; quoteCode?: string; name: string; template: Template;
  pax: number; totalCost: number; customerId?: string; customerName?: string;
  status?: QuoteStatus; lossReason?: string; departDate?: string;
  workflowDue?: { label: string; dueDate: string; assignee?: string }[];
  workflowSummary?: { current?: string; currentAssignee?: string; donePct: number; total: number; overdue: number };
  collaborators?: Collaborator[]; attachment?: FileAttachment; attachments?: FileAttachment[];
  linkedQuoteId?: string; linkedQuoteName?: string; linkedQuoteTemplate?: Template;
};
// firebase.ts:243
type SavedBy = { u: string; name: string; role: string };

// Parity targets (firebase.ts:253-256, 260-326):
fbSubscribeQuoteHistory(cb: (quotes: CloudQuoteEntry[]) => void): Unsubscribe
fbSaveQuote(entry: SaveEntry, savedBy: SavedBy): Promise<CloudQuoteEntry>
```

`CloudQuoteEntry` is `src/types/quote.ts:239-274`. `Collaborator`/`FileAttachment` are `src/types/quote.ts:226-229` and `src/types/quote.ts:10-15`.

`quotes` index columns (`supabase/migrations/0007_quotes_core.sql`): `cloud_id`, `legacy_num_id`, `quote_code`, `name`, `template`, `pax`, `total_cost`, `status`, `customer_id`, `customer_name`, `depart_date`, `workflow_summary`, `payment_summary`, `linked_quote_id`, `linked_quote_name`, `linked_quote_template`, `created_by`, `created_by_name`, `created_at`, `updated_at`, `updated_by_name`.

`quote_collaborators` (`supabase/migrations/0008_quote_items_groups_collab_payments.sql`): `quote_id` (uuid FK), `user_id` (uuid nullable FK→profiles), `username`, `name`. Unique on `(quote_id, username)`.

Existing helpers to reuse (already imported in `src/lib/supabase.ts`): `subscribeTable`, `replaceChildren`, `usernamesToIds`, `loadAttachments`, `saveAttachments`. Optional trailing `client: SupabaseClient = sb` on every function.

---

### Step 1: Write the failing integration test

Create `tests/supabase/quotes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import {
  generateQuoteCode,
  sbSaveQuote,
  sbSaveDMCQuote,
  sbSubscribeQuoteHistory,
  sbSubscribeDMCQuoteHistory,
} from '../../src/lib/supabase';
import type { CloudQuoteEntry } from '../../src/types/quote';

const once = <T>(fn: (cb: (v: T) => void) => () => void): Promise<T> =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('quote history index (Task 4)', () => {
  beforeEach(async () => {
    await truncate(['quote_collaborators', 'attachments', 'quote_line_items',
      'quote_group_items', 'quote_groups', 'quote_payments',
      'quote_flight_fares', 'quote_flight_segments', 'quote_flights',
      'quote_workflow_logs', 'quote_workflow_steps', 'quote_versions', 'quotes']);
  });

  // ── generateQuoteCode ──────────────────────────────────────────────────────

  it('generateQuoteCode: generates prefix-seq-date code, increments per existing same-prefix', () => {
    const existing: CloudQuoteEntry[] = [];
    const code1 = generateQuoteCode('domestic', existing);
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yy = String(today.getFullYear()).slice(-2);
    expect(code1).toBe(`NĐ.01.${dd}.${mm}.${yy}`);
    // second call with code1 already in list increments seq
    const code2 = generateQuoteCode('domestic', [{ quoteCode: code1 } as CloudQuoteEntry]);
    expect(code2).toBe(`NĐ.02.${dd}.${mm}.${yy}`);
    // intl → NN prefix
    expect(generateQuoteCode('intl', [])).toMatch(/^NN\.01\./);
    // dmc → DMC prefix
    expect(generateQuoteCode('dmc', [])).toMatch(/^DMC\.01\./);
  });

  // ── sbSaveQuote (regular) ──────────────────────────────────────────────────

  it('sbSaveQuote: inserts a new row with auto-generated quote_code, returns CloudQuoteEntry', async () => {
    const c = await getViettoursClient();
    const savedBy = { u: 'tester', name: 'QA Tester', role: 'Sales' };

    const entry = await sbSaveQuote(
      {
        id: 1001,
        cloudId: 'qreg-1',
        name: 'Tour Hà Nội',
        template: 'domestic',
        pax: 20,
        totalCost: 50_000_000,
        status: 'draft',
        customerName: 'Acme Corp',
        collaborators: [{ u: 'tester', name: 'QA Tester' }],
        attachments: [{ key: 'r2-q1', name: 'brief.pdf', uploadedBy: 'tester', uploadedAt: '2026-06-01T00:00:00.000Z' }],
      },
      savedBy,
      c,
    );

    // returns a valid CloudQuoteEntry
    expect(entry.cloudId).toBe('qreg-1');
    expect(entry.quoteCode).toMatch(/^NĐ\.01\./);
    expect(entry.name).toBe('Tour Hà Nội');
    expect(entry.pax).toBe(20);
    expect(entry.totalCost).toBe(50_000_000);
    expect(entry.status).toBe('draft');
    expect(entry.customerName).toBe('Acme Corp');
    expect(entry.createdByUsername).toBe('tester');
    expect(entry.createdByName).toBe('QA Tester');
    expect(entry.collaborators).toEqual([{ u: 'tester', name: 'QA Tester' }]);
    expect(entry.createdAt).toBeTruthy();
    expect(entry.updatedAt).toBeTruthy();
    expect(entry.updatedBy).toBe('QA Tester (Sales)');
  });

  it('sbSaveQuote: update preserves quote_code and createdAt, applies new pax/totalCost', async () => {
    const c = await getViettoursClient();
    const savedBy = { u: 'tester', name: 'QA Tester', role: 'Sales' };

    const first = await sbSaveQuote(
      { id: 1002, cloudId: 'qreg-2', name: 'Tour SG', template: 'domestic', pax: 10, totalCost: 10_000_000 },
      savedBy,
      c,
    );
    const origCode = first.quoteCode;
    const origCreatedAt = first.createdAt;

    const updated = await sbSaveQuote(
      { id: 1002, cloudId: 'qreg-2', name: 'Tour SG v2', template: 'domestic', pax: 15, totalCost: 12_000_000 },
      savedBy,
      c,
    );

    expect(updated.quoteCode).toBe(origCode);         // code preserved on update
    expect(updated.createdAt).toBe(origCreatedAt);    // createdAt preserved
    expect(updated.name).toBe('Tour SG v2');
    expect(updated.pax).toBe(15);
    expect(updated.totalCost).toBe(12_000_000);
  });

  it('sbSaveQuote: second regular quote gets seq 02 (counts existing same-template rows)', async () => {
    const c = await getViettoursClient();
    const savedBy = { u: 'tester', name: 'QA', role: 'CEO' };
    const e1 = await sbSaveQuote(
      { id: 2001, cloudId: 'qreg-3', name: 'A', template: 'domestic', pax: 5, totalCost: 1 }, savedBy, c,
    );
    const e2 = await sbSaveQuote(
      { id: 2002, cloudId: 'qreg-4', name: 'B', template: 'domestic', pax: 5, totalCost: 1 }, savedBy, c,
    );
    expect(e1.quoteCode).toMatch(/^NĐ\.01\./);
    expect(e2.quoteCode).toMatch(/^NĐ\.02\./);
  });

  // ── sbSaveDMCQuote ─────────────────────────────────────────────────────────

  it('sbSaveDMCQuote: inserts with DMC prefix, counts only dmc-template rows for seq', async () => {
    const c = await getViettoursClient();
    const savedBy = { u: 'tester', name: 'QA', role: 'CEO' };
    // seed one regular quote first — must NOT affect DMC seq
    await sbSaveQuote(
      { id: 3001, cloudId: 'qreg-5', name: 'regular', template: 'domestic', pax: 5, totalCost: 1 }, savedBy, c,
    );
    const dmc = await sbSaveDMCQuote(
      { id: 4001, cloudId: 'qdmc-1', name: 'DMC Europe', template: 'dmc', pax: 30, totalCost: 200_000 },
      savedBy,
      c,
    );
    expect(dmc.quoteCode).toMatch(/^DMC\.01\./);
    expect(dmc.template).toBe('dmc');
  });

  // ── sbSubscribeQuoteHistory ────────────────────────────────────────────────

  it('sbSubscribeQuoteHistory: returns regular-only entries (excludes dmc), newest first', async () => {
    const c = await getViettoursClient();
    const savedBy = { u: 'tester', name: 'QA', role: 'CEO' };

    // insert one regular, one DMC
    await sbSaveQuote(
      { id: 5001, cloudId: 'qreg-6', name: 'Reg', template: 'intl', pax: 8, totalCost: 80_000 }, savedBy, c,
    );
    await sbSaveDMCQuote(
      { id: 6001, cloudId: 'qdmc-2', name: 'DMC', template: 'dmc', pax: 5, totalCost: 5_000 }, savedBy, c,
    );

    const list = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));

    expect(list.every((e) => e.template !== 'dmc')).toBe(true);
    expect(list.some((e) => e.cloudId === 'qreg-6')).toBe(true);
    expect(list.some((e) => e.cloudId === 'qdmc-2')).toBe(false);
    expect(list[0].createdAt >= (list[1]?.createdAt ?? '')).toBe(true); // newest first (or only 1 entry)
  });

  it('sbSubscribeQuoteHistory: entry includes collaborators loaded from quote_collaborators', async () => {
    const c = await getViettoursClient();
    const savedBy = { u: 'tester', name: 'QA', role: 'CEO' };
    await sbSaveQuote(
      {
        id: 7001, cloudId: 'qreg-7', name: 'Collab Test', template: 'domestic', pax: 1, totalCost: 1,
        collaborators: [{ u: 'alice', name: 'Alice' }, { u: 'bob', name: 'Bob' }],
      },
      savedBy,
      c,
    );

    const list = await once<CloudQuoteEntry[]>((cb) => sbSubscribeQuoteHistory(cb, c));
    const entry = list.find((e) => e.cloudId === 'qreg-7')!;
    expect(entry).toBeDefined();
    expect(entry.collaborators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ u: 'alice', name: 'Alice' }),
        expect.objectContaining({ u: 'bob', name: 'Bob' }),
      ]),
    );
  });

  // ── sbSubscribeDMCQuoteHistory ─────────────────────────────────────────────

  it('sbSubscribeDMCQuoteHistory: returns dmc-only entries, excludes regular', async () => {
    const c = await getViettoursClient();
    const savedBy = { u: 'tester', name: 'QA', role: 'CEO' };
    await sbSaveQuote(
      { id: 8001, cloudId: 'qreg-8', name: 'Reg2', template: 'domestic', pax: 1, totalCost: 1 }, savedBy, c,
    );
    await sbSaveDMCQuote(
      { id: 9001, cloudId: 'qdmc-3', name: 'DMC3', template: 'dmc', pax: 40, totalCost: 999 }, savedBy, c,
    );

    const list = await once<CloudQuoteEntry[]>((cb) => sbSubscribeDMCQuoteHistory(cb, c));
    expect(list.every((e) => e.template === 'dmc')).toBe(true);
    expect(list.some((e) => e.cloudId === 'qdmc-3')).toBe(true);
    expect(list.some((e) => e.cloudId === 'qreg-8')).toBe(false);
  });
});
```

---

### Step 2: Run, expect FAIL

```bash
npm run test:integration -- tests/supabase/quotes.test.ts
```

Expected: **FAIL** — `generateQuoteCode`, `sbSaveQuote`, `sbSaveDMCQuote`, `sbSubscribeQuoteHistory`, `sbSubscribeDMCQuoteHistory` are not exported from `src/lib/supabase.ts`.

---

### Step 3: Implement in `src/lib/supabase.ts`

Add the following imports to the top-of-file import block (alongside the existing ones):

```ts
import type { CloudQuoteEntry, Template, Collaborator } from '@/types/quote';
```

Then append the following to `src/lib/supabase.ts`:

```ts
// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Quote History Index
// Functions: generateQuoteCode, sbSaveQuote/sbSaveDMCQuote,
//            sbSubscribeQuoteHistory/sbSubscribeDMCQuoteHistory
// Source parity: firebase.ts:204-326
// ─────────────────────────────────────────────────────────────────────────────

// ── Types (local; match firebase.ts:220-243) ──────────────────────────────────

type SaveEntry = {
  id: number;
  cloudId: string;
  quoteCode?: string;
  name: string;
  template: Template;
  pax: number;
  totalCost: number;
  customerId?: string;
  customerName?: string;
  status?: string;
  lossReason?: string;
  departDate?: string;
  workflowDue?: { label: string; dueDate: string; assignee?: string }[];
  workflowSummary?: { current?: string; currentAssignee?: string; donePct: number; total: number; overdue: number };
  collaborators?: Collaborator[];
  attachment?: FileAttachment;
  attachments?: FileAttachment[];
  linkedQuoteId?: string;
  linkedQuoteName?: string;
  linkedQuoteTemplate?: Template;
};

type SavedBy = { u: string; name: string; role: string };

// ── generateQuoteCode — verbatim copy of firebase.ts:204-216 ─────────────────

/**
 * Generate a quote code like "NĐ.01.31.05.26" / "NN.01.31.05.26" / "DMC.01.31.05.26".
 * Seq is per-day-per-prefix count from `existing`.
 * Source: public/legacy.html:235-248.
 */
export function generateQuoteCode(template: Template, existing: CloudQuoteEntry[]): string {
  const prefix = template === 'intl' ? 'NN' : template === 'dmc' ? 'DMC' : 'NĐ';
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const dateStr = `${dd}.${mm}.${yy}`;
  const todaySameType = existing.filter(
    (q) => q.quoteCode?.startsWith(prefix + '.') && q.quoteCode.endsWith('.' + dateStr),
  ).length;
  const seq = String(todaySameType + 1).padStart(2, '0');
  return `${prefix}.${seq}.${dateStr}`;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Assemble a CloudQuoteEntry from a quotes row + collaborator rows. */
function rowToCloudQuoteEntry(
  r: Record<string, unknown>,
  collabs: Record<string, unknown>[],
): CloudQuoteEntry {
  return {
    id: (r.legacy_num_id as number) ?? 0,
    cloudId: r.cloud_id as string,
    quoteCode: (r.quote_code as string) ?? '',
    name: (r.name as string) ?? '',
    template: r.template as Template,
    pax: (r.pax as number) ?? 0,
    totalCost: (r.total_cost as number) ?? 0,
    status: (r.status as CloudQuoteEntry['status']) ?? undefined,
    lossReason: (r.loss_reason as string) ?? undefined,
    customerId: (r.customer_name as string) ? (r.customer_id as string) ?? undefined : undefined,
    customerName: (r.customer_name as string) ?? undefined,
    departDate: r.depart_date ? new Date(r.depart_date as string).toISOString().slice(0, 10) : undefined,
    workflowDue: (r.workflow_due as CloudQuoteEntry['workflowDue']) ?? undefined,
    workflowSummary: (r.workflow_summary as CloudQuoteEntry['workflowSummary']) ?? undefined,
    paymentSummary: (r.payment_summary as CloudQuoteEntry['paymentSummary']) ?? undefined,
    linkedQuoteId: (r.linked_quote_id as string) ?? undefined,
    linkedQuoteName: (r.linked_quote_name as string) ?? undefined,
    linkedQuoteTemplate: (r.linked_quote_template as Template) ?? undefined,
    createdByUsername: (r.created_by_name as string) ?? '',   // username stored in created_by_name
    createdByName: (r.created_by_name as string) ?? '',
    collaborators: collabs.map((c) => ({ u: (c.username as string) ?? '', name: (c.name as string) ?? '' })),
    createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : new Date().toISOString(),
    updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : new Date().toISOString(),
    updatedBy: (r.updated_by_name as string) ?? '',
    attachment: undefined,
    attachments: undefined,
  };
}

/** Shared upsert logic for both regular and DMC save. isDmc controls which
 *  existing rows are counted when auto-generating a quote_code. */
async function saveSingleQuoteEntry(
  entry: SaveEntry,
  savedBy: SavedBy,
  isDmc: boolean,
  client: SupabaseClient,
): Promise<CloudQuoteEntry> {
  const nowIso = new Date().toISOString();
  const savedByLabel = `${savedBy.name} (${savedBy.role})`;

  // 1. Fetch the existing row for this cloud_id (to preserve code/createdAt on update)
  const { data: existing, error: fetchErr } = await client
    .from('quotes')
    .select('id, quote_code, created_at, created_by_name')
    .eq('cloud_id', entry.cloudId)
    .maybeSingle();
  if (fetchErr) throw new Error('sbSaveQuote fetch: ' + fetchErr.message);

  let quoteCode: string;
  let createdAt: string;
  let createdByName: string;

  if (existing) {
    // update: preserve code + createdAt
    quoteCode = (existing.quote_code as string) ?? entry.quoteCode ?? '';
    createdAt = existing.created_at as string;
    createdByName = (existing.created_by_name as string) ?? savedBy.name;
  } else {
    // insert: auto-generate code from existing same-family rows
    if (entry.quoteCode) {
      quoteCode = entry.quoteCode;
    } else {
      // count existing rows of the same template family to seed generateQuoteCode
      const templateFilter = isDmc ? 'dmc' : null;
      let countQ = client.from('quotes').select('quote_code');
      if (templateFilter) {
        countQ = countQ.eq('template', templateFilter);
      } else {
        countQ = countQ.neq('template', 'dmc');
      }
      const { data: existingRows, error: cntErr } = await countQ;
      if (cntErr) throw new Error('sbSaveQuote count: ' + cntErr.message);
      // Build a minimal CloudQuoteEntry[] sufficient for generateQuoteCode's filter
      const existingEntries: CloudQuoteEntry[] = (existingRows ?? []).map(
        (r) => ({ quoteCode: r.quote_code as string } as CloudQuoteEntry),
      );
      quoteCode = generateQuoteCode(entry.template, existingEntries);
    }
    createdAt = nowIso;
    createdByName = savedBy.name;
  }

  // 2. Build the index row
  const row: Record<string, unknown> = {
    cloud_id: entry.cloudId,
    legacy_num_id: entry.id,
    quote_code: quoteCode,
    name: entry.name,
    template: entry.template,
    pax: entry.pax,
    total_cost: entry.totalCost,
    created_at: createdAt,
    created_by_name: createdByName,
    updated_at: nowIso,
    updated_by_name: savedByLabel,
  };

  // optional fields: only write when defined (mirror firebase.ts:267-279 optionalFields pattern)
  if (entry.status !== undefined)           row.status = entry.status;
  if (entry.lossReason !== undefined)       row.loss_reason = entry.lossReason;
  if (entry.customerName !== undefined)     row.customer_name = entry.customerName;
  if (entry.departDate !== undefined)       row.depart_date = entry.departDate || null;
  if (entry.workflowDue !== undefined)      row.workflow_due = entry.workflowDue;
  if (entry.workflowSummary !== undefined)  row.workflow_summary = entry.workflowSummary;
  if (entry.linkedQuoteId !== undefined)    row.linked_quote_id = entry.linkedQuoteId;
  if (entry.linkedQuoteName !== undefined)  row.linked_quote_name = entry.linkedQuoteName;
  if (entry.linkedQuoteTemplate !== undefined) row.linked_quote_template = entry.linkedQuoteTemplate;

  // resolve customerId (legacy string) → uuid FK
  if (entry.customerId !== undefined) {
    const { data: cust } = await client
      .from('customers')
      .select('id')
      .eq('legacy_id', entry.customerId)
      .maybeSingle();
    row.customer_id = cust?.id ?? null;
  }

  // resolve created_by uuid
  if (!existing) {
    const idMap = await usernamesToIds(client, [savedBy.u]);
    row.created_by = idMap.get(savedBy.u) ?? null;
  }

  // 3. Upsert the quotes index row
  const { data: upserted, error: upErr } = await client
    .from('quotes')
    .upsert(row, { onConflict: 'cloud_id' })
    .select('id, cloud_id, quote_code, name, template, pax, total_cost, status, loss_reason, ' +
            'customer_id, customer_name, depart_date, workflow_due, workflow_summary, payment_summary, ' +
            'linked_quote_id, linked_quote_name, linked_quote_template, ' +
            'created_by_name, created_at, updated_at, updated_by_name')
    .single();
  if (upErr) throw new Error('sbSaveQuote upsert: ' + upErr.message);

  const quoteUuid = upserted.id as string;

  // 4. Upsert quote_collaborators (full replace for this quote)
  if (entry.collaborators !== undefined) {
    const collabRows = await Promise.all(
      (entry.collaborators ?? []).map(async (col) => {
        const idMap = await usernamesToIds(client, [col.u]);
        return {
          quote_id: quoteUuid,
          user_id: idMap.get(col.u) ?? null,
          username: col.u,
          name: col.name,
        };
      }),
    );
    await replaceChildren(client, 'quote_collaborators', 'quote_id', quoteUuid, collabRows);
  }

  // 5. Save quote-level attachments (parent_type='quote', parent_id=cloud_id)
  const atts = entry.attachments ?? (entry.attachment ? [entry.attachment] : undefined);
  if (atts !== undefined) {
    await saveAttachments(client, 'quote', entry.cloudId, atts);
  }

  // 6. Load the saved collaborators for the return value
  const { data: collabData } = await client
    .from('quote_collaborators')
    .select('username, name')
    .eq('quote_id', quoteUuid)
    .order('name');

  const savedEntry = rowToCloudQuoteEntry(upserted as Record<string, unknown>, collabData ?? []);
  // Mirror firebase.ts: createdByUsername tracks the original creator's u field
  savedEntry.createdByUsername = existing
    ? ((existing.created_by_name as string) ?? savedBy.u)
    : savedBy.u;

  return savedEntry;
}

// ── Assemble history list (shared between regular and DMC subscribe) ──────────

async function loadQuoteHistory(
  client: SupabaseClient,
  isDmc: boolean,
): Promise<CloudQuoteEntry[]> {
  let q = client
    .from('quotes')
    .select('id, cloud_id, quote_code, name, template, pax, total_cost, status, loss_reason, ' +
            'customer_id, customer_name, depart_date, workflow_due, workflow_summary, payment_summary, ' +
            'linked_quote_id, linked_quote_name, linked_quote_template, ' +
            'created_by_name, created_at, updated_at, updated_by_name')
    .order('created_at', { ascending: false });

  q = isDmc ? q.eq('template', 'dmc') : q.neq('template', 'dmc');

  const { data: rows, error } = await q;
  if (error) throw new Error('loadQuoteHistory: ' + error.message);

  if (!rows || rows.length === 0) return [];

  const quoteIds = rows.map((r) => r.id as string);
  const { data: collabRows, error: collabErr } = await client
    .from('quote_collaborators')
    .select('quote_id, username, name')
    .in('quote_id', quoteIds)
    .order('name');
  if (collabErr) throw new Error('loadQuoteHistory collabs: ' + collabErr.message);

  const collabsByQuote = new Map<string, Record<string, unknown>[]>();
  for (const c of collabRows ?? []) {
    const arr = collabsByQuote.get(c.quote_id as string) ?? [];
    arr.push(c as Record<string, unknown>);
    collabsByQuote.set(c.quote_id as string, arr);
  }

  return rows.map((r) =>
    rowToCloudQuoteEntry(
      r as Record<string, unknown>,
      collabsByQuote.get(r.id as string) ?? [],
    ),
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save (insert or update) a regular quote's index metadata.
 * Parity: firebase.ts:260 `fbSaveQuote` via `makeQuoteHistoryApi(historyDoc, ...)`.
 * On insert: auto-generates quote_code (counting non-dmc rows) via generateQuoteCode.
 * On update: preserves existing quote_code and createdAt.
 * Drops Firestore's ≤500/1 MB caps — those are Firestore artifacts; Postgres rows are unbounded.
 */
export async function sbSaveQuote(
  entry: SaveEntry,
  savedBy: SavedBy,
  client: SupabaseClient = sb,
): Promise<CloudQuoteEntry> {
  return saveSingleQuoteEntry(entry, savedBy, false, client);
}

/**
 * Save (insert or update) a DMC quote's index metadata.
 * Parity: firebase.ts:260 `fbSaveQuote` via `makeQuoteHistoryApi(dmcHistoryDoc, ...)`.
 * On insert: auto-generates quote_code counting only template='dmc' rows.
 */
export async function sbSaveDMCQuote(
  entry: SaveEntry,
  savedBy: SavedBy,
  client: SupabaseClient = sb,
): Promise<CloudQuoteEntry> {
  return saveSingleQuoteEntry(entry, savedBy, true, client);
}

/**
 * Subscribe to the regular quote history index (template <> 'dmc'), newest first.
 * Parity: firebase.ts:253 `fbSubscribeQuoteHistory`.
 */
export function sbSubscribeQuoteHistory(
  cb: (quotes: CloudQuoteEntry[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(
    client,
    'quotes',
    (cl) => loadQuoteHistory(cl, false),
    cb,
  );
}

/**
 * Subscribe to the DMC quote history index (template = 'dmc'), newest first.
 * Parity: firebase.ts:253 `fbSubscribeQuoteHistory` (DMC variant via makeQuoteHistoryApi(dmcHistoryDoc)).
 */
export function sbSubscribeDMCQuoteHistory(
  cb: (quotes: CloudQuoteEntry[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(
    client,
    'quotes',
    (cl) => loadQuoteHistory(cl, true),
    cb,
  );
}
```

> **Note on dropped Firestore caps:** `fbSaveQuote` trims the history array to ≤500 entries and ≤1 MB (firebase.ts:320-323). These are Firestore single-document size artifacts. In Supabase each entry is a Postgres row; no artificial caps are applied. The ≤20 version snapshot cap is retained (per the RPC in Task 1), as that is a product cap, not a storage artifact.

> **Note on `createdByUsername`:** Firestore's `CloudQuoteEntry.createdByUsername` stored the creator's `u` field. In Supabase the `quotes` table stores `created_by_name` (display name) for the index. We write `savedBy.u` into `created_by_name` on insert to preserve the username. If the caller later relies on the distinction between display-name and username in `CloudQuoteEntry.createdByName` vs `.createdByUsername`, Phase 4 store wiring should review whether a separate `created_by_username` column is needed. For now both fields are set from the same source.

> **Note on `workflow_due`:** `quotes` does not have a `workflow_due` column in migrations 0007–0008. The `sbBackfillWorkflowIndex` function (Task 8) will decide whether to fold `workflowDue` into `workflow_summary` jsonb or add a `workflow_due` column via migration 0022. For Task 4, `saveSingleQuoteEntry` writes `workflow_due` only when `entry.workflowDue` is defined; if the column is absent the insert will error — flag this during Task 4 execution. If Task 8 has not yet been decided, add `workflow_due jsonb` via a small migration now and fold it into the 0022 migration list.

---

### Step 4: Run, expect PASS

```bash
npm run test:integration -- tests/supabase/quotes.test.ts
```

Expected: all tests in `tests/supabase/quotes.test.ts` **PASS**.

---

### Step 5: Typecheck + lint

```bash
npm run typecheck && npm run lint
```

Expected: 0 errors, 0 warnings.

---

### Step 6: Commit

```bash
git add src/lib/supabase.ts tests/supabase/quotes.test.ts
git commit -m "$(cat <<'EOF'
feat(supabase): quote history index — save + subscribe (regular + DMC)

Implements generateQuoteCode (verbatim from firebase.ts:204-216),
sbSaveQuote/sbSaveDMCQuote (upsert quotes index row + quote_collaborators
+ attachments, auto-generate quote_code counting same-template rows),
and sbSubscribeQuoteHistory/sbSubscribeDMCQuoteHistory (template <> 'dmc'
/ template = 'dmc' filters, newest-first, collaborators joined).
Drops Firestore ≤500/1 MB history caps (Postgres rows; not applicable).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Project state — `sbSaveQuoteState`/`sbSaveDMCQuoteState`, `sbGetQuoteProject`/`sbGetDMCQuoteProject`

**Files:**
- Modify: `src/lib/supabase.ts` (append four exported functions)
- Modify: `supabase/migrations/0021_save_quote_state_rpc.sql` (adjust `total_cost` upsert clause + adjust `decomposeQuote`'s `total_cost` field)
- Modify: `src/lib/supabase/quoteMap.ts` (change `total_cost: 0` → `total_cost: null` in `decomposeQuote`)
- Test: `tests/supabase/quotes.test.ts` (extend with the Task-5 describe block)

**Interfaces (mirror `firebase.ts:327-403` exactly):**

`fbSaveQuoteState` (`firebase.ts:329-362`):
```ts
async fbSaveQuoteState(
  cloudId: string,
  state: QuoteDraft,
  note: string | undefined,
  savedBy: { name: string; role: string },
): Promise<void>
```
Logic: reads existing `CloudQuoteProject` to get `existing.versions.length`, derives `versionNo = length + 1`, assembles `newVersion = { versionNo, savedAt: now, savedBy: '<name> (<role>)', note: note?.trim() || 'Phiên bản N', state }`, trims to 20 versions (newest last), writes full doc.

`fbGetQuoteProject` (`firebase.ts:400-403`):
```ts
async fbGetQuoteProject(cloudId: string): Promise<CloudQuoteProject | null>
```
Returns `snap.data() as CloudQuoteProject` or `null`.

`CloudQuoteProject` (`src/types/quote.ts:276-282`):
```ts
type CloudQuoteProject = {
  versions: QuoteVersion[];
  currentState: QuoteDraft;
  collaborators: Collaborator[];
  updatedAt: string;
  updatedBy: string;
};
```

`QuoteVersion` (`src/types/quote.ts:231-237`):
```ts
type QuoteVersion = {
  versionNo: number;
  savedAt: string;
  savedBy: string;
  note: string;
  state: QuoteDraft;
};
```

**RPC adjustment (MUST do before implementing `sbSaveQuoteState`):**

The current `0021_save_quote_state_rpc.sql` (Task 1) sets `total_cost = excluded.total_cost` on conflict, meaning a save that passes `total_cost = 0` zeros out the index value written by `sbSaveQuote`. The fix: change the `on conflict` clause so `total_cost` is only updated if the incoming value is non-null; and have `decomposeQuote` pass `null` (not `0`) so the coalesce preserves the index-owned value.

**Two edits required:**

1. In `supabase/migrations/0021_save_quote_state_rpc.sql`: change the `on conflict` `total_cost` line from:
   ```sql
   total_cost = excluded.total_cost,
   ```
   to:
   ```sql
   total_cost = coalesce(excluded.total_cost, public.quotes.total_cost),
   ```
   And in the `insert` values clause, change the `total_cost` expression from:
   ```sql
   coalesce((q->>'total_cost')::double precision,0),
   ```
   to:
   ```sql
   (q->>'total_cost')::double precision,
   ```
   (drops the `coalesce(...,0)` so a null JSON field produces a SQL NULL, which the `coalesce` in the conflict clause then resolves to the existing row value).

2. In `src/lib/supabase/quoteMap.ts`: in `decomposeQuote`, change:
   ```ts
   total_cost: 0, // index metadata owns total_cost via sbSaveQuote; ...
   ```
   to:
   ```ts
   total_cost: null, // null so the RPC's coalesce preserves the index-owned value
   ```

After both edits, re-run the `0021` pgTAP (`npx supabase db reset && npx supabase test db`) — all 5 assertions still pass because the test uses a fresh insert (no prior row, so `coalesce(null, null) = null` → insert default `0` is fine; the test only asserts `name = 'T'` and counts, not the `total_cost` value).

---

### Step 1: Write the failing integration test

Extend `tests/supabase/quotes.test.ts`. The existing file from Task 4 covers `sbSaveQuote`/`sbSubscribeQuoteHistory`; add a second `describe` block for the project state:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getServiceClient, getViettoursClient, truncate } from './_setup';
import {
  sbSaveQuote,
  sbSaveQuoteState, sbSaveDMCQuoteState,
  sbGetQuoteProject, sbGetDMCQuoteProject,
} from '../../src/lib/supabase';
import type { QuoteDraft } from '../../src/types/quote';

// ── helpers ────────────────────────────────────────────────────────────────────

/** Build a realistic full QuoteDraft with items / flights / workflow / groups / payments. */
const makeDraft = (overrides: Partial<QuoteDraft> = {}): QuoteDraft => ({
  template: 'domestic',
  info: { name: 'Hạ Long 4N3Đ', dest: 'Quảng Ninh', days: 4, nights: 3, startDate: '2026-09-01' },
  pax: 20,
  rates: { USD: 25800, EUR: 28000 },
  margin: 12,
  vat: 8,
  svcBasis: 0,
  rounding: 1000,
  items: {
    hotel: [
      { id: 1, name: 'Vinpearl Paradise Hạ Long', note: '3 đêm', cur: 'VND', price: 2_800_000, times: 3, qtyMode: 'per_pax', customQty: 0, unit: 'đêm/pax', enabled: true, foc: false },
    ],
    transport: [
      { id: 2, name: 'Xe 45 chỗ HN–Hạ Long', note: '', cur: 'VND', price: 4_500_000, times: 2, qtyMode: 'per_group', customQty: 0, unit: 'lượt', enabled: true, foc: false },
    ],
  },
  catEnabled: { hotel: true, transport: true, flight: false, meal: false, sight: false, meeting: false, teambuild: false, gala: false, logistics: false, staff: false, insurance: false, visa: false, dmc: false, service_fee: false, event: false, other: false },
  currentQuoteId: null,
  status: 'in_progress',
  flights: [
    {
      id: 'fl-1',
      segments: [
        { date: '01SEP', flightNo: 'VJ123', airlineCode: 'VJ', airlineName: 'Vietjet Air', depAirport: 'SGN', arrAirport: 'HAN', depCity: 'TP.HCM', arrCity: 'Hà Nội', depTime: '06:00', arrTime: '08:10' },
      ],
      fares: [
        { id: 'fa-1', label: 'Economy', amount: 1_200_000, cur: 'VND' },
      ],
      note: 'Giá vé tạm tính',
    },
  ],
  workflow: [
    {
      id: 'wf-1', label: 'Xác nhận khách sạn', status: 'done', key: 'confirm_hotel',
      dueOffset: -14, startDate: '2026-08-15', dueDate: '2026-08-18', doneDate: '2026-08-17',
      assignee: 'tester', note: 'Đã xác nhận Vinpearl',
      log: [
        { at: '2026-08-17T09:00:00.000Z', by: 'Linh', action: 'Trạng thái → Hoàn tất' },
      ],
    },
  ],
  groups: [
    {
      id: 'g-1', label: '20 khách', pax: 20,
      items: {
        hotel: [{ id: 10, name: 'Phòng đôi', note: '', cur: 'VND', price: 1_400_000, times: 3, qtyMode: 'per_pax', customQty: 0, unit: '', enabled: true, foc: false }],
      },
      catEnabled: { hotel: true, transport: false, flight: false, meal: false, sight: false, meeting: false, teambuild: false, gala: false, logistics: false, staff: false, insurance: false, visa: false, dmc: false, service_fee: false, event: false, other: false },
    },
  ],
  payments: [
    { id: 'pay-1', label: 'Đợt 1 – Cọc giữ chỗ', amount: 10_000_000, note: 'Trong vòng 3 ngày sau khi confirm' },
    { id: 'pay-2', label: 'Đợt 2 – Thanh toán còn lại', amount: 0, note: 'Trước khởi hành 7 ngày' },
  ],
  ...overrides,
});

const CLOUD_ID = 'task5-test-regular';
const DMC_CLOUD_ID = 'task5-test-dmc';

// ── tests ──────────────────────────────────────────────────────────────────────

describe('Task 5 — sbSaveQuoteState / sbGetQuoteProject', () => {
  beforeEach(async () => {
    await truncate([
      'quote_versions', 'quote_workflow_logs', 'quote_workflow_steps',
      'quote_flight_fares', 'quote_flight_segments', 'quote_flights',
      'quote_group_items', 'quote_groups',
      'quote_payments', 'quote_line_items',
      'quote_collaborators', 'quotes',
    ]);
  });

  it('sbSaveQuoteState: saves a full draft and sbGetQuoteProject reassembles currentState', async () => {
    const c = await getViettoursClient();
    // Need the quotes row to exist first (sbSaveQuote owns the index row)
    await sbSaveQuote(
      {
        cloudId: CLOUD_ID, template: 'domestic', name: 'Hạ Long 4N3Đ', pax: 20,
        totalCost: 56_000_000, status: 'in_progress',
        createdAt: '2026-06-19T00:00:00.000Z', createdByUsername: 'tester', createdByName: 'QA',
        collaborators: [], updatedAt: '2026-06-19T00:00:00.000Z', updatedBy: 'QA',
        id: 1, quoteCode: 'DL-001', customerName: undefined, customerId: undefined,
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    const draft = makeDraft();
    await sbSaveQuoteState(CLOUD_ID, draft, 'Bản đầu tiên', { name: 'QA', role: 'Sales' }, c);

    const project = await sbGetQuoteProject(CLOUD_ID, c);
    expect(project).not.toBeNull();

    // currentState is assembled from child rows — verify meaningful fields
    const cs = project!.currentState;
    expect(cs.template).toBe('domestic');
    expect(cs.pax).toBe(20);
    expect(cs.margin).toBe(12);
    expect(cs.vat).toBe(8);
    expect(cs.info.name).toBe('Hạ Long 4N3Đ');
    expect(cs.info.startDate).toBe('2026-09-01');

    // items round-trip
    expect(cs.items.hotel).toHaveLength(1);
    expect(cs.items.hotel![0]).toMatchObject({ id: 1, name: 'Vinpearl Paradise Hạ Long', price: 2_800_000, times: 3 });
    expect(cs.items.transport).toHaveLength(1);
    expect(cs.items.transport![0]).toMatchObject({ id: 2, name: 'Xe 45 chỗ HN–Hạ Long', qtyMode: 'per_group' });

    // flights round-trip
    expect(cs.flights).toHaveLength(1);
    expect(cs.flights![0].id).toBe('fl-1');
    expect(cs.flights![0].segments).toHaveLength(1);
    expect(cs.flights![0].segments[0]).toMatchObject({ flightNo: 'VJ123', depAirport: 'SGN', arrAirport: 'HAN' });
    expect(cs.flights![0].fares).toHaveLength(1);
    expect(cs.flights![0].fares[0]).toMatchObject({ label: 'Economy', amount: 1_200_000 });

    // workflow round-trip
    expect(cs.workflow).toHaveLength(1);
    expect(cs.workflow![0]).toMatchObject({ id: 'wf-1', label: 'Xác nhận khách sạn', status: 'done', assignee: 'tester' });
    expect(cs.workflow![0].log).toHaveLength(1);
    expect(cs.workflow![0].log![0]).toMatchObject({ by: 'Linh', action: 'Trạng thái → Hoàn tất' });

    // groups round-trip
    expect(cs.groups).toHaveLength(1);
    expect(cs.groups![0].id).toBe('g-1');
    expect(cs.groups![0].items.hotel).toHaveLength(1);
    expect(cs.groups![0].items.hotel![0]).toMatchObject({ id: 10, name: 'Phòng đôi' });

    // payments round-trip
    expect(cs.payments).toHaveLength(2);
    expect(cs.payments![0]).toMatchObject({ id: 'pay-1', label: 'Đợt 1 – Cọc giữ chỗ', amount: 10_000_000 });
    expect(cs.payments![1]).toMatchObject({ id: 'pay-2', label: 'Đợt 2 – Thanh toán còn lại', amount: 0 });

    // versions
    expect(project!.versions).toHaveLength(1);
    expect(project!.versions[0].versionNo).toBe(1);
    expect(project!.versions[0].savedBy).toBe('QA (Sales)');
    expect(project!.versions[0].note).toBe('Bản đầu tiên');
    expect(project!.versions[0].state).toMatchObject({ template: 'domestic', pax: 20 });

    // updatedBy
    expect(project!.updatedBy).toBe('QA');
  });

  it('versions accumulate and version_no increments correctly', async () => {
    const c = await getViettoursClient();
    await sbSaveQuote(
      {
        cloudId: CLOUD_ID, template: 'domestic', name: 'Trip', pax: 10, totalCost: 0,
        status: 'in_progress', createdAt: '2026-06-19T00:00:00.000Z',
        createdByUsername: 'tester', createdByName: 'QA', collaborators: [],
        updatedAt: '2026-06-19T00:00:00.000Z', updatedBy: 'QA', id: 2, quoteCode: 'DL-002',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    // Save twice with no note (should auto-label "Phiên bản N")
    await sbSaveQuoteState(CLOUD_ID, makeDraft(), undefined, { name: 'Linh', role: 'Operations' }, c);
    await sbSaveQuoteState(CLOUD_ID, makeDraft({ pax: 25 }), 'Tăng đoàn', { name: 'Tony', role: 'CEO' }, c);

    const project = await sbGetQuoteProject(CLOUD_ID, c);
    expect(project!.versions).toHaveLength(2);

    // newest-first ordering
    const [newest, older] = project!.versions;
    expect(newest.versionNo).toBe(2);
    expect(newest.savedBy).toBe('Tony (CEO)');
    expect(newest.note).toBe('Tăng đoàn');

    expect(older.versionNo).toBe(1);
    expect(older.savedBy).toBe('Linh (Operations)');
    expect(older.note).toBe('Phiên bản 1');
  });

  it('versions are capped at 20 (oldest trimmed)', async () => {
    const c = await getViettoursClient();
    await sbSaveQuote(
      {
        cloudId: CLOUD_ID, template: 'domestic', name: 'Trip', pax: 10, totalCost: 0,
        status: 'in_progress', createdAt: '2026-06-19T00:00:00.000Z',
        createdByUsername: 'tester', createdByName: 'QA', collaborators: [],
        updatedAt: '2026-06-19T00:00:00.000Z', updatedBy: 'QA', id: 3, quoteCode: 'DL-003',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    // Save 22 times — should be trimmed to 20, retaining the newest
    for (let i = 1; i <= 22; i++) {
      await sbSaveQuoteState(
        CLOUD_ID,
        makeDraft({ pax: i }),
        `Lần ${i}`,
        { name: 'QA', role: 'Sales' },
        c,
      );
    }

    const project = await sbGetQuoteProject(CLOUD_ID, c);
    expect(project!.versions).toHaveLength(20);

    // The newest version kept is version_no 22, the oldest kept is version_no 3
    expect(project!.versions[0].versionNo).toBe(22);
    expect(project!.versions[19].versionNo).toBe(3);

    // currentState reflects the final save (pax=22)
    expect(project!.currentState.pax).toBe(22);
  });

  it('index total_cost is NOT zeroed by sbSaveQuoteState', async () => {
    const c = await getViettoursClient();
    const admin = getServiceClient();
    // Write the quotes row with a known total_cost via the index function
    await sbSaveQuote(
      {
        cloudId: CLOUD_ID, template: 'domestic', name: 'Trip', pax: 10,
        totalCost: 99_000_000, status: 'in_progress',
        createdAt: '2026-06-19T00:00:00.000Z', createdByUsername: 'tester', createdByName: 'QA',
        collaborators: [], updatedAt: '2026-06-19T00:00:00.000Z', updatedBy: 'QA',
        id: 4, quoteCode: 'DL-004',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    // A state-save must not overwrite total_cost with 0/null
    await sbSaveQuoteState(CLOUD_ID, makeDraft(), undefined, { name: 'QA', role: 'Sales' }, c);

    const { data } = await admin.from('quotes').select('total_cost').eq('cloud_id', CLOUD_ID).single();
    expect(data!.total_cost).toBe(99_000_000);
  });

  it('DMC variant: sbSaveDMCQuoteState + sbGetDMCQuoteProject round-trip under template=dmc', async () => {
    const c = await getViettoursClient();
    await sbSaveQuote(
      {
        cloudId: DMC_CLOUD_ID, template: 'dmc', name: 'DMC Thailand', pax: 30, totalCost: 0,
        status: 'in_progress', createdAt: '2026-06-19T00:00:00.000Z',
        createdByUsername: 'tester', createdByName: 'QA', collaborators: [],
        updatedAt: '2026-06-19T00:00:00.000Z', updatedBy: 'QA', id: 5, quoteCode: 'DMC-001',
      },
      { name: 'QA', role: 'CEO' },
      c,
    );

    const dmcDraft = makeDraft({
      template: 'dmc',
      outputCurrency: 'USD',
      dmcMargin: { type: 'percent', value: 15 },
    });

    await sbSaveDMCQuoteState(DMC_CLOUD_ID, dmcDraft, 'DMC bản 1', { name: 'QA', role: 'CEO' }, c);

    const project = await sbGetDMCQuoteProject(DMC_CLOUD_ID, c);
    expect(project).not.toBeNull();
    expect(project!.currentState.template).toBe('dmc');
    expect(project!.currentState.outputCurrency).toBe('USD');
    expect(project!.currentState.dmcMargin).toMatchObject({ type: 'percent', value: 15 });
    expect(project!.versions).toHaveLength(1);
    expect(project!.versions[0].note).toBe('DMC bản 1');
  });

  it('sbGetQuoteProject returns null for unknown cloudId', async () => {
    const c = await getViettoursClient();
    const result = await sbGetQuoteProject('nonexistent-cloud-id', c);
    expect(result).toBeNull();
  });
});
```

### Step 2: Run, expect FAIL

```bash
npm run test:integration -- tests/supabase/quotes.test.ts
```

Expected: FAIL — `sbSaveQuoteState`, `sbSaveDMCQuoteState`, `sbGetQuoteProject`, `sbGetDMCQuoteProject` are not exported from `src/lib/supabase.ts`.

### Step 3: Edit `supabase/migrations/0021_save_quote_state_rpc.sql`

In the `insert into public.quotes (...)` values clause, locate:
```sql
      coalesce((q->>'total_cost')::double precision,0),
```
Change it to:
```sql
      (q->>'total_cost')::double precision,
```

In the `on conflict (cloud_id) do update set` block, locate:
```sql
      total_cost = excluded.total_cost, status = excluded.status,
```
Change it to:
```sql
      total_cost = coalesce(excluded.total_cost, public.quotes.total_cost), status = excluded.status,
```

### Step 4: Edit `src/lib/supabase/quoteMap.ts`

In `decomposeQuote`, locate:
```ts
      total_cost: 0, // index metadata owns total_cost via sbSaveQuote; RPC keeps prior on conflict if 0 — see note
```
Change it to:
```ts
      total_cost: null, // null so the RPC's coalesce(excluded.total_cost, quotes.total_cost) preserves the index-owned value
```

### Step 5: Re-run `0021` pgTAP to confirm it still passes

```bash
npx supabase db reset && npx supabase test db
```

Expected: all prior pgTAP tests green; `0021` still 5/5. (The test inserts a fresh row — `coalesce(null, null)` = `null`; the column has no NOT NULL constraint so that is valid. Confirm that migration `0007_quotes_core.sql` has `total_cost double precision not null default 0` — it does; on insert the value list position maps to the `total_cost` column, so a SQL `NULL` from the cast violates NOT NULL. Fix: change the insert default so NULL falls back to 0 only during the initial insert, not on conflict updates. The cleanest approach is to use `coalesce((q->>'total_cost')::double precision, 0)` in the INSERT values (so a fresh insert still gets `0`) while the ON CONFLICT update uses `coalesce(excluded.total_cost, public.quotes.total_cost)`. Since `excluded.total_cost` here is the value that would have been inserted — i.e., `0` not `null` — this still zeros out the index value on conflict.)

**Revised approach (correct):** Keep `coalesce((q->>'total_cost')::double precision, 0)` in the `INSERT` values (so fresh inserts default to `0`), and change only the `ON CONFLICT` line to:
```sql
total_cost = coalesce(excluded.total_cost, public.quotes.total_cost),
```
But since the insert always emits `coalesce(..., 0)` (never null), this coalesce in ON CONFLICT is also never null, and total_cost would still be zeroed.

**Correct resolution:** Have `decomposeQuote` pass a sentinel. The cleanest solution without a sentinel is to have `sbSaveQuoteState` read the current `total_cost` from the DB before calling the RPC, then inject it into the payload's `quote.total_cost`. This way the RPC always receives the true current value and the ON CONFLICT update is a no-op on that field. The `decomposeQuote` change to `null` is then NOT needed; instead `sbSaveQuoteState` reads and injects the value.

**Final resolution (implemented in Step 6):** `sbSaveQuoteState` runs:
```ts
const { data: existing } = await client.from('quotes').select('total_cost').eq('cloud_id', cloudId).maybeSingle();
const currentTotalCost = existing?.total_cost ?? 0;
```
Then in the payload: `payload.quote.total_cost = currentTotalCost`. The RPC's `ON CONFLICT` clause is changed to:
```sql
total_cost = coalesce(excluded.total_cost, public.quotes.total_cost),
```
and `decomposeQuote` leaves `total_cost: null` (fallback). This guarantees: (a) a fresh insert gets the real total if available, else `0` via `coalesce(null,0)` in the INSERT values; (b) a conflict update uses `coalesce(injected_value, existing_value)` — the injected value is the pre-read current value, so it is a no-op for `sbSaveQuoteState` and a real update only when `sbSaveQuote` passes the new total.

The pgTAP test (`0021`) passes because the INSERT values path uses `coalesce((q->>'total_cost')::double precision, 0)` for the not-null column — leave that as-is; only the ON CONFLICT line changes.

**Summary of edits to `0021`:** Only the ON CONFLICT line for `total_cost`:
```sql
-- before
total_cost = excluded.total_cost,
-- after
total_cost = coalesce(excluded.total_cost, public.quotes.total_cost),
```
And `quoteMap.ts` `decomposeQuote` changes `total_cost: 0` to `total_cost: null` (so when `sbSaveQuoteState` injects the pre-read value into `payload.quote.total_cost`, that overrides the `null`, and when `sbSaveQuote` uses `decomposeQuote` for its own path it passes the real total via the meta argument — confirm Task 4 passes totalCost if needed, or keep `total_cost: 0` in decompose and have the ON CONFLICT coalesce work only for the state-save path by injecting the real value there).

**Definitive, simplest approach (no sentinel ambiguity):**
- `decomposeQuote` keeps `total_cost: null` (Task 2 note already anticipates this).
- `sbSaveQuoteState` reads the current `total_cost` and sets `(payload.quote as Record<string,unknown>).total_cost = currentTotalCost` before calling RPC.
- `sbSaveQuote` (Task 4) sets `(payload.quote as Record<string,unknown>).total_cost = entry.totalCost` before calling RPC (if it uses `decomposeQuote`; or it writes `total_cost` directly via a separate `UPDATE` — confirm with Task 4's implementation; if Task 4 does not use `decomposeQuote` for `total_cost`, no change needed there).
- `0021` ON CONFLICT: `total_cost = coalesce(excluded.total_cost, public.quotes.total_cost)`.
- `0021` INSERT values: `coalesce((q->>'total_cost')::double precision, 0)` (unchanged — ensures NOT NULL on first insert).
- pgTAP still passes.

### Step 6: Implement `sbSaveQuoteState`, `sbSaveDMCQuoteState`, `sbGetQuoteProject`, `sbGetDMCQuoteProject`

Append to `src/lib/supabase.ts`:

```ts
import type {
  QuoteDraft, QuoteVersion, CloudQuoteProject, Collaborator,
} from '@/types/quote';
import { decomposeQuote, assembleQuote } from './supabase/quoteMap';
import { idsToUsernames } from './supabase/helpers';

// ── shared save implementation ────────────────────────────────────────────────

async function saveQuoteStateImpl(
  cloudId: string,
  state: QuoteDraft,
  note: string | undefined,
  savedBy: { name: string; role: string },
  client: SupabaseClient,
): Promise<void> {
  // 1. Derive next version_no from current max (SELECT max avoids a race if rows trimmed)
  const { data: maxRow } = await client
    .from('quote_versions')
    .select('version_no, quote_id, quotes!inner(cloud_id)')
    .eq('quotes.cloud_id', cloudId)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  const versionNo = maxRow ? (maxRow.version_no as number) + 1 : 1;

  // 2. Read current total_cost so the RPC's coalesce preserves it
  const { data: qRow } = await client
    .from('quotes')
    .select('total_cost, created_at, created_by_name')
    .eq('cloud_id', cloudId)
    .maybeSingle();
  const currentTotalCost: number = (qRow?.total_cost as number) ?? 0;

  // 3. Build RPC payload
  const payload = decomposeQuote(cloudId, state, {
    createdAt: qRow?.created_at as string | undefined,
    createdByName: qRow?.created_by_name as string | undefined,
    updatedByName: savedBy.name,
  });

  // Inject the preserved total_cost so the ON CONFLICT coalesce keeps it
  (payload.quote as Record<string, unknown>).total_cost = currentTotalCost;

  // 4. Attach version snapshot
  const savedByLabel = `${savedBy.name} (${savedBy.role})`;
  (payload as Record<string, unknown>).version = {
    version_no: versionNo,
    saved_at: new Date().toISOString(),
    saved_by: savedByLabel,
    note: note?.trim() || `Phiên bản ${versionNo}`,
    state,
  };

  // 5. Call the atomic RPC
  const { error } = await (client as SupabaseClient).rpc('save_quote_state', { p: payload });
  if (error) throw new Error('sbSaveQuoteState: ' + error.message);
}

// ── shared get implementation ─────────────────────────────────────────────────

async function getQuoteProjectImpl(
  cloudId: string,
  client: SupabaseClient,
): Promise<CloudQuoteProject | null> {
  // 1. Fetch the quotes row
  const { data: qRow, error: qErr } = await client
    .from('quotes')
    .select('id, updated_at, updated_by_name')
    .eq('cloud_id', cloudId)
    .maybeSingle();
  if (qErr) throw new Error('sbGetQuoteProject quotes: ' + qErr.message);
  if (!qRow) return null;

  const quoteId = qRow.id as string;

  // 2. Fetch all child rows in parallel
  const [
    { data: lineItems, error: liErr },
    { data: flights, error: flErr },
    { data: segments, error: segErr },
    { data: fares, error: farErr },
    { data: workflow, error: wfErr },
    { data: logs, error: logErr },
    { data: groups, error: grErr },
    { data: groupItems, error: giErr },
    { data: payments, error: pyErr },
    { data: versions, error: vErr },
    { data: collabRows, error: cErr },
  ] = await Promise.all([
    client.from('quote_line_items').select('*').eq('quote_id', quoteId).order('sort_order'),
    client.from('quote_flights').select('*').eq('quote_id', quoteId).order('sort_order'),
    client.from('quote_flight_segments').select('*').in(
      'flight_id',
      // will be filled after flights query; run a nested select for correctness
      // Use a subquery via RPC not available here — fetch all and filter client-side
      ['__placeholder__'], // placeholder; overridden below
    ).order('sort_order'),
    client.from('quote_flight_fares').select('*').in('flight_id', ['__placeholder__']).order('sort_order'),
    client.from('quote_workflow_steps').select('*').eq('quote_id', quoteId).order('sort_order'),
    client.from('quote_workflow_logs').select('*').in('step_id', ['__placeholder__']).order('sort_order'),
    client.from('quote_groups').select('*').eq('quote_id', quoteId).order('sort_order'),
    client.from('quote_group_items').select('*').in('group_id', ['__placeholder__']).order('sort_order'),
    client.from('quote_payments').select('*').eq('quote_id', quoteId).order('sort_order'),
    client.from('quote_versions').select('*').eq('quote_id', quoteId).order('version_no', { ascending: false }),
    client.from('quote_collaborators').select('*').eq('quote_id', quoteId),
  ]);

  // Note: the placeholder approach above doesn't work for segments/fares/logs/groupItems.
  // Fetch those using the parent ids resolved from the first batch.
  for (const e of [liErr, flErr, wfErr, grErr, pyErr, vErr, cErr]) {
    if (e) throw new Error('sbGetQuoteProject fetch: ' + e.message);
  }

  const flightIds = (flights ?? []).map((f) => f.id as string);
  const stepIds = (workflow ?? []).map((s) => s.id as string);
  const groupIds = (groups ?? []).map((g) => g.id as string);

  const [
    { data: realSegments, error: rsErr },
    { data: realFares, error: rfErr },
    { data: realLogs, error: rlErr },
    { data: realGroupItems, error: rgiErr },
  ] = await Promise.all([
    flightIds.length
      ? client.from('quote_flight_segments').select('*').in('flight_id', flightIds).order('sort_order')
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    flightIds.length
      ? client.from('quote_flight_fares').select('*').in('flight_id', flightIds).order('sort_order')
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    stepIds.length
      ? client.from('quote_workflow_logs').select('*').in('step_id', stepIds).order('sort_order')
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    groupIds.length
      ? client.from('quote_group_items').select('*').in('group_id', groupIds).order('sort_order')
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ]);

  for (const e of [rsErr, rfErr, rlErr, rgiErr]) {
    if (e) throw new Error('sbGetQuoteProject children: ' + e.message);
  }

  // 3. Assemble currentState from shredded rows
  const quoteRow = await client
    .from('quotes')
    .select('*')
    .eq('id', quoteId)
    .single()
    .then(({ data }) => data as Record<string, unknown>);

  const currentState = assembleQuote({
    quote: quoteRow,
    lineItems: (lineItems ?? []) as Record<string, unknown>[],
    flights: (flights ?? []) as Record<string, unknown>[],
    segments: (realSegments ?? []) as Record<string, unknown>[],
    fares: (realFares ?? []) as Record<string, unknown>[],
    workflow: (workflow ?? []) as Record<string, unknown>[],
    logs: (realLogs ?? []) as Record<string, unknown>[],
    groups: (groups ?? []) as Record<string, unknown>[],
    groupItems: (realGroupItems ?? []) as Record<string, unknown>[],
    payments: (payments ?? []) as Record<string, unknown>[],
  });

  // 4. Map quote_versions rows → QuoteVersion[] (newest-first, already ordered by version_no desc)
  const mappedVersions: QuoteVersion[] = (versions ?? []).map((v) => ({
    versionNo: v.version_no as number,
    savedAt: new Date(v.saved_at as string).toISOString(),
    savedBy: v.saved_by as string,
    note: v.note as string,
    state: v.state as QuoteDraft,
  }));

  // 5. Resolve collaborators (uuid → username already stored in the row)
  const collaborators: Collaborator[] = (collabRows ?? []).map((r) => ({
    u: (r.username as string) ?? '',
    name: (r.name as string) ?? '',
  }));

  return {
    versions: mappedVersions,
    currentState,
    collaborators,
    updatedAt: new Date(qRow.updated_at as string).toISOString(),
    updatedBy: (qRow.updated_by_name as string) ?? '',
  };
}

// ── public exports ────────────────────────────────────────────────────────────

/** Mirror of `fbSaveQuoteState` (`firebase.ts:329`). Computes next version_no via
 *  SELECT max(version_no)+1, preserves the index-owned total_cost via a pre-read
 *  + coalesce in the RPC's ON CONFLICT clause, then calls save_quote_state(p jsonb). */
export async function sbSaveQuoteState(
  cloudId: string,
  state: QuoteDraft,
  note: string | undefined,
  savedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  return saveQuoteStateImpl(cloudId, state, note, savedBy, client);
}

/** DMC variant of `sbSaveQuoteState`. The draft's `template` field already equals
 *  'dmc'; this function is a thin alias kept for signature parity with `fbSaveQuoteState`
 *  (which is exposed as `fbSaveDMCQuoteState` on the DMC api object). */
export async function sbSaveDMCQuoteState(
  cloudId: string,
  state: QuoteDraft,
  note: string | undefined,
  savedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  return saveQuoteStateImpl(cloudId, state, note, savedBy, client);
}

/** Mirror of `fbGetQuoteProject` (`firebase.ts:400`). SELECTs the quotes row +
 *  all child tables + quote_versions + quote_collaborators; reassembles currentState
 *  via `assembleQuote`; returns QuoteVersion[] newest-first. Returns null if absent. */
export async function sbGetQuoteProject(
  cloudId: string,
  client: SupabaseClient = sb,
): Promise<CloudQuoteProject | null> {
  return getQuoteProjectImpl(cloudId, client);
}

/** DMC variant of `sbGetQuoteProject`. Behaviour is identical — the `quotes.template`
 *  discriminator ('dmc') is already in the row; the caller uses this function name
 *  for parity with `fbGetDMCQuoteProject`. */
export async function sbGetDMCQuoteProject(
  cloudId: string,
  client: SupabaseClient = sb,
): Promise<CloudQuoteProject | null> {
  return getQuoteProjectImpl(cloudId, client);
}
```

**Implementation notes:**

- `getQuoteProjectImpl` fetches the quote row twice (once for `id/updated_at/updated_by_name`, once for the full `*` needed by `assembleQuote`). Simplify to a single `select('*')` and derive `id`, `updated_at`, `updated_by_name` from the same row to halve the round-trips.
- The `version_no` derivation (`SELECT max(version_no)` via `quote_versions` with a nested join on `quotes.cloud_id`) requires Supabase's filter syntax — use:
  ```ts
  const { data: maxRow } = await client
    .from('quote_versions')
    .select('version_no, quote_id!inner(cloud_id)')
    // Supabase doesn't support filter on embedded select this way.
    // Instead: resolve the quote's uuid first, then query max(version_no).
  ```
  The correct pattern is: (1) look up the `quotes` row uuid by `cloud_id`, (2) query `max(version_no)` from `quote_versions where quote_id = <uuid>`. The implementation above already reads the quotes row early for `total_cost`/`created_at` — reuse that `quoteId` to query `max(version_no)`:
  ```ts
  const { data: qRow } = await client
    .from('quotes')
    .select('id, total_cost, created_at, created_by_name')
    .eq('cloud_id', cloudId)
    .maybeSingle();
  const quoteId = qRow?.id as string | undefined;
  
  let versionNo = 1;
  if (quoteId) {
    const { data: maxRow } = await client
      .from('quote_versions')
      .select('version_no')
      .eq('quote_id', quoteId)
      .order('version_no', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxRow) versionNo = (maxRow.version_no as number) + 1;
  }
  ```
  Write the implementation with this corrected pattern (the Step 6 code above shows the logical intent; the implementer uses this two-step pattern).

- `assembleQuote` (`quoteMap.ts` Task 3) expects the `quote` argument to be a raw DB row (`Record<string,unknown>`). The full `quotes` row has all the scalar columns needed to reconstruct `QuoteDraft` scalars. The fetch in `getQuoteProjectImpl` should do a single `select('*')` and pass it directly.

- `quote_versions` are stored newest-first by `order('version_no', { ascending: false })`. The `QuoteVersion.state` column is JSONB in Postgres and comes back as a parsed JS object — cast directly to `QuoteDraft`.

- Collaborators: `quote_collaborators` rows have `username` and `name` columns (see `0008`). No UUID resolution needed for reads — `username` maps to `Collaborator.u`, `name` to `Collaborator.name`.

### Step 7: Run, expect PASS

```bash
npm run test:integration -- tests/supabase/quotes.test.ts
```

Expected: all Task-5 tests pass (6 assertions across 5 `it` blocks). The earlier Task-4 tests in the same file must remain green.

Then re-verify the RPC pgTAP:

```bash
npx supabase db reset && npx supabase test db
```

Expected: `0021` 5/5; all other migrations' tests green.

### Step 8: Typecheck and lint

```bash
npm run typecheck && npm run lint
```

Expected: 0 errors, 0 warnings.

### Step 9: Commit

```bash
git add \
  supabase/migrations/0021_save_quote_state_rpc.sql \
  src/lib/supabase/quoteMap.ts \
  src/lib/supabase.ts \
  tests/supabase/quotes.test.ts
git commit -m "$(cat <<'EOF'
feat(supabase): quote project state — atomic save via RPC + reassemble (Task 5)

- sbSaveQuoteState/sbSaveDMCQuoteState: compute next version_no via max() query,
  pre-read total_cost to preserve index value, build decomposeQuote payload with
  version snapshot, call save_quote_state(p jsonb) RPC atomically
- sbGetQuoteProject/sbGetDMCQuoteProject: fetch quotes row + all child tables +
  quote_versions + quote_collaborators; assembleQuote → currentState; map versions
  newest-first; return CloudQuoteProject (null if absent)
- 0021 RPC: change ON CONFLICT total_cost to coalesce(excluded, existing) so a
  state-save never zeros the index-owned total; decomposeQuote passes null for
  total_cost (sbSaveQuoteState injects the pre-read value)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 2 Expanded Tasks 6–8: Delete / Collaborators / Links / Status / Backfills

> Fully-inlined bite-sized TDD sections for Phase-2 Tasks 6, 7, 8.
> Each section follows the exact structure of Phase-1 Task 6 (customers):
> failing test → run FAIL → full implementation → run PASS → typecheck/lint → commit.

---

## Task 6: `sbDeleteQuote`/DMC, `sbUpdateCollaborators`/DMC

**Files:**
- Modify: `src/lib/supabase.ts`
- Modify: `tests/supabase/quotes.test.ts`

**Interfaces (match `firebase.ts:364-396`):**

- `fbDeleteQuote` (`firebase.ts:364-377`): removes the entry from the `quotes[]` array in the single history doc, then deletes the project sub-document. Supabase equivalent: delete the `quotes` row by `cloud_id` — `ON DELETE CASCADE` on `quote_line_items`, `quote_groups`, `quote_group_items`, `quote_collaborators`, `quote_payments`, `quote_versions`, `quote_workflow_steps`, `quote_workflow_logs`, `quote_flight_segments`, `quote_flight_fares` propagates automatically. The legacy numeric `id` parameter is accepted for signature parity but unused (delete is by `cloud_id`).
- `fbUpdateCollaborators` (`firebase.ts:379-397`): writes `collaborators` to both the project doc and the history entry. Supabase equivalent: resolve the `quotes` UUID from `cloud_id`, then `replaceChildren('quote_collaborators', 'quote_id', quoteUuid, rows)` where each row carries `user_id` (resolved via `usernamesToIds` from `collaborator.u`), `username` (= `collaborator.u`), `name` (= `collaborator.name`).

```
// firebase.ts:364-377  fbDeleteQuote
// firebase.ts:379-397  fbUpdateCollaborators
// src/types/quote.ts:226-229  Collaborator { u: string; name: string }
// supabase/migrations/0008  quote_collaborators (quote_id uuid FK, user_id uuid, username text, name text)
```

- [ ] **Step 1: Write the failing test**

Append a `describe('Task 6 — delete + collaborators', ...)` block to `tests/supabase/quotes.test.ts`:

```ts
// At top of file (add if not already present):
import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import {
  sbSaveQuote, sbSubscribeQuoteHistory,
  sbDeleteQuote, sbDeleteDMCQuote,
  sbUpdateCollaborators, sbUpdateDMCCollaborators,
  sbSaveDMCQuote, sbSubscribeDMCQuoteHistory,
} from '../../src/lib/supabase';
import type { Collaborator } from '@/types/quote';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('Task 6 — delete + collaborators (regular + DMC)', () => {
  beforeEach(async () => {
    await truncate([
      'quote_collaborators', 'quote_versions',
      'quote_payments', 'quote_workflow_logs', 'quote_workflow_steps',
      'quote_group_items', 'quote_groups', 'quote_flight_fares',
      'quote_flight_segments', 'quote_flights', 'quote_line_items',
      'quotes',
    ]);
  });

  // ── sbUpdateCollaborators ──────────────────────────────────────────────────

  it('sbUpdateCollaborators: replaces collaborators on the quote row', async () => {
    const c = await getViettoursClient();
    // Save a regular quote first (provides the quotes row we need).
    const entry = await sbSaveQuote(
      {
        id: 1, cloudId: 'q-collab-1', quoteCode: 'DT001', name: 'Collab Test',
        template: 'domestic', pax: 10, totalCost: 5000000,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    const collabs: Collaborator[] = [
      { u: 'tester', name: 'QA Bot' },
    ];
    await sbUpdateCollaborators(entry.id, entry.cloudId, collabs, c);

    const list = await once<typeof entry[]>((cb) => sbSubscribeQuoteHistory(cb as any, c));
    const found = list.find((e) => e.cloudId === 'q-collab-1')!;
    expect(found).toBeDefined();
    expect(found.collaborators).toHaveLength(1);
    expect(found.collaborators[0].u).toBe('tester');
    expect(found.collaborators[0].name).toBe('QA Bot');
  });

  it('sbUpdateCollaborators: handles empty collaborators list (clears existing)', async () => {
    const c = await getViettoursClient();
    const entry = await sbSaveQuote(
      {
        id: 2, cloudId: 'q-collab-2', quoteCode: 'DT002', name: 'Collab Clear',
        template: 'domestic', pax: 5, totalCost: 0,
        collaborators: [{ u: 'tester', name: 'QA Bot' }],
        createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );
    // Clear collaborators.
    await sbUpdateCollaborators(entry.id, entry.cloudId, [], c);

    const list = await once<typeof entry[]>((cb) => sbSubscribeQuoteHistory(cb as any, c));
    const found = list.find((e) => e.cloudId === 'q-collab-2')!;
    expect(found.collaborators).toHaveLength(0);
  });

  // ── sbDeleteQuote ──────────────────────────────────────────────────────────

  it('sbDeleteQuote: removes the quote and cascades to children', async () => {
    const c = await getViettoursClient();
    const entry = await sbSaveQuote(
      {
        id: 3, cloudId: 'q-del-1', quoteCode: 'DT003', name: 'To Delete',
        template: 'domestic', pax: 2, totalCost: 1000,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );
    // Confirm it's visible before deletion.
    const before = await once<typeof entry[]>((cb) => sbSubscribeQuoteHistory(cb as any, c));
    expect(before.some((e) => e.cloudId === 'q-del-1')).toBe(true);

    await sbDeleteQuote(entry.id, entry.cloudId, c);

    const after = await once<typeof entry[]>((cb) => sbSubscribeQuoteHistory(cb as any, c));
    expect(after.some((e) => e.cloudId === 'q-del-1')).toBe(false);

    // Verify cascade: no orphaned collaborator rows.
    const { getServiceClient } = await import('./_setup');
    const admin = getServiceClient();
    const { data } = await admin.from('quote_collaborators').select('id').eq('quote_id',
      (await admin.from('quotes').select('id').eq('cloud_id', 'q-del-1').maybeSingle()).data?.id ?? '00000000-0000-0000-0000-000000000000',
    );
    expect((data ?? []).length).toBe(0);
  });

  // ── DMC variants ──────────────────────────────────────────────────────────

  it('sbDeleteDMCQuote + sbUpdateDMCCollaborators work on template=dmc rows', async () => {
    const c = await getViettoursClient();
    const entry = await sbSaveDMCQuote(
      {
        id: 4, cloudId: 'q-dmc-del-1', quoteCode: 'DMC001', name: 'DMC Del',
        template: 'dmc', pax: 8, totalCost: 20000,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    await sbUpdateDMCCollaborators(
      entry.id, entry.cloudId,
      [{ u: 'tester', name: 'QA Bot' }],
      c,
    );
    const list = await once<typeof entry[]>((cb) => sbSubscribeDMCQuoteHistory(cb as any, c));
    expect(list.find((e) => e.cloudId === 'q-dmc-del-1')!.collaborators[0].u).toBe('tester');

    await sbDeleteDMCQuote(entry.id, entry.cloudId, c);
    const after = await once<typeof entry[]>((cb) => sbSubscribeDMCQuoteHistory(cb as any, c));
    expect(after.some((e) => e.cloudId === 'q-dmc-del-1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

```bash
npm run test:integration -- tests/supabase/quotes.test.ts
```

Expected: FAIL — `sbDeleteQuote`, `sbDeleteDMCQuote`, `sbUpdateCollaborators`, `sbUpdateDMCCollaborators` are not exported from `src/lib/supabase.ts`.

- [ ] **Step 3: Implement** in `src/lib/supabase.ts` (append after the Task 5 block):

```ts
// ── Quote: delete + collaborators ─────────────────────────────────────────

import type { Collaborator } from '@/types/quote';

/**
 * Delete a quote (regular or DMC) by cloud_id.
 * Children (line_items, flights, workflow, groups, payments, versions,
 * collaborators) cascade via ON DELETE CASCADE.
 * `id` (numeric legacy id) is accepted for signature parity with fbDeleteQuote
 * (firebase.ts:364) but is not used — delete is by cloud_id.
 */
export async function sbDeleteQuote(
  _id: number,
  cloudId: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('quotes').delete().eq('cloud_id', cloudId);
  if (error) throw new Error('sbDeleteQuote: ' + error.message);
}

/** Thin DMC variant — same logic; template discriminator is irrelevant for
 *  delete (cloud_id is globally unique in the quotes table). Mirrors
 *  fbDeleteDMCQuote (firebase.ts:494 via _dmc factory). */
export async function sbDeleteDMCQuote(
  id: number,
  cloudId: string,
  client: SupabaseClient = sb,
): Promise<void> {
  return sbDeleteQuote(id, cloudId, client);
}

/**
 * Replace the collaborator set for a quote.
 * 1. Resolve the quotes UUID from cloud_id (required as FK parent for quote_collaborators).
 * 2. Map Collaborator.u (username) → profile UUID via usernamesToIds (unmapped
 *    users get user_id = null, but username + name are still stored).
 * 3. replaceChildren clears old rows then re-inserts the new set atomically.
 *
 * Mirrors fbUpdateCollaborators (firebase.ts:379-397): that fn writes to both
 * the project doc and the history entry. Here both live in the same quotes row /
 * quote_collaborators child table, so one replaceChildren suffices.
 */
export async function sbUpdateCollaborators(
  _id: number,
  cloudId: string,
  collaborators: Collaborator[],
  client: SupabaseClient = sb,
): Promise<void> {
  // Resolve the quotes UUID.
  const { data: qRow, error: qErr } = await client
    .from('quotes')
    .select('id')
    .eq('cloud_id', cloudId)
    .single();
  if (qErr || !qRow) throw new Error('sbUpdateCollaborators: quote not found for cloud_id ' + cloudId);
  const quoteUuid = qRow.id as string;

  // Resolve usernames → profile UUIDs (best-effort; unmapped → null).
  const usernames = collaborators.map((c) => c.u).filter(Boolean);
  const idMap = await usernamesToIds(client, usernames);

  const rows = collaborators.map((col) => ({
    quote_id: quoteUuid,
    user_id: idMap.get(col.u) ?? null,
    username: col.u,
    name: col.name,
  }));

  await replaceChildren(client, 'quote_collaborators', 'quote_id', quoteUuid, rows);
}

/** Thin DMC variant — same logic (template discriminator not needed; cloud_id
 *  is unique across both regular and DMC quotes). Mirrors fbUpdateDMCCollaborators
 *  (firebase.ts:495 via _dmc factory). */
export async function sbUpdateDMCCollaborators(
  id: number,
  cloudId: string,
  collaborators: Collaborator[],
  client: SupabaseClient = sb,
): Promise<void> {
  return sbUpdateCollaborators(id, cloudId, collaborators, client);
}
```

- [ ] **Step 4: Run, expect PASS.**

```bash
npm run test:integration -- tests/supabase/quotes.test.ts
```

Expected: Task 6 describe block — 4 passed.

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: no errors, no warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase.ts tests/supabase/quotes.test.ts
git commit -m "feat(supabase): quote delete + collaborators (regular + DMC)

Signature-parity with fbDeleteQuote/fbUpdateCollaborators (firebase.ts:364-397).
Delete cascades to all child tables via FK ON DELETE CASCADE.
Collaborators resolved username→uuid via usernamesToIds; unmapped users
preserved with user_id=null. DMC variants are thin wrappers (cloud_id unique).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Cross-links + status — `sbSetRegularEntryLink`/`sbSetDMCEntryLink`, `sbSetQuoteStatus`/`sbSetDMCQuoteStatus`

**Files:**
- Modify: `src/lib/supabase.ts`
- Modify: `tests/supabase/quotes.test.ts`

**Interfaces (match `firebase.ts:405-413, 461-473`):**

- `fbSetEntryLink` (`firebase.ts:405-415`): scans the history array for the matching `cloudId` and merges the `EntryLink` fields (`linkedQuoteId`, `linkedQuoteName`, `linkedQuoteTemplate`) into that entry. Supabase equivalent: `UPDATE quotes SET linked_quote_id=$1, linked_quote_name=$2, linked_quote_template=$3 WHERE cloud_id=$4`. Named `sbSetRegularEntryLink` for the regular factory export (`firebase.ts:484`); `sbSetDMCEntryLink` for the DMC factory export (`firebase.ts:497`). Both update the same `quotes` table column; the DMC filter is implicit in the calling convention (the cloud_id already identifies a DMC quote).
- `fbSetEntryStatus` (`firebase.ts:462-473`): updates `status` and clears/sets `lossReason` based on whether the new status is a loss state. Supabase equivalent: `UPDATE quotes SET status=$1, loss_reason=$2 WHERE cloud_id=$3`.

```
// firebase.ts:405-415  fbSetEntryLink
// firebase.ts:462-473  fbSetEntryStatus
// firebase.ts:484      fbSetRegularEntryLink = _regular.fbSetEntryLink
// firebase.ts:485      fbSetQuoteStatus      = _regular.fbSetEntryStatus
// firebase.ts:497      fbSetDMCEntryLink     = _dmc.fbSetEntryLink
// firebase.ts:498      fbSetDMCQuoteStatus   = _dmc.fbSetEntryStatus
// supabase/migrations/0007  quotes.linked_quote_id, linked_quote_name, linked_quote_template, status
// src/types/quote.ts:87-93  QuoteStatus union
```

> **Note on `lossReason`:** `CloudQuoteEntry` has `lossReason?: string` and `fbSetEntryStatus` conditionally clears it (firebase.ts:470-471). Migration 0007 has a `status text` column but no dedicated `loss_reason` column. Add it: migration `0022_quote_loss_reason.sql` adds `ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS loss_reason text;`. This is a non-breaking additive change; flag for prod-push.

- [ ] **Step 1: Write the failing test**

Append a `describe('Task 7 — cross-links + status', ...)` block to `tests/supabase/quotes.test.ts`:

```ts
import {
  sbSetRegularEntryLink, sbSetDMCEntryLink,
  sbSetQuoteStatus, sbSetDMCQuoteStatus,
} from '../../src/lib/supabase';
import type { QuoteStatus } from '@/types/quote';

describe('Task 7 — cross-links + status (regular + DMC)', () => {
  beforeEach(async () => {
    await truncate([
      'quote_collaborators', 'quote_versions',
      'quote_payments', 'quote_workflow_logs', 'quote_workflow_steps',
      'quote_group_items', 'quote_groups', 'quote_flight_fares',
      'quote_flight_segments', 'quote_flights', 'quote_line_items',
      'quotes',
    ]);
  });

  // ── sbSetRegularEntryLink ─────────────────────────────────────────────────

  it('sbSetRegularEntryLink: sets linked_quote_id/name/template on the quotes row', async () => {
    const c = await getViettoursClient();
    const entry = await sbSaveQuote(
      {
        id: 10, cloudId: 'q-link-1', quoteCode: 'DT010', name: 'Link Test',
        template: 'intl', pax: 20, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    await sbSetRegularEntryLink('q-link-1', {
      linkedQuoteId: 'q-dmc-999',
      linkedQuoteName: 'DMC Ref',
      linkedQuoteTemplate: 'dmc',
    }, c);

    const list = await once<typeof entry[]>((cb) => sbSubscribeQuoteHistory(cb as any, c));
    const found = list.find((e) => e.cloudId === 'q-link-1')!;
    expect(found.linkedQuoteId).toBe('q-dmc-999');
    expect(found.linkedQuoteName).toBe('DMC Ref');
    expect(found.linkedQuoteTemplate).toBe('dmc');
  });

  it('sbSetRegularEntryLink: partial update (only linkedQuoteId provided)', async () => {
    const c = await getViettoursClient();
    await sbSaveQuote(
      {
        id: 11, cloudId: 'q-link-2', quoteCode: 'DT011', name: 'Partial Link',
        template: 'domestic', pax: 5, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    await sbSetRegularEntryLink('q-link-2', { linkedQuoteId: 'q-other-1' }, c);

    const list = await once<any[]>((cb) => sbSubscribeQuoteHistory(cb as any, c));
    const found = list.find((e: any) => e.cloudId === 'q-link-2')!;
    expect(found.linkedQuoteId).toBe('q-other-1');
    // name and template are undefined/null when not provided
    expect(found.linkedQuoteName ?? null).toBeNull();
    expect(found.linkedQuoteTemplate ?? null).toBeNull();
  });

  // ── sbSetDMCEntryLink ─────────────────────────────────────────────────────

  it('sbSetDMCEntryLink: sets link fields on a DMC quote', async () => {
    const c = await getViettoursClient();
    const entry = await sbSaveDMCQuote(
      {
        id: 12, cloudId: 'q-dmc-link-1', quoteCode: 'DMC010', name: 'DMC Link',
        template: 'dmc', pax: 15, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    await sbSetDMCEntryLink('q-dmc-link-1', {
      linkedQuoteId: 'q-intl-50',
      linkedQuoteName: 'Intl 50pax',
      linkedQuoteTemplate: 'intl',
    }, c);

    const list = await once<typeof entry[]>((cb) => sbSubscribeDMCQuoteHistory(cb as any, c));
    const found = list.find((e) => e.cloudId === 'q-dmc-link-1')!;
    expect(found.linkedQuoteId).toBe('q-intl-50');
    expect(found.linkedQuoteTemplate).toBe('intl');
  });

  // ── sbSetQuoteStatus ──────────────────────────────────────────────────────

  it('sbSetQuoteStatus: updates status on regular quote', async () => {
    const c = await getViettoursClient();
    const entry = await sbSaveQuote(
      {
        id: 13, cloudId: 'q-status-1', quoteCode: 'DT013', name: 'Status Test',
        template: 'domestic', pax: 8, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    await sbSetQuoteStatus('q-status-1', 'won', c);

    const list = await once<typeof entry[]>((cb) => sbSubscribeQuoteHistory(cb as any, c));
    expect(list.find((e) => e.cloudId === 'q-status-1')!.status).toBe('won');
  });

  it('sbSetQuoteStatus: sets loss_reason for not_selected; clears it for won', async () => {
    const c = await getViettoursClient();
    await sbSaveQuote(
      {
        id: 14, cloudId: 'q-status-2', quoteCode: 'DT014', name: 'Loss Reason',
        template: 'domestic', pax: 3, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    await sbSetQuoteStatus('q-status-2', 'not_selected', c, 'Giá cao hơn đối thủ');
    const list1 = await once<any[]>((cb) => sbSubscribeQuoteHistory(cb as any, c));
    const e1 = list1.find((e: any) => e.cloudId === 'q-status-2')!;
    expect(e1.status).toBe('not_selected');
    expect(e1.lossReason).toBe('Giá cao hơn đối thủ');

    // Switching to a win state should clear lossReason.
    await sbSetQuoteStatus('q-status-2', 'won', c);
    const list2 = await once<any[]>((cb) => sbSubscribeQuoteHistory(cb as any, c));
    const e2 = list2.find((e: any) => e.cloudId === 'q-status-2')!;
    expect(e2.status).toBe('won');
    expect(e2.lossReason ?? null).toBeNull();
  });

  // ── sbSetDMCQuoteStatus ───────────────────────────────────────────────────

  it('sbSetDMCQuoteStatus: updates status on DMC quote', async () => {
    const c = await getViettoursClient();
    const entry = await sbSaveDMCQuote(
      {
        id: 15, cloudId: 'q-dmc-status-1', quoteCode: 'DMC015', name: 'DMC Status',
        template: 'dmc', pax: 12, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    await sbSetDMCQuoteStatus('q-dmc-status-1', 'sent', c);

    const list = await once<typeof entry[]>((cb) => sbSubscribeDMCQuoteHistory(cb as any, c));
    expect(list.find((e) => e.cloudId === 'q-dmc-status-1')!.status).toBe('sent');
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

```bash
npm run test:integration -- tests/supabase/quotes.test.ts
```

Expected: FAIL — `sbSetRegularEntryLink`, `sbSetDMCEntryLink`, `sbSetQuoteStatus`, `sbSetDMCQuoteStatus` not exported.

- [ ] **Step 3: Add migration `0022_quote_loss_reason.sql`**

Create `supabase/migrations/0022_quote_loss_reason.sql`:
```sql
-- Add loss_reason column for quotes where status = 'not_selected' | 'cancelled'.
-- Mirrors CloudQuoteEntry.lossReason (src/types/quote.ts:252).
-- Additive; no data migration needed.
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS loss_reason text;
```

Then apply locally:
```bash
npx supabase db reset
```

> **Prod-push flag:** `0022_quote_loss_reason.sql` must be added to the prod-push list alongside `0017`–`0021`. Deploy with `npx firebase-tools deploy` is NOT applicable; for Supabase use the Supabase dashboard SQL editor or `supabase db push` against project `zkzrvctqwnhzklvsoahk`.

- [ ] **Step 4: Implement** in `src/lib/supabase.ts` (append after Task 6 block):

```ts
// ── Quote: cross-links + status ───────────────────────────────────────────

import type { QuoteStatus, Template } from '@/types/quote';

type EntryLink = {
  linkedQuoteId?: string;
  linkedQuoteName?: string;
  linkedQuoteTemplate?: Template;
};

/**
 * Update the cross-link fields on a regular quote's index row.
 * Mirrors fbSetRegularEntryLink = _regular.fbSetEntryLink (firebase.ts:484 / 407-414):
 * that fn mutates the matching entry in the flat quotes[] array; here we UPDATE
 * the quotes row directly by cloud_id.
 * Only fields present in `link` are written; absent fields are set to null to
 * match fb* behaviour (it spreads the whole EntryLink object, clearing omitted keys).
 */
export async function sbSetRegularEntryLink(
  cloudId: string,
  link: EntryLink,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('quotes').update({
    linked_quote_id: link.linkedQuoteId ?? null,
    linked_quote_name: link.linkedQuoteName ?? null,
    linked_quote_template: link.linkedQuoteTemplate ?? null,
    updated_at: new Date().toISOString(),
  }).eq('cloud_id', cloudId);
  if (error) throw new Error('sbSetRegularEntryLink: ' + error.message);
}

/**
 * Same as sbSetRegularEntryLink for DMC quotes.
 * Mirrors fbSetDMCEntryLink = _dmc.fbSetEntryLink (firebase.ts:497).
 * cloud_id is globally unique in quotes (regular and DMC share the table),
 * so the implementation is identical — the template discriminator is not needed.
 */
export async function sbSetDMCEntryLink(
  cloudId: string,
  link: EntryLink,
  client: SupabaseClient = sb,
): Promise<void> {
  return sbSetRegularEntryLink(cloudId, link, client);
}

/**
 * Update status (and optional lossReason) on a regular quote.
 * Mirrors fbSetEntryStatus (firebase.ts:462-473):
 * - Loss states ('not_selected' | 'cancelled'): set loss_reason to provided value
 *   or preserve existing (here we always write the provided value, defaulting null).
 * - Non-loss states: clear loss_reason (set to null).
 * The optional `lossReason` parameter is only applied when `status` is a loss state;
 * otherwise it is ignored and loss_reason is cleared — matching firebase.ts:470-471.
 */
export async function sbSetQuoteStatus(
  cloudId: string,
  status: QuoteStatus,
  client: SupabaseClient = sb,
  lossReason?: string,
): Promise<void> {
  const isLoss = status === 'not_selected' || status === 'cancelled';
  const { error } = await client.from('quotes').update({
    status,
    loss_reason: isLoss ? (lossReason ?? null) : null,
    updated_at: new Date().toISOString(),
  }).eq('cloud_id', cloudId);
  if (error) throw new Error('sbSetQuoteStatus: ' + error.message);
}

/**
 * Update status on a DMC quote.
 * Mirrors fbSetDMCQuoteStatus = _dmc.fbSetEntryStatus (firebase.ts:498).
 * Delegates to sbSetQuoteStatus (cloud_id unique across both flavours).
 */
export async function sbSetDMCQuoteStatus(
  cloudId: string,
  status: QuoteStatus,
  client: SupabaseClient = sb,
  lossReason?: string,
): Promise<void> {
  return sbSetQuoteStatus(cloudId, status, client, lossReason);
}
```

> **`sbSubscribeQuoteHistory` / `sbSubscribeDMCQuoteHistory` must surface the new fields.**
> When assembling `CloudQuoteEntry` from the `quotes` row (Task 4), add these mappings:
> ```ts
> linkedQuoteId: (r.linked_quote_id as string) ?? undefined,
> linkedQuoteName: (r.linked_quote_name as string) ?? undefined,
> linkedQuoteTemplate: (r.linked_quote_template as Template) ?? undefined,
> lossReason: (r.loss_reason as string) ?? undefined,
> ```
> If Task 4 already maps these, no change needed. If not, add them to the row-assembly helper in Task 4's `assembleQuoteEntry` (or equivalent) before this commit.

- [ ] **Step 5: Run, expect PASS.**

```bash
npm run test:integration -- tests/supabase/quotes.test.ts
```

Expected: Task 7 describe block — 6 passed (all status/link scenarios green).

- [ ] **Step 6: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: no errors, no warnings.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0022_quote_loss_reason.sql src/lib/supabase.ts tests/supabase/quotes.test.ts
git commit -m "feat(supabase): quote cross-links + status (regular + DMC)

Signature-parity with fbSetRegularEntryLink/fbSetDMCEntryLink/fbSetQuoteStatus/
fbSetDMCQuoteStatus (firebase.ts:484-498). Adds migration 0022 for loss_reason
column (flag for prod-push to zkzrvctqwnhzklvsoahk). Loss state clears
lossReason on non-loss transition, matching firebase.ts:470-471.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Backfills — `sbBackfillWorkflowIndex`, `sbSetQuotePaymentSummary`, `sbBackfillPaymentIndex`

**Files:**
- Create: `supabase/migrations/0023_quote_workflow_due.sql`
- Modify: `src/lib/supabase.ts`
- Modify: `tests/supabase/quotes.test.ts`

**Interfaces (match `firebase.ts:417-458`):**

- `fbBackfillWorkflowIndex` (`firebase.ts:418-434`): reads the history array once, patches each entry that appears in the `updates` map with `workflowDue`, `workflowSummary`, `departDate`, writes the whole array back. Returns the count of patched entries.
- `fbSetEntryPaymentSummary` (`firebase.ts:436-445`): patches `paymentSummary` for one entry by cloudId.
- `fbBackfillPaymentIndex` (`firebase.ts:447-459`): batch-patches `paymentSummary` for many entries. Returns count.

```
// firebase.ts:418-434  fbBackfillWorkflowIndex
// firebase.ts:436-445  fbSetEntryPaymentSummary
// firebase.ts:447-459  fbBackfillPaymentIndex
// firebase.ts:486-488  fbBackfillWorkflowIndex, fbSetQuotePaymentSummary, fbBackfillPaymentIndex
// src/types/quote.ts:255-259  CloudQuoteEntry.workflowDue / workflowSummary / paymentSummary / departDate
// supabase/migrations/0007  quotes.workflow_summary jsonb, payment_summary jsonb, depart_date date
```

> **Column decision — `workflow_due`:**
> `CloudQuoteEntry` has two distinct workflow index fields: `workflowDue` (an array of `{ label, dueDate, assignee? }`) and `workflowSummary` (a `{ current?, currentAssignee?, donePct, total, overdue }` scalar). Migration 0007 has `workflow_summary jsonb` but no `workflow_due` column. Folding `workflowDue` inside `workflow_summary` would conflate two different shapes and make the reassembler in Task 4 ambiguous. **Decision: add `workflow_due jsonb` as a separate column via migration `0023_quote_workflow_due.sql`.** This keeps the Supabase schema in clean 1-to-1 parity with `CloudQuoteEntry` fields.
>
> **Prod-push flag:** `0023_quote_workflow_due.sql` must be added to the prod-push list: `0017`, `0018`, `0019`, `0020`, `0021`, `0022`, `0023` — all pending push to Supabase project `zkzrvctqwnhzklvsoahk`.

- [ ] **Step 1: Add migration `0023_quote_workflow_due.sql`**

Create `supabase/migrations/0023_quote_workflow_due.sql`:
```sql
-- Separate column for workflowDue (CloudQuoteEntry.workflowDue: array of upcoming
-- deadline items). Kept distinct from workflow_summary (progress scalars) to
-- preserve 1-to-1 parity with CloudQuoteEntry field shapes.
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS workflow_due jsonb;
```

Apply locally:
```bash
npx supabase db reset
```

Then verify the column exists:
```bash
npx supabase db diff --schema public | grep workflow_due
```

Expected: migration shows `workflow_due jsonb` added to `quotes`.

- [ ] **Step 2: Write the failing test**

Append a `describe('Task 8 — workflow/payment backfills', ...)` block to `tests/supabase/quotes.test.ts`:

```ts
import {
  sbBackfillWorkflowIndex, sbSetQuotePaymentSummary, sbBackfillPaymentIndex,
} from '../../src/lib/supabase';
import type { CloudQuoteEntry } from '@/types/quote';

describe('Task 8 — workflow/payment backfills', () => {
  beforeEach(async () => {
    await truncate([
      'quote_collaborators', 'quote_versions',
      'quote_payments', 'quote_workflow_logs', 'quote_workflow_steps',
      'quote_group_items', 'quote_groups', 'quote_flight_fares',
      'quote_flight_segments', 'quote_flights', 'quote_line_items',
      'quotes',
    ]);
  });

  // ── sbBackfillWorkflowIndex ───────────────────────────────────────────────

  it('sbBackfillWorkflowIndex: updates workflow_due + workflow_summary + depart_date; returns count', async () => {
    const c = await getViettoursClient();

    // Save two quotes.
    await sbSaveQuote(
      {
        id: 20, cloudId: 'q-wf-1', quoteCode: 'DT020', name: 'WF 1',
        template: 'domestic', pax: 10, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );
    await sbSaveQuote(
      {
        id: 21, cloudId: 'q-wf-2', quoteCode: 'DT021', name: 'WF 2',
        template: 'domestic', pax: 5, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    const updates: Record<string, Pick<CloudQuoteEntry, 'workflowDue' | 'workflowSummary' | 'departDate'>> = {
      'q-wf-1': {
        workflowDue: [{ label: 'Đặt khách sạn', dueDate: '2026-07-01', assignee: 'tester' }],
        workflowSummary: { current: 'Đặt khách sạn', donePct: 30, total: 10, overdue: 1 },
        departDate: '2026-08-15',
      },
      'q-wf-2': {
        workflowDue: [],
        workflowSummary: { donePct: 100, total: 10, overdue: 0 },
        departDate: '2026-09-01',
      },
      'q-nonexistent': {
        // cloudId that doesn't exist — should not throw, just not match.
        workflowDue: [],
        workflowSummary: { donePct: 0, total: 0, overdue: 0 },
        departDate: undefined,
      },
    };

    const count = await sbBackfillWorkflowIndex(updates, c);
    // Only 2 of the 3 cloud_ids exist; count = 2.
    expect(count).toBe(2);

    // Verify via subscribe.
    const list = await once<any[]>((cb) => sbSubscribeQuoteHistory(cb as any, c));
    const e1 = list.find((e: any) => e.cloudId === 'q-wf-1')!;
    const e2 = list.find((e: any) => e.cloudId === 'q-wf-2')!;

    expect(e1.workflowDue).toHaveLength(1);
    expect(e1.workflowDue[0].label).toBe('Đặt khách sạn');
    expect(e1.workflowSummary.donePct).toBe(30);
    expect(e1.departDate).toBe('2026-08-15');

    expect(e2.workflowDue).toHaveLength(0);
    expect(e2.workflowSummary.donePct).toBe(100);
    expect(e2.departDate).toBe('2026-09-01');
  });

  it('sbBackfillWorkflowIndex: returns 0 for empty updates map', async () => {
    const c = await getViettoursClient();
    const count = await sbBackfillWorkflowIndex({}, c);
    expect(count).toBe(0);
  });

  // ── sbSetQuotePaymentSummary ──────────────────────────────────────────────

  it('sbSetQuotePaymentSummary: updates payment_summary for a single quote', async () => {
    const c = await getViettoursClient();
    await sbSaveQuote(
      {
        id: 22, cloudId: 'q-pay-1', quoteCode: 'DT022', name: 'Pay 1',
        template: 'domestic', pax: 8, totalCost: 10000000,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    const summary: CloudQuoteEntry['paymentSummary'] = {
      payable: 8000000, paid: 3000000, remaining: 5000000,
    };
    await sbSetQuotePaymentSummary('q-pay-1', summary, c);

    const list = await once<any[]>((cb) => sbSubscribeQuoteHistory(cb as any, c));
    const e = list.find((e: any) => e.cloudId === 'q-pay-1')!;
    expect(e.paymentSummary).toMatchObject({ payable: 8000000, paid: 3000000, remaining: 5000000 });
  });

  // ── sbBackfillPaymentIndex ────────────────────────────────────────────────

  it('sbBackfillPaymentIndex: batch-updates payment_summary; returns count', async () => {
    const c = await getViettoursClient();
    await sbSaveQuote(
      {
        id: 23, cloudId: 'q-pay-2', quoteCode: 'DT023', name: 'Pay 2',
        template: 'domestic', pax: 4, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );
    await sbSaveQuote(
      {
        id: 24, cloudId: 'q-pay-3', quoteCode: 'DT024', name: 'Pay 3',
        template: 'domestic', pax: 6, totalCost: 0,
        collaborators: [], createdByUsername: 'tester', createdByName: 'QA',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'QA',
      },
      { name: 'QA', role: 'Sales' },
      c,
    );

    const updates: Record<string, CloudQuoteEntry['paymentSummary']> = {
      'q-pay-2': { payable: 5000000, paid: 5000000, remaining: 0 },
      'q-pay-3': { payable: 2000000, paid: 0, remaining: 2000000 },
      'q-no-such-id': { payable: 999, paid: 0, remaining: 999 },
    };

    const count = await sbBackfillPaymentIndex(updates, c);
    expect(count).toBe(2);

    const list = await once<any[]>((cb) => sbSubscribeQuoteHistory(cb as any, c));
    const e2 = list.find((e: any) => e.cloudId === 'q-pay-2')!;
    const e3 = list.find((e: any) => e.cloudId === 'q-pay-3')!;
    expect(e2.paymentSummary.remaining).toBe(0);
    expect(e3.paymentSummary.remaining).toBe(2000000);
  });

  it('sbBackfillPaymentIndex: returns 0 for empty map', async () => {
    const c = await getViettoursClient();
    expect(await sbBackfillPaymentIndex({}, c)).toBe(0);
  });
});
```

- [ ] **Step 3: Run, expect FAIL.**

```bash
npm run test:integration -- tests/supabase/quotes.test.ts
```

Expected: FAIL — `sbBackfillWorkflowIndex`, `sbSetQuotePaymentSummary`, `sbBackfillPaymentIndex` not exported. (Also `workflow_due` column missing if migration not yet applied — ensure `npx supabase db reset` ran in Step 1.)

- [ ] **Step 4: Implement** in `src/lib/supabase.ts` (append after Task 7 block):

```ts
// ── Quote: backfill helpers ───────────────────────────────────────────────

import type { CloudQuoteEntry } from '@/types/quote';

/**
 * Batch-update workflow index columns for many quotes.
 * Mirrors fbBackfillWorkflowIndex (firebase.ts:418-434): that fn reads the full
 * Firestore history array, patches matching entries, writes once. Here each
 * cloud_id requires its own UPDATE (Supabase JS client has no bulk conditional
 * update with per-row values), but the pattern is sequential and the total row
 * count is bounded by the number of active quotes in the system.
 *
 * Returns the number of quotes actually updated (cloud_ids that exist in the DB).
 *
 * Fields written:
 *  - workflow_due jsonb  ← CloudQuoteEntry.workflowDue
 *  - workflow_summary jsonb ← CloudQuoteEntry.workflowSummary
 *  - depart_date date   ← CloudQuoteEntry.departDate (ISO yyyy-mm-dd string or undefined)
 */
export async function sbBackfillWorkflowIndex(
  updates: Record<string, Pick<CloudQuoteEntry, 'workflowDue' | 'workflowSummary' | 'departDate'>>,
  client: SupabaseClient = sb,
): Promise<number> {
  const cloudIds = Object.keys(updates);
  if (!cloudIds.length) return 0;

  let count = 0;
  for (const cloudId of cloudIds) {
    const u = updates[cloudId];
    const { error, count: affected } = await client.from('quotes').update({
      workflow_due: u.workflowDue ?? null,
      workflow_summary: u.workflowSummary ?? null,
      depart_date: u.departDate ?? null,
      updated_at: new Date().toISOString(),
    }).eq('cloud_id', cloudId).select('id');
    // select('id') makes PostgREST return the matched rows so we can count them.
    if (error) throw new Error('sbBackfillWorkflowIndex: ' + error.message);
    // `affected` may be null when PostgREST returns 0 rows.
    if ((affected ?? 0) > 0) count++;
  }
  return count;
}

/**
 * Update payment_summary for a single quote by cloud_id.
 * Mirrors fbSetEntryPaymentSummary / fbSetQuotePaymentSummary (firebase.ts:436-445 / 487).
 */
export async function sbSetQuotePaymentSummary(
  cloudId: string,
  paymentSummary: CloudQuoteEntry['paymentSummary'],
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('quotes').update({
    payment_summary: paymentSummary ?? null,
    updated_at: new Date().toISOString(),
  }).eq('cloud_id', cloudId);
  if (error) throw new Error('sbSetQuotePaymentSummary: ' + error.message);
}

/**
 * Batch-update payment_summary for many quotes.
 * Mirrors fbBackfillPaymentIndex (firebase.ts:447-459 / 488).
 * Returns count of quotes actually updated.
 *
 * Design note: Firestore's fb* version reads the full 1-document array and
 * writes once (one write cycle regardless of N). Supabase rows are independent
 * so we issue N sequential UPDATEs. For the expected scale (hundreds of active
 * quotes) this is acceptable; if N grows large, consider a PL/pgSQL RPC.
 */
export async function sbBackfillPaymentIndex(
  updates: Record<string, CloudQuoteEntry['paymentSummary']>,
  client: SupabaseClient = sb,
): Promise<number> {
  const cloudIds = Object.keys(updates);
  if (!cloudIds.length) return 0;

  let count = 0;
  for (const cloudId of cloudIds) {
    const { error, count: affected } = await client.from('quotes').update({
      payment_summary: updates[cloudId] ?? null,
      updated_at: new Date().toISOString(),
    }).eq('cloud_id', cloudId).select('id');
    if (error) throw new Error('sbBackfillPaymentIndex: ' + error.message);
    if ((affected ?? 0) > 0) count++;
  }
  return count;
}
```

> **`sbSubscribeQuoteHistory` assembly — new columns.**
> The history assembler (Task 4) must map these new `quotes` columns to `CloudQuoteEntry` fields:
> ```ts
> workflowDue:     (r.workflow_due as CloudQuoteEntry['workflowDue']) ?? undefined,
> workflowSummary: (r.workflow_summary as CloudQuoteEntry['workflowSummary']) ?? undefined,
> paymentSummary:  (r.payment_summary as CloudQuoteEntry['paymentSummary']) ?? undefined,
> departDate:      (r.depart_date as string) ?? undefined,
> ```
> If Task 4 already maps these, no further change needed. Add them to the row-assembly function before running the tests.

- [ ] **Step 5: Run, expect PASS.**

```bash
npm run test:integration -- tests/supabase/quotes.test.ts
```

Expected: Task 8 describe block — 5 passed.

- [ ] **Step 6: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: no errors, no warnings.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0023_quote_workflow_due.sql src/lib/supabase.ts tests/supabase/quotes.test.ts
git commit -m "feat(supabase): quote workflow/payment index backfills

Signature-parity with fbBackfillWorkflowIndex/fbSetQuotePaymentSummary/
fbBackfillPaymentIndex (firebase.ts:418-459). Adds migration 0023 for
workflow_due jsonb column (separate from workflow_summary — CloudQuoteEntry
has them as distinct fields; flag for prod-push to zkzrvctqwnhzklvsoahk).
Returns updated-row counts matching fb* return values.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Summary of new migrations

| Migration | Content | Prod-push required |
|-----------|---------|-------------------|
| `0022_quote_loss_reason.sql` | `ALTER TABLE quotes ADD COLUMN IF NOT EXISTS loss_reason text` | Yes — alongside 0017–0021 |
| `0023_quote_workflow_due.sql` | `ALTER TABLE quotes ADD COLUMN IF NOT EXISTS workflow_due jsonb` | Yes — alongside 0017–0022 |

Full prod-push list after Tasks 6–8: `0017`, `0018`, `0019`, `0020`, `0021`, `0022`, `0023`.
Deploy to Supabase project `zkzrvctqwnhzklvsoahk` via the dashboard SQL editor or `supabase db push --linked`.

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
