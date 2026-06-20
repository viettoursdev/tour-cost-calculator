# Supabase Phase 4 — Store/Component Wiring + Realtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip the app's data layer from the Firestore gateway (`fb*`) to the Supabase gateway (`sb*`) behind the existing `VITE_AUTH_BACKEND` flag, activating Supabase Realtime, with production staying on Firebase until cutover (Phase 7).

**Architecture:** Introduce one flag-gated barrel, `src/lib/dataBackend.ts`, that re-exports all 75 data `fb*` functions under their **same names**, selecting the `sb*` implementation when `VITE_AUTH_BACKEND === 'supabase'` and the `fb*` implementation otherwise. Repoint all 37 non-test consumers (18 stores + 16 components + 3 lib modules) from `@/lib/firebase` → `@/lib/dataBackend` — the imported names and call sites are unchanged, so only the import path moves. Realtime is **already implemented** inside the `sb*` subscribe functions (Supabase Postgres Changes via `subscribeTable` in `src/lib/supabase/helpers.ts`), so flipping the import activates it — no new realtime code. Auth is out of scope (Phase 3 already routes it through `authBackend`; the 75 functions are all data, none auth).

**Tech Stack:** Vite 5 · React 18 · TypeScript 5 (strict) · Zustand 4 · Firebase 10 (`fb*`) · Supabase JS (`sb*`) · Vitest.

## ⚠️ Prerequisite finding (pre-existing Phase-3 defect — fix in Task 0)

`src/lib/supabase.ts` **throws at module top-level** (lines 11–13) when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are unset. Since Phase 3, the **eager, static** startup chain `App → authStore → @/auth/backend → supabaseBackend → (value import) @/lib/supabase` evaluates `supabase.ts` on every page load, **regardless of `VITE_AUTH_BACKEND`**. `.github/workflows/deploy.yml` injects only `VITE_FIREBASE_*`, so the deployed bundle throws on startup → **white screen in production**. `npm run build`/`typecheck`/`test` all pass (the throw is runtime-only; `vitest.config.ts` provides dummy Supabase env), which is why CI never caught it. Phase 4's barrel imports `supabase.ts` the same way, so this must be fixed before Phase 4 ships. → **Task 0.**

## Global Constraints

