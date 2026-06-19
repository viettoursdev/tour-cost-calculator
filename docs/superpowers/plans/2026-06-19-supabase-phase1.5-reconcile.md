# Supabase Migration — Phase 1.5 (Drift Reconciliation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every data-loss gap the drift audit found between the app (`src/types/*`, `fb*` in `src/lib/firebase.ts`, `src/stores/*`) and the Supabase schema + gateway — five field gaps plus the entirely-uncovered chat feature — so no data is silently lost when stores switch to `sb*` in Phase 4.

**Architecture:** Additive only. Each field gap = a migration adding the column(s)/child table + extending the existing `sb*` function(s) to map the field, mirroring `fb*`. The chat feature = 3 new tables (`chats`, `chat_members`, `chat_messages`) with parity RLS + grants + realtime publication + 8 `sb*` functions mirroring the 8 `fb*` chat functions. No store wiring (Phase 4), no `firebase.ts` changes.

**Tech Stack:** `@supabase/supabase-js`, PL/pgSQL (the `save_quote_state` RPC gets a passengers block), Vitest integration tests against local Supabase (Docker), pgTAP for schema, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-06-19-phase1.5-drift-audit.md` (read it — it has the exhaustive field tables, severities, and the full chat data model + proposed DDL). Type sources: `src/types/customer.ts`, `src/types/quote.ts` (`Passenger`, `WorkflowStep`), `src/types/notification.ts`, `src/types/itinerary.ts`, `src/types/chat.ts`. `fb*` references: `src/lib/firebase.ts` (chat fns ~661-753).

## Global Constraints

- **Do NOT modify `src/lib/firebase.ts` or wire any store** (Phase 4). Append to `src/lib/supabase.ts` / `src/lib/supabase/quoteMap.ts`; add migrations + tests.
- **Signature parity:** new/extended `sb*` functions keep the exact `fb*` signature + the optional trailing `client: SupabaseClient = sb`. Extended functions must not change their existing signature.
- **No data loss:** every field the audit flags must round-trip through save→load on the Supabase path (the test proves it). Mirror `fb*` semantics exactly.
- **Migrations continue from 0023** (sequential). New migrations join the **prod-push list (currently 0017–0022 → becomes 0017–00NN)**. New tables get parity RLS (`public.is_viettours_user()` on SELECT + ALL-with-check), 0017-style grants are already covered by `alter default privileges` for `authenticated`/`service_role` (verify a read works after reset), and chat tables join the `supabase_realtime` publication.
- **Conventions:** preserve `created_at`; normalize read timestamps via `new Date(...).toISOString()`; username↔uuid via `usernamesToIds`/`idsToUsernames` (store both uuid + username where the app uses usernames); safe fetch-then-delete; batched child loads (no N+1).
- **Commits:** Conventional Commits; body ends `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. `npm run typecheck && npm run lint` (0 warnings) + `npm run test:integration` green before each commit.

## Scope (from the audit's "Recommended Phase 1.5 Scope")

Field gaps (data-loss): Customer CRM (`source`/`tags`/`interactions`/`nextFollowUp`); Notification (`priority`/`attachments`/`reminder`); Itinerary (`startDate`); Quote `passengers`; Quote `WorkflowStep.attachments`. Whole feature: chat. Plus the cosmetic `WorkflowStep.assignee_user_id` FK populate (folded into the workflow-attachments task).

---

## File Structure

```
supabase/migrations/0023_customer_crm.sql            # customers: source/tags/next_follow_up + customer_interactions table
supabase/migrations/0024_notification_priority.sql   # notifications: priority/reminder
supabase/migrations/0025_itinerary_start_date.sql    # itineraries: start_date
supabase/migrations/0026_quote_passengers.sql        # quote_passengers table
supabase/migrations/0027_chat.sql                    # chats / chat_members / chat_messages + RLS + grants + realtime
supabase/migrations/0021_save_quote_state_rpc.sql    # EDIT: add passengers delete+reinsert block
src/lib/supabase.ts                                  # extend customer/notification/itinerary fns; add 8 chat fns
src/lib/supabase/quoteMap.ts                         # add passengers + per-step attachments to decompose/assemble
tests/supabase/*.test.ts                             # extend customers/simple(itin)/quotes; new chat.test.ts; pgTAP for new tables
docs/supabase-setup.md                               # update prod-push migration list
```

---

## Task 1: Customer CRM fields (source, tags, interactions, nextFollowUp)

**Files:** Create `supabase/migrations/0023_customer_crm.sql`; Modify `src/lib/supabase.ts` (`sbPushCustomers`, `rowToCustomer`, `sbSubscribeCustomers`); Test `tests/supabase/customers.test.ts`.

