# Supabase Phase 6 — ETL + dry-run + verification harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone, idempotent Node ETL that reads a Firestore export dump (`{ singles, collections }`) and direct-inserts it into the normalized Supabase Postgres schema via the service-role client, with a verification harness proving per-table row-count/checksum parity against a committed synthetic fixture.

**Architecture:** A new `scripts/etl/` module tree of focused, single-responsibility loaders (`profiles`, `customers`, `suppliers`, `quotes`, …) orchestrated by `scripts/supabase-etl.mjs`. Identity re-keying flows through one keystone: the profiles loader creates auth users, captures their UUIDs, and returns a `username → UUID` map plus legacy-id maps (customer, supplier) that downstream loaders use to resolve FKs. Every username reference resolves through the map; unmapped references are collected and the run fails loudly at the end unless explicitly allowed (deleted-user attribution keeps the display-name string + null FK). The harness lives alongside `tests/supabase/` and runs the full ETL against the fixture into the local Docker stack.

**Tech Stack:** Node 24 ESM (`.mjs`, no build step), `@supabase/supabase-js` (already a dep), `firebase-admin` (already a dep, for the real-export path only), Vitest integration config (`vitest.integration.config.ts`), local Supabase CLI stack.

## Global Constraints

- ETL is **standalone direct-insert** — maps dump JSON to inserts via `supabase-js`; it does NOT import from `src/lib` and does NOT call the `save_quote_state` RPC (the RPC is `SECURITY INVOKER` and would attribute `created_by` to the ETL runner, not the original author).
- **Idempotent truncate-and-reload** — every run first truncates all app tables and deletes all `@viettours.com.vn` `auth.users`, so dry-run and real-run share one code path and re-runs never collide on existing auth emails.
- **Auth users:** `auth.admin.createUser({ email, email_confirm: true })`, **no password** (parity with magic-link prod).
- **Identity safety net:** unmapped usernames are collected per-run; the orchestrator throws at the end listing them all (no silent orphans) unless `ALLOW_UNMAPPED=1`. `created_by`/`updated_by` for deleted users → null FK + preserved `*_name` string.
- **Dump shape:** `{ singles: { "viettours/<docId>": <data> }, collections: { "<coll>": { "<docId>": <data> } } }` (per `scripts/firestore-export.mjs`).
- **Local stack:** API `http://127.0.0.1:54321`, DB `:54322`. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (well-known local defaults already used by `tests/supabase/_setup.ts`).
- **Target for Phase 6:** local Docker only. The real prod cloud run, deploy-secret wiring, Worker redeploy, and Firebase removal are **Phase 7 (cutover)** — out of scope here.
- Gate before any commit that touches `src/` or configs: `npm run typecheck` and `npm run lint` (zero warnings). ETL `.mjs` files are not part of the TS project but must pass `node --check`.

---

## Reference: dump → table column maps

These are the authoritative source→target mappings the loaders implement. (Schema columns from `supabase/migrations/`; dump shapes from `src/lib/firebase.ts` + `src/types/*`.)

**Identity fields per source doc** (every one resolves through the username→UUID map):

| Source doc | username-bearing fields |
|---|---|
| `user_accounts.users[]` | `.u` (the canonical username) |
| `customer_list.customers[]` | `createdBy`, `updatedBy`, `interactions[].byU`, `nextFollowUp.byU` |
| `ncc_master.suppliers[]` | `createdBy`, `updatedBy`, `ratings[].by` |
| `ncc_products.products[]` | `createdBy`, `updatedBy`, `files[].uploadedBy` |
| `contracts_master.contracts[]` | `createdBy`, `updatedBy` |
| `quote_history` / `dmc_quote_history` `.quotes[]` | `createdByUsername`, `collaborators[].u` |
| `quote_projects/{id}` / `dmc_quote_projects/{id}` | `currentState.workflow[].assignee`, `collaborators[].u` |
| `itinerary_index.items[]`, `tour_itineraries/{id}` | `createdBy`, `updatedBy` |
| `menu_index.items[]`, `tour_menus/{id}` | `createdBy`, `updatedBy` |
| `visa_proc_index.items[]`, `visa_procedures/{id}` | `createdByUsername`, `collaborators[]` |
| `visa_projects.projects[]` | `createdByUsername`, `mainStaff[]`, `supportStaff[]`, `collaborators[]` |
| `visa_products.versions[]` | `savedBy` |
| `payment_approvals.{key}` | `stage1.approverUsername`, `stage2.approverUsername` |
| `tour_payments/{id}` | `updatedBy` |
| `user_notifications/{username}` | doc key = owner username; `notifications[].createdBy` |
| `notification_threads/{id}` | `members[]`, `createdBy`, `comments[].by` |
| `chats/{id}` | `members[]`, `createdBy`, `messages[].by`, `reads{username}` |
| `poi_library.pois[]`, `fx_rates._meta`, `master_rate_card._meta` | `createdBy`/`updatedBy`/`pushedBy` |

**Note on `updatedBy`:** several docs store `updatedBy` as a `"Name (Role)"` display string (e.g. `customer_list`, `ncc_master`, `contracts_master`, `poi_library`, `master_rate_card._meta.pushedBy`), NOT a username. Those map to `updated_by_name` (display only) via `nameFromActor()`; they do NOT resolve to a UUID. Docs that store a real username in `updatedBy` (`itinerary_index`, `menu_index`, `restaurant_list`, `tour_payments`, `visa_products`) map it to `updated_by_name` too (the schema has no `updated_by` UUID column anywhere — only `created_by` is a UUID FK). So **only `createdBy`/`createdByUsername`/collaborator/assignee/approver/member fields resolve to UUIDs; every `updatedBy` maps to a name string.**

---

## Task 1: ETL scaffolding — service client, helpers, full reset

**Files:**
- Create: `scripts/etl/db.mjs`
- Create: `scripts/etl/util.mjs`
- Test: `tests/etl/scaffolding.test.ts`
- Modify: `package.json` (add `etl` + `test:etl` scripts)
- Modify: `vitest.integration.config.ts` (include `tests/etl/**`)

**Interfaces:**
- Produces: `serviceClient(): SupabaseClient` (from `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`); `CHILD_FIRST_TABLES: string[]` (every app table, children before parents); `resetAll(client): Promise<void>` (truncate all + delete `@viettours.com.vn` auth users); `insert(client, table, rows, opts?): Promise<rows[]>` (chunked insert, returns selected rows when `opts.select` given, throws on error); `iso(v)`, `dateOnly(v)`, `nameFromActor(s)`, `firstName(actor)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/etl/scaffolding.test.ts
import { describe, it, expect } from 'vitest';
import { serviceClient, resetAll, insert, CHILD_FIRST_TABLES } from '../../scripts/etl/db.mjs';
import { nameFromActor, dateOnly, iso } from '../../scripts/etl/util.mjs';

describe('etl scaffolding', () => {
  it('parses "Name (Role)" actor strings to a bare name', () => {
    expect(nameFromActor('Tony Nguyen (CEO)')).toBe('Tony Nguyen');
    expect(nameFromActor('plain')).toBe('plain');
    expect(nameFromActor(undefined)).toBe('');
  });

  it('normalizes dates and timestamps', () => {
    expect(dateOnly('2026-06-20T08:00:00.000Z')).toBe('2026-06-20');
    expect(dateOnly(undefined)).toBeNull();
    expect(iso(undefined)).toBeNull();
    expect(iso('2026-06-20T08:00:00.000Z')).toBe('2026-06-20T08:00:00.000Z');
  });

  it('CHILD_FIRST_TABLES lists children before their parents', () => {
    const i = (t: string) => CHILD_FIRST_TABLES.indexOf(t);
    expect(i('customer_contacts')).toBeLessThan(i('customers'));
    expect(i('quote_line_items')).toBeLessThan(i('quotes'));
    expect(i('chat_messages')).toBeLessThan(i('chats'));
    expect(i('quotes')).toBeLessThan(i('customers')); // quotes FK customers
  });

  it('resetAll then insert round-trips a row', async () => {
    const c = serviceClient();
    await resetAll(c);
    await insert(c, 'fx_rates', [{ currency: 'USD', rate_to_vnd: 25000, pushed_by: 'tony' }]);
    const { data } = await c.from('fx_rates').select('currency');
    expect(data).toEqual([{ currency: 'USD' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/scaffolding.test.ts`
Expected: FAIL — `Cannot find module '../../scripts/etl/db.mjs'`.

- [ ] **Step 3: Write `scripts/etl/util.mjs`**

```js
// scripts/etl/util.mjs — pure helpers, no I/O.

/** "Tony Nguyen (CEO)" -> "Tony Nguyen"; passes plain strings through. */
export function nameFromActor(s) {
  if (!s) return '';
  return String(s).replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** Alias kept for readability where a value is already a bare name. */
export const firstName = nameFromActor;

/** ISO timestamp string or null (timestamptz columns accept the ISO string). */
export function iso(v) {
  return v ? String(v) : null;
}

/** First 10 chars (yyyy-mm-dd) of an ISO date, or null. For `date` columns. */
export function dateOnly(v) {
  return v ? String(v).slice(0, 10) : null;
}

/** Chunk an array into sub-arrays of size n. */
export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
```

- [ ] **Step 4: Write `scripts/etl/db.mjs`**

```js
// scripts/etl/db.mjs — service-role client, table ordering, reset, insert helper.
import { createClient } from '@supabase/supabase-js';
import { chunk } from './util.mjs';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export function serviceClient() {
  return createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Children before parents; entities that FK other entities (quotes->customers) after them.
export const CHILD_FIRST_TABLES = [
  // quote children
  'quote_workflow_logs', 'quote_workflow_steps',
  'quote_flight_segments', 'quote_flight_fares', 'quote_flights',
  'quote_group_items', 'quote_groups',
  'quote_line_items', 'quote_collaborators', 'quote_payments', 'quote_passengers',
  'quote_versions',
  'quotes',
  // payments / approvals
  'payment_records', 'custom_cost_items', 'tour_payments',
  'payment_approval_stages', 'payment_approvals',
  // notifications / chat
  'notifications',
  'notification_comments', 'notification_thread_members', 'notification_threads',
  'chat_messages', 'chat_members', 'chats',
  // itineraries / menus
  'itinerary_days', 'itinerary_flights', 'itineraries',
  'menu_days', 'menus', 'restaurant_menus', 'restaurants',
  // visa
  'visa_product_fees', 'visa_products_meta', 'visa_products',
  'visa_procedures', 'visa_projects',
  // suppliers / products
  'ncc_product_prices', 'ncc_products', 'supplier_contacts', 'suppliers',
  // contracts
  'contract_payments', 'contract_cancels', 'contracts',
  // customers
  'customer_interactions', 'customer_contacts', 'customers',
  // rate card / misc
  'rate_card_hotels', 'rate_card_other', 'rate_card_visa', 'rate_card_meta',
  'fx_rates', 'pois', 'attachments', 'audit_log',
  // profiles last (everything FKs it)
  'profiles',
];

const PK_COL = {
  fx_rates: 'currency', rate_card_hotels: 'city', rate_card_other: 'rkey',
  rate_card_visa: 'one_row', rate_card_meta: 'one_row', visa_products_meta: 'one_row',
  tour_payments: 'id', payment_approvals: 'id',
  notification_thread_members: 'thread_id', notification_threads: 'id',
  chat_members: 'chat_id', chats: 'id',
};

/** Truncate every app table (children first) and delete all @viettours auth users. */
export async function resetAll(client) {
  for (const t of CHILD_FIRST_TABLES) {
    const col = PK_COL[t] ?? 'id';
    const { error } = await client.from(t).delete().not(col, 'is', null);
    if (error && !/no rows/i.test(error.message)) throw new Error(`reset ${t}: ${error.message}`);
  }
  // Delete auth users (their profiles cascade via profiles.id FK ON DELETE CASCADE).
  const { data, error } = await client.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error('reset listUsers: ' + error.message);
  for (const u of data.users) {
    if (u.email && u.email.endsWith('@viettours.com.vn')) {
      const { error: delErr } = await client.auth.admin.deleteUser(u.id);
      if (delErr) throw new Error(`reset deleteUser ${u.email}: ${delErr.message}`);
    }
  }
}

/**
 * Chunked insert. Drops keys whose value is `undefined` (Postgres rejects them).
 * Returns inserted rows selecting `opts.select` columns (for legacy-id maps).
 */
export async function insert(client, table, rows, opts = {}) {
  if (!rows.length) return [];
  const clean = rows.map((r) => {
    const o = {};
    for (const [k, v] of Object.entries(r)) if (v !== undefined) o[k] = v;
    return o;
  });
  const out = [];
  for (const part of chunk(clean, 500)) {
    let q = client.from(table).insert(part);
    if (opts.select) q = q.select(opts.select);
    const { data, error } = await q;
    if (error) throw new Error(`insert ${table}: ${error.message}`);
    if (data) out.push(...data);
  }
  return out;
}
```

