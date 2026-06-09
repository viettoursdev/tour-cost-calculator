# PR-Itinerary (Chương trình tour) — Design

_Date: 2026-06-08_
_Phase: Post-3 — alt-template port (1 of 4)_
_Builds on: PR-3.11 Admin (`e4cdef4`)_
_Status: Approved design, ready for implementation plan_

---

## 1. Goal

Port the legacy "Chương trình tour" feature (`public/legacy.html:6474–7250` plus helpers at `6582–6665` and Firestore plumbing at `451–468`) into the Vite app. The Itinerary feature is launched from the TemplateSelector tile and replaces the current legacy deep-link.

After this PR users can:

- See a list (`ItineraryHome`) of all saved itineraries with search + delete + open + new.
- Build/edit an itinerary (`ItineraryBuilder`) with:
  - General info (type/continent/country/seq → auto-generated code), title, destination, days/nights, intro, **linked quote** (auto-fills destination/days/nights from a cloud quote).
  - **Flight info** with paste-and-parse from GDS/PNR text.
  - **Day-by-day schedule** with **drag-and-drop reordering** of days and activities (via Sortable.js).
  - Each day has multiple segments (groups for multi-flight days), each segment has transport text + activities. Activities have time + text.
  - Meal toggles (B/L/D) per day + meal note.
  - Includes/Excludes editable lists.
- **AI buttons** (gracefully degraded if no Cloudflare Worker URL is configured):
  - ✨ Generate intro paragraph from destination.
  - ✨ Generate activity description from place name.
  - 📍 Calculate driving distance/duration from day's route.
  - ⚙️ AI Settings modal to paste/save the Worker URL.
- **Export to Word (.docx)** — full-page itinerary with header, intro box, flight table, day-by-day blocks, meal line, includes/excludes columns, footer.

**Out of scope:**
- Image upload / management for itinerary photos (legacy renders 4 placeholder image frames).
- Tests — refactor convention.
- Mobile-first redesign.

---

## 2. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Trigger | Replace the existing `coming-soon` link in `TemplateSelectorModal.tsx` with `itinerary` as a real template tile | One-line wiring; matches the established TemplateSelector pattern. |
| Routing | When `template === 'itinerary'`, render `<ItineraryApp />` instead of the normal `<QuoteView />`. Add to `QuoteView.tsx` (which is the template-aware shell). | Mirrors legacy `index.html:8462-8464`. |
| State | New `itineraryStore` (Zustand) with `{ list, current, init, subscribe, open, create, save, delete }` | List view subscribes to the index; builder opens a single full itinerary. Matches existing store patterns (e.g., `quoteHistoryStore`). |
| Drag-and-drop library | **Sortable.js** via `sortablejs` npm package + a small `<SortableList>` React wrapper | Legacy uses `window.Sortable`; matching the exact behavior (revert-to-React-control on drop) is essential. Adding `@dnd-kit` would mean re-architecting the drop logic. |
| Type extension | Add `'itinerary'` to the `Template` union and a corresponding entry in `TEMPLATES` (with the alt-template flag `kind: 'alt'`) | Avoids a separate "alt template" concept. The template flag short-circuits to render `ItineraryApp` instead of the standard quote shell. |
| AI Worker | Port `getAIWorker/setAIWorker/callAIWorker` verbatim to `src/lib/aiWorker.ts`. URL stored in `localStorage` (`vte_ai_worker`). | One-to-one parity. Worker may not be deployed; degradation: button shows alert "Chưa cấu hình AI Worker URL". |
| AI calls | `/ai` for text generation (Claude), `/distance` for Google Maps | Worker proxies API keys server-side; client only knows the worker URL. |
| Flight parser | Port `parseFlights` verbatim to `src/components/itinerary/parseFlights.ts` | ~30 LOC pure function; copy-paste with TS types. |
| Region codes | Move `ITIN_TYPE`, `ITIN_CONTINENT`, `ITIN_COUNTRY`, `generateItinCode` to `src/components/itinerary/itinCode.ts` | Self-contained; not shared with other features. |
| Transport presets | Inline in `src/components/itinerary/constants.ts` (6 entries) | Tiny constant. |
| Default Includes/Excludes | Move `DEFAULT_INCLUDES` and `DEFAULT_EXCLUDES` from legacy (lines 5605-5624) into `src/components/itinerary/constants.ts`. They're already needed by Contract too — if a `src/components/contract/constants.ts` already has them, reuse; otherwise inline here. | Contract is in `src/`; PR-3.6 ported it, so check. Most likely they live in contract — if so, re-export. |
| Firestore docs | `viettours/itinerary_index` (metadata array `items[]`, capped at 500) + `tour_itineraries/{id}` (full itinerary). Match legacy. | Two-app coexistence with legacy. |
| Firestore signatures | `fbSaveItinerary`, `fbGetItinerary`, `fbDeleteItinerary`, `fbSubscribeItineraries` in `src/lib/firebase.ts` | Mechanical port. |
| Linked-quote dropdown | Reuse existing `quoteHistoryStore.quotes` (from PR-3.2) for the picker | Already subscribed when user logs in; no additional plumbing. |
| Cloud quote subscription in Builder | Read from store via `useQuoteHistoryStore(s => s.quotes)` | One-line dependency. |
| Logo in DOCX | Continue inlining `VTE_LOGO` as a base64 PNG constant in `src/lib/exports/exportItineraryDocx.ts` | The legacy DOCX uses a logo. We have the base64 from legacy. (See risk §7.) |
| Vietnamese diacritics in DOCX | Keep — `docx` library + Aptos font render Unicode fine | DOCX is a structured XML format; the font reference is metadata, not pixel data. Word renders at view time. |
| Auto-save vs explicit save | Explicit `💾 Lưu` button. No autosave (matches legacy and avoids racing the 500-item index cap). | Simpler; less chance of accidentally saving incomplete drafts. |
| Builder UX | Match legacy visual identity (teal gradients, glass cards) using MUI primitives + `sx`. Not pixel-perfect, but visually clear. | Pixel-parity isn't worth the cost. |
| Permission | None required (legacy has no perm gate on itinerary). | Matches legacy. |

