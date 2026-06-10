# Test suite for business logic

**Status:** Approved — 2026-06-10
**Scope:** Add a unit test suite covering all non-UI logic in `src/`.
**Out of scope:** Component / DOM / interaction tests. Export generators in `src/lib/exports/*`.

## Goal

Stand up a Vitest-based test suite that covers every meaningful piece of business logic — Zustand stores, `lib/` utilities, `auth/` permissions, and the quote calculator — and gate CI on it. Bar is **behavior coverage** (every logic module has a meaningful test file), not a percentage threshold.

## Tooling & layout

- **Runner:** Vitest. Vite-native, jest-compatible API, no extra config needed beyond `defineConfig`. Add `vitest` and `jsdom` as devDeps.
- **Env:** `jsdom`. Required because most stores touch `localStorage` / `sessionStorage` (`vte_users`, `vte_s`, `vte_quote_draft_{username}`, hotel/visa/rate caches).
- **Layout:** Tests co-located next to source — `src/lib/currency.test.ts`, `src/stores/quoteStore.test.ts`, etc. Matches the `@/*` path alias and keeps tests discoverable.
- **Shared helpers** under `src/test/`:
  - `setup.ts` — jsdom polyfills, clears `localStorage` and `sessionStorage` in `afterEach`.
  - `firebaseFake.ts` — in-memory fake for the Firestore surface (`db`, `doc`, `getDoc`, `setDoc`, `updateDoc`, `getDocs`, `onSnapshot`, `collection`).
  - `storeReset.ts` — helper that resets a Zustand store to its initial state via `useStore.setState(initial, true)`.
- **npm scripts:**
  - `npm test` → `vitest run` (single pass; what CI uses).
  - `npm run test:watch` → `vitest` (watch loop for local dev).

## Firebase & localStorage strategy

**Firebase: module mock.** `vi.mock('@/lib/firebase')` replaces the module globally. The fake exposes the same named exports the stores import, backed by an in-memory `Map<path, data>`. Tests can:

- Seed docs: `firestoreFake.set('viettours/ncc_master', { suppliers: [...] })`
- Assert writes: `expect(firestoreFake.writes).toContainEqual({ path: '...', data: ... })`
- Trigger snapshot callbacks: `firestoreFake.emit('viettours/master_rate_card', newData)` to test live-sync logic.

This is fast, deterministic, and verifies stores call Firestore with the right shapes — which is the actual bug surface.

**localStorage.** jsdom provides a real `localStorage`. `setup.ts` clears both storages in `afterEach`. For the per-user quote draft gotcha (`quoteStore` persist override at write time), tests seed `vte_quote_draft_{username}` directly, call `quoteStore.init(user)`, and assert the draft hydrated correctly — exactly the regression path we want covered.

**Zustand reset.** Each test file calls `useFooStore.setState(initialState, true)` in `beforeEach` via the `storeReset` helper. Where a store doesn't already expose its initial state, we add a small `export const initialState = { … }` (or a `getInitialState()` getter) — single-line refactor, no behavior change.

## Per-module test plan

### `auth/` (2 files)

- **`PERMISSIONS.test.ts`** — `hasPerm` returns false for null user, returns role-defined value for each role, returns false for unknown role. Spot-check the documented matrix: Admin can `viewHistory`+`viewContracts` only; Accountant can `viewHistory` only; Standard can do nothing; CEO can `manageUsers`.
- **`ROLES.test.ts`** — `ROLES` order matches hierarchy doc; `DEFAULT_USERS` shape (role assignments, unique usernames, color values).

### `lib/` (6 files)

- **`currency.test.ts`**
  - `toOutputCurrency`: VND→VND identity; missing rate→identity; normal divide.
  - `fmtCurrency`: VND format `1.234.567 ₫`; JPY/KRW no-decimals + suffix; USD 2-decimals + comma grouping.
  - `fmtOutput`: returns `'—'` when non-VND rate missing.
- **`dateUtils.test.ts`**
  - `calcEndDate`: null start→null; `days=1` returns start; `days=N` returns start+(N−1); negative days clamped to 0.
  - `fmtDate`: vi-VN by default, en-GB when `en=true`, null/undefined→`''`.
