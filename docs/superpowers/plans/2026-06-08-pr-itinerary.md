# PR-Itinerary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans`.

**Goal:** Port the "Chương trình tour" (Itinerary) feature into the Vite app. Largest single PR yet — ~12 tasks across types, Firestore plumbing, AI worker, store, list view, builder, drag-drop, AI buttons, DOCX export, TemplateSelector wiring.

**Spec:** `docs/superpowers/specs/2026-06-08-pr-itinerary-design.md`

**Tech:** TS · React 18 · MUI v6 · Zustand · Firebase · Sortable.js · docx.

**Tests:** Out of scope. Run `npm run typecheck && npm run lint && npm run build` after every task.

**Conventions per task:**
- Commit per task; Conventional Commits with PR prefix `feat(itinerary): …`.
- Co-author: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## Task 1: Install sortablejs + add itinerary types

**Files:**
- Modify: `package.json` (add `sortablejs` dep)
- Create: `src/types/itinerary.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1:** `npm install sortablejs @types/sortablejs --save-exact`. Confirm `package-lock.json` updates.
- [ ] **Step 2:** Create `src/types/itinerary.ts` exactly as spec §4.
- [ ] **Step 3:** Add `export * from './itinerary';` to `src/types/index.ts`.
- [ ] **Step 4:** `npm run typecheck && npm run lint`.
- [ ] **Commit:** `feat(itinerary): types + sortablejs dep (PR Itin Task 1)`

---

## Task 2: Itinerary constants + helpers

**Files:**
- Create: `src/components/itinerary/constants.ts` (TRANSPORT_PRESETS, factories, ITIN_DEFAULT_INC/EXC)
- Create: `src/components/itinerary/itinCode.ts` (ITIN_TYPE, ITIN_CONTINENT, ITIN_COUNTRY, generateItinCode)
- Create: `src/components/itinerary/parseFlights.ts`

- [ ] **Step 1:** `constants.ts` — port `newDay`, `newSegment`, `newActivity`, `ITIN_DEFAULT_INC`, `ITIN_DEFAULT_EXC`, `TRANSPORT_PRESETS`. The DEFAULT lists are copied from legacy 5605-5624.
- [ ] **Step 2:** `itinCode.ts` — port `ITIN_TYPE`, `ITIN_CONTINENT`, `ITIN_COUNTRY`, `generateItinCode` from legacy 1670-1683.
- [ ] **Step 3:** `parseFlights.ts` — port the parser from legacy 6623-6657 with TS types. Return `Flight[]`.
- [ ] **Step 4:** `npm run typecheck && npm run lint`.
- [ ] **Commit:** `feat(itinerary): constants, region codes, flight parser (PR Itin Task 2)`

---

## Task 3: AI Worker helper

**Files:**
- Create: `src/lib/aiWorker.ts`

- [ ] **Step 1:** Port `getAIWorker`, `setAIWorker`, `callAIWorker` from legacy 6603-6613.
- [ ] **Step 2:** `callAIWorker` signature: `(path: '/ai' | '/distance', body: { prompt?: string; origin?: string; destination?: string; mode?: string }) => Promise<{ text?: string; distance?: string; duration?: string; error?: string }>`.
- [ ] **Step 3:** `npm run typecheck && npm run lint`.
- [ ] **Commit:** `feat(itinerary): AI Worker helper (Cloudflare proxy) (PR Itin Task 3)`

---

## Task 4: Firestore signatures for itineraries

**Files:**
- Modify: `src/lib/firebase.ts`

- [ ] **Step 1:** Add `ITIN_INDEX_DOC` constant and `itinDoc(id)` factory near the other doc-ref constants.
- [ ] **Step 2:** Implement `fbSaveItinerary(itin, savedBy)`, `fbGetItinerary(id)`, `fbDeleteItinerary(id)`, `fbSubscribeItineraries(cb)` per spec §5. Mirror legacy 451-468.
- [ ] **Step 3:** Import `Itinerary`, `ItineraryIndexEntry` types in firebase.ts.
- [ ] **Step 4:** `npm run typecheck && npm run lint`.
- [ ] **Commit:** `feat(firebase): itinerary save/get/delete/subscribe (PR Itin Task 4)`

---

## Task 5: SortableList component

**Files:**
- Create: `src/components/itinerary/SortableList.tsx`

- [ ] **Step 1:** Wrapper around `Sortable.create()` from `sortablejs`. Props: `{ onReorder: (from: number, to: number) => void; handle?: string; className?: string; sx?: SxProps; deps?: React.DependencyList; children: React.ReactNode }`.
- [ ] **Step 2:** Use `useRef` + `useEffect` to attach Sortable to the div. On `onEnd`, revert the DOM move (`insertBefore`) then call `onReorder`. Match legacy 6582-6599.
- [ ] **Step 3:** `npm run typecheck && npm run lint`.
- [ ] **Commit:** `feat(itinerary): SortableList drag-drop wrapper (PR Itin Task 5)`

---

## Task 6: Itinerary store

**Files:**
- Create: `src/stores/itineraryStore.ts`

- [ ] **Step 1:** Zustand store: `{ list: ItineraryIndexEntry[]; loading: boolean; init: () => Unsubscribe; save: (itin: Itinerary, savedBy: string) => Promise<void>; load: (id: string) => Promise<Itinerary | null>; delete: (id: string) => Promise<void> }`.
- [ ] **Step 2:** `init()` calls `fbSubscribeItineraries` and updates `list` + `loading`.
- [ ] **Step 3:** Save/load/delete wrap the fb fns.
- [ ] **Step 4:** Wire `init()` in `MainApp.tsx` next to other store inits.
- [ ] **Step 5:** `npm run typecheck && npm run lint`.
- [ ] **Commit:** `feat(itinerary): itineraryStore (PR Itin Task 6)`

---

## Task 7: ItineraryHome (list view)

**Files:**
- Create: `src/components/itinerary/ItineraryHome.tsx`

- [ ] **Step 1:** Props: `{ onNew: () => void; onOpen: (id: string) => void; onBack: () => void }`. Read `list` + `loading` from `itineraryStore`.
- [ ] **Step 2:** Header (teal gradient), search input, card grid with destination/days/nights, updated-by + updated-at, delete button.
- [ ] **Step 3:** Delete handler shows confirm dialog and calls `itineraryStore.delete(id)`.
- [ ] **Step 4:** Match the legacy visual layout reasonably closely with MUI.
- [ ] **Step 5:** `npm run typecheck && npm run lint`.
- [ ] **Commit:** `feat(itinerary): ItineraryHome list view (PR Itin Task 7)`

---

## Task 8: ItineraryBuilder shell + Info section

**Files:**
- Create: `src/components/itinerary/ItineraryBuilder.tsx`

- [ ] **Step 1:** Props: `{ initial: Itinerary | null; user: User; onBack: () => void }`. Local state holds the in-progress itinerary; initial value is `initial` or a fresh draft built from `newDay`/etc.
- [ ] **Step 2:** Header (gradient) with code display, ⚙️ AI button (opens AISettingsModal), 💾 Lưu, 📄 Xuất Word, ↩ Quay lại.
- [ ] **Step 3:** Info card: type/continent/country/seq selectors (cascading), title, destination, days, nights, intro (textarea), linked-quote dropdown (read from `useQuoteHistoryStore`).
- [ ] **Step 4:** Save handler calls `itineraryStore.save(it, '{name} ({role})')`.
- [ ] **Step 5:** `npm run typecheck && npm run lint`.
- [ ] **Commit:** `feat(itinerary): Builder shell + Info section (PR Itin Task 8)`

---

## Task 9: Builder — Flights section (paste-and-parse)

**Files:**
- Modify: `src/components/itinerary/ItineraryBuilder.tsx`

- [ ] **Step 1:** Add Flights card with table of `{group, leg, flightNo, dep, arr}` rows + add/delete buttons.
- [ ] **Step 2:** Paste-and-parse area: textarea + "⚡ Phân tích" button calls `parseFlights(text)` and replaces `it.flights`.
- [ ] **Step 3:** `npm run typecheck && npm run lint`.
- [ ] **Commit:** `feat(itinerary): Builder Flights section + paste-parse (PR Itin Task 9)`

---

## Task 10: Builder — Day schedule (with drag-drop)

**Files:**
- Modify: `src/components/itinerary/ItineraryBuilder.tsx`

- [ ] **Step 1:** Render `<SortableList onReorder={reorderDays}>` of days. Each day card has day header (drag handle ⋮⋮, day number, date, title, delete), segments list, "+ Thêm ngày" button.
- [ ] **Step 2:** Each segment: optional groupLabel (when >1 segment), transport preset dropdown + transport text input, activities list inside a `<SortableList>`.
- [ ] **Step 3:** Each activity row: drag handle, time input, text input, delete.
- [ ] **Step 4:** Meal toggles B/L/D + meal note at the bottom of each day card.
- [ ] **Step 5:** "+ Tách nhóm" button per day to add a segment.
- [ ] **Step 6:** `npm run typecheck && npm run lint`.
- [ ] **Commit:** `feat(itinerary): Builder day schedule with drag-drop (PR Itin Task 10)`

---

## Task 11: Builder — Includes/Excludes + AI buttons

**Files:**
- Modify: `src/components/itinerary/ItineraryBuilder.tsx`
- Create: `src/components/itinerary/AISettingsModal.tsx`

- [ ] **Step 1:** Two-column Includes/Excludes editable lists at the bottom of the builder; defaults from `ITIN_DEFAULT_INC/EXC`.
- [ ] **Step 2:** Wire AI buttons:
  - `genIntro` — calls `callAIWorker('/ai', { prompt: 'Viết đoạn giới thiệu 3-4 câu...' })` and updates `it.intro` on success.
  - `genActivity(dayId, segId, actId, placeText)` — calls `/ai` with a placeholder prompt and updates the activity text.
  - `genDistance(dayId, segId, routeText)` — parses route → calls `/distance` → updates segment `transport`.
- [ ] **Step 3:** Error handling: catch + `window.alert('❌ ' + err.message)`. The "Chưa cấu hình" message comes from the helper.
- [ ] **Step 4:** `AISettingsModal.tsx` — MUI Dialog with worker URL input + save button (calls `setAIWorker`).
- [ ] **Step 5:** `npm run typecheck && npm run lint`.
- [ ] **Commit:** `feat(itinerary): Builder Includes/Excludes + AI buttons + Settings modal (PR Itin Task 11)`

---

## Task 12: ItineraryApp shell (mode switch)

**Files:**
- Create: `src/components/itinerary/ItineraryApp.tsx`

- [ ] **Step 1:** Component holding `mode: 'list' | 'edit'` state and `current: Itinerary | null`. Renders `<ItineraryHome>` or `<ItineraryBuilder>`.
- [ ] **Step 2:** `onNew` → `setCurrent(null)`, mode=edit. `onOpen(id)` → `itineraryStore.load(id)` → mode=edit. `onBack` from builder → mode=list.
- [ ] **Step 3:** Accept an `onExit: () => void` prop the parent shell passes — when user wants to leave Itinerary entirely (e.g., switch template).
- [ ] **Step 4:** `npm run typecheck && npm run lint`.
- [ ] **Commit:** `feat(itinerary): ItineraryApp mode switch (PR Itin Task 12)`

---

## Task 13: DOCX export

**Files:**
- Create: `src/lib/exports/exportItineraryDocx.ts`

- [ ] **Step 1:** Port the full DOCX layout from legacy 6474-6579 to a typed function `exportItineraryDocx(it: Itinerary, code: string): Promise<void>`.
- [ ] **Step 2:** Inline `VTE_LOGO` base64 as a constant within this file. Copy the value from legacy line 627.
- [ ] **Step 3:** Use `docx` npm package (already installed). Save via `Packer.toBlob` + `file-saver` (already installed).
- [ ] **Step 4:** File name: `ChuongTrinh_${code}_${destinationSlug}.docx` where slug = `destination.replace(/[^a-zA-Z0-9_À-ỹ]/g,'_').slice(0,30)`.
- [ ] **Step 5:** Wire "📄 Xuất Word" button in `ItineraryBuilder` to call this.
- [ ] **Step 6:** `npm run typecheck && npm run lint && npm run build` to confirm bundle still builds.
- [ ] **Commit:** `feat(exports): exportItineraryDocx (PR Itin Task 13)`

---

## Task 14: TemplateSelector wiring + QuoteView routing

**Files:**
- Modify: `src/components/quote/constants.ts` (add `itinerary` to TEMPLATES + Template union)
- Modify: `src/components/quote/TemplateSelectorModal.tsx`
- Modify: `src/components/quote/QuoteView.tsx`
- Modify: `src/stores/quoteStore.ts` (handle `newDraft('itinerary')` short-circuit)

- [ ] **Step 1:** Extend `Template` union with `'itinerary'`. Add to `TEMPLATES` constant with the same `{ label, icon, desc }` already in COMING_SOON_TILES, plus a `kind: 'alt'` flag.
- [ ] **Step 2:** In `quoteStore.newDraft('itinerary')`, just set `template: 'itinerary'`; skip the `info/items/catEnabled` setup. (Itinerary doesn't use those.)
- [ ] **Step 3:** Remove `itinerary` from `COMING_SOON_TILES` in `TemplateSelectorModal.tsx` (the main TEMPLATES iteration will now render it as a real tile).
- [ ] **Step 4:** In `QuoteView.tsx`, before the toolbar+drawer render, check `if (template === 'itinerary') return <ItineraryApp onExit={() => useQuoteStore.getState().abandon()} />;`. Pass `onExit` so the user can leave back to the template selector.
- [ ] **Step 5:** `npm run typecheck && npm run lint && npm run build`.
- [ ] **Commit:** `feat(itinerary): wire as first-class template in selector + view (PR Itin Task 14)`

---

## Task 15: Full manual verification

Walk through V1–V18 from spec §9 in `npm run dev`. Commit any UX fixes as `fix(itinerary): …`.