---

## 3. Architecture & file plan

```
src/
├── lib/
│   ├── aiWorker.ts                                NEW  — getAIWorker / setAIWorker / callAIWorker
│   ├── firebase.ts                                EDIT — fb* itinerary fns
│   └── exports/
│       └── exportItineraryDocx.ts                 NEW  — full DOCX port (~250 LOC)
├── stores/
│   └── itineraryStore.ts                          NEW  — list + current itinerary state
├── types/
│   └── itinerary.ts                               NEW  — Itinerary, Day, Segment, Activity, Flight
└── components/
    ├── itinerary/                                 NEW DIR
    │   ├── constants.ts                           NEW  — ITIN_DEFAULT_INC/EXC, TRANSPORT_PRESETS, factories
    │   ├── itinCode.ts                            NEW  — ITIN_TYPE/CONTINENT/COUNTRY + generateItinCode
    │   ├── parseFlights.ts                        NEW  — GDS/PNR parser
    │   ├── SortableList.tsx                       NEW  — Sortable.js React wrapper
    │   ├── ItineraryApp.tsx                       NEW  — Home ↔ Builder mode switch
    │   ├── ItineraryHome.tsx                      NEW  — list + search + delete
    │   ├── ItineraryBuilder.tsx                   NEW  — main editor (~700 LOC, may split into subviews)
    │   └── AISettingsModal.tsx                    NEW  — paste worker URL
    └── quote/
        ├── TemplateSelectorModal.tsx              EDIT — remove the `itinerary` coming-soon tile
        └── QuoteView.tsx                          EDIT — render <ItineraryApp/> when template==='itinerary'
```

`Template` union + `TEMPLATES` constant get extended in `src/components/quote/constants.ts`. The `newDraft('itinerary')` short-circuits: it sets `template: 'itinerary'` and nothing else (no `info`, `items`, etc.) — the QuoteView then renders `ItineraryApp` and stops.

---

## 4. Types

`src/types/itinerary.ts`:

```ts
export interface Activity { id: string; time: string; text: string; }
export interface Segment { id: string; groupLabel: string; transport: string; activities: Activity[]; }
export interface Day {
  id: string;
  dayNum: number;
  date: string;
  title: string;
  meals: { B: boolean; L: boolean; D: boolean };
  mealNote: string;
  segments: Segment[];
}
export interface Flight {
  id: string;
  group: string;
  leg: string;
  flightNo: string;
  dep: string;
  arr: string;
}
export interface Itinerary {
  id: string;
  code?: string;
  type: 'NN' | 'ND';
  continent: string;     // CA / AU / MY / PH / DD / VN
  country: string;
  seq: number;
  title: string;
  destination: string;
  days: number;
  nights: number;
  intro: string;
  flights: Flight[];
  schedule: Day[];
  includes: string[];
  excludes: string[];
  linkedQuoteId: string | null;
  linkedQuoteName: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}
export interface ItineraryIndexEntry {
  id: string;
  code: string;
  title: string;
  destination: string;
  days: number;
  nights: number;
  linkedQuoteName: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt: string;
  updatedBy: string;
}
```

---

## 5. Firestore signatures