- **`util.test.ts`**
  - `debounce` (fake timers): fires once after wait; latest args win; rapid calls reset timer.
  - `applyPath`: sets nested path; creates missing objects; doesn't mutate input (structural clone); root-level keys.
- **`notifications.test.ts`** — event dispatch + listener wiring; verify payload shape.
- **`storage.test.ts`** — round-trip `readUserSnapshots` / `readSavedQuotes` / `writeSavedQuotes` against jsdom localStorage; tolerant of malformed JSON.
- **`docExtract.test.ts`** — happy-path parsing; error-tolerant on bad input. (If the file is purely a mammoth/pdfjs wrapper with no own logic, skip — confirm during implementation.)

### `stores/` (15 files)

Each store gets state-transition tests plus a Firestore-interaction test where applicable. Highlights below; the rest follow the same pattern.

- **`authStore.test.ts`** — `login()` calls `init()` first then validates; rejects bad password; updates session storage `vte_s`; plaintext compare.
- **`quoteStore.test.ts`** — the most consequential file. Covers documented gotchas:
  - `init(user)` hydrates from `vte_quote_draft_{user}` (seed key, call init, assert draft loaded).
  - Two users on same machine don't cross-leak: init A → mutate → init B → B sees empty draft.
  - DMC drafts hydrated from localStorage are **discarded** and the key is removed (known-issue branch at `src/stores/quoteStore.ts:131-139`).
  - `setView` clamps to `cost | history` when template is `dmc`.
  - `newDraft('dmc')` seeds `dmcDefaults` + correct `catEnabled`.
  - `setPax(0)` clamps to 1; `setRounding(0)` clamps to 1.
  - `importJSON` rejects wrong `_meta.app`; clamps malformed `pax: 0` to 1.
  - `exportJSON` includes `_meta` and current draft.
  - `saveSnapshot` writes per-user list, caps at 50, includes `savedBy`.
  - `saveCloud` calls DMC vs regular fb functions based on template; generates a quote code only when new.
- **`rateCardStore.test.ts`** — load/sync paths; `applyPath`-style nested updates.
- **`quoteHistoryStore.test.ts`** — separate `quotes` vs `dmcQuotes` lists; subscribe to snapshot updates.
- **`contractStore.test.ts`**, **`customerStore.test.ts`**, **`nccStore.test.ts`** — CRUD against single-doc Firestore (`viettours/ncc_master.suppliers[]` pattern); seed → action → assert in-memory state + assert correct `setDoc` payload.
- **`paymentStore.test.ts`** — payment additions, totals, `vte_payments_{tourKey}` keying.
- **`paymentApprovalStore.test.ts`** — approval state machine.
- **`notificationStore.test.ts`** — push/read/per-user routing.
- **`itineraryStore.test.ts`**, **`menuStore.test.ts`**, **`restaurantStore.test.ts`**, **`visaProcStore.test.ts`**, **`visaProductsStore.test.ts`** — load/save/edit basic flows.

### Pure logic that lives under `components/` (2 files)

These aren't UI; they're the calculator math + template metadata. Include in scope:

- **`components/quote/calc.test.ts`** — `computeTotals`. The most important file in the suite. Cases: empty draft; mixed VAT / margin / svcBasis combinations; rounding to nearest `rounding` increment; DMC margin (percent vs absolute); per-pax vs per-group items.
- **`components/quote/constants.test.ts`** — `TEMPLATES` shape; `DMC_CAT_IDS` ⊂ `CATS`; `mkItem` defaults.

## CI integration

One change to `.github/workflows/deploy.yml`. Insert `npm test` between lint and typecheck:

```yaml
- run: npm run lint
- run: npm test              # new: vitest run, fails CI on red
- run: npm run typecheck
- run: npm run build
```

- `npm test` runs `vitest run` (single pass, no watch).
- Failed tests block the GitHub Pages deploy, same as `lint --max-warnings 0` already does.
- No coverage flag in CI for now (behavior coverage, no % gate). Can add `--coverage` later if we want a report artifact.
- No pre-push hook in scope. Keeps the change minimal.

## Non-goals

- No component / DOM tests (`@testing-library/react` not added).
- No E2E (Playwright/Cypress not added).
- No tests for `src/lib/exports/*` PDF/DOCX/Excel generators (output-heavy, low ROI for unit tests).
- No coverage threshold enforcement.
- No emulator-based Firestore tests.