- [ ] **Step 5: Add npm scripts and widen the integration test glob**

In `package.json` `scripts`, after the `test:integration` line add:

```json
    "etl": "node scripts/supabase-etl.mjs",
    "test:etl": "vitest run --config vitest.integration.config.ts tests/etl"
```

In `vitest.integration.config.ts`, change the `include` glob so ETL tests are picked up by `test:integration` too:

```ts
    include: ['tests/supabase/**/*.test.ts', 'tests/etl/**/*.test.ts'],
```

- [ ] **Step 6: Run test to verify it passes**

Run (local Supabase must be up — `supabase start`): `npx vitest run --config vitest.integration.config.ts tests/etl/scaffolding.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: node --check the new modules**

Run: `node --check scripts/etl/db.mjs && node --check scripts/etl/util.mjs`
Expected: no output, exit 0.

- [ ] **Step 8: Commit**

```bash
git add scripts/etl/db.mjs scripts/etl/util.mjs tests/etl/scaffolding.test.ts package.json vitest.integration.config.ts
git commit -m "feat(supabase): Phase 6 ETL scaffolding — service client, reset, helpers"
```

---

## Task 2: Synthetic fixture dump + expected counts

**Files:**
- Create: `tests/etl/fixtures/firestore-dump.sample.json`
- Create: `tests/etl/fixtures/expected.mjs`
- Test: `tests/etl/fixture.test.ts`

**Interfaces:**
- Produces: a dump object matching the exporter shape covering every entity with at least one doc and exercising every username-bearing field (including one **deleted-user** reference — a `createdBy: 'ghost'` with no matching user, to test soft-resolve). `expected.mjs` exports `EXPECTED` — per-table row counts + checksums the verification harness asserts.

The fixture must contain exactly these users and entities (counts in `expected.mjs` are derived from this list — keep them in sync):

- `singles["viettours/user_accounts"].users`: **3** users — `{u:'tony',email:'tony@viettours.com.vn',role:'CEO',name:'Tony',color:'#111'}`, `{u:'mai',email:'mai@viettours.com.vn',role:'Sales',name:'Mai',color:'#222'}`, `{u:'linh',email:'linh@viettours.com.vn',role:'Operations',name:'Linh',color:'#333'}`. (`ghost` is intentionally NOT a user → deleted-user case.)
- `singles["viettours/customer_list"]`: `{ customers: [{ id:'c1', name:'Acme', type:'company', contacts:[{name:'A',phone:'1',email:'a@x',position:'P'}], note:'', source:'web', tags:['vip'], interactions:[{id:'i1',at:'2026-06-01T00:00:00Z',byU:'mai',byName:'Mai',type:'call',text:'hi'}], nextFollowUp:{date:'2026-07-01',note:'n',byU:'mai',byName:'Mai'}, createdAt:'2026-05-01T00:00:00Z', createdBy:'mai', updatedBy:'Mai (Sales)' }], updatedBy:'Mai (Sales)' }`
- `singles["viettours/ncc_master"]`: `{ suppliers: [{ id:'s1', name:'HotelX', sectors:['hotel'], location:'HN', contacts:[], note:'', ratings:[{id:'r1',by:'tony',byName:'Tony',at:'2026-05-02T00:00:00Z',stars:5,comment:'ok'}], createdAt:'2026-05-01T00:00:00Z', createdBy:'tony' }], updatedBy:'Tony (CEO)' }`
- `singles["viettours/ncc_products"]`: `{ products: [{ id:'p1', nccId:'s1', nccName:'HotelX', category:'hotel', name:'Room', prices:[{id:'pr1',label:'STD',amount:100,cur:'USD',unit:'night'}], files:[{key:'k',name:'f.pdf',uploadedBy:'linh'}], createdAt:'2026-05-01T00:00:00Z', createdBy:'linh' }], updatedBy:'Linh (Operations)' }`
- `singles["viettours/contracts_master"]`: `{ contracts: [{ id:'k1', contractNo:'C-1', contractStatus:'signed', tourName:'Tour A', tourDays:3, tourNights:2, contractPax:10, pricePerPax:500, partyB:{name:'Acme'}, includes:['x'], excludes:['y'], payments:[{id:'cp1',label:'Deposit',mode:'percent',percent:30,amount:0,dueDate:'2026-06-10',note:'',status:'pending'}], cancels:[{when:'2026-06-01',penalty:10}], bondPercent:5, hasAcceptance:false, createdAt:'2026-05-01T00:00:00Z', createdBy:'tony', _tourKey:'tourA' }], updatedBy:'Tony (CEO)' }`
- `singles["viettours/master_rate_card"]`: `{ _meta:{version:'2.0',type:'viettours_ratecard_master',pushedAt:'2026-05-01T00:00:00Z',pushedBy:'Tony (CEO)',app:'x',autoSync:true}, hotels:{ 'Hanoi':[{name:'HotelX'}] }, visaRates:{ 'USD':1 }, otherRates:{ 'transport_car':{label:'Car'} } }`
- `singles["viettours/fx_rates"]`: `{ rates:{ USD:25000, EUR:27000 }, _meta:{ pushedAt:'2026-05-01T00:00:00Z', pushedBy:'Tony (CEO)' } }`
- `singles["viettours/restaurant_list"]`: `{ restaurants:[{ id:'rest1', name:'Pho', continent:'Asia', country:'VN', city:'HN', rating:4, review:'good', menus:[{id:'m1',name:'Set',dishes:'pho',price:10,cur:'USD',rating:4,review:''}] }], updatedBy:'linh' }`
- `singles["viettours/visa_products"]`: `{ products:[{ id:'vp1', country:'JP', visaType:'tourist', fees:[{id:'f1',name:'gov',amount:50,cur:'USD',perPax:true}], markupType:'percent', markupValue:10, markupCur:'USD', note:'', active:true }], rates:{USD:1}, versions:[{versionNo:1,savedAt:'2026-05-01T00:00:00Z',savedBy:'tony',products:[]}], updatedBy:'tony' }`
- `singles["viettours/itinerary_index"]`: `{ items:[{ id:'it1', code:'IT-1', title:'Trip', destination:'HN', days:3, nights:2, createdAt:'2026-05-01T00:00:00Z', createdBy:'linh', updatedAt:'2026-05-02T00:00:00Z', updatedBy:'linh' }] }`
- `singles["viettours/menu_index"]`: `{ items:[{ id:'mn1', code:'MN-1', title:'Menu', destination:'HN', days:3, createdAt:'2026-05-01T00:00:00Z', createdBy:'linh', updatedBy:'linh' }] }`
- `singles["viettours/visa_proc_index"]`: `{ items:[{ id:'vpr1', code:'VPR-1', title:'JP proc', country:'JP', collaborators:['mai'], createdByUsername:'tony', createdByName:'Tony', updatedBy:'tony' }] }`
- `singles["viettours/visa_projects"]`: `{ projects:[{ id:'vj1', code:'VJ-1', name:'JP batch', country:'JP', status:'planning', mainStaff:['tony'], supportStaff:['mai'], collaborators:['linh'], documentsSummary:'', linkedProcIds:[], applyCount:1, milestones:[], applicants:[], createdByUsername:'tony', createdByName:'Tony', createdAt:'2026-05-01T00:00:00Z' }], updatedBy:'Tony (CEO)' }`
- `singles["viettours/poi_library"]`: `{ pois:[{ id:'poi1', place:'Temple', destination:'HN', commentary:'nice', createdAt:'2026-05-01T00:00:00Z', createdBy:'ghost', updatedBy:'Tony (CEO)' }] }` — **`ghost` is the deleted-user reference.**
- `singles["viettours/payment_approvals"]`: `{ 'tourA::deposit': { stage1:{status:'approved',approverUsername:'tony',approverName:'Tony',note:'ok',updatedAt:'2026-06-02T00:00:00Z'}, currentStage:1, finalStatus:'approved', intendedApprover1Name:'Tony' } }`
- `collections.quote_projects`: `{ 'cloud-q1': { currentState: <QuoteDraft, see below>, versions:[{versionNo:1,savedAt:'2026-05-01T00:00:00Z',savedBy:'Tony (CEO)',note:'init',state:{}}], collaborators:[{u:'mai',name:'Mai'}], updatedAt:'2026-05-02T00:00:00Z', updatedBy:'tony' } }` where `currentState` = `{ template:'domestic', info:{name:'Tour A',dest:'HN',days:3,nights:2,startDate:'2026-07-01'}, pax:10, rates:{USD:25000}, margin:10, vat:8, svcBasis:0, rounding:0, items:{ hotel:[{id:1,name:'Room',cur:'USD',price:100,times:1,qtyMode:'per_pax',enabled:true}] }, catEnabled:{hotel:true}, status:'sent', inclusions:['x'], exclusions:['y'], payments:[{id:'qp1',label:'Deposit',amount:1000,note:''}], passengers:[{id:'pax1',name:'John'}], workflow:[{id:'w1',label:'Book',status:'todo',key:'book',assignee:'linh',log:[{at:'2026-05-01T00:00:00Z',by:'Linh',action:'created'}]}], groups:[] }`
- `collections.dmc_quote_projects`: `{ 'cloud-d1': { currentState:{ template:'dmc', info:{name:'DMC X',dest:'JP',days:4,nights:3}, pax:6, rates:{USD:25000}, margin:0, vat:0, svcBasis:0, rounding:0, catEnabled:{}, outputCurrency:'USD', dmcPrices:{'6':1200}, dmcMargin:{type:'percent',value:15}, items:{}, workflow:[], groups:[] }, versions:[], collaborators:[], updatedAt:'2026-05-02T00:00:00Z', updatedBy:'tony' } }`
- `singles["viettours/quote_history"]`: `{ quotes:[{ id:1, cloudId:'cloud-q1', quoteCode:'Q-1', name:'Tour A', template:'domestic', pax:10, totalCost:5000, customerId:'c1', customerName:'Acme', status:'sent', departDate:'2026-07-01', createdByUsername:'tony', createdByName:'Tony', collaborators:[{u:'mai',name:'Mai'}], createdAt:'2026-05-01T00:00:00Z', updatedAt:'2026-05-02T00:00:00Z', updatedBy:'Tony (CEO)' }] }`
- `singles["viettours/dmc_quote_history"]`: `{ quotes:[{ id:2, cloudId:'cloud-d1', quoteCode:'D-1', name:'DMC X', template:'dmc', pax:6, totalCost:7200, status:'draft', createdByUsername:'tony', createdByName:'Tony', collaborators:[], createdAt:'2026-05-01T00:00:00Z', updatedAt:'2026-05-02T00:00:00Z', updatedBy:'Tony (CEO)' }] }`
- `collections.tour_itineraries`: `{ 'it1': { id:'it1', code:'IT-1', type:'ND', continent:'Asia', country:'VN', seq:0, title:'Trip', destination:'HN', days:3, nights:2, startDate:'2026-07-01', intro:'', schedule:[{day:1,title:'Arrive',meals:{B:false,L:true,D:true},segments:[]}], flights:[{id:'fl1',leg:'out',flightNo:'VN1',dep:'HAN',arr:'SGN'}], includes:['x'], excludes:['y'], linkedQuoteId:null, linkedQuoteName:'', createdAt:'2026-05-01T00:00:00Z', createdBy:'linh', updatedBy:'linh' } }`
- `collections.tour_menus`: `{ 'mn1': { id:'mn1', code:'MN-1', type:'ND', continent:'Asia', country:'VN', seq:0, title:'Menu', destination:'HN', days:3, linkedItineraryId:null, linkedItineraryName:'', linkedQuoteId:null, linkedQuoteName:'', schedule:[{day:1,city:'HN',meals:[]}], createdAt:'2026-05-01T00:00:00Z', createdBy:'linh', updatedBy:'linh' } }`
- `collections.visa_procedures`: `{ 'vpr1': { id:'vpr1', code:'VPR-1', title:'JP proc', country:'JP', collaborators:['mai'], createdByUsername:'tony', createdByName:'Tony', sections:[{id:'sec1',kind:'doc',title:'Docs',repeatable:false,fieldDefs:[],rows:[]}], versions:[], linkedQuoteId:null, linkedQuoteName:'', createdAt:'2026-05-01T00:00:00Z', updatedBy:'tony' } }`
- `collections.tour_payments`: `{ 'tourA': { payments:{ 'hotel::HotelX':{supplier:'HotelX',tracked:true,customAmount:0,installments:[{label:'Dep',amount:500,status:'unpaid',paidDate:''}],note:''} }, customItems:[{key:'ci1',catId:'misc',catLabel:'Misc',catIcon:'★',catColor:'#000',name:'Tip',amount:50}], updatedAt:'2026-06-01T00:00:00Z', updatedBy:'linh' } }`
- `collections.user_notifications`: `{ 'mai': { notifications:[{ id:'n1', type:'collab', title:'Hi', message:'msg', createdBy:'tony', createdAt:'2026-06-01T00:00:00Z', read:false, link:{kind:'quote',id:'cloud-q1',label:'Tour A'}, threadId:'th1', priority:'high' }] } }`
- `collections.notification_threads`: `{ 'th1': { id:'th1', title:'Thread', members:['tony','mai'], link:{kind:'quote',id:'cloud-q1',label:'Tour A'}, comments:[{id:'cm1',by:'tony',byName:'Tony',text:'hello',at:'2026-06-01T00:00:00Z'}], createdAt:'2026-06-01T00:00:00Z', createdBy:'tony', actType:'collab', status:'open' } }`
- `collections.chats`: `{ 'dm_mai__tony': { id:'dm_mai__tony', isGroup:false, members:['mai','tony'], createdBy:'tony', createdByName:'Tony', createdAt:'2026-06-01T00:00:00Z', lastAt:'2026-06-01T01:00:00Z', lastText:'hey', lastByName:'Tony', messages:[{id:'msg1',by:'tony',byName:'Tony',at:'2026-06-01T01:00:00Z',text:'hey',reactions:{'👍':['mai']}}], reads:{ tony:'2026-06-01T01:00:00Z', mai:'2026-06-01T00:30:00Z' } } }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/etl/fixture.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EXPECTED } from './fixtures/expected.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));