- **Gateway public API is frozen.** Stores/components call functions with the existing `fb*` names and identical signatures. Do NOT rename call sites or change arguments. (design spec seam #1)
- **Flag default is `firebase`.** Selector logic mirrors `src/auth/backend.ts:24` exactly: `import.meta.env.VITE_AUTH_BACKEND === 'supabase' ? supabase : firebase`. Any value ≠ `'supabase'` (incl. unset) → Firebase. Production stays on Firebase.
- **One flag controls both auth and data.** Reuse `VITE_AUTH_BACKEND`; do NOT introduce a new env var. This closes the documented Phase-3 gotcha (under the flag, data was still Firestore → all reads/writes denied).
- **Zero behavior change when the flag is unset.** Unit tests mock `@/lib/firebase`; the default (firebase) branch re-exports those exact references, so existing store tests must pass unchanged.
- **Conventional Commits.** One logical change per commit. UI language Vietnamese, code English.
- **Gate before done:** `npm run typecheck`, `npm run lint` (`--max-warnings 0`), `npm test` (unit), `npm run test:integration`. CI must stay green.

---

### Task 0: Provide `VITE_SUPABASE_*` to the production build (fix the Phase-3 white-screen)

**Files:**
- Modify: `.github/workflows/deploy.yml` (add the two Supabase vars to the `npm run build` step's `env:` block)

**Prerequisite (out-of-band, the user must confirm):** the GitHub repo must hold secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the prod project `zkzrvctqwnhzklvsoahk`. The anon key + URL are public (they ship in the bundle), so they may alternatively be hardcoded in the workflow — but secrets match the existing `VITE_FIREBASE_*` convention. **If the secrets do not exist, adding the workflow lines yields empty strings and the throw persists** — the secrets must be set first.

- [ ] **Step 1: Add the env lines**

In `.github/workflows/deploy.yml`, the `- run: npm run build` step's `env:` block (currently the six `VITE_FIREBASE_*` lines), append:

```yaml
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
```

> Do NOT add `VITE_AUTH_BACKEND` here — production must stay on Firebase (the flag defaults to firebase when unset). These two vars only stop `supabase.ts` from throwing at load; the Firebase gateway remains active.

- [ ] **Step 2: Verify the secrets are configured (manual / user)**

Confirm with the user (or via `gh secret list` if authorized) that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` exist in the repo's Actions secrets. Without them, this task does not resolve the white-screen.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "fix(supabase): inject VITE_SUPABASE_* into prod build to stop startup throw (Phase 4 Task 0)

The eager authStore→backend→supabaseBackend→supabase.ts chain evaluates
supabase.ts on every load since Phase 3; without these vars it throws at
module init and white-screens production. Firebase stays the active backend.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> **Hotfix note:** this single commit, if cherry-picked/pushed to `main` ahead of the rest of Phase 4, restores production on its own. Consider shipping it first.

---

### Task 1: Create the `dataBackend` selector barrel + test env

**Files:**
- Create: `src/lib/dataBackend.ts`
- Modify: `vitest.config.ts` (add `VITE_FIREBASE_*` dummy defines, mirroring the existing `VITE_SUPABASE_*` block)
- Test: `src/lib/dataBackend.test.ts`

**Interfaces:**
- Consumes: `src/lib/firebase.ts` (all 75 `fb*` data exports), `src/lib/supabase.ts` (all 75 `sb*` data exports). Both already exist with identical signatures (verified: 0 missing `sb*`).
- Produces: a module exporting all 75 names — `fbAddThreadComment, fbBackfillPaymentIndex, fbBackfillWorkflowIndex, fbDeleteChatMessage, fbDeleteDMCQuote, fbDeleteItinerary, fbDeleteMenu, fbDeleteQuote, fbDeleteVisaProc, fbEditChatMessage, fbEnsureChat, fbEnsureNotifThread, fbGetContracts, fbGetDMCQuoteProject, fbGetItinerary, fbGetMenu, fbGetQuoteProject, fbGetTourPayments, fbGetVisaProc, fbLogAudit, fbMarkChatRead, fbPullMasterRC, fbPushContracts, fbPushCustomers, fbPushFxRates, fbPushMasterRC, fbPushNcc, fbPushNccProducts, fbPushNotifications, fbPushPois, fbPushVisaProjects, fbSaveDMCQuote, fbSaveDMCQuoteState, fbSaveItinerary, fbSaveMenu, fbSaveQuote, fbSaveQuoteState, fbSaveRestaurants, fbSaveTourPayments, fbSaveVisaProc, fbSaveVisaProducts, fbSendChatMessage, fbSendNotification, fbSendNotificationMany, fbSetApprovalStage, fbSetDMCEntryLink, fbSetDMCQuoteStatus, fbSetQuotePaymentSummary, fbSetQuoteStatus, fbSetRegularEntryLink, fbSetThreadStatus, fbSubscribeAuditLog, fbSubscribeChats, fbSubscribeContracts, fbSubscribeCustomers, fbSubscribeDMCQuoteHistory, fbSubscribeFxRates, fbSubscribeItineraries, fbSubscribeMasterRC, fbSubscribeMenus, fbSubscribeNcc, fbSubscribeNccProducts, fbSubscribeNotifThread, fbSubscribeNotifications, fbSubscribePaymentApprovals, fbSubscribePois, fbSubscribeQuoteHistory, fbSubscribeRestaurants, fbSubscribeTourPayments, fbSubscribeVisaProcs, fbSubscribeVisaProducts, fbSubscribeVisaProjects, fbToggleChatReaction, fbUpdateCollaborators, fbUpdateDMCCollaborators* — each typed identically to its `fb*` counterpart.

**Why the `as typeof fb.X` cast:** `sb*` functions carry an extra optional trailing `client = sb` param. Without the cast, `cond ? sb.sbX : fb.fbX` yields a union function type that can be awkward to call. Casting the `sb` branch to the `fb` type collapses each export to the exact production signature consumers already expect — and if any `sb*` signature is genuinely incompatible, the cast fails at `typecheck`, surfacing a real parity bug.

- [ ] **Step 1: Add Firebase dummy env to the test config**

In `vitest.config.ts`, inside the existing `define: { ... }` block (which already holds the two `VITE_SUPABASE_*` lines), add the Firebase keys so the barrel test can import the real `firebase.ts` (which throws at module load if any `VITE_FIREBASE_*` is missing). Store tests are unaffected — they `vi.mock('@/lib/firebase')`, so the real module never loads there.

```ts
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://localhost:54321'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('unit-test-anon-key'),
    'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify('unit-test'),
    'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify('unit-test.firebaseapp.com'),
    'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify('unit-test'),
    'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify('unit-test.appspot.com'),
    'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify('0'),
    'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify('1:0:web:0'),
  },
```

> Before writing the keys, open `src/lib/firebase.ts` (the `firebaseConfig` object, ~lines 20–32) and confirm the exact `VITE_FIREBASE_*` key names it reads; match them verbatim. The list above is the standard set — adjust only if the file differs.

- [ ] **Step 2: Write the failing test**

Create `src/lib/dataBackend.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';

// The full data-gateway surface the barrel must expose (75 names).
const NAMES = [
  'fbAddThreadComment','fbBackfillPaymentIndex','fbBackfillWorkflowIndex','fbDeleteChatMessage',
  'fbDeleteDMCQuote','fbDeleteItinerary','fbDeleteMenu','fbDeleteQuote','fbDeleteVisaProc',
  'fbEditChatMessage','fbEnsureChat','fbEnsureNotifThread','fbGetContracts','fbGetDMCQuoteProject',
  'fbGetItinerary','fbGetMenu','fbGetQuoteProject','fbGetTourPayments','fbGetVisaProc','fbLogAudit',
  'fbMarkChatRead','fbPullMasterRC','fbPushContracts','fbPushCustomers','fbPushFxRates','fbPushMasterRC',
  'fbPushNcc','fbPushNccProducts','fbPushNotifications','fbPushPois','fbPushVisaProjects','fbSaveDMCQuote',
  'fbSaveDMCQuoteState','fbSaveItinerary','fbSaveMenu','fbSaveQuote','fbSaveQuoteState','fbSaveRestaurants',
  'fbSaveTourPayments','fbSaveVisaProc','fbSaveVisaProducts','fbSendChatMessage','fbSendNotification',
  'fbSendNotificationMany','fbSetApprovalStage','fbSetDMCEntryLink','fbSetDMCQuoteStatus',
  'fbSetQuotePaymentSummary','fbSetQuoteStatus','fbSetRegularEntryLink','fbSetThreadStatus',
  'fbSubscribeAuditLog','fbSubscribeChats','fbSubscribeContracts','fbSubscribeCustomers',
  'fbSubscribeDMCQuoteHistory','fbSubscribeFxRates','fbSubscribeItineraries','fbSubscribeMasterRC',
  'fbSubscribeMenus','fbSubscribeNcc','fbSubscribeNccProducts','fbSubscribeNotifThread',
  'fbSubscribeNotifications','fbSubscribePaymentApprovals','fbSubscribePois','fbSubscribeQuoteHistory',
  'fbSubscribeRestaurants','fbSubscribeTourPayments','fbSubscribeVisaProcs','fbSubscribeVisaProducts',
  'fbSubscribeVisaProjects','fbToggleChatReaction','fbUpdateCollaborators','fbUpdateDMCCollaborators',
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('dataBackend selector', () => {
  it('exports every data-gateway function (75)', async () => {
    const dg = await import('@/lib/dataBackend');
    for (const n of NAMES) {
      expect(typeof (dg as Record<string, unknown>)[n], `${n} should be a function`).toBe('function');
    }
    expect(NAMES.length).toBe(75);
  });

  it('defaults to the Firebase gateway when the flag is unset', async () => {
    vi.resetModules();
    const fb = await import('@/lib/firebase');
    const dg = await import('@/lib/dataBackend');
    expect(dg.fbSubscribeNcc).toBe(fb.fbSubscribeNcc);
    expect(dg.fbSaveQuoteState).toBe(fb.fbSaveQuoteState);
  });

  it('selects the Supabase gateway when VITE_AUTH_BACKEND=supabase', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_AUTH_BACKEND', 'supabase');
    const sb = await import('@/lib/supabase');
    const dg = await import('@/lib/dataBackend');
    expect(dg.fbSubscribeNcc).toBe(sb.sbSubscribeNcc);
    expect(dg.fbSaveQuoteState).toBe(sb.sbSaveQuoteState);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/lib/dataBackend.test.ts`
Expected: FAIL — `Cannot find module '@/lib/dataBackend'`.

- [ ] **Step 4: Create the barrel**

Create `src/lib/dataBackend.ts`. Header + selector const, then the 75 re-exports:

```ts
// Flag-gated data gateway selector (Phase 4).
// Re-exports every data fb* function under its same name, selecting the Supabase
// (sb*) implementation when VITE_AUTH_BACKEND === 'supabase', else Firebase (fb*).
// Selector mirrors src/auth/backend.ts. Auth functions are NOT here — they route
// through authBackend (Phase 3). Production stays on Firebase until cutover (Phase 7).
import * as fb from './firebase';
import * as sb from './supabase';

const sbActive = import.meta.env.VITE_AUTH_BACKEND === 'supabase';

export const fbAddThreadComment = sbActive ? (sb.sbAddThreadComment as typeof fb.fbAddThreadComment) : fb.fbAddThreadComment;
export const fbBackfillPaymentIndex = sbActive ? (sb.sbBackfillPaymentIndex as typeof fb.fbBackfillPaymentIndex) : fb.fbBackfillPaymentIndex;
export const fbBackfillWorkflowIndex = sbActive ? (sb.sbBackfillWorkflowIndex as typeof fb.fbBackfillWorkflowIndex) : fb.fbBackfillWorkflowIndex;
export const fbDeleteChatMessage = sbActive ? (sb.sbDeleteChatMessage as typeof fb.fbDeleteChatMessage) : fb.fbDeleteChatMessage;
export const fbDeleteDMCQuote = sbActive ? (sb.sbDeleteDMCQuote as typeof fb.fbDeleteDMCQuote) : fb.fbDeleteDMCQuote;
export const fbDeleteItinerary = sbActive ? (sb.sbDeleteItinerary as typeof fb.fbDeleteItinerary) : fb.fbDeleteItinerary;
export const fbDeleteMenu = sbActive ? (sb.sbDeleteMenu as typeof fb.fbDeleteMenu) : fb.fbDeleteMenu;
export const fbDeleteQuote = sbActive ? (sb.sbDeleteQuote as typeof fb.fbDeleteQuote) : fb.fbDeleteQuote;
export const fbDeleteVisaProc = sbActive ? (sb.sbDeleteVisaProc as typeof fb.fbDeleteVisaProc) : fb.fbDeleteVisaProc;
export const fbEditChatMessage = sbActive ? (sb.sbEditChatMessage as typeof fb.fbEditChatMessage) : fb.fbEditChatMessage;
export const fbEnsureChat = sbActive ? (sb.sbEnsureChat as typeof fb.fbEnsureChat) : fb.fbEnsureChat;
export const fbEnsureNotifThread = sbActive ? (sb.sbEnsureNotifThread as typeof fb.fbEnsureNotifThread) : fb.fbEnsureNotifThread;
export const fbGetContracts = sbActive ? (sb.sbGetContracts as typeof fb.fbGetContracts) : fb.fbGetContracts;
export const fbGetDMCQuoteProject = sbActive ? (sb.sbGetDMCQuoteProject as typeof fb.fbGetDMCQuoteProject) : fb.fbGetDMCQuoteProject;
export const fbGetItinerary = sbActive ? (sb.sbGetItinerary as typeof fb.fbGetItinerary) : fb.fbGetItinerary;
export const fbGetMenu = sbActive ? (sb.sbGetMenu as typeof fb.fbGetMenu) : fb.fbGetMenu;
export const fbGetQuoteProject = sbActive ? (sb.sbGetQuoteProject as typeof fb.fbGetQuoteProject) : fb.fbGetQuoteProject;
export const fbGetTourPayments = sbActive ? (sb.sbGetTourPayments as typeof fb.fbGetTourPayments) : fb.fbGetTourPayments;
export const fbGetVisaProc = sbActive ? (sb.sbGetVisaProc as typeof fb.fbGetVisaProc) : fb.fbGetVisaProc;
export const fbLogAudit = sbActive ? (sb.sbLogAudit as typeof fb.fbLogAudit) : fb.fbLogAudit;
export const fbMarkChatRead = sbActive ? (sb.sbMarkChatRead as typeof fb.fbMarkChatRead) : fb.fbMarkChatRead;
export const fbPullMasterRC = sbActive ? (sb.sbPullMasterRC as typeof fb.fbPullMasterRC) : fb.fbPullMasterRC;
export const fbPushContracts = sbActive ? (sb.sbPushContracts as typeof fb.fbPushContracts) : fb.fbPushContracts;
export const fbPushCustomers = sbActive ? (sb.sbPushCustomers as typeof fb.fbPushCustomers) : fb.fbPushCustomers;
export const fbPushFxRates = sbActive ? (sb.sbPushFxRates as typeof fb.fbPushFxRates) : fb.fbPushFxRates;
export const fbPushMasterRC = sbActive ? (sb.sbPushMasterRC as typeof fb.fbPushMasterRC) : fb.fbPushMasterRC;
export const fbPushNcc = sbActive ? (sb.sbPushNcc as typeof fb.fbPushNcc) : fb.fbPushNcc;
export const fbPushNccProducts = sbActive ? (sb.sbPushNccProducts as typeof fb.fbPushNccProducts) : fb.fbPushNccProducts;
export const fbPushNotifications = sbActive ? (sb.sbPushNotifications as typeof fb.fbPushNotifications) : fb.fbPushNotifications;
export const fbPushPois = sbActive ? (sb.sbPushPois as typeof fb.fbPushPois) : fb.fbPushPois;
export const fbPushVisaProjects = sbActive ? (sb.sbPushVisaProjects as typeof fb.fbPushVisaProjects) : fb.fbPushVisaProjects;
export const fbSaveDMCQuote = sbActive ? (sb.sbSaveDMCQuote as typeof fb.fbSaveDMCQuote) : fb.fbSaveDMCQuote;
export const fbSaveDMCQuoteState = sbActive ? (sb.sbSaveDMCQuoteState as typeof fb.fbSaveDMCQuoteState) : fb.fbSaveDMCQuoteState;
export const fbSaveItinerary = sbActive ? (sb.sbSaveItinerary as typeof fb.fbSaveItinerary) : fb.fbSaveItinerary;
export const fbSaveMenu = sbActive ? (sb.sbSaveMenu as typeof fb.fbSaveMenu) : fb.fbSaveMenu;
export const fbSaveQuote = sbActive ? (sb.sbSaveQuote as typeof fb.fbSaveQuote) : fb.fbSaveQuote;
export const fbSaveQuoteState = sbActive ? (sb.sbSaveQuoteState as typeof fb.fbSaveQuoteState) : fb.fbSaveQuoteState;
export const fbSaveRestaurants = sbActive ? (sb.sbSaveRestaurants as typeof fb.fbSaveRestaurants) : fb.fbSaveRestaurants;
export const fbSaveTourPayments = sbActive ? (sb.sbSaveTourPayments as typeof fb.fbSaveTourPayments) : fb.fbSaveTourPayments;
export const fbSaveVisaProc = sbActive ? (sb.sbSaveVisaProc as typeof fb.fbSaveVisaProc) : fb.fbSaveVisaProc;
export const fbSaveVisaProducts = sbActive ? (sb.sbSaveVisaProducts as typeof fb.fbSaveVisaProducts) : fb.fbSaveVisaProducts;
export const fbSendChatMessage = sbActive ? (sb.sbSendChatMessage as typeof fb.fbSendChatMessage) : fb.fbSendChatMessage;
export const fbSendNotification = sbActive ? (sb.sbSendNotification as typeof fb.fbSendNotification) : fb.fbSendNotification;
export const fbSendNotificationMany = sbActive ? (sb.sbSendNotificationMany as typeof fb.fbSendNotificationMany) : fb.fbSendNotificationMany;
export const fbSetApprovalStage = sbActive ? (sb.sbSetApprovalStage as typeof fb.fbSetApprovalStage) : fb.fbSetApprovalStage;
export const fbSetDMCEntryLink = sbActive ? (sb.sbSetDMCEntryLink as typeof fb.fbSetDMCEntryLink) : fb.fbSetDMCEntryLink;
export const fbSetDMCQuoteStatus = sbActive ? (sb.sbSetDMCQuoteStatus as typeof fb.fbSetDMCQuoteStatus) : fb.fbSetDMCQuoteStatus;
export const fbSetQuotePaymentSummary = sbActive ? (sb.sbSetQuotePaymentSummary as typeof fb.fbSetQuotePaymentSummary) : fb.fbSetQuotePaymentSummary;
export const fbSetQuoteStatus = sbActive ? (sb.sbSetQuoteStatus as typeof fb.fbSetQuoteStatus) : fb.fbSetQuoteStatus;
export const fbSetRegularEntryLink = sbActive ? (sb.sbSetRegularEntryLink as typeof fb.fbSetRegularEntryLink) : fb.fbSetRegularEntryLink;
export const fbSetThreadStatus = sbActive ? (sb.sbSetThreadStatus as typeof fb.fbSetThreadStatus) : fb.fbSetThreadStatus;
export const fbSubscribeAuditLog = sbActive ? (sb.sbSubscribeAuditLog as typeof fb.fbSubscribeAuditLog) : fb.fbSubscribeAuditLog;
export const fbSubscribeChats = sbActive ? (sb.sbSubscribeChats as typeof fb.fbSubscribeChats) : fb.fbSubscribeChats;
export const fbSubscribeContracts = sbActive ? (sb.sbSubscribeContracts as typeof fb.fbSubscribeContracts) : fb.fbSubscribeContracts;
export const fbSubscribeCustomers = sbActive ? (sb.sbSubscribeCustomers as typeof fb.fbSubscribeCustomers) : fb.fbSubscribeCustomers;
export const fbSubscribeDMCQuoteHistory = sbActive ? (sb.sbSubscribeDMCQuoteHistory as typeof fb.fbSubscribeDMCQuoteHistory) : fb.fbSubscribeDMCQuoteHistory;
export const fbSubscribeFxRates = sbActive ? (sb.sbSubscribeFxRates as typeof fb.fbSubscribeFxRates) : fb.fbSubscribeFxRates;
export const fbSubscribeItineraries = sbActive ? (sb.sbSubscribeItineraries as typeof fb.fbSubscribeItineraries) : fb.fbSubscribeItineraries;
export const fbSubscribeMasterRC = sbActive ? (sb.sbSubscribeMasterRC as typeof fb.fbSubscribeMasterRC) : fb.fbSubscribeMasterRC;
export const fbSubscribeMenus = sbActive ? (sb.sbSubscribeMenus as typeof fb.fbSubscribeMenus) : fb.fbSubscribeMenus;
export const fbSubscribeNcc = sbActive ? (sb.sbSubscribeNcc as typeof fb.fbSubscribeNcc) : fb.fbSubscribeNcc;
export const fbSubscribeNccProducts = sbActive ? (sb.sbSubscribeNccProducts as typeof fb.fbSubscribeNccProducts) : fb.fbSubscribeNccProducts;
export const fbSubscribeNotifThread = sbActive ? (sb.sbSubscribeNotifThread as typeof fb.fbSubscribeNotifThread) : fb.fbSubscribeNotifThread;
export const fbSubscribeNotifications = sbActive ? (sb.sbSubscribeNotifications as typeof fb.fbSubscribeNotifications) : fb.fbSubscribeNotifications;
export const fbSubscribePaymentApprovals = sbActive ? (sb.sbSubscribePaymentApprovals as typeof fb.fbSubscribePaymentApprovals) : fb.fbSubscribePaymentApprovals;
export const fbSubscribePois = sbActive ? (sb.sbSubscribePois as typeof fb.fbSubscribePois) : fb.fbSubscribePois;
export const fbSubscribeQuoteHistory = sbActive ? (sb.sbSubscribeQuoteHistory as typeof fb.fbSubscribeQuoteHistory) : fb.fbSubscribeQuoteHistory;
export const fbSubscribeRestaurants = sbActive ? (sb.sbSubscribeRestaurants as typeof fb.fbSubscribeRestaurants) : fb.fbSubscribeRestaurants;
export const fbSubscribeTourPayments = sbActive ? (sb.sbSubscribeTourPayments as typeof fb.fbSubscribeTourPayments) : fb.fbSubscribeTourPayments;
export const fbSubscribeVisaProcs = sbActive ? (sb.sbSubscribeVisaProcs as typeof fb.fbSubscribeVisaProcs) : fb.fbSubscribeVisaProcs;
export const fbSubscribeVisaProducts = sbActive ? (sb.sbSubscribeVisaProducts as typeof fb.fbSubscribeVisaProducts) : fb.fbSubscribeVisaProducts;
export const fbSubscribeVisaProjects = sbActive ? (sb.sbSubscribeVisaProjects as typeof fb.fbSubscribeVisaProjects) : fb.fbSubscribeVisaProjects;
export const fbToggleChatReaction = sbActive ? (sb.sbToggleChatReaction as typeof fb.fbToggleChatReaction) : fb.fbToggleChatReaction;
export const fbUpdateCollaborators = sbActive ? (sb.sbUpdateCollaborators as typeof fb.fbUpdateCollaborators) : fb.fbUpdateCollaborators;
export const fbUpdateDMCCollaborators = sbActive ? (sb.sbUpdateDMCCollaborators as typeof fb.fbUpdateDMCCollaborators) : fb.fbUpdateDMCCollaborators;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/lib/dataBackend.test.ts`
Expected: PASS (3 tests). If the "selects the Supabase gateway" case fails to swap, confirm `vi.resetModules()` runs before `stubEnv` and that the import order is `stubEnv` → `import`.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean. A failure here on a specific `as typeof fb.X` cast means that `sb*` function's signature genuinely diverges from its `fb*` twin — STOP and reconcile the gateway signature (do not loosen the cast to `as any`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/dataBackend.ts src/lib/dataBackend.test.ts vitest.config.ts
git commit -m "feat(supabase): flag-gated data gateway selector (Phase 4 Task 1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Repoint the 18 stores to the selector

**Files (Modify — import line only):**
`src/stores/chatStore.ts`, `contractStore.ts`, `customerStore.ts`, `itineraryStore.ts`, `menuStore.ts`, `nccProductsStore.ts`, `nccStore.ts`, `notificationStore.ts`, `paymentApprovalStore.ts`, `paymentStore.ts`, `poiStore.ts`, `quoteHistoryStore.ts`, `quoteStore.ts`, `rateCardStore.ts`, `restaurantStore.ts`, `visaProcStore.ts`, `visaProductsStore.ts`, `visaProjectStore.ts`

**Interfaces:**
- Consumes: the 75 `fb*` re-exports from Task 1 (`@/lib/dataBackend`).
- Produces: nothing new — identical call sites, only the import source changes.

**The edit (uniform for every file):** change the gateway import's path from `'@/lib/firebase'` to `'@/lib/dataBackend'`. Leave the imported **names** exactly as they are. Do NOT touch any `import type { Unsubscribe } from 'firebase/firestore'` lines — those are backend-neutral types and stay.

- [ ] **Step 1: Repoint each store's import path**

For each file above, find the `from '@/lib/firebase'` import (it imports only `fb*` data functions) and change the path to `'@/lib/dataBackend'`. Example (`src/stores/nccStore.ts:3`):

```ts
// before
import { fbSubscribeNcc, fbPushNcc } from '@/lib/firebase';
// after
import { fbSubscribeNcc, fbPushNcc } from '@/lib/dataBackend';
```

For multi-line imports (e.g. `quoteStore.ts`, `itineraryStore.ts`, `menuStore.ts`, `visaProcStore.ts`, `notificationStore.ts`), only the trailing `} from '@/lib/firebase';` line changes to `} from '@/lib/dataBackend';`.

- [ ] **Step 2: Confirm no store still imports data functions from `@/lib/firebase`**

Run: `grep -rln "from '@/lib/firebase'" src/stores --include='*.ts' | grep -v '\.test\.'`
Expected: **no output** (every non-test store now points at `dataBackend`).

> Note: store **test** files keep `vi.mock('@/lib/firebase', …)` — do NOT change them. With the flag unset (default in tests), the barrel re-exports the mocked `@/lib/firebase` references, so the mocks still intercept the store's calls and assertions on `vi.mocked(fb.fbX)` still hold.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 4: Run the unit suite**

Run: `npm test`
Expected: PASS, same count as the Phase-3 baseline (≈565 + the 3 new barrel tests). No store test should change behavior.

- [ ] **Step 5: Commit**

```bash
git add src/stores
git commit -m "feat(supabase): repoint stores to the data gateway selector (Phase 4 Task 2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Repoint the 16 components + 3 lib modules to the selector

**Files (Modify — import line only):**
- Components: `src/components/admin/AuditView.tsx`, `src/components/admin/RateCardSyncModal.tsx`, `src/components/chat/ChatPanel.tsx`, `src/components/contract/PaymentPanel.tsx`, `src/components/notifications/NotificationBell.tsx`, `src/components/notifications/NotificationCenter.tsx`, `src/components/quote/AdvanceView.tsx`, `src/components/quote/PaymentBoard.tsx`, `src/components/quote/PaymentRequestModal.tsx`, `src/components/quote/PaymentView.tsx`, `src/components/quote/QuoteHistoryView.tsx`, `src/components/quote/QuoteLinksModal.tsx`, `src/components/quote/SalesPipeline.tsx`, `src/components/quote/VersionHistoryModal.tsx`, `src/components/quote/WorkflowBoard.tsx`, `src/components/shell/MainApp.tsx`
- Lib: `src/lib/assistant/tools.ts`, `src/lib/audit.ts`, `src/lib/notifications.ts`

**Interfaces:**
- Consumes: the 75 `fb*` re-exports from Task 1 (`@/lib/dataBackend`).
- Produces: nothing new — identical call sites.

**The edit (uniform):** change the `from '@/lib/firebase'` import path to `'@/lib/dataBackend'`, keeping imported names unchanged. These files import only `fb*` data functions from that module (verified). Leave any other firebase imports (there are none in these lines) untouched.

- [ ] **Step 1: Repoint each component/lib import path**

For each file above, change `from '@/lib/firebase'` → `from '@/lib/dataBackend'`. Example (`src/components/shell/MainApp.tsx:5`):

```ts
// before
import { fbSubscribeFxRates } from '@/lib/firebase';
// after
import { fbSubscribeFxRates } from '@/lib/dataBackend';
```

- [ ] **Step 2: Confirm no non-test source outside `firebase.ts`/`firebaseBackend.ts` still imports from `@/lib/firebase`**

Run: `grep -rln "from '@/lib/firebase'" src --include='*.ts' --include='*.tsx' | grep -v '\.test\.' | grep -v 'src/lib/firebase.ts' | grep -v 'firebaseBackend'`
Expected: **no output**. (`firebaseBackend.ts` legitimately still imports `fb*` auth helpers — it IS the Firebase auth backend — and is excluded.)

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 4: Run the unit suite**

Run: `npm test`
Expected: PASS, unchanged from Task 2.

- [ ] **Step 5: Commit**

```bash
git add src/components src/lib/assistant/tools.ts src/lib/audit.ts src/lib/notifications.ts
git commit -m "feat(supabase): repoint components + lib to the data gateway selector (Phase 4 Task 3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Full gate, flag smoke checklist, and docs/memory update

**Files:**
- Modify: `docs/supabase-setup.md` (add a Phase-4 section)
- Modify (after merge, separately): the `supabase-migration` memory file

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: documentation + a manual smoke checklist; no code.

- [ ] **Step 1: Run the complete gate**

Run: `npm run typecheck && npm run lint && npm test && npm run test:integration`
Expected: typecheck/lint clean; unit green (≈568); integration green. Note: the integration suite has a **known pre-existing flake** — `notifications.test.ts` "I3 realtime" concurrency (passes 14/14 in isolation, untouched by this branch). If only that line is red, re-run it in isolation to confirm it's the flake, not a regression: `npm run test:integration -- notifications`.

- [ ] **Step 2: Manual flag smoke (requires the local Supabase stack + a seeded `@viettours.com.vn` profile)**

This is a manual verification, not an automated test. Document the result in the commit/PR notes.

```bash
# 1. Start the local Supabase stack (Docker) per docs/supabase-setup.md, then:
VITE_AUTH_BACKEND=supabase npm run dev
```
In the browser (DEV build → Email+Password panel):
- [ ] Sign in with a seeded `@viettours.com.vn` account; `currentUser` resolves (no "denied" state).
- [ ] A synced list loads from Postgres — e.g. NCC suppliers or customers appear (was empty/denied before Phase 4 under the flag).
- [ ] Create/edit one record; confirm it persists (reload the page → it's still there).
- [ ] **Realtime:** open a second tab signed in as the same/another `@viettours.com.vn` user; create a supplier in tab A → it appears in tab B without reload (Supabase Postgres Changes is live).
- [ ] Open a quote, save it, reopen → it reassembles correctly (exercises `assemble*`/`decompose*` + `save_quote_state` RPC through the store).
- [ ] Toggle the flag off (`npm run dev` with no `VITE_AUTH_BACKEND`) → app behaves exactly as today on Firebase (regression check).

> If the local stack isn't available this session, record that the smoke is **deferred** and must run before any staging/prod cutover (Phase 7). The automated gate (Step 1) still fully covers the default-Firebase path.

- [ ] **Step 3: Add a Phase-4 section to `docs/supabase-setup.md`**

Document: the `dataBackend.ts` selector (one flag now flips both auth and data, closing the Phase-3 gotcha); that realtime ships inside the `sb*` subscribe functions (no separate wiring); that production stays on Firebase until cutover; and the manual smoke checklist from Step 2. Match the existing doc's heading style.

- [ ] **Step 4: Commit the docs**

```bash
git add docs/supabase-setup.md
git commit -m "docs(supabase): Phase 4 data-gateway selector + flag smoke checklist (Phase 4 Task 4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: Update the `supabase-migration` memory** (after the branch is reviewed/merged)

Mark Phase 4 DONE; note the `dataBackend.ts` seam and that the Phase-3 gotcha is closed (one flag flips auth + data); record the smoke result (done/deferred); set **Next: Phase 5** (Worker JWT verification swap).

---

## Self-Review

**1. Spec coverage** (design spec phase table, row 4 = "Realtime subscriptions on list/index tables; swap store imports `fb*` → `sb*`"):
- "Swap store imports `fb*` → `sb*`" → Tasks 2 + 3 (the selector makes the swap flag-gated rather than a hard rename, per the spec's seam-#1 "change only the import line" + the documented requirement that production stays on Firebase until cutover). ✓
- "Realtime subscriptions on list/index tables" → already implemented inside the `sb*` subscribe functions (Phase 1/1.5, `subscribeTable` helper); activated by the import swap. Smoke Step 2 verifies it live. ✓
- Phase-3 gotcha ("under the flag, data still Firestore → denied") → closed by reusing `VITE_AUTH_BACKEND` for the data selector (Global Constraints + Task 4 docs). ✓

**2. Placeholder scan:** no TBD/TODO/"handle edge cases"/"similar to Task N". The barrel is shown in full (75 lines); every repoint shows the exact before/after. ✓

**3. Type consistency:** the selector const is `sbActive` throughout; every export is `fbX = sbActive ? (sb.sbX as typeof fb.fbX) : fb.fbX`; consumers keep the identical `fb*` names. The 75-name list in the Task-1 test matches the 75 exports in the barrel. ✓

**Scope note:** Phase 4 is a single subsystem (the data-gateway seam) — no sub-project split needed. Tasks 2 and 3 are mechanical and could be merged, but are kept separate so a reviewer can gate store wiring independently from component/lib wiring.