```ts
const ITIN_INDEX_DOC = doc(db, 'viettours', 'itinerary_index');
const itinDoc = (id: string) => doc(db, 'tour_itineraries', id);

export async function fbSaveItinerary(itin: Itinerary, savedBy: string): Promise<void>;
// 1. setDoc(itinDoc(itin.id), { ...itin, updatedAt, updatedBy })
// 2. read index, upsert metadata entry, setDoc(ITIN_INDEX_DOC, { items: list.slice(0,500) })

export async function fbGetItinerary(id: string): Promise<Itinerary | null>;
export async function fbDeleteItinerary(id: string): Promise<void>;
export function fbSubscribeItineraries(cb: (list: ItineraryIndexEntry[]) => void): Unsubscribe;
```

Mirror legacy `public/legacy.html:451–468`.

---

## 6. AI Worker helper

`src/lib/aiWorker.ts` — verbatim port:

```ts
const LS_KEY = 'vte_ai_worker';
export function getAIWorker(): string { /* ... */ }
export function setAIWorker(url: string): void { /* ... */ }
export async function callAIWorker(path: '/ai' | '/distance', body: unknown): Promise<{ text?: string; distance?: string; duration?: string; error?: string }>;
```

`callAIWorker` throws `Error('Chưa cấu hình AI Worker URL (bấm ⚙️ AI để nhập)')` when URL not configured.

---

## 7. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `VTE_LOGO` base64 is large (~10KB) and bloats the bundle | Certain | Inline only inside `exportItineraryDocx.ts` so it's tree-shaken when no export occurs. Put it in a manual chunk if needed (it can also be reused for Invoice PDF later). |
| `sortablejs` adds bundle weight (~50KB) | Low | The DnD UX is critical to legacy parity. Acceptable trade-off. Already in the `exports` chunk because of MUI/Firebase splits. |
| Drag-drop + React state diverges (Sortable mutates DOM) | High | Use the legacy `onEnd` trick: revert the DOM move (`insertBefore`), then let React re-render. Already in `SortableList`. |
| AI Worker is not deployed → users see confusing alerts | Medium | First-time clicking ✨ shows the AI Settings modal with a "configure first" hint. |
| Flight parser misses unusual GDS formats | Medium | Provide a `+ Thêm chuyến` manual button as fallback. Same as legacy. |
| Linked-quote dropdown shows DMC quotes alongside regular ones (UX confusion) | Low | List both; users typically know which one they want. Could filter later. |
| Days reordering renumbers them — if a day is mid-edit, fields don't lose state because keyed by `id` | Low | We key by `day.id`, never `dayNum`. |
| Builder hot-path renders all activities on every keystroke | Medium | Acceptable for now; lift performance work to a follow-up if needed. |
| Saving conflicts on the index (two users edit) | Low | Last-write-wins on the index doc. Per-itinerary doc isolated. Matches legacy. |

---

## 8. Out of scope

- Image upload UI (legacy doesn't have it either — just placeholder cells in the DOCX).
- Itinerary sharing / collaborators.
- Tests.

---

## 9. Manual verification

- **V1:** TemplateSelector now shows "Chương trình tour" as a real tile (no longer a legacy link).
- **V2:** Click it → `ItineraryHome` renders, list loads from Firestore, search filters work.
- **V3:** "+ Tạo chương trình" → opens fresh builder with `code` showing `NN-CA-TQ-001`.
- **V4:** Change type/continent/country/seq → `code` updates accordingly. Linked-country dropdown updates when continent changes.
- **V5:** Type a destination/title; add a flight via the paste-and-parse area with a GDS sample (e.g. `1  BR 396 10JUN SGN TPE  1545 2010`) → parsed and appears in the flights table.
- **V6:** Drag days and activities to reorder; numbers re-flow correctly.
- **V7:** Toggle meals B/L/D on day 1; type a meal note. Add an activity, type time + text.
- **V8:** Edit includes/excludes — defaults from `DEFAULT_INCLUDES` show initially.
- **V9:** Link a quote → destination/days/nights get auto-filled from the picked quote.
- **V10:** Click 💾 Lưu → confirm Firestore `tour_itineraries/{id}` doc exists and the `itinerary_index.items` array has a matching metadata entry.
- **V11:** Close Builder → return to Home; the new itinerary appears in the list.
- **V12:** Open the same itinerary → all data round-trips (drag order, meals, intro, flights, etc.).
- **V13:** Delete from Home → confirmation → Firestore entry removed.
- **V14:** Click ⚙️ AI → paste a dummy URL; save. `localStorage.vte_ai_worker` is set.
- **V15:** Click ✨ on intro **without** configuring the worker → alert "Chưa cấu hình AI Worker URL".
- **V16:** With a real worker URL, ✨ on intro returns AI-generated text.
- **V17:** Click 📄 Xuất Word → downloads `ChuongTrinh_{code}_{destinationSlug}.docx`. Open it: title, intro, flight table, day-by-day blocks, meals, includes/excludes columns all rendered.
- **V18:** Switch template back to a regular quote (Báo giá tour nội địa) → returns to the normal QuoteView. No leak of itinerary state.