describe('etl fixture', () => {
  it('has the exporter shape with singles + collections', () => {
    expect(Object.keys(dump.singles)).toContain('viettours/user_accounts');
    expect(Object.keys(dump.collections)).toContain('quote_projects');
    expect(Object.keys(dump.collections)).toContain('chats');
  });

  it('declares 3 users and the expected profile count', () => {
    expect(dump.singles['viettours/user_accounts'].users).toHaveLength(3);
    expect(EXPECTED.profiles).toBe(3);
  });

  it('contains the deleted-user (ghost) reference exactly once', () => {
    const json = JSON.stringify(dump);
    expect(json.match(/"ghost"/g)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/fixture.test.ts`
Expected: FAIL — fixture/expected modules not found.

- [ ] **Step 3: Author `tests/etl/fixtures/firestore-dump.sample.json`**

Write the JSON file containing exactly the `singles` and `collections` described in the table above (every bullet becomes one key). Validate it parses: `node -e "JSON.parse(require('fs').readFileSync('tests/etl/fixtures/firestore-dump.sample.json','utf8')); console.log('ok')"`.

- [ ] **Step 4: Author `tests/etl/fixtures/expected.mjs`**

```js
// tests/etl/fixtures/expected.mjs — counts/checksums derived from the sample dump.
export const EXPECTED = {
  profiles: 3,
  customers: 1, customer_contacts: 1, customer_interactions: 1,
  suppliers: 1, supplier_contacts: 0, ncc_products: 1, ncc_product_prices: 1,
  contracts: 1, contract_payments: 1, contract_cancels: 1,
  rate_card_hotels: 1, rate_card_other: 1, rate_card_visa: 1, rate_card_meta: 1,
  fx_rates: 2, restaurants: 1, restaurant_menus: 1,
  visa_products: 1, visa_product_fees: 1, visa_products_meta: 1,
  pois: 1,
  quotes: 2,                 // 1 regular + 1 dmc
  quote_line_items: 1, quote_groups: 0, quote_payments: 1, quote_passengers: 1,
  quote_workflow_steps: 1, quote_workflow_logs: 1, quote_versions: 1,
  itineraries: 1, itinerary_days: 1, itinerary_flights: 1,
  menus: 1, menu_days: 1,
  visa_procedures: 1, visa_projects: 1,
  tour_payments: 1, payment_records: 1, custom_cost_items: 1,
  payment_approvals: 1, payment_approval_stages: 1,
  notifications: 1, notification_threads: 1, notification_thread_members: 2, notification_comments: 1,
  chats: 1, chat_members: 2, chat_messages: 1,
  // checksums
  sum_total_cost: 12200,     // 5000 + 7200
  sum_fx_rate_to_vnd: 52000, // 25000 + 27000
  // identity
  unmapped_usernames: ['ghost'],
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/fixture.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add tests/etl/fixtures/firestore-dump.sample.json tests/etl/fixtures/expected.mjs tests/etl/fixture.test.ts
git commit -m "test(supabase): Phase 6 synthetic ETL fixture + expected counts"
```

---

## Task 3: Profiles keystone + username→UUID resolver

**Files:**
- Create: `scripts/etl/profiles.mjs`
- Test: `tests/etl/profiles.test.ts`

**Interfaces:**
- Consumes: `serviceClient`, `resetAll`, `insert` (Task 1); fixture dump (Task 2).
- Produces:
  - `loadProfiles(client, dump): Promise<Map<string,string>>` — for each `user_accounts.users[]`: create the auth user (`email_confirm:true`, no password), then UPDATE the trigger-created profile row to the real `username/name/role/color/phone`. Returns `usernameToId` map.
  - `makeResolver(usernameToId): { resolve(u), resolveMany(us), unmapped: Set<string> }` — `resolve(u)` returns the UUID, or `null` for a falsy/unmapped username (recording unmapped non-empty names in `unmapped`). `resolveMany` maps an array, dropping nulls.

- [ ] **Step 1: Write the failing test**

```ts
// tests/etl/profiles.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient, resetAll } from '../../scripts/etl/db.mjs';
import { loadProfiles, makeResolver } from '../../scripts/etl/profiles.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));
const c = serviceClient();
let map: Map<string, string>;

describe('etl profiles', () => {
  beforeAll(async () => {
    await resetAll(c);
    map = await loadProfiles(c, dump);
  });

  it('creates one profile per user with the real role/name', async () => {
    expect(map.size).toBe(3);
    const { data } = await c.from('profiles').select('username, role, name').order('username');
    expect(data).toEqual([
      { username: 'linh', role: 'Operations', name: 'Linh' },
      { username: 'mai', role: 'Sales', name: 'Mai' },
      { username: 'tony', role: 'CEO', name: 'Tony' },
    ]);
  });

  it('resolver returns UUIDs for known users and null for unmapped, recording them', () => {
    const r = makeResolver(map);
    expect(r.resolve('tony')).toBe(map.get('tony'));
    expect(r.resolve('ghost')).toBeNull();
    expect(r.resolve('')).toBeNull();
    expect([...r.unmapped]).toEqual(['ghost']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/profiles.test.ts`
Expected: FAIL — `profiles.mjs` not found.

- [ ] **Step 3: Write `scripts/etl/profiles.mjs`**

```js
// scripts/etl/profiles.mjs — keystone: auth users + profiles + username->UUID map.

/** Create auth users (no password) and overwrite trigger-provisioned profiles. */
export async function loadProfiles(client, dump) {
  const users = dump.singles['viettours/user_accounts']?.users ?? [];
  const map = new Map();
  for (const u of users) {
    const email = u.email || `${u.u}@viettours.com.vn`;
    const { data, error } = await client.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    const id = data.user.id;
    // The on_auth_user_created trigger already inserted a profiles row (role Standard,
    // username/name = email prefix). Overwrite with the real values from the dump.
    const { error: upErr } = await client.from('profiles').update({
      username: u.u, email, role: u.role ?? 'Standard',
      name: u.name ?? u.u, color: u.color ?? '#888888', phone: u.phone ?? null,
    }).eq('id', id);
    if (upErr) throw new Error(`profile update ${u.u}: ${upErr.message}`);
    map.set(u.u, id);
  }
  return map;
}

/** Resolver: username -> UUID, null for falsy/unmapped (unmapped non-empty names recorded). */
export function makeResolver(usernameToId) {
  const unmapped = new Set();
  const resolve = (u) => {
    if (!u) return null;
    const id = usernameToId.get(u);
    if (id) return id;
    unmapped.add(u);
    return null;
  };
  const resolveMany = (us) => (us ?? []).map(resolve).filter(Boolean);
  return { resolve, resolveMany, unmapped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/profiles.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: node --check + commit**

```bash
node --check scripts/etl/profiles.mjs
git add scripts/etl/profiles.mjs tests/etl/profiles.test.ts
git commit -m "feat(supabase): Phase 6 profiles keystone + username->UUID resolver"
```

---

## Task 4: Customers, suppliers, NCC products loaders

**Files:**
- Create: `scripts/etl/customers.mjs`
- Create: `scripts/etl/suppliers.mjs`
- Test: `tests/etl/independent-a.test.ts`

**Interfaces:**
- Consumes: `insert` (Task 1), a resolver `r` (Task 3).
- Produces:
  - `loadCustomers(client, dump, r): Promise<Map<string,string>>` — inserts customers (+contacts, +interactions); returns `legacyCustomerId → uuid`.
  - `loadSuppliers(client, dump, r): Promise<Map<string,string>>` — inserts suppliers (+contacts); returns `legacySupplierId → uuid`.
  - `loadNccProducts(client, dump, r, supplierMap): Promise<void>` — inserts ncc_products (+prices), resolving `supplier_id` via `supplierMap`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/etl/independent-a.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient, resetAll } from '../../scripts/etl/db.mjs';
import { loadProfiles, makeResolver } from '../../scripts/etl/profiles.mjs';
import { loadCustomers, loadSuppliers, loadNccProducts } from '../../scripts/etl/customers.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));
const c = serviceClient();
let r: ReturnType<typeof makeResolver>;
let custMap: Map<string,string>;
let supMap: Map<string,string>;

describe('etl independent entities A', () => {
  beforeAll(async () => {
    await resetAll(c);
    r = makeResolver(await loadProfiles(c, dump));
    custMap = await loadCustomers(c, dump, r);
    supMap = await loadSuppliers(c, dump, r);
    await loadNccProducts(c, dump, r, supMap);
  });

  it('loads customers with contacts + interactions and resolves createdBy', async () => {
    const { data: cust } = await c.from('customers').select('legacy_id, source, created_by, created_by_name');
    expect(cust).toHaveLength(1);
    expect(cust![0].source).toBe('web');
    expect(cust![0].created_by).toBe(r.resolve('mai'));
    const { count: contacts } = await c.from('customer_contacts').select('*', { count: 'exact', head: true });
    const { count: inter } = await c.from('customer_interactions').select('*', { count: 'exact', head: true });
    expect(contacts).toBe(1); expect(inter).toBe(1);
    expect(custMap.get('c1')).toBeTruthy();
  });

  it('loads suppliers and ncc_products with supplier_id resolved', async () => {
    const { data: prod } = await c.from('ncc_products').select('legacy_id, supplier_id, ncc_name');
    expect(prod).toHaveLength(1);
    expect(prod![0].supplier_id).toBe(supMap.get('s1'));
    const { count: prices } = await c.from('ncc_product_prices').select('*', { count: 'exact', head: true });
    expect(prices).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/independent-a.test.ts`
Expected: FAIL — `customers.mjs` not found.

- [ ] **Step 3: Write `scripts/etl/customers.mjs`**

```js
// scripts/etl/customers.mjs — customers (+contacts/interactions), suppliers (+contacts), ncc_products (+prices).
import { insert } from './db.mjs';
import { iso, nameFromActor } from './util.mjs';

export async function loadCustomers(client, dump, r) {
  const customers = dump.singles['viettours/customer_list']?.customers ?? [];
  const rows = customers.map((x) => ({
    legacy_id: x.id, name: x.name, type: x.type, address: x.address ?? null,
    tax_code: x.taxCode ?? null, note: x.note ?? '',
    source: x.source ?? null, tags: x.tags ?? [], next_follow_up: x.nextFollowUp ?? null,
    created_by: r.resolve(x.createdBy), created_by_name: nameFromActor(x.createdBy) || null,
    created_at: iso(x.createdAt) ?? undefined, updated_at: iso(x.updatedAt),
    updated_by_name: nameFromActor(x.updatedBy) || null,
  }));
  const inserted = await insert(client, 'customers', rows, { select: 'id, legacy_id' });
  const map = new Map(inserted.map((row) => [row.legacy_id, row.id]));

  const contacts = [], inter = [];
  for (const x of customers) {
    const cid = map.get(x.id);
    (x.contacts ?? []).forEach((ct, i) => contacts.push({
      customer_id: cid, name: ct.name ?? '', phone: ct.phone ?? '', email: ct.email ?? '',
      position: ct.position ?? '', sort_order: i,
    }));
    (x.interactions ?? []).forEach((it, i) => inter.push({
      customer_id: cid, legacy_id: it.id ?? null, at: iso(it.at) ?? undefined,
      by_username: it.byU ?? null, by_name: it.byName ?? '', type: it.type ?? '',
      text: it.text ?? '', sort_order: i,
    }));
  }
  await insert(client, 'customer_contacts', contacts);
  await insert(client, 'customer_interactions', inter);
  return map;
}

export async function loadSuppliers(client, dump, r) {
  const suppliers = dump.singles['viettours/ncc_master']?.suppliers ?? [];
  const rows = suppliers.map((x) => ({
    legacy_id: x.id, name: x.name, sectors: x.sectors ?? [], location: x.location ?? '',
    note: x.note ?? '', created_by: r.resolve(x.createdBy),
    created_by_name: nameFromActor(x.createdBy) || null,
    created_at: iso(x.createdAt) ?? undefined, updated_at: iso(x.updatedAt),
    updated_by_name: nameFromActor(x.updatedBy) || null,
  }));
  const inserted = await insert(client, 'suppliers', rows, { select: 'id, legacy_id' });
  const map = new Map(inserted.map((row) => [row.legacy_id, row.id]));
  const contacts = [];
  for (const x of suppliers) {
    const sid = map.get(x.id);
    (x.contacts ?? []).forEach((ct, i) => contacts.push({
      supplier_id: sid, name: ct.name ?? '', phone: ct.phone ?? '', email: ct.email ?? '',
      position: ct.position ?? '', sort_order: i,
    }));
  }
  await insert(client, 'supplier_contacts', contacts);
  return map;
}

export async function loadNccProducts(client, dump, r, supplierMap) {
  const products = dump.singles['viettours/ncc_products']?.products ?? [];
  const rows = products.map((x) => ({
    legacy_id: x.id, supplier_id: x.nccId ? supplierMap.get(x.nccId) ?? null : null,
    ncc_name: x.nccName ?? '', category: x.category, name: x.name,
    description: x.description ?? null, note: x.note ?? null,
    created_by: r.resolve(x.createdBy), created_by_name: nameFromActor(x.createdBy) || null,
    created_at: iso(x.createdAt) ?? undefined, updated_at: iso(x.updatedAt),
    updated_by_name: nameFromActor(x.updatedBy) || null,
  }));
  const inserted = await insert(client, 'ncc_products', rows, { select: 'id, legacy_id' });
  const map = new Map(inserted.map((row) => [row.legacy_id, row.id]));
  const prices = [];
  for (const x of products) {
    const pid = map.get(x.id);
    (x.prices ?? []).forEach((p, i) => prices.push({
      product_id: pid, label: p.label ?? '', amount: p.amount ?? 0, cur: p.cur ?? 'VND',
      unit: p.unit ?? '', note: p.note ?? null, sort_order: i,
    }));
  }
  await insert(client, 'ncc_product_prices', prices);
}
```

- [ ] **Step 4: Re-export from a `suppliers.mjs` barrel (so the Interfaces match)**

Create `scripts/etl/suppliers.mjs`:

```js
// scripts/etl/suppliers.mjs — re-export for import clarity; impl lives in customers.mjs.
export { loadSuppliers, loadNccProducts } from './customers.mjs';
```

(The test imports all three from `customers.mjs`; the barrel is for the orchestrator's readability.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/independent-a.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: node --check + commit**

```bash
node --check scripts/etl/customers.mjs && node --check scripts/etl/suppliers.mjs
git add scripts/etl/customers.mjs scripts/etl/suppliers.mjs tests/etl/independent-a.test.ts
git commit -m "feat(supabase): Phase 6 customers/suppliers/ncc_products loaders"
```

---

## Task 5: Contracts, rate card, fx, restaurants, pois, visa products loaders

**Files:**
- Create: `scripts/etl/misc.mjs`
- Test: `tests/etl/independent-b.test.ts`

**Interfaces:**
- Consumes: `insert`, resolver `r`.
- Produces: `loadContracts`, `loadRateCard`, `loadFxRates`, `loadRestaurants`, `loadPois`, `loadVisaProducts` — each `(client, dump, r): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/etl/independent-b.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient, resetAll } from '../../scripts/etl/db.mjs';
import { loadProfiles, makeResolver } from '../../scripts/etl/profiles.mjs';
import { loadContracts, loadRateCard, loadFxRates, loadRestaurants, loadPois, loadVisaProducts } from '../../scripts/etl/misc.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));
const c = serviceClient();

describe('etl independent entities B', () => {
  let r: ReturnType<typeof makeResolver>;
  beforeAll(async () => {
    await resetAll(c);
    r = makeResolver(await loadProfiles(c, dump));
    await loadContracts(c, dump, r);
    await loadRateCard(c, dump, r);
    await loadFxRates(c, dump, r);
    await loadRestaurants(c, dump, r);
    await loadPois(c, dump, r);
    await loadVisaProducts(c, dump, r);
  });

  it('loads contracts with payments + cancels', async () => {
    const { data } = await c.from('contracts').select('legacy_id, tour_key, created_by');
    expect(data).toHaveLength(1);
    expect(data![0].tour_key).toBe('tourA');
    expect(data![0].created_by).toBe(r.resolve('tony'));
    const { count: pays } = await c.from('contract_payments').select('*', { count: 'exact', head: true });
    const { count: cancels } = await c.from('contract_cancels').select('*', { count: 'exact', head: true });
    expect(pays).toBe(1); expect(cancels).toBe(1);
  });

  it('loads rate card sections, fx, restaurants, pois, visa products', async () => {
    const { count: hotels } = await c.from('rate_card_hotels').select('*', { count: 'exact', head: true });
    const { count: fx } = await c.from('fx_rates').select('*', { count: 'exact', head: true });
    const { count: rm } = await c.from('restaurant_menus').select('*', { count: 'exact', head: true });
    const { count: fees } = await c.from('visa_product_fees').select('*', { count: 'exact', head: true });
    expect(hotels).toBe(1); expect(fx).toBe(2); expect(rm).toBe(1); expect(fees).toBe(1);
    const { data: poi } = await c.from('pois').select('legacy_id, created_by, created_by_name');
    expect(poi![0].created_by).toBeNull();              // 'ghost' is unmapped
    expect(poi![0].created_by_name).toBe('ghost');       // attribution string preserved
    expect([...r.unmapped]).toContain('ghost');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/independent-b.test.ts`
Expected: FAIL — `misc.mjs` not found.

- [ ] **Step 3: Write `scripts/etl/misc.mjs`**

```js
// scripts/etl/misc.mjs — contracts, rate card, fx, restaurants, pois, visa products.
import { insert } from './db.mjs';
import { iso, nameFromActor } from './util.mjs';

export async function loadContracts(client, dump, r) {
  const contracts = dump.singles['viettours/contracts_master']?.contracts ?? [];
  const rows = contracts.map((x) => ({
    legacy_id: x.id, contract_no: x.contractNo ?? '', contract_date: x.contractDate ?? null,
    contract_status: x.contractStatus ?? 'draft', tour_name: x.tourName ?? '', tour_dest: x.tourDest ?? null,
    tour_days: x.tourDays ?? 0, tour_nights: x.tourNights ?? 0, tour_start_date: x.tourStartDate ?? null,
    departure: x.departure ?? null, contract_pax: x.contractPax ?? 0, price_per_pax: x.pricePerPax ?? 0,
    party_b: x.partyB ?? {}, includes: x.includes ?? [], excludes: x.excludes ?? [],
    bond_percent: x.bondPercent ?? 0, has_acceptance: x.hasAcceptance ?? false,
    acceptance_date: x.acceptanceDate ?? null, acceptance_note: x.acceptanceNote ?? null,
    tour_key: x._tourKey ?? null, linked_quote_id: x.linkedQuoteId ?? null, linked_quote_name: x.linkedQuoteName ?? null,
    created_by: r.resolve(x.createdBy), created_by_name: nameFromActor(x.createdBy) || null,
    created_at: iso(x.createdAt) ?? undefined, updated_at: iso(x.updatedAt),
    updated_by_name: nameFromActor(x.updatedBy) || null,
  }));
  const inserted = await insert(client, 'contracts', rows, { select: 'id, legacy_id' });
  const map = new Map(inserted.map((row) => [row.legacy_id, row.id]));
  const pays = [], cancels = [];
  for (const x of contracts) {
    const kid = map.get(x.id);
    (x.payments ?? []).forEach((p, i) => pays.push({
      contract_id: kid, label: p.label ?? '', mode: p.mode ?? 'percent', percent: p.percent ?? null,
      amount: p.amount ?? 0, due_date: p.dueDate ?? null, note: p.note ?? '', status: p.status ?? 'pending',
      paid_date: p.paidDate ?? null, received_amount: p.receivedAmount ?? null,
      approval_requested: p.approvalRequested ?? false, sort_order: i,
    }));
    (x.cancels ?? []).forEach((cn, i) => cancels.push({
      contract_id: kid, when_text: cn.when ?? '', penalty: cn.penalty ?? 0, sort_order: i,
    }));
  }
  await insert(client, 'contract_payments', pays);
  await insert(client, 'contract_cancels', cancels);
}

export async function loadRateCard(client, dump) {
  const rc = dump.singles['viettours/master_rate_card'];
  if (!rc) return;
  const hotels = Object.entries(rc.hotels ?? {}).map(([city, entries]) => ({ city, entries }));
  const other = Object.entries(rc.otherRates ?? {}).map(([rkey, entry]) => ({ rkey, entry }));
  await insert(client, 'rate_card_hotels', hotels);
  await insert(client, 'rate_card_other', other);
  await insert(client, 'rate_card_visa', [{ one_row: true, data: rc.visaRates ?? {} }]);
  const m = rc._meta ?? {};
  await insert(client, 'rate_card_meta', [{
    one_row: true, version: m.version ?? null, type: m.type ?? null,
    pushed_at: iso(m.pushedAt), pushed_by: nameFromActor(m.pushedBy) || null,
    app: m.app ?? null, auto_sync: m.autoSync ?? null,
  }]);
}

export async function loadFxRates(client, dump) {
  const doc = dump.singles['viettours/fx_rates'];
  if (!doc) return;
  const by = nameFromActor(doc._meta?.pushedBy) || null;
  const rows = Object.entries(doc.rates ?? {}).map(([currency, rate]) => ({
    currency, rate_to_vnd: rate, pushed_at: iso(doc._meta?.pushedAt), pushed_by: by,
  }));
  await insert(client, 'fx_rates', rows);
}

export async function loadRestaurants(client, dump) {
  const restaurants = dump.singles['viettours/restaurant_list']?.restaurants ?? [];
  const rows = restaurants.map((x) => ({
    legacy_id: x.id, name: x.name ?? '', continent: x.continent ?? null, country: x.country ?? null,
    city: x.city ?? null, website: x.website ?? null, menu_link: x.menuLink ?? null,
    contact: x.contact ?? null, note: x.note ?? null, rating: x.rating ?? 0, review: x.review ?? '',
  }));
  const inserted = await insert(client, 'restaurants', rows, { select: 'id, legacy_id' });
  const map = new Map(inserted.map((row) => [row.legacy_id, row.id]));
  const menus = [];
  for (const x of restaurants) {
    const rid = map.get(x.id);
    (x.menus ?? []).forEach((m, i) => menus.push({
      restaurant_id: rid, legacy_menu_id: m.id ?? null, name: m.name ?? '', dishes: m.dishes ?? null,
      price: m.price ?? 0, cur: m.cur ?? 'VND', rating: m.rating ?? 0, review: m.review ?? null, sort_order: i,
    }));
  }
  await insert(client, 'restaurant_menus', menus);
}

export async function loadPois(client, dump, r) {
  const pois = dump.singles['viettours/poi_library']?.pois ?? [];
  const rows = pois.map((x) => ({
    place: x.place, destination: x.destination ?? null, commentary: x.commentary ?? '',
    created_by: r.resolve(x.createdBy), created_by_name: nameFromActor(x.createdBy) || null,
    created_at: iso(x.createdAt) ?? undefined, updated_at: iso(x.updatedAt),
    updated_by_name: nameFromActor(x.updatedBy) || null, legacy_id: x.id,
  }));
  await insert(client, 'pois', rows);
}

export async function loadVisaProducts(client, dump) {
  const doc = dump.singles['viettours/visa_products'];
  if (!doc) return;
  const products = doc.products ?? [];
  const rows = products.map((x) => ({
    legacy_id: x.id, country: x.country ?? '', visa_type: x.visaType ?? '', validity: x.validity ?? null,
    location: x.location ?? null, markup_type: x.markupType ?? 'percent', markup_value: x.markupValue ?? 0,
    markup_cur: x.markupCur ?? 'VND', note: x.note ?? '', active: x.active ?? true,
  }));
  const inserted = await insert(client, 'visa_products', rows, { select: 'id, legacy_id' });
  const map = new Map(inserted.map((row) => [row.legacy_id, row.id]));
  const fees = [];
  for (const x of products) {
    const pid = map.get(x.id);
    (x.fees ?? []).forEach((f, i) => fees.push({
      product_id: pid, legacy_fee_id: f.id ?? null, name: f.name ?? '', amount: f.amount ?? 0,
      cur: f.cur ?? 'VND', per_pax: f.perPax ?? true, sort_order: i,
    }));
  }
  await insert(client, 'visa_product_fees', fees);
  await insert(client, 'visa_products_meta', [{
    one_row: true, rates: doc.rates ?? {}, versions: doc.versions ?? [],
    updated_at: iso(doc.updatedAt), updated_by: nameFromActor(doc.updatedBy) || null,
  }]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/independent-b.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: node --check + commit**

```bash
node --check scripts/etl/misc.mjs
git add scripts/etl/misc.mjs tests/etl/independent-b.test.ts
git commit -m "feat(supabase): Phase 6 contracts/rate-card/fx/restaurants/pois/visa-products loaders"
```

---

## Task 6: Quotes loader (regular + DMC unified)

**Files:**
- Create: `scripts/etl/quotes.mjs`
- Test: `tests/etl/quotes.test.ts`

**Interfaces:**
- Consumes: `insert`, resolver `r`, `customerMap` (Task 4), `dateOnly`/`iso`/`nameFromActor`.
- Produces: `loadQuotes(client, dump, r, customerMap): Promise<void>` — unifies `quote_history`+`quote_projects` and `dmc_quote_history`+`dmc_quote_projects` into `quotes` (+ line items, groups+group items, payments, passengers, flights+segments+fares, workflow steps+logs, versions). Joins index↔project by `cloudId`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/etl/quotes.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient, resetAll } from '../../scripts/etl/db.mjs';
import { loadProfiles, makeResolver } from '../../scripts/etl/profiles.mjs';
import { loadCustomers } from '../../scripts/etl/customers.mjs';
import { loadQuotes } from '../../scripts/etl/quotes.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));
const c = serviceClient();

describe('etl quotes', () => {
  let r: ReturnType<typeof makeResolver>;
  beforeAll(async () => {
    await resetAll(c);
    r = makeResolver(await loadProfiles(c, dump));
    const custMap = await loadCustomers(c, dump, r);
    await loadQuotes(c, dump, r, custMap);
  });

  it('unifies regular + dmc into quotes with resolved created_by + customer_id', async () => {
    const { data } = await c.from('quotes').select('cloud_id, template, total_cost, created_by, created_by_username, customer_id, customer_name').order('cloud_id');
    expect(data).toHaveLength(2);
    const reg = data!.find((q) => q.cloud_id === 'cloud-q1')!;
    expect(reg.template).toBe('domestic');
    expect(reg.created_by).toBe(r.resolve('tony'));
    expect(reg.created_by_username).toBe('tony');
    expect(reg.customer_id).toBeTruthy();        // resolved from legacy 'c1'
    const dmc = data!.find((q) => q.cloud_id === 'cloud-d1')!;
    expect(dmc.template).toBe('dmc');
    expect(dmc.customer_id).toBeNull();
  });

  it('shreds child tables from currentState', async () => {
    const counts: Record<string, number> = {};
    for (const t of ['quote_line_items','quote_payments','quote_passengers','quote_workflow_steps','quote_workflow_logs','quote_versions','quote_collaborators']) {
      const { count } = await c.from(t).select('*', { count: 'exact', head: true });
      counts[t] = count ?? 0;
    }
    expect(counts.quote_line_items).toBe(1);
    expect(counts.quote_payments).toBe(1);
    expect(counts.quote_passengers).toBe(1);
    expect(counts.quote_workflow_steps).toBe(1);
    expect(counts.quote_workflow_logs).toBe(1);
    expect(counts.quote_versions).toBe(1);
    expect(counts.quote_collaborators).toBe(1);  // 'mai' on cloud-q1
  });

  it('resolves workflow assignee + collaborator to UUIDs', async () => {
    const { data: w } = await c.from('quote_workflow_steps').select('assignee_user_id, assignee_username');
    expect(w![0].assignee_user_id).toBe(r.resolve('linh'));
    expect(w![0].assignee_username).toBe('linh');
    const { data: collab } = await c.from('quote_collaborators').select('user_id, username');
    expect(collab![0].user_id).toBe(r.resolve('mai'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/quotes.test.ts`
Expected: FAIL — `quotes.mjs` not found.

- [ ] **Step 3: Write `scripts/etl/quotes.mjs`**

```js
// scripts/etl/quotes.mjs — unify quote_history+quote_projects and DMC variants into quotes + children.
import { insert } from './db.mjs';
import { iso, dateOnly, nameFromActor } from './util.mjs';

// Map a QuoteDraft Item -> quote_line_items / quote_group_items row (shared shape).
function itemRow(quoteOrGroupKey, category, it, i) {
  return {
    ...quoteOrGroupKey, category, legacy_item_id: typeof it.id === 'number' ? it.id : null,
    name: it.name ?? '', note: it.note ?? '', cur: it.cur ?? 'VND', price: it.price ?? 0,
    times: it.times ?? 1, qty_mode: it.qtyMode ?? 'per_pax', custom_qty: it.customQty ?? 0,
    unit: it.unit ?? '', enabled: it.enabled ?? true, foc: it.foc ?? false,
    optional: it.optional ?? null, included: it.included ?? null, sort_order: i,
  };
}

async function loadOne(client, indexEntry, project, r, customerMap) {
  const draft = project?.currentState ?? {};
  const quoteRow = {
    cloud_id: indexEntry.cloudId, legacy_num_id: indexEntry.id ?? null, quote_code: indexEntry.quoteCode ?? null,
    name: indexEntry.name ?? draft.info?.name ?? '', template: indexEntry.template ?? draft.template,
    pax: indexEntry.pax ?? draft.pax ?? 0, total_cost: indexEntry.totalCost ?? 0,
    status: indexEntry.status ?? draft.status ?? null,
    customer_id: indexEntry.customerId ? customerMap.get(indexEntry.customerId) ?? null : null,
    customer_name: indexEntry.customerName ?? null, depart_date: dateOnly(indexEntry.departDate),
    info: draft.info ?? {}, rates: draft.rates ?? {}, rate_base: draft.rateBase ?? null,
    margin: draft.margin ?? 0, vat: draft.vat ?? 0, svc_basis: draft.svcBasis ?? 0, rounding: draft.rounding ?? 0,
    cat_enabled: draft.catEnabled ?? {}, pricing_options: draft.pricingOptions ?? null,
    inclusions: draft.inclusions ?? null, exclusions: draft.exclusions ?? null,
    output_currency: draft.outputCurrency ?? null, dmc_prices: draft.dmcPrices ?? null, dmc_margin: draft.dmcMargin ?? null,
    active_group_id: draft.activeGroupId ?? null, workflow_summary: indexEntry.workflowSummary ?? null,
    payment_summary: indexEntry.paymentSummary ?? null, loss_reason: indexEntry.lossReason ?? draft.lossReason ?? null,
    workflow_due: indexEntry.workflowDue ?? null,
    linked_quote_id: indexEntry.linkedQuoteId ?? null, linked_quote_name: indexEntry.linkedQuoteName ?? null,
    linked_quote_template: indexEntry.linkedQuoteTemplate ?? null,
    created_by: r.resolve(indexEntry.createdByUsername), created_by_username: indexEntry.createdByUsername ?? null,
    created_by_name: indexEntry.createdByName ?? null, created_at: iso(indexEntry.createdAt) ?? undefined,
    updated_at: iso(indexEntry.updatedAt), updated_by_name: nameFromActor(indexEntry.updatedBy) || null,
  };
  const [inserted] = await insert(client, 'quotes', [quoteRow], { select: 'id, cloud_id' });
  const qid = inserted.id;

  // Line items (draft.items: { category: Item[] }).
  const lineItems = [];
  for (const [category, arr] of Object.entries(draft.items ?? {})) {
    (arr ?? []).forEach((it, i) => lineItems.push(itemRow({ quote_id: qid }, category, it, i)));
  }
  await insert(client, 'quote_line_items', lineItems);

  // Groups + group items.
  const groups = draft.groups ?? [];
  const groupRows = groups.map((g, i) => ({
    quote_id: qid, legacy_group_id: g.id ?? null, label: g.label ?? '', pax: g.pax ?? 0,
    cat_enabled: g.catEnabled ?? {}, sort_order: i,
  }));
  const insertedGroups = await insert(client, 'quote_groups', groupRows, { select: 'id, legacy_group_id' });
  const gmap = new Map(insertedGroups.map((row) => [row.legacy_group_id, row.id]));
  const groupItems = [];
  for (const g of groups) {
    const gid = gmap.get(g.id);
    for (const [category, arr] of Object.entries(g.items ?? {})) {
      (arr ?? []).forEach((it, i) => groupItems.push(itemRow({ group_id: gid }, category, it, i)));
    }
  }
  await insert(client, 'quote_group_items', groupItems);

  // Payments, passengers.
  await insert(client, 'quote_payments', (draft.payments ?? []).map((p, i) => ({
    quote_id: qid, legacy_payment_id: p.id ?? null, label: p.label ?? '', amount: p.amount ?? 0,
    note: p.note ?? '', sort_order: i,
  })));
  await insert(client, 'quote_passengers', (draft.passengers ?? []).map((p, i) => ({
    quote_id: qid, legacy_passenger_id: p.id ?? null, sort_order: i, name: p.name ?? '',
    gender: p.gender ?? null, dob: p.dob ?? null, id_type: p.idType ?? null, id_no: p.idNo ?? null,
    nationality: p.nationality ?? null, room_type: p.roomType ?? null, room_no: p.roomNo ?? null,
    dietary: p.dietary ?? null, phone: p.phone ?? null, emergency: p.emergency ?? null, note: p.note ?? null,
  })));

  // Flights + segments + fares.
  const flights = draft.flights ?? [];
  const flightRows = flights.map((f, i) => ({ quote_id: qid, legacy_flight_id: f.id ?? null, note: f.note ?? null, sort_order: i }));
  const insertedFlights = await insert(client, 'quote_flights', flightRows, { select: 'id, legacy_flight_id' });
  const fmap = new Map(insertedFlights.map((row) => [row.legacy_flight_id, row.id]));
  const segs = [], fares = [];
  for (const f of flights) {
    const fid = fmap.get(f.id);
    (f.segments ?? []).forEach((s, i) => segs.push({
      flight_id: fid, date: s.date ?? null, flight_no: s.flightNo ?? null, airline_code: s.airlineCode ?? null,
      airline_name: s.airlineName ?? null, dep_airport: s.depAirport ?? null, arr_airport: s.arrAirport ?? null,
      dep_city: s.depCity ?? null, arr_city: s.arrCity ?? null, dep_time: s.depTime ?? null, arr_time: s.arrTime ?? null,
      dep_day_offset: s.depDayOffset ?? null, arr_day_offset: s.arrDayOffset ?? null, sort_order: i,
    }));
    (f.fares ?? []).forEach((fa, i) => fares.push({
      flight_id: fid, legacy_fare_id: fa.id ?? null, label: fa.label ?? '', amount: fa.amount ?? 0,
      cur: fa.cur ?? 'VND', sort_order: i,
    }));
  }
  await insert(client, 'quote_flight_segments', segs);
  await insert(client, 'quote_flight_fares', fares);

  // Workflow steps + logs.
  const workflow = draft.workflow ?? [];
  const stepRows = workflow.map((w, i) => ({
    quote_id: qid, legacy_step_id: w.id ?? null, label: w.label ?? '', status: w.status ?? 'todo',
    step_key: w.key ?? null, due_offset: w.dueOffset ?? null, start_date: dateOnly(w.startDate),
    due_date: dateOnly(w.dueDate), done_date: dateOnly(w.doneDate),
    assignee_user_id: r.resolve(w.assignee), assignee_username: w.assignee ?? null, note: w.note ?? null, sort_order: i,
  }));
  const insertedSteps = await insert(client, 'quote_workflow_steps', stepRows, { select: 'id, legacy_step_id' });
  const smap = new Map(insertedSteps.map((row) => [row.legacy_step_id, row.id]));
  const logs = [];
  for (const w of workflow) {
    const sid = smap.get(w.id);
    (w.log ?? []).forEach((l, i) => logs.push({
      step_id: sid, at: iso(l.at) ?? undefined, by_name: l.by ?? '', action: l.action ?? '', sort_order: i,
    }));
  }
  await insert(client, 'quote_workflow_logs', logs);

  // Collaborators (from index entry; fall back to project.collaborators).
  const collabs = indexEntry.collaborators ?? project?.collaborators ?? [];
  await insert(client, 'quote_collaborators', collabs.map((cb) => ({
    quote_id: qid, user_id: r.resolve(cb.u), username: cb.u ?? null, name: cb.name ?? '',
  })));

  // Versions.
  await insert(client, 'quote_versions', (project?.versions ?? []).map((v) => ({
    quote_id: qid, version_no: v.versionNo, saved_at: iso(v.savedAt) ?? undefined,
    saved_by: nameFromActor(v.savedBy) || '', note: v.note ?? '', state: v.state ?? {},
  })));
}

export async function loadQuotes(client, dump, r, customerMap) {
  const pairs = [
    ['viettours/quote_history', dump.collections.quote_projects ?? {}],
    ['viettours/dmc_quote_history', dump.collections.dmc_quote_projects ?? {}],
  ];
  for (const [indexKey, projects] of pairs) {
    const entries = dump.singles[indexKey]?.quotes ?? [];
    for (const entry of entries) {
      await loadOne(client, entry, projects[entry.cloudId], r, customerMap);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/quotes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: node --check + commit**

```bash
node --check scripts/etl/quotes.mjs
git add scripts/etl/quotes.mjs tests/etl/quotes.test.ts
git commit -m "feat(supabase): Phase 6 quotes loader (regular + DMC unified, shredded children)"
```

---

## Task 7: Itineraries + menus loaders

**Files:**
- Create: `scripts/etl/itineraries.mjs`
- Test: `tests/etl/itineraries.test.ts`

**Interfaces:**
- Consumes: `insert`, resolver `r`.
- Produces: `loadItineraries(client, dump, r): Promise<void>` (itineraries + days + flights, from `tour_itineraries` collection); `loadMenus(client, dump, r): Promise<void>` (menus + days, from `tour_menus`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/etl/itineraries.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient, resetAll } from '../../scripts/etl/db.mjs';
import { loadProfiles, makeResolver } from '../../scripts/etl/profiles.mjs';
import { loadItineraries, loadMenus } from '../../scripts/etl/itineraries.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));
const c = serviceClient();

describe('etl itineraries + menus', () => {
  beforeAll(async () => {
    await resetAll(c);
    const r = makeResolver(await loadProfiles(c, dump));
    await loadItineraries(c, dump, r);
    await loadMenus(c, dump, r);
  });

  it('loads itinerary with days, flights, and start_date', async () => {
    const { data } = await c.from('itineraries').select('legacy_id, start_date, created_by_name');
    expect(data).toHaveLength(1);
    expect(data![0].start_date).toBe('2026-07-01');
    const { count: days } = await c.from('itinerary_days').select('*', { count: 'exact', head: true });
    const { count: fl } = await c.from('itinerary_flights').select('*', { count: 'exact', head: true });
    expect(days).toBe(1); expect(fl).toBe(1);
  });

  it('loads menu with days', async () => {
    const { count: menus } = await c.from('menus').select('*', { count: 'exact', head: true });
    const { count: mdays } = await c.from('menu_days').select('*', { count: 'exact', head: true });
    expect(menus).toBe(1); expect(mdays).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/itineraries.test.ts`
Expected: FAIL — `itineraries.mjs` not found.

- [ ] **Step 3: Write `scripts/etl/itineraries.mjs`**

```js
// scripts/etl/itineraries.mjs — itineraries (+days/flights) and menus (+days).
import { insert } from './db.mjs';
import { iso, dateOnly, nameFromActor } from './util.mjs';

export async function loadItineraries(client, dump, r) {
  const docs = Object.values(dump.collections.tour_itineraries ?? {});
  const rows = docs.map((x) => ({
    legacy_id: x.id, code: x.code ?? null, type: x.type ?? 'ND', continent: x.continent ?? null,
    country: x.country ?? null, seq: x.seq ?? 0, title: x.title ?? '', destination: x.destination ?? null,
    days: x.days ?? 0, nights: x.nights ?? 0, intro: x.intro ?? '', includes: x.includes ?? [], excludes: x.excludes ?? [],
    exec: x.exec ?? null, linked_quote_id: x.linkedQuoteId ?? null, linked_quote_name: x.linkedQuoteName ?? null,
    start_date: dateOnly(x.startDate),
    created_by: r.resolve(x.createdBy), created_by_name: nameFromActor(x.createdBy) || null,
    created_at: iso(x.createdAt) ?? undefined, updated_at: iso(x.updatedAt), updated_by_name: nameFromActor(x.updatedBy) || null,
  }));
  const inserted = await insert(client, 'itineraries', rows, { select: 'id, legacy_id' });
  const map = new Map(inserted.map((row) => [row.legacy_id, row.id]));
  const days = [], flights = [];
  for (const x of docs) {
    const iid = map.get(x.id);
    (x.schedule ?? []).forEach((d, i) => days.push({
      itinerary_id: iid, day_num: d.day ?? i + 1, date: d.date ?? null, title: d.title ?? '',
      meals: d.meals ?? { B: false, L: false, D: false }, meal_note: d.mealNote ?? '',
      segments: d.segments ?? [], sort_order: i,
    }));
    (x.flights ?? []).forEach((f, i) => flights.push({
      itinerary_id: iid, legacy_flight_id: f.id ?? null, group_text: f.group ?? null, leg: f.leg ?? null,
      flight_no: f.flightNo ?? null, dep: f.dep ?? null, arr: f.arr ?? null, dep_airport: f.depAirport ?? null,
      dep_time: f.depTime ?? null, arr_airport: f.arrAirport ?? null, arr_time: f.arrTime ?? null,
      dep_day_offset: f.depDayOffset ?? null, arr_day_offset: f.arrDayOffset ?? null, sort_order: i,
    }));
  }
  await insert(client, 'itinerary_days', days);
  await insert(client, 'itinerary_flights', flights);
}

export async function loadMenus(client, dump, r) {
  const docs = Object.values(dump.collections.tour_menus ?? {});
  const rows = docs.map((x) => ({
    legacy_id: x.id, code: x.code ?? null, type: x.type ?? 'ND', continent: x.continent ?? null,
    country: x.country ?? null, seq: x.seq ?? 0, title: x.title ?? '', destination: x.destination ?? null, days: x.days ?? 0,
    linked_itinerary_id: x.linkedItineraryId ?? null, linked_itinerary_name: x.linkedItineraryName ?? null,
    linked_quote_id: x.linkedQuoteId ?? null, linked_quote_name: x.linkedQuoteName ?? null,
    created_by: r.resolve(x.createdBy), created_by_name: nameFromActor(x.createdBy) || null,
    created_at: iso(x.createdAt) ?? undefined, updated_at: iso(x.updatedAt), updated_by_name: nameFromActor(x.updatedBy) || null,
  }));
  const inserted = await insert(client, 'menus', rows, { select: 'id, legacy_id' });
  const map = new Map(inserted.map((row) => [row.legacy_id, row.id]));
  const days = [];
  for (const x of docs) {
    const mid = map.get(x.id);
    (x.schedule ?? []).forEach((d, i) => days.push({
      menu_id: mid, day_num: d.day ?? i + 1, date: d.date ?? null, city: d.city ?? null,
      meals: d.meals ?? [], sort_order: i,
    }));
  }
  await insert(client, 'menu_days', days);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/itineraries.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: node --check + commit**

```bash
node --check scripts/etl/itineraries.mjs
git add scripts/etl/itineraries.mjs tests/etl/itineraries.test.ts
git commit -m "feat(supabase): Phase 6 itineraries + menus loaders"
```

---

## Task 8: Visa procedures + visa projects loaders

**Files:**
- Create: `scripts/etl/visa.mjs`
- Test: `tests/etl/visa.test.ts`

**Interfaces:**
- Consumes: `insert`, resolver `r`.
- Produces: `loadVisaProcedures(client, dump, r): Promise<void>` (from `visa_procedures` collection); `loadVisaProjects(client, dump, r): Promise<void>` (from `visa_projects` single). Both resolve `created_by` + collaborator/staff username arrays to UUID arrays, preserving the username arrays.

- [ ] **Step 1: Write the failing test**

```ts
// tests/etl/visa.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient, resetAll } from '../../scripts/etl/db.mjs';
import { loadProfiles, makeResolver } from '../../scripts/etl/profiles.mjs';
import { loadVisaProcedures, loadVisaProjects } from '../../scripts/etl/visa.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));
const c = serviceClient();

describe('etl visa', () => {
  let r: ReturnType<typeof makeResolver>;
  beforeAll(async () => {
    await resetAll(c);
    r = makeResolver(await loadProfiles(c, dump));
    await loadVisaProcedures(c, dump, r);
    await loadVisaProjects(c, dump, r);
  });

  it('loads visa procedure resolving created_by + collaborators array', async () => {
    const { data } = await c.from('visa_procedures').select('legacy_id, created_by, created_by_username, collaborators, collaborator_usernames');
    expect(data).toHaveLength(1);
    expect(data![0].created_by).toBe(r.resolve('tony'));
    expect(data![0].created_by_username).toBe('tony');
    expect(data![0].collaborators).toEqual([r.resolve('mai')]);
    expect(data![0].collaborator_usernames).toEqual(['mai']);
  });

  it('loads visa project resolving main/support/collaborator staff arrays', async () => {
    const { data } = await c.from('visa_projects').select('legacy_id, main_staff, support_staff, collaborators, main_staff_usernames, created_by_username');
    expect(data).toHaveLength(1);
    expect(data![0].main_staff).toEqual([r.resolve('tony')]);
    expect(data![0].support_staff).toEqual([r.resolve('mai')]);
    expect(data![0].collaborators).toEqual([r.resolve('linh')]);
    expect(data![0].main_staff_usernames).toEqual(['tony']);
    expect(data![0].created_by_username).toBe('tony');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/visa.test.ts`
Expected: FAIL — `visa.mjs` not found.

- [ ] **Step 3: Write `scripts/etl/visa.mjs`**

```js
// scripts/etl/visa.mjs — visa_procedures + visa_projects (uuid[] staff/collab arrays).
import { insert } from './db.mjs';
import { iso, dateOnly, nameFromActor } from './util.mjs';

export async function loadVisaProcedures(client, dump, r) {
  const docs = Object.values(dump.collections.visa_procedures ?? {});
  const rows = docs.map((x) => ({
    legacy_id: x.id, code: x.code ?? '', title: x.title ?? '', country: x.country ?? '',
    visa_type: x.visaType ?? null, is_template: x.isTemplate ?? false,
    sections: x.sections ?? [], versions: x.versions ?? [],
    collaborators: r.resolveMany(x.collaborators), collaborator_usernames: x.collaborators ?? [],
    linked_quote_id: x.linkedQuoteId ?? null, linked_quote_name: x.linkedQuoteName ?? null,
    created_by: r.resolve(x.createdByUsername), created_by_username: x.createdByUsername ?? null,
    created_by_name: x.createdByName ?? null, created_at: iso(x.createdAt) ?? undefined,
    updated_at: iso(x.updatedAt), updated_by_name: nameFromActor(x.updatedBy) || null,
  }));
  await insert(client, 'visa_procedures', rows);
}

export async function loadVisaProjects(client, dump, r) {
  const projects = dump.singles['viettours/visa_projects']?.projects ?? [];
  const rows = projects.map((x) => ({
    legacy_id: x.id, code: x.code ?? '', name: x.name ?? '', country: x.country ?? '', status: x.status ?? 'planning',
    main_staff: r.resolveMany(x.mainStaff), support_staff: r.resolveMany(x.supportStaff),
    main_staff_usernames: x.mainStaff ?? [], support_staff_usernames: x.supportStaff ?? [],
    documents_summary: x.documentsSummary ?? '', linked_quote_id: x.linkedQuoteId ?? null,
    linked_quote_name: x.linkedQuoteName ?? null, linked_proc_ids: x.linkedProcIds ?? [],
    apply_count: x.applyCount ?? 0, passed_count: x.passedCount ?? 0, failed_count: x.failedCount ?? 0,
    have_visa_count: x.haveVisaCount ?? 0, pending_count: x.pendingCount ?? 0,
    start_date: dateOnly(x.startDate), departure_date: dateOnly(x.departureDate), end_date: dateOnly(x.endDate),
    milestones: x.milestones ?? [], applicants: x.applicants ?? [],
    collaborators: r.resolveMany(x.collaborators), collaborator_usernames: x.collaborators ?? [],
    created_by: r.resolve(x.createdByUsername), created_by_username: x.createdByUsername ?? null,
    created_by_name: x.createdByName ?? null, created_at: iso(x.createdAt) ?? undefined,
    updated_at: iso(x.updatedAt), updated_by_name: nameFromActor(x.updatedBy) || null,
  }));
  await insert(client, 'visa_projects', rows);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/visa.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: node --check + commit**

```bash
node --check scripts/etl/visa.mjs
git add scripts/etl/visa.mjs tests/etl/visa.test.ts
git commit -m "feat(supabase): Phase 6 visa procedures + projects loaders"
```

---

## Task 9: Payments + approvals loaders

**Files:**
- Create: `scripts/etl/payments.mjs`
- Test: `tests/etl/payments.test.ts`

**Interfaces:**
- Consumes: `insert`, resolver `r`.
- Produces: `loadTourPayments(client, dump, r): Promise<void>` (tour_payments + payment_records + custom_cost_items, from `tour_payments` collection; the `payments` map keys become `record_key`); `loadPaymentApprovals(client, dump, r): Promise<void>` (payment_approvals + payment_approval_stages, from the `payment_approvals` single map).

- [ ] **Step 1: Write the failing test**

```ts
// tests/etl/payments.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient, resetAll } from '../../scripts/etl/db.mjs';
import { loadProfiles, makeResolver } from '../../scripts/etl/profiles.mjs';
import { loadTourPayments, loadPaymentApprovals } from '../../scripts/etl/payments.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));
const c = serviceClient();

describe('etl payments', () => {
  let r: ReturnType<typeof makeResolver>;
  beforeAll(async () => {
    await resetAll(c);
    r = makeResolver(await loadProfiles(c, dump));
    await loadTourPayments(c, dump, r);
    await loadPaymentApprovals(c, dump, r);
  });

  it('loads tour payments with records + custom items', async () => {
    const { data: tp } = await c.from('tour_payments').select('tour_key');
    expect(tp).toEqual([{ tour_key: 'tourA' }]);
    const { data: rec } = await c.from('payment_records').select('record_key, supplier');
    expect(rec![0].record_key).toBe('hotel::HotelX');
    const { count: ci } = await c.from('custom_cost_items').select('*', { count: 'exact', head: true });
    expect(ci).toBe(1);
  });

  it('loads approvals with stages, resolving approver UUID', async () => {
    const { data: ap } = await c.from('payment_approvals').select('approval_key, current_stage, final_status');
    expect(ap![0].approval_key).toBe('tourA::deposit');
    expect(ap![0].final_status).toBe('approved');
    const { data: st } = await c.from('payment_approval_stages').select('stage, status, approver_user_id, approver_username');
    expect(st![0].stage).toBe(1);
    expect(st![0].approver_user_id).toBe(r.resolve('tony'));
    expect(st![0].approver_username).toBe('tony');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/payments.test.ts`
Expected: FAIL — `payments.mjs` not found.

- [ ] **Step 3: Write `scripts/etl/payments.mjs`**

```js
// scripts/etl/payments.mjs — tour_payments (+records/custom items) and payment_approvals (+stages).
import { insert } from './db.mjs';
import { iso } from './util.mjs';

export async function loadTourPayments(client, dump, r) {
  const docs = dump.collections.tour_payments ?? {};
  const rows = Object.entries(docs).map(([tourKey, x]) => ({
    tour_key: tourKey, updated_at: iso(x.updatedAt), updated_by: x.updatedBy ?? null,
  }));
  const inserted = await insert(client, 'tour_payments', rows, { select: 'id, tour_key' });
  const map = new Map(inserted.map((row) => [row.tour_key, row.id]));
  const records = [], custom = [];
  for (const [tourKey, x] of Object.entries(docs)) {
    const tpid = map.get(tourKey);
    for (const [recordKey, p] of Object.entries(x.payments ?? {})) {
      records.push({
        tour_payment_id: tpid, record_key: recordKey, supplier: p.supplier ?? null,
        tracked: p.tracked ?? null, custom_amount: p.customAmount ?? null,
        installments: p.installments ?? [], note: p.note ?? null,
      });
    }
    (x.customItems ?? []).forEach((ci, i) => custom.push({
      tour_payment_id: tpid, item_key: ci.key, cat_id: ci.catId, cat_label: ci.catLabel ?? null,
      cat_icon: ci.catIcon ?? null, cat_color: ci.catColor ?? null, name: ci.name ?? '',
      amount: ci.amount ?? 0, sort_order: i,
    }));
  }
  await insert(client, 'payment_records', records);
  await insert(client, 'custom_cost_items', custom);
}

export async function loadPaymentApprovals(client, dump, r) {
  const doc = dump.singles['viettours/payment_approvals'] ?? {};
  const rows = Object.entries(doc).map(([approvalKey, x]) => ({
    approval_key: approvalKey, current_stage: x.currentStage ?? null, final_status: x.finalStatus ?? null,
    intended_approver1_name: x.intendedApprover1Name ?? null, intended_approver2_name: x.intendedApprover2Name ?? null,
  }));
  const inserted = await insert(client, 'payment_approvals', rows, { select: 'id, approval_key' });
  const map = new Map(inserted.map((row) => [row.approval_key, row.id]));
  const stages = [];
  for (const [approvalKey, x] of Object.entries(doc)) {
    const aid = map.get(approvalKey);
    for (const stage of [1, 2]) {
      const s = x[`stage${stage}`];
      if (!s) continue;
      stages.push({
        approval_id: aid, stage, status: s.status, approver_user_id: r.resolve(s.approverUsername),
        approver_username: s.approverUsername ?? null, approver_name: s.approverName ?? null,
        note: s.note ?? '', updated_at: iso(s.updatedAt) ?? undefined,
      });
    }
  }
  await insert(client, 'payment_approval_stages', stages);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/payments.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: node --check + commit**

```bash
node --check scripts/etl/payments.mjs
git add scripts/etl/payments.mjs tests/etl/payments.test.ts
git commit -m "feat(supabase): Phase 6 tour payments + approvals loaders"
```

---

## Task 10: Notifications, threads, chat loaders + exporter chat support

**Files:**
- Create: `scripts/etl/notifications.mjs`
- Modify: `scripts/firestore-export.mjs` (add `chats` to `DYNAMIC_COLLECTIONS`)
- Test: `tests/etl/notifications.test.ts`

**Interfaces:**
- Consumes: `insert`, resolver `r`.
- Produces: `loadNotifications(client, dump, r)` (per-user `user_notifications/{username}` → `notifications`, owner `user_id` = the doc-key username); `loadThreads(client, dump, r)` (notification_threads + members + comments); `loadChats(client, dump, r)` (chats + chat_members + chat_messages, with `last_read` from the doc's `reads` map).

- [ ] **Step 1: Write the failing test**

```ts
// tests/etl/notifications.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient, resetAll } from '../../scripts/etl/db.mjs';
import { loadProfiles, makeResolver } from '../../scripts/etl/profiles.mjs';
import { loadNotifications, loadThreads, loadChats } from '../../scripts/etl/notifications.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));
const c = serviceClient();

describe('etl notifications + threads + chat', () => {
  let r: ReturnType<typeof makeResolver>;
  beforeAll(async () => {
    await resetAll(c);
    r = makeResolver(await loadProfiles(c, dump));
    await loadNotifications(c, dump, r);
    await loadThreads(c, dump, r);
    await loadChats(c, dump, r);
  });

  it('loads per-user notifications with owner user_id from the doc key', async () => {
    const { data } = await c.from('notifications').select('user_id, title, priority, created_by');
    expect(data).toHaveLength(1);
    expect(data![0].user_id).toBe(r.resolve('mai'));   // doc key 'mai'
    expect(data![0].priority).toBe('high');
    expect(data![0].created_by).toBe(r.resolve('tony'));
  });

  it('loads thread with members + comments', async () => {
    const { data: th } = await c.from('notification_threads').select('id, created_by');
    expect(th![0].id).toBe('th1');
    const { count: mem } = await c.from('notification_thread_members').select('*', { count: 'exact', head: true });
    const { count: com } = await c.from('notification_comments').select('*', { count: 'exact', head: true });
    expect(mem).toBe(2); expect(com).toBe(1);
  });

  it('loads chat with members (last_read from reads) + messages', async () => {
    const { data: ch } = await c.from('chats').select('id, is_group, last_text');
    expect(ch![0].id).toBe('dm_mai__tony');
    const { data: mem } = await c.from('chat_members').select('username, user_id, last_read').order('username');
    expect(mem).toHaveLength(2);
    expect(mem!.find((m) => m.username === 'tony')!.last_read).toBe('2026-06-01T01:00:00Z');
    const { data: msg } = await c.from('chat_messages').select('legacy_id, by_user_id, by_username, text');
    expect(msg![0].by_user_id).toBe(r.resolve('tony'));
    expect(msg![0].text).toBe('hey');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/notifications.test.ts`
Expected: FAIL — `notifications.mjs` not found.

- [ ] **Step 3: Write `scripts/etl/notifications.mjs`**

```js
// scripts/etl/notifications.mjs — notifications, threads (+members/comments), chats (+members/messages).
import { insert } from './db.mjs';
import { iso } from './util.mjs';

export async function loadNotifications(client, dump, r) {
  const docs = dump.collections.user_notifications ?? {};
  const rows = [];
  for (const [ownerUsername, doc] of Object.entries(docs)) {
    const ownerId = r.resolve(ownerUsername);
    if (!ownerId) continue;  // notifications table requires a non-null owner (NOT NULL user_id)
    for (const n of doc.notifications ?? []) {
      rows.push({
        legacy_id: n.id ?? null, user_id: ownerId, type: n.type, title: n.title ?? '', message: n.message ?? '',
        created_by: r.resolve(n.createdBy), created_by_name: n.createdByName ?? null,
        created_at: iso(n.createdAt) ?? undefined, read: n.read ?? false, link: n.link ?? null,
        thread_id: n.threadId ?? null, data: n.data ?? null, priority: n.priority ?? null, reminder: n.reminder ?? null,
      });
    }
  }
  await insert(client, 'notifications', rows);
}

export async function loadThreads(client, dump, r) {
  const docs = dump.collections.notification_threads ?? {};
  const threadRows = Object.values(docs).map((x) => ({
    id: x.id, title: x.title ?? '', link: x.link ?? null, act_type: x.actType ?? null, status: x.status ?? null,
    created_by: r.resolve(x.createdBy), created_by_name: x.createdByName ?? null,
    created_at: iso(x.createdAt) ?? undefined, updated_at: iso(x.updatedAt), updated_by_name: x.updatedByName ?? null,
    data: x.data ?? null,
  }));
  await insert(client, 'notification_threads', threadRows);
  const members = [], comments = [];
  for (const x of Object.values(docs)) {
    (x.members ?? []).forEach((u) => members.push({ thread_id: x.id, user_id: r.resolve(u), username: u }));
    (x.comments ?? []).forEach((cm, i) => comments.push({
      thread_id: x.id, legacy_id: cm.id ?? null, by_user_id: r.resolve(cm.by), by_username: cm.by ?? null,
      by_name: cm.byName ?? '', text: cm.text ?? '', at: iso(cm.at) ?? undefined, sort_order: i,
    }));
  }
  await insert(client, 'notification_thread_members', members);
  await insert(client, 'notification_comments', comments);
}

export async function loadChats(client, dump, r) {
  const docs = dump.collections.chats ?? {};
  const chatRows = Object.values(docs).map((x) => ({
    id: x.id, is_group: x.isGroup ?? false, title: x.title ?? null,
    created_by: r.resolve(x.createdBy), created_by_name: x.createdByName ?? null,
    created_at: iso(x.createdAt) ?? undefined, last_at: iso(x.lastAt), last_text: x.lastText ?? null,
    last_by_name: x.lastByName ?? null,
  }));
  await insert(client, 'chats', chatRows);
  const members = [], messages = [];
  for (const x of Object.values(docs)) {
    (x.members ?? []).forEach((u) => members.push({
      chat_id: x.id, user_id: r.resolve(u), username: u, last_read: iso(x.reads?.[u]),
    }));
    (x.messages ?? []).forEach((m) => messages.push({
      chat_id: x.id, legacy_id: m.id ?? null, by_user_id: r.resolve(m.by), by_username: m.by ?? null,
      by_name: m.byName ?? '', at: iso(m.at) ?? undefined, text: m.text ?? null, file: m.file ?? null,
      reply_to: m.replyTo ?? null, edited_at: iso(m.editedAt), deleted: m.deleted ?? false,
      reactions: m.reactions ?? {},
    }));
  }
  await insert(client, 'chat_members', members);
  await insert(client, 'chat_messages', messages);
}
```

- [ ] **Step 4: Add `chats` to the exporter so real runs include chat data**

In `scripts/firestore-export.mjs`, add `'chats'` to the `DYNAMIC_COLLECTIONS` array (chat lives in `chats/{id}` docs with embedded `messages[]` + `reads{}`):

```js
const DYNAMIC_COLLECTIONS = [
  'quote_projects',
  'dmc_quote_projects',
  'user_notifications',
  'notification_threads',
  'tour_payments',
  'tour_itineraries',
  'tour_menus',
  'visa_procedures',
  'chats',
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/notifications.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: node --check + commit**

```bash
node --check scripts/etl/notifications.mjs && node --check scripts/firestore-export.mjs
git add scripts/etl/notifications.mjs scripts/firestore-export.mjs tests/etl/notifications.test.ts
git commit -m "feat(supabase): Phase 6 notifications/threads/chat loaders + export chats"
```

---

## Task 11: Orchestrator + CLI + real-export path

**Files:**
- Create: `scripts/supabase-etl.mjs`
- Test: `tests/etl/orchestrator.test.ts`

**Interfaces:**
- Consumes: every loader (Tasks 3–10), `serviceClient`/`resetAll`.
- Produces: `runEtl(client, dump, opts = {}): Promise<{ unmapped: string[] }>` — runs `resetAll` then all loaders in spec order, threading the username/customer/supplier maps. After loading, if `opts.allowUnmapped` is falsy and any unmapped usernames were collected, throws `Error('Unmapped usernames: …')`. CLI portion (only when run directly) reads `DUMP_PATH` (default `firestore-dump.json`), builds the service client, and runs.

- [ ] **Step 1: Write the failing test**

```ts
// tests/etl/orchestrator.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient } from '../../scripts/etl/db.mjs';
import { runEtl } from '../../scripts/supabase-etl.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));
const c = serviceClient();

describe('etl orchestrator', () => {
  it('throws on unmapped usernames unless allowed', async () => {
    await expect(runEtl(c, dump)).rejects.toThrow(/Unmapped usernames: ghost/);
  });

  it('runs end to end and reports unmapped when allowed', async () => {
    const res = await runEtl(c, dump, { allowUnmapped: true });
    expect(res.unmapped).toEqual(['ghost']);
    const { count } = await c.from('quotes').select('*', { count: 'exact', head: true });
    expect(count).toBe(2);
    // idempotent: a second run reloads cleanly (no duplicate-key errors)
    const res2 = await runEtl(c, dump, { allowUnmapped: true });
    expect(res2.unmapped).toEqual(['ghost']);
    const { count: count2 } = await c.from('quotes').select('*', { count: 'exact', head: true });
    expect(count2).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/orchestrator.test.ts`
Expected: FAIL — `supabase-etl.mjs` not found.

- [ ] **Step 3: Write `scripts/supabase-etl.mjs`**

```js
#!/usr/bin/env node
// scripts/supabase-etl.mjs — orchestrates the Firestore->Supabase ETL in spec order.
import { readFileSync } from 'node:fs';
import { serviceClient, resetAll } from './etl/db.mjs';
import { loadProfiles, makeResolver } from './etl/profiles.mjs';
import { loadCustomers, loadSuppliers, loadNccProducts } from './etl/customers.mjs';
import { loadContracts, loadRateCard, loadFxRates, loadRestaurants, loadPois, loadVisaProducts } from './etl/misc.mjs';
import { loadQuotes } from './etl/quotes.mjs';
import { loadItineraries, loadMenus } from './etl/itineraries.mjs';
import { loadVisaProcedures, loadVisaProjects } from './etl/visa.mjs';
import { loadTourPayments, loadPaymentApprovals } from './etl/payments.mjs';
import { loadNotifications, loadThreads, loadChats } from './etl/notifications.mjs';

export async function runEtl(client, dump, opts = {}) {
  await resetAll(client);

  // 1. Keystone: profiles + map.
  const usernameMap = await loadProfiles(client, dump);
  const r = makeResolver(usernameMap);

  // 2. Independent entities.
  const customerMap = await loadCustomers(client, dump, r);
  const supplierMap = await loadSuppliers(client, dump, r);
  await loadNccProducts(client, dump, r, supplierMap);
  await loadContracts(client, dump, r);
  await loadRateCard(client, dump, r);
  await loadFxRates(client, dump, r);
  await loadRestaurants(client, dump, r);
  await loadPois(client, dump, r);
  await loadVisaProducts(client, dump, r);

  // 3. Quotes (regular + DMC).
  await loadQuotes(client, dump, r, customerMap);

  // 4. Itineraries, menus, visa.
  await loadItineraries(client, dump, r);
  await loadMenus(client, dump, r);
  await loadVisaProcedures(client, dump, r);
  await loadVisaProjects(client, dump, r);

  // 5. Payments, notifications, threads, chat.
  await loadTourPayments(client, dump, r);
  await loadPaymentApprovals(client, dump, r);
  await loadNotifications(client, dump, r);
  await loadThreads(client, dump, r);
  await loadChats(client, dump, r);

  const unmapped = [...r.unmapped].sort();
  if (unmapped.length && !opts.allowUnmapped) {
    throw new Error(`Unmapped usernames: ${unmapped.join(', ')} — pass ALLOW_UNMAPPED=1 to accept (deleted users).`);
  }
  return { unmapped };
}

// CLI: node scripts/supabase-etl.mjs  (reads DUMP_PATH, default firestore-dump.json)
if (import.meta.url === `file://${process.argv[1]}`) {
  const dumpPath = process.env.DUMP_PATH || 'firestore-dump.json';
  const dump = JSON.parse(readFileSync(dumpPath, 'utf8'));
  const client = serviceClient();
  runEtl(client, dump, { allowUnmapped: process.env.ALLOW_UNMAPPED === '1' })
    .then((res) => {
      console.log(`ETL complete. Unmapped usernames: ${res.unmapped.length ? res.unmapped.join(', ') : '(none)'}`);
    })
    .catch((e) => { console.error('ETL failed:', e.message); process.exit(1); });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/orchestrator.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: node --check + commit**

```bash
node --check scripts/supabase-etl.mjs
git add scripts/supabase-etl.mjs tests/etl/orchestrator.test.ts
git commit -m "feat(supabase): Phase 6 ETL orchestrator + CLI + unmapped-username gate"
```

---

## Task 12: Verification harness — full run, all counts + checksums

**Files:**
- Create: `tests/etl/verify.test.ts`

**Interfaces:**
- Consumes: `runEtl` (Task 11), `EXPECTED` (Task 2).

- [ ] **Step 1: Write the failing test**

```ts
// tests/etl/verify.test.ts — single full ETL run asserted against the fixture's known totals.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient } from '../../scripts/etl/db.mjs';
import { runEtl } from '../../scripts/supabase-etl.mjs';
import { EXPECTED } from './fixtures/expected.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));
const c = serviceClient();

async function count(table: string): Promise<number> {
  const { count, error } = await c.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

describe('etl verification harness', () => {
  let result: { unmapped: string[] };
  beforeAll(async () => { result = await runEtl(c, dump, { allowUnmapped: true }); }, 60000);

  it('reports exactly the expected unmapped usernames', () => {
    expect(result.unmapped).toEqual(EXPECTED.unmapped_usernames);
  });

  it('matches per-table row counts for every table', async () => {
    const tables = Object.keys(EXPECTED).filter((k) => !k.startsWith('sum_') && k !== 'unmapped_usernames');
    const actual: Record<string, number> = {};
    for (const t of tables) actual[t] = await count(t);
    const expected: Record<string, number> = {};
    for (const t of tables) expected[t] = (EXPECTED as Record<string, number>)[t];
    expect(actual).toEqual(expected);
  });

  it('matches financial checksums', async () => {
    const { data: q } = await c.from('quotes').select('total_cost');
    expect(q!.reduce((s, x) => s + Number(x.total_cost), 0)).toBe(EXPECTED.sum_total_cost);
    const { data: fx } = await c.from('fx_rates').select('rate_to_vnd');
    expect(fx!.reduce((s, x) => s + Number(x.rate_to_vnd), 0)).toBe(EXPECTED.sum_fx_rate_to_vnd);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (then passes)**

Run: `npx vitest run --config vitest.integration.config.ts tests/etl/verify.test.ts`
Expected: This test should PASS immediately if Tasks 1–11 are correct. If any count mismatches, the failure names the exact table — fix the offending loader (or the `EXPECTED`/fixture if the fixture itself is wrong), then re-run. Do NOT adjust `EXPECTED` to paper over a real loader bug.

- [ ] **Step 3: Run the whole ETL suite**

Run: `npm run test:etl`
Expected: all ETL test files pass.

- [ ] **Step 4: Commit**

```bash
git add tests/etl/verify.test.ts
git commit -m "test(supabase): Phase 6 ETL verification harness (counts + checksums)"
```

---

## Task 13: Docs + memory update

**Files:**
- Modify: `docs/supabase-setup.md` (add a Phase 6 section)
- Modify: `/Users/vitahoang/.claude-max/projects/-Users-vitahoang-Code-tour-cost-calculator/memory/supabase-migration.md`

- [ ] **Step 1: Add a Phase 6 section to `docs/supabase-setup.md`**

Append a `## Phase 6 — ETL (Firestore → Supabase)` section documenting: the dump shape and how to produce a real one (`SA_PATH=prod-sa.json node scripts/firestore-export.mjs`); how to run the ETL locally against a real export (`SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… DUMP_PATH=firestore-dump.json npm run etl`); the idempotent truncate-and-reload behaviour and `@viettours.com.vn` auth-user deletion; the `ALLOW_UNMAPPED=1` gate and what unmapped usernames mean (deleted users → null FK + preserved name); that auth users are created passwordless (magic-link parity); the verification harness (`npm run test:etl`) and that it runs against the local Docker stack only; and the explicit note that **the prod cloud run, deploy-secret wiring, Worker redeploy, and Firebase removal are Phase 7 (cutover), not Phase 6.** Also note the exporter now includes `chats`.

- [ ] **Step 2: Run the full gate**

Run: `npm run typecheck && npm run lint`
Expected: clean (the new `.test.ts` files type-check; `.mjs` files are outside the TS project). If lint flags the test files, fix per the existing `tests/supabase/` conventions.

- [ ] **Step 3: Commit docs**

```bash
git add docs/supabase-setup.md
git commit -m "docs(supabase): Phase 6 ETL runbook + verification harness"
```

- [ ] **Step 4: Update the migration memory**

Update `memory/supabase-migration.md`: mark Phase 6 DONE (ETL `scripts/supabase-etl.mjs` + `scripts/etl/*` loaders + `tests/etl/` harness, local-Docker dry-run green, synthetic fixture, `chats` added to exporter, unmapped-username gate). Note **Next: Phase 7 (cutover)** and carry forward the still-open items (add `VITE_SUPABASE_*` repo secrets + deploy.yml env; push migrations 0017–0027 to prod `zkzrvctqwnhzklvsoahk`; bootstrap-CEO GUC fix; Worker deploy + `SUPABASE_PROJECT_REF` at cutover). This is a memory-file edit, not a git commit.

---

## Self-Review notes

- **Spec coverage:** ETL ordering (profiles→independent→quotes→itin/menu/visa→payments/notif) — Tasks 3–10 in that order, wired by Task 11. Idempotent truncate-reload — Task 1 `resetAll` + Task 11 calls it first; Task 11 test asserts a clean second run. `auth.admin.createUser` keystone + username→UUID map — Task 3. Re-keying safety net / unmapped-fails-loudly — Task 3 resolver + Task 11 gate + Task 5/12 tests assert the `ghost` case. Deleted-user display strings + null FK — Task 5 poi test. Verification counts + checksums — Task 12. Synthetic fixture + real-export path — Tasks 2 + 11 CLI. Chat (absent from exporter) — Task 10 adds it to both the exporter and the ETL.
- **Type consistency:** loader signatures are uniform `(client, dump, r[, map])`; maps returned by `loadCustomers`/`loadSuppliers` are consumed by `loadNccProducts`/`loadQuotes` with matching names; `makeResolver` returns `{resolve, resolveMany, unmapped}` used identically everywhere.
- **Known non-blocking note:** `attachments` and R2 file rows are not migrated by this ETL (files stay in R2, keys are embedded in the JSONB/array columns that ARE migrated, e.g. quote `info`, message `file`); the `attachments` table is populated lazily by the app, matching today's Firestore behaviour. No source doc in the export maps to standalone `attachments` rows.