**Interfaces:** No signature change. `Customer` (`src/types/customer.ts`) gains round-trip for `source?`, `tags?: string[]`, `interactions?: CustomerInteraction[]`, `nextFollowUp?: {date,note,byU,byName}`.

- [ ] **Step 1: Migration** — `supabase/migrations/0023_customer_crm.sql`:
```sql
alter table public.customers add column if not exists source text;
alter table public.customers add column if not exists tags text[] not null default '{}';
alter table public.customers add column if not exists next_follow_up jsonb;

create table if not exists public.customer_interactions (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  legacy_id   text,
  at          timestamptz not null default now(),
  by_username text,
  by_name     text not null default '',
  type        text not null default '',
  text        text not null default '',
  sort_order  int not null default 0
);
create index if not exists customer_interactions_customer_idx on public.customer_interactions(customer_id);
alter table public.customer_interactions enable row level security;
create policy customer_interactions_read  on public.customer_interactions for select using (public.is_viettours_user());
create policy customer_interactions_write on public.customer_interactions for all using (public.is_viettours_user()) with check (public.is_viettours_user());
```
> Read `src/types/customer.ts` for the exact `CustomerInteraction` field names; map them to the `customer_interactions` columns (adjust column names to match if the audit's guess differs). `tags` is a `text[]`; `nextFollowUp` is a small value object → `next_follow_up jsonb`.

- [ ] **Step 2: Write the failing test** (extend `customers.test.ts`): round-trip a customer with `source`, `tags:['vip','intl']`, 2 `interactions`, and a `nextFollowUp` object; assert all four survive `sbPushCustomers` → `sbSubscribeCustomers`.
- [ ] **Step 3: Run, expect FAIL.** `npm run test:integration -- tests/supabase/customers.test.ts`
- [ ] **Step 4: Implement** — extend `sbPushCustomers` upsert payload with `source`, `tags`, `next_follow_up`; `replaceChildren(client,'customer_interactions','customer_id', uuid, rows)` for interactions (resolve `byU`→keep username; sort_order by index); extend `rowToCustomer` to read them back (tags `?? []`, next_follow_up object, interactions from the batched child query — add a batched fetch like `customer_contacts`). Normalize interaction `at` timestamps.
- [ ] **Step 5: Run, expect PASS** + `npm run typecheck && npm run lint`.
- [ ] **Step 6: Commit** — `feat(supabase): customer CRM fields (source/tags/interactions/nextFollowUp)`.

---

## Task 2: Notification priority, attachments, reminder

**Files:** Create `supabase/migrations/0024_notification_priority.sql`; Modify `src/lib/supabase.ts` (`sbSendNotification`, `sbPushNotifications`, `rowToNotif`); Test `tests/supabase/notifications.test.ts`.

**Interfaces:** No signature change. `Notification` gains round-trip for `priority?: 'normal'|'high'|'urgent'`, `attachments?: FileAttachment[]`, `reminder?: {every,deadline?}`.

- [ ] **Step 1: Migration** — `supabase/migrations/0024_notification_priority.sql`:
```sql
alter table public.notifications add column if not exists priority text;
alter table public.notifications add column if not exists reminder jsonb;
```
(Notification attachments use the generic `attachments` table with `parent_type='notification'`, `parent_id` = the notification's `legacy_id`.)

- [ ] **Step 2: Write the failing test** (extend `notifications.test.ts`): send a notification with `priority:'urgent'`, a `reminder:{every:'4h',deadline:'2026-09-01'}`, and 1 attachment; subscribe → assert all three round-trip.
- [ ] **Step 3: Run, expect FAIL.**
- [ ] **Step 4: Implement** — add `priority`, `reminder` to the insert in `sbSendNotification` and the rows in `sbPushNotifications`; read them in `rowToNotif` (`priority ?? undefined`, `reminder ?? undefined`); `saveAttachments(client,'notification', legacyId, notif.attachments ?? [])` on send and `loadAttachmentsForParents(client,'notification', legacyIds)` in the subscribe assembly (set `attachments` per notification).
- [ ] **Step 5: Run, expect PASS** + `npm run typecheck && npm run lint`.
- [ ] **Step 6: Commit** — `feat(supabase): notification priority/reminder/attachments`.

---

## Task 3: Itinerary startDate

**Files:** Create `supabase/migrations/0025_itinerary_start_date.sql`; Modify `src/lib/supabase.ts` (`sbSaveItinerary`, `sbGetItinerary`); Test `tests/supabase/itineraries.test.ts`.

- [ ] **Step 1: Migration** — `alter table public.itineraries add column if not exists start_date date;`
- [ ] **Step 2: Write the failing test** (extend `itineraries.test.ts`): save an itinerary with `startDate:'2026-07-01'`; `sbGetItinerary` → assert `startDate === '2026-07-01'`.
- [ ] **Step 3: Run, expect FAIL.**
- [ ] **Step 4: Implement** — add `start_date: itin.startDate ?? null` to the `sbSaveItinerary` upsert; in `sbGetItinerary` set `startDate: (row.start_date as string) ?? undefined`.
- [ ] **Step 5: Run, expect PASS** + `npm run typecheck && npm run lint`.
- [ ] **Step 6: Commit** — `feat(supabase): itinerary start_date`.

---

## Task 4: Quote passengers (manifest/rooming)

**Files:** Create `supabase/migrations/0026_quote_passengers.sql`; Modify `supabase/migrations/0021_save_quote_state_rpc.sql` (add passengers block); Modify `src/lib/supabase/quoteMap.ts` (`decomposeQuote`, `assembleQuote`) + `src/lib/supabase.ts` (`getQuoteProjectImpl` fetch); Test `tests/supabase/quotes.test.ts`.

**Interfaces:** `QuoteDraft.passengers?: Passenger[]` (`src/types/quote.ts` — read the `Passenger` type for exact fields) round-trips through `sbSaveQuoteState`→`sbGetQuoteProject`.

- [ ] **Step 1: Migration** — `supabase/migrations/0026_quote_passengers.sql` (columns per the `Passenger` type; the audit proposes: name, gender, dob, id_type, id_no, nationality, room_type, room_no, dietary, phone, emergency, note — VERIFY against `src/types/quote.ts:Passenger` and match exactly):
```sql
create table if not exists public.quote_passengers (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.quotes(id) on delete cascade,
  legacy_passenger_id text,
  name text not null default '', gender text, dob text,
  id_type text, id_no text, nationality text,
  room_type text, room_no text, dietary text, phone text, emergency text, note text,
  sort_order int not null default 0
);
create index if not exists quote_passengers_quote_idx on public.quote_passengers(quote_id);
alter table public.quote_passengers enable row level security;
create policy quote_passengers_read  on public.quote_passengers for select using (public.is_viettours_user());
create policy quote_passengers_write on public.quote_passengers for all using (public.is_viettours_user()) with check (public.is_viettours_user());
```
- [ ] **Step 2: Edit the RPC** `0021_save_quote_state_rpc.sql` — add, alongside the other child-replace blocks: `delete from public.quote_passengers where quote_id = v_quote_id;` then a `for elem in select * from jsonb_array_elements(coalesce(p->'passengers','[]'::jsonb)) loop insert into public.quote_passengers (...) values (...) end loop;` mapping each `Passenger` field (snake_case columns ← the payload keys `decomposeQuote` produces).
- [ ] **Step 3: Write the failing test** (extend `quotes.test.ts`): save a quote whose draft has 2 passengers (with rooming fields); `sbGetQuoteProject` → assert `currentState.passengers` deep-equals (content) the saved passengers.
- [ ] **Step 4: Run, expect FAIL** (`npm run test:integration -- tests/supabase/quotes.test.ts` + `npx supabase db reset` for the migration/RPC).
- [ ] **Step 5: Implement** — `decomposeQuote`: add `passengers: passengerRows(d.passengers)` (a mapper like the others, snake_case keys + sort_order); `assembleQuote`: reconstruct `passengers` from the `passengers` rows input; `getQuoteProjectImpl`: fetch `quote_passengers` by quote_id and pass into `assembleQuote`. Update the `AssembleInput` type.
- [ ] **Step 6: Run** `npx supabase db reset && npx supabase test db` (RPC pgTAP still green) + `npm run test:integration -- tests/supabase/quotes.test.ts tests/supabase/quoteMap.test.ts` (extend the quoteMap round-trip test with passengers) + `npm run typecheck && npm run lint`. Expect PASS.
- [ ] **Step 7: Commit** — `feat(supabase): quote passengers (manifest/rooming) — table + RPC + quoteMap`.

---

## Task 5: Quote WorkflowStep attachments (+ assignee_user_id FK)

**Files:** Modify `src/lib/supabase/quoteMap.ts` (workflow mapping) + `src/lib/supabase.ts` (`saveQuoteStateImpl`, `getQuoteProjectImpl`); Test `tests/supabase/quotes.test.ts`.

**Interfaces:** `WorkflowStep.attachments?: FileAttachment[]` round-trips. Uses the generic `attachments` table with `parent_type='quote_workflow_step'`, `parent_id` = `<cloudId>::<legacy_step_id>` (composite so step ids are unique across quotes).

- [ ] **Step 1: Write the failing test** (extend `quotes.test.ts`): save a quote whose draft has a workflow step with 1 attachment; `sbGetQuoteProject` → assert `currentState.workflow[i].attachments` round-trips.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** — the RPC replaces workflow_steps relationally (no attachment column), so attachments save in the GATEWAY layer after the RPC, like `saveAttachments(client,'quote', cloudId, ...)`: in `saveQuoteStateImpl`, after the RPC succeeds, for each `state.workflow` step call `saveAttachments(client, 'quote_workflow_step', \`${cloudId}::${step.id}\`, step.attachments ?? [])`. In `getQuoteProjectImpl`/`assembleQuote`, batch-load via `loadAttachmentsForParents(client,'quote_workflow_step', state.workflow.map(s => \`${cloudId}::${s.id}\`))` and attach to each step. Also (cosmetic #9): populate `assignee_user_id` in `workflowRows` by resolving `assignee`→uuid (the RPC reads `assignee_username` already; add the uuid resolution in the gateway before building the payload, or leave the column null and note it). Keep it simple: resolve assignee usernames→uuids once and include `assignee_user_id` in the workflow payload rows + RPC insert.
- [ ] **Step 4: Run, expect PASS** + `npm run typecheck && npm run lint`.
- [ ] **Step 5: Commit** — `feat(supabase): quote workflow-step attachments + assignee uuid`.

---

## Task 6: Chat schema (chats, chat_members, chat_messages)

**Files:** Create `supabase/migrations/0027_chat.sql`; Create `supabase/tests/0027_chat_test.sql`.

**Interfaces:** Produces 3 tables per the audit's proposed DDL (§6) + parity RLS + realtime publication. `chat_messages.reactions jsonb`, `file jsonb`, `reply_to jsonb`.

- [ ] **Step 1: Migration** — `supabase/migrations/0027_chat.sql`: the three `create table` statements from the audit (`chats` text PK; `chat_members` PK `(chat_id, username)`; `chat_messages` with `legacy_id`, `by_username`, `file`/`reply_to`/`reactions` jsonb, `deleted`, `edited_at`, `sort_order bigint generated always as identity`), the two indexes, parity RLS on all three (`do $$ foreach ... is_viettours_user() ...`), and `alter publication supabase_realtime add table public.chats, public.chat_members, public.chat_messages;`.
- [ ] **Step 2: Write the pgTAP test** `supabase/tests/0027_chat_test.sql`: `has_table` ×3; `chats` PK is text; `chat_members` composite PK; FK chat_messages→chats cascade; RLS enabled on all three; `chat_messages` in `supabase_realtime`.
- [ ] **Step 3: Run, expect FAIL** then **Step 4** `npx supabase db reset && npx supabase test db` → PASS (+ all prior green, incl. the 0016 full-RLS backstop covering the 3 new tables).
- [ ] **Step 5: Commit** — `feat(supabase): chat schema (chats/members/messages) + RLS + realtime`.

---

## Task 7: Chat gateway A — subscribe/ensure/send

**Files:** Modify `src/lib/supabase.ts`; Test `tests/supabase/chat.test.ts`.

**Interfaces (match `firebase.ts` chat fns; types `src/types/chat.ts`):**
- `sbSubscribeChats(username, cb: (list: Chat[]) => void, client?)` — chats where the user is a member (join `chat_members`); assemble `Chat` (members from chat_members usernames, reads from `chat_members.last_read`, lastAt/lastText/lastByName from columns; `messages` may be empty in the list view or capped — match `fbSubscribeChats`).
- `sbSubscribeChat(id, cb: (chat: Chat | null) => void, client?)` — single chat + its `chat_messages` (assemble `ChatMessage[]` newest-or-oldest per fb*, with file/replyTo/reactions/editedAt/deleted), realtime on `chat_messages` filtered `chat_id=eq.{id}` (+ chats + chat_members like the notif-thread multi-table subscribe).
- `sbEnsureChat(chat: Chat, client?)` — upsert `chats` (text PK), merge members into `chat_members` (resolve username→user_id; keep username), preserve title/createdAt on re-ensure (mirror `fbEnsureChat`).
- `sbSendChatMessage(id, msg: ChatMessage, client?)` — insert `chat_messages` (legacy_id=msg.id, by_username, file/reply_to jsonb, reactions default {}); update `chats.last_at/last_text/last_by_name`; update sender's `chat_members.last_read`. (Match `fbSendChatMessage` incl. the 500-cap if fb enforces one — replicate.)

- [ ] Steps 1–6: failing `tests/supabase/chat.test.ts` (ensure a chat between two usernames → sbSubscribeChats yields it for a member; send a message → sbSubscribeChat yields it with file/reply/reactions; lastText updates), run FAIL, implement full code (mirror fb*, optional `client=sb`, timestamp-normalized, username↔uuid), run PASS, `typecheck && lint`, commit (`feat(supabase): chat gateway — subscribe/ensure/send`). Read `firebase.ts:661-753` for exact behavior.

---

## Task 8: Chat gateway B — edit/delete/react/read

**Files:** Modify `src/lib/supabase.ts`; Test `tests/supabase/chat.test.ts`.

**Interfaces (match `firebase.ts` chat fns):**
- `sbEditChatMessage(id, msgId, text, client?)` — UPDATE `chat_messages` set text + edited_at where chat_id+legacy_id.
- `sbDeleteChatMessage(id, msgId, client?)` — UPDATE set deleted=true, text=null, file=null (soft delete, mirror `fbDeleteChatMessage`).
- `sbToggleChatReaction(id, msgId, emoji, username, client?)` — read the message's `reactions` jsonb, toggle `username` in `reactions[emoji]` (add if absent, remove if present; drop the emoji key if its array empties), write back.
- `sbMarkChatRead(id, username, client?)` — UPDATE `chat_members.last_read = now()` where chat_id+username.

- [ ] Steps 1–6: failing test (send a message, edit it → editedAt set + text changed; delete it → deleted=true, text null; toggle a reaction on/off → reactions reflect it; markRead → last_read advances), run FAIL, implement full code, run PASS, `typecheck && lint`, commit (`feat(supabase): chat gateway — edit/delete/react/read`).

---

## Task 9: Surface parity + full gate + Phase-1.5 doc

**Files:** Modify `tests/supabase/parity.test.ts`; Modify `docs/supabase-setup.md`.

- [ ] **Step 1:** add the 8 chat `sb*` names to the parity list; grep-confirm against actual exports; assert each is a function.
- [ ] **Step 2:** `npm run test:integration -- tests/supabase/parity.test.ts` → green.
- [ ] **Step 3:** append to `docs/supabase-setup.md`: Phase 1.5 done — all audit gaps closed (list the 5 fields + chat); **prod-push migrations now 0017–0027** (add 0023 customer CRM, 0024 notification, 0025 itinerary start_date, 0026 quote_passengers, 0027 chat); the edited 0021 RPC (passengers) must be re-pushed. Stores still not wired (Phase 4).
- [ ] **Step 4: Full gate** — `npm run typecheck && npm run lint && npm test && npm run test:integration`. All green; capture totals.
- [ ] **Step 5: Commit** — `feat(supabase): Phase 1.5 reconciliation complete — drift gaps closed`.

---

## Self-Review

**Spec coverage (against the audit's Recommended Scope):** Customer CRM → Task 1; Notification → Task 2; Itinerary startDate → Task 3; Quote passengers → Task 4; WorkflowStep attachments (+assignee uuid #9) → Task 5; Chat (schema + 8 fns) → Tasks 6–8; surface/doc/gate → Task 9. All audit data-loss gaps + the cosmetic #9 covered. ✔

**Placeholder scan:** field-gap tasks (1–5) carry concrete migration SQL + exact field-map instructions citing the type files + audit; chat tasks 6–8 give the schema DDL (full) and per-function interface specs citing `firebase.ts` + `chat.ts` and a complete test description — bite-sized and independently testable. The implementer reads the audit (committed) + the type files for exhaustive field lists. **Pre-flight note for the executor:** if you want every gateway line inlined (as Phases 1/2 ended up), expand Tasks 1–8's implementation steps to full code before dispatch — otherwise implementers work from the exact field maps + the cited `fb*`/types (acceptable, mirror-an-existing-API). The novel schema (migrations, chat DDL, RPC passengers block) IS fully inlined.

**Type consistency:** new migrations 0023–0027 are sequential and non-colliding; the RPC edit is to 0021 (re-applied on reset). Chat `sb*` names (Tasks 7–8) match the parity list (Task 9) and the `fb*` twins. `parent_type` strings: `'customer'`/`'notification'`/`'quote_workflow_step'` used consistently between save and load. `quote_passengers` columns match the `decomposeQuote` payload keys and the RPC insert.

**Open item flagged:** verify the exact `CustomerInteraction` and `Passenger` field names against `src/types/{customer,quote}.ts` during implementation — the migration column lists above are from the audit's proposal and must match the real types (adjust column names if they differ; the test is the proof).
