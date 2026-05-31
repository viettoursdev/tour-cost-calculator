# Vite + React + TypeScript Refactor — Design

_Date: 2026-05-31_
_Project: Viettours Tour Cost Calculator_
_Status: Approved design, ready for implementation plan_

---

## 1. Goal

Refactor the existing single-file React application (`index.html`, ~10,638 lines, ~800KB, React 18 via in-browser Babel) into a build-tooled React/TypeScript SPA deployed to GitHub Pages.

**Drivers:**

- Initial-load size and parse cost: in-browser Babel transpilation of an 800KB file is slow on poor connections.
- Maintainability: a 10K-line file is hard to navigate, review, and reason about.
- Tooling: no HMR, no tree-shaking, no type checking, no proper code review surface.

**Non-goals:**

- Adding new features.
- Changing the Firestore data model.
- Replacing the custom-auth model with Firebase Auth.
- Adding a test suite (separate effort).
- Mobile-first redesign.

---

## 2. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Build tool | **Vite 5+** | App is single-screen, auth-gated, client-only. Next.js routing/SSR/SSG gains nothing here; pays complexity cost for unused features. |
| Language | **TypeScript strict** | 10K-line codebase with untyped Firestore documents is exactly where TS pays off. Front-loaded porting friction is acceptable. |
| State | **Zustand** (one store per domain) with `subscribeWithSelector` + `persist` | Avoids prop-drilling current app already suffers from; `persist` middleware replaces ad-hoc `localStorage.setItem` interceptors. |
| UI library | **MUI v6** (`@mui/material`, icons, `x-date-pickers`, `x-data-grid`) | Explicit user choice. Acknowledged trade-off: each ported component is redesigned, not relocated. |
| Data layer cleanup | **Light** — named exports from `src/lib/firebase.ts`, replacing `window.fb*` globals; signatures preserved | Full data-layer rewrite (React Query, etc.) is its own multi-week project; light cleanup is the right scope for this refactor. |
| Migration strategy | **Incremental (strangler) within one repo** — Vite app built into `/preview/` during early phases, then cut over to root once shell + login + first tab work. Subsequent PRs port one tab at a time; un-ported tabs render a "Open in legacy" link. | Two-app coexistence is impossible on a single Pages site, but two-build coexistence at different URLs is. Keeps blast radius small. |
| Routing | None (`useState`-driven tabs) | App is single-screen. |
| CSS strategy | MUI `sx`/`styled` per component as ported; minimal `src/global.css` for non-component rules | Old `<style>` block does not lift cleanly when migrating to MUI primitives. |
| Firebase config | Hardcoded in `src/lib/firebase.ts` | Public client key, already in repo. No new secrets. |
| CDN libs | Replaced with npm packages (`xlsx`, `jspdf`, `html2canvas`, `docx`, `file-saver`, `firebase`) | Enables tree-shaking, manual chunks. |
| Tests | Out of scope for this refactor | Existing app has none; adding them is a separate effort. |
| Cutover safety net | Archive pre-cutover monolith as `dist/legacy.html` for 2 weeks post-cutover | Soft rollback without a redeploy. |

---

## 3. Project structure

```
tour-cost-calculator/
├── index.html              # Vite entry, tiny shell with <div id="root">
├── vite.config.ts          # base: '/tour-cost-calculator/', alias @ → src
├── tsconfig.json           # strict: true
├── package.json
├── .github/workflows/deploy.yml
├── public/
│   └── legacy.html         # archived pre-cutover monolithic file
├── src/
│   ├── main.tsx            # ReactDOM.createRoot, ThemeProvider, CssBaseline
│   ├── App.tsx             # auth gate → <MainApp/>
│   ├── theme.ts            # MUI createTheme — colors/typography from current CSS
│   ├── global.css          # minimal non-component rules
│   ├── lib/
│   │   ├── firebase.ts     # Firestore init + all fb* named exports
│   │   ├── storage.ts      # localStorage helpers (vte_* keys, legacy migration)
│   │   ├── notifications.ts# browser-notif utils
│   │   ├── util.ts         # debounce, applyPath, fmt helpers
│   │   └── exports/
│   │       ├── excel.ts
│   │       ├── pdf.ts      # PDFImage + PDFVector + invoice + contract + cert
│   │       └── docx.ts
│   ├── types/
│   │   ├── rates.ts        # RATES_INIT, CATS, UNITS, TEMPLATES
│   │   ├── user.ts         # User, Role
│   │   ├── contract.ts
│   │   ├── quote.ts
│   │   ├── customer.ts
│   │   ├── ncc.ts
│   │   └── notification.ts
│   ├── auth/
│   │   └── PERMISSIONS.ts
│   ├── stores/
│   │   ├── authStore.ts
│   │   ├── rateCardStore.ts
│   │   ├── quoteStore.ts
│   │   ├── quoteHistoryStore.ts
│   │   ├── contractStore.ts
│   │   ├── customerStore.ts
│   │   ├── nccStore.ts
│   │   └── notificationStore.ts
│   ├── hooks/
│   │   ├── useFirestoreSubscription.ts
│   │   └── useLocalStorageBackup.ts
│   └── components/
│       ├── shell/          # MainApp, AppBar, TabBar, NotificationBell, TemplateSelector
│       ├── rates/          # RatesPanel, RateCardModal, HotelModal, VisaModal
│       ├── quote/          # LineRow, CatBlock, SummaryView, HistPanel, SaveQuoteModal, QuoteHistoryView
│       ├── dashboard/      # DashboardView
│       ├── payment/        # PaymentView, PaymentPanel
│       ├── dmc/            # DMCComparePanel, CurrencySelector, CostView, QuoteView
│       ├── contract/       # ContractView, ContractModal, ContractManagerModal, AcceptanceCertModal, InvoiceModal
│       ├── customer/       # CustomerView, CustomerModal
│       ├── ncc/            # NCCView, NCCModal
│       └── admin/          # UserManagementModal, RateCardSyncModal
```

**Path alias:** `@/` → `src/`.

**Lint/format:** ESLint with `@typescript-eslint` and `eslint-plugin-react-hooks`, Prettier defaults. No heavy preset.

---

## 4. Data layer

### 4.1 `src/lib/firebase.ts` — I/O layer

Pure functions, no React, no Zustand. One module, named exports. Mirrors current `window.fb*` signatures so porting is mechanical.

Rules:

- All functions take/return typed domain objects, never raw `DocumentData`.
- All subscriptions return `Unsubscribe` so stores can clean up.
- No retry/debounce logic here — that lives in stores.
- No `try/catch` swallows. Errors propagate to callers (stores) which decide what to surface.

Exported surface (signatures preserve current `window.fb*` behavior):

```ts
export const db: Firestore;

// Rate card
export function fbPushMasterRC(rc: RateCard): Promise<void>;
export function fbPullMasterRC(): Promise<RateCard | null>;
export function fbSubscribeMasterRC(cb: (rc: RateCard) => void): Unsubscribe;

// Users
export function fbPushSingleUser(u: User): Promise<void>;
export function fbPullUsers(): Promise<User[]>;

// Contracts
export function fbSyncContracts(tourKey: string, list: Contract[], info: ContractInfo): Promise<void>;
export function fbSubscribeContracts(cb: (all: Record<string, Contract[]>) => void): Unsubscribe;

// Quotes (regular)
export function fbSaveQuote(meta: QuoteMeta, project: QuoteProject): Promise<string>;
export function fbLoadQuote(id: string): Promise<QuoteProject | null>;
export function fbUpdateCollaborators(id: string, users: string[]): Promise<void>;
export function fbSubscribeQuoteHistory(cb: (list: QuoteMeta[]) => void): Unsubscribe;

// Quotes (DMC) — separate names, not flags
export function fbSaveDMCQuote(meta: QuoteMeta, project: QuoteProject): Promise<string>;
export function fbLoadDMCQuote(id: string): Promise<QuoteProject | null>;
export function fbSubscribeDMCQuoteHistory(cb: (list: QuoteMeta[]) => void): Unsubscribe;

// Notifications
export function fbSendNotification(username: string, n: Notification): Promise<void>;
export function fbSubscribeNotifications(username: string, cb: (list: Notification[]) => void): Unsubscribe;

// NCC, Customers — same shape (push/pull/subscribe)
```

### 4.2 Zustand stores — state layer

One store per domain. Each store owns: state shape, mutations, an `init()` action wiring Firestore subscription + localStorage hydration, and disposal via the returned unsubscribe.

| Store | Owns | Firestore doc(s) | localStorage key(s) |
|---|---|---|---|
| `authStore` | current user, all users, login/logout, permission checks | `viettours/user_accounts` | `vte_users`, `vte_s` (sessionStorage) |
| `rateCardStore` | master rate card (hotels/visa/transport/etc) | `viettours/master_rate_card` | `vte_master_rate_card` + legacy `vte_rate_*`, `vte_hotels_v2_*`, `vte_visa_rates` |
| `quoteStore` | active quote draft (per template), local quick-save history | none for draft | `vte_q`, draft-per-template |
| `quoteHistoryStore` | cloud quote history — regular + DMC slices | `viettours/quote_history`, `quote_projects/*`, `viettours/dmc_quote_history`, `dmc_quote_projects/*` | none |
| `contractStore` | all contracts by tour, payments | `viettours/contracts_master`, `viettours/payments_*` | `vte_contracts_*`, `vte_payments_*` |
| `customerStore` | customers list | `viettours/customers_master` | none |
| `nccStore` | suppliers list | `viettours/ncc_master` | none |
| `notificationStore` | current user's notifications, unread count | `user_notifications/{username}` | none |

Example shape:

```ts
type RateCardState = {
  rates: RateCard;
  status: 'idle' | 'syncing' | 'error';
  init: () => Unsubscribe;
  updateRate: (path: string, value: unknown) => void;
};

const pushDebounced = debounce(fbPushMasterRC, 2000);

export const useRateCardStore = create<RateCardState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        rates: RATES_INIT,
        status: 'idle',
        init: () => fbSubscribeMasterRC((cloud) => set({ rates: cloud })),
        updateRate: (path, value) => {
          const next = applyPath(get().rates, path, value);
          set({ rates: next, status: 'syncing' });
          pushDebounced(next).then(
            () => set({ status: 'idle' }),
            () => set({ status: 'error' })
          );
        },
      }),
      { name: 'vte_master_rate_card' }
    )
  )
);
```

Wiring in `App.tsx`:

```tsx
useEffect(() => {
  if (!currentUser) return;
  const disposers = [
    useRateCardStore.getState().init(),
    useQuoteHistoryStore.getState().init(currentUser.u),
    useContractStore.getState().init(),
    useCustomerStore.getState().init(),
    useNccStore.getState().init(),
    useNotificationStore.getState().init(currentUser.u),
  ];
  return () => disposers.forEach(fn => fn());
}, [currentUser]);
```

### 4.3 Conventions

- Components read state via narrow selectors: `const rates = useRateCardStore(s => s.rates)`. Narrow selection is required to avoid re-render storms with MUI.
- Components never call `fb*` directly — they call store actions. Stores own the Firestore boundary.
- `persist` middleware handles localStorage backup automatically. The legacy ad-hoc `localStorage.setItem` interceptor is removed. Each store's `init()` performs a one-time legacy migration: read old `vte_*` keys, hydrate state, delete legacy keys.
- Async lives in store actions (`async updateRate()`). Components `await` them when they care about completion (e.g., for toast feedback).
- Cross-store reads inside actions use `someStore.getState()` — no store-to-store React subscriptions.

### 4.4 Deliberately not included

- **React Query** — Zustand + `onSnapshot` covers our real-time needs; React Query would duplicate the cache.
- **Optimistic-update framework** — current app already optimistically updates localStorage then pushes; we keep that pattern but inside store actions.
- **Event bus / pub-sub** — cross-cutting concerns (e.g., contract change → notification) go through explicit calls in store actions.

---

## 5. Migration plan

Each item is one PR. Order is driven by dependencies and risk.

### Phase 0 — Scaffold (no behavior change)

- **PR-0.1 Vite scaffold**: TS strict, `base` path, `@/` alias, ESLint/Prettier, MUI + Zustand installed, empty `<App/>` rendering "Hello". Old `index.html` archived to `public/legacy.html`. CI builds, deploys to a preview path (`/preview/`) so the live app stays untouched.
- **PR-0.2 Theme + shell chrome**: `src/theme.ts`, `CssBaseline`, app `AppBar`, empty `TabBar` with real tab labels but no content. Rendered to `/preview/`.

### Phase 1 — Data foundations

- **PR-1.1 Types**: port `RATES_INIT`, `CATS`, `UNITS`, `TEMPLATES`, `PERMISSIONS`, contract/quote/customer/ncc shapes to `src/types/*.ts`.
- **PR-1.2 `lib/firebase.ts`**: port Firebase init + every `window.fb*` function as a named export. Old `index.html` still uses `window.fb*` unchanged; new file is parallel until components migrate.
- **PR-1.3 `lib/storage.ts` + `lib/notifications.ts`**: port localStorage helpers and browser-notif utils. Parallel-coexist pattern.
- **PR-1.4 `authStore` + login**: port `ldUsers/svUsers/syncUsersFromCloud/doLogin` into Zustand `authStore`. Build a real MUI login screen. First user-visible piece on `/preview/`.

### Phase 2 — First vertical slice (cutover trigger)

- **PR-2.1 `rateCardStore` + RatesPanel + RateCardModal + HotelModal + VisaModal**: chosen first because it exercises MUI forms + modals + Firestore sync + localStorage persist + the master rate card sync flow — the hardest patterns up front. If this works cleanly, the rest is mechanical.
- **🚩 CUTOVER PR-2.2**: switch `/preview/` → root. `legacy.html` stays as fallback. From here, every subsequent PR ships to production. The Vite app at this point renders: login + Rates tab fully functional; other tabs show a "Coming soon — open in legacy" placeholder with a deep link back to the old file.

### Phase 3 — Tab-by-tab port

- **PR-3.1 Quote core**: `quoteStore`, `LineRow`, `CatBlock`, `SummaryView`, `HistPanel`.
- **PR-3.2 Quote history (cloud)**: `quoteHistoryStore`, `SaveQuoteModal`, `QuoteHistoryView`, collaborator logic.
- **PR-3.3 Dashboard**: `DashboardView`.
- **PR-3.4 NCC**: `nccStore`, `NCCView`, `NCCModal`.
- **PR-3.5 Customer**: `customerStore`, `CustomerView`, `CustomerModal`.
- **PR-3.6 Contract core**: `contractStore`, `ContractView`, `ContractModal`, `ContractManagerModal`.
- **PR-3.7 Payments**: `PaymentView`, `PaymentPanel`.
- **PR-3.8 Acceptance + invoice**: `AcceptanceCertModal`, `InvoiceModal`.
- **PR-3.9 DMC**: `DMCComparePanel`, `CurrencySelector`, `CostView`, `QuoteView`, DMC slice of `quoteHistoryStore`.
- **PR-3.10 Notifications**: `notificationStore`, `NotificationBell`, `checkContractDeadlines`, collab-invite notif.
- **PR-3.11 Admin**: `UserManagementModal`, `RateCardSyncModal`.

### Phase 4 — Cleanup

- **PR-4.1 Export functions**: port `exportExcel`, `exportPDFImage`, `exportPDFVector`, `exportInvoice`, `exportContractPDF`, `exportContractDocx`, `exportAcceptanceCertPDF` into `lib/exports/*` and wire to ported components. Can be done piecemeal alongside Phase 3 if a tab depends on its exports.
- **PR-4.2 Delete `public/legacy.html`** after ~2 weeks of stable cutover with no rollbacks.
- **PR-4.3 Remove dead code**: any remaining `window.fb*` shims, unused localStorage migration paths.

### Sequencing principles

- **Rate card first** (PR-2.1) is deliberate: it's the riskiest pattern (modals + nested forms + dual-write Firestore/localStorage + master sync). If MUI + Zustand can model this cleanly, every later tab is easier. Failing here is cheap; failing on Contracts after porting half the app is expensive.
- **Quote core before Dashboard/Contracts** because both read quote state.
- **NCC + Customer before Contracts** because contracts reference both.
- **Notifications late** because they cross-cut multiple stores and are non-critical.
- **Exports last** as a sweep — they're pure functions, easy to port in bulk.

### Effort estimate

Phase 0: ~1 day. Phase 1: ~2 days. Phase 2: ~3–5 days. Phase 3: ~1–3 days per PR. Phase 4: ~1–2 days. **Total: ~4–6 weeks** of focused work.

---

## 6. Build & deployment

### 6.1 GitHub Pages source

One-time manual change in repo Settings → Pages: switch from "Deploy from branch" to "**GitHub Actions**". This disables the current auto-deploy-from-`main:/` behavior.

### 6.2 Vite config

```ts
// vite.config.ts
export default defineConfig({
  base: '/tour-cost-calculator/',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          mui: ['@mui/material', '@mui/icons-material', '@mui/x-data-grid', '@mui/x-date-pickers'],
          firebase: ['firebase/app', 'firebase/firestore'],
          exports: ['xlsx', 'jspdf', 'html2canvas', 'docx', 'file-saver'],
        },
      },
    },
  },
});
```

Manual chunks keep first-paint bundle small; MUI / Firebase / export libs are big and cache well separately.

### 6.3 GitHub Actions workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build
      - run: cp public/legacy.html dist/legacy.html
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### 6.4 Preview environment during Phase 0–2

GitHub Pages serves one site; we need the Vite app reachable without disturbing the live tool. During Phases 0–2 only, the Vite app is built with `base: '/tour-cost-calculator/preview/'` and the existing `index.html` is copied to `dist/index.html` so the legacy app continues to serve at root.

```yaml
# temporary build steps during Phase 0–2 (replace the standard build + legacy-copy steps in 6.3)
- run: npm run build              # base=/tour-cost-calculator/preview/, outputs to dist/
- run: mv dist _vite_out
- run: mkdir -p dist/preview && mv _vite_out/* dist/preview/
- run: cp index.html dist/index.html                # legacy at root
- run: cp public/legacy.html dist/legacy.html
# then actions/upload-pages-artifact with path: dist (unchanged from 6.3)
```

The upload step in 6.3 (`path: dist`) is unchanged — only the build steps differ. After cutover (PR-2.2), this section's steps are deleted and the build reverts to the simple form in 6.3.

### 6.5 Cutover (PR-2.2)

1. Flip `base` back to `/tour-cost-calculator/`.
2. Remove the preview shuffle from the workflow.
3. Old root `index.html` is replaced by Vite's generated `dist/index.html`.
4. `public/legacy.html` (exact copy of pre-cutover monolith) is built into `dist/legacy.html` — bookmarkable fallback.
5. Announce in team chat: "New app is live. Legacy at `/legacy.html` for emergencies. Report any regressions immediately."

### 6.6 Un-ported tabs during Phase 3

Each tab not yet ported renders a placeholder:

```tsx
<Alert severity="info">
  This tab is being migrated. Use the legacy app:
  <Button href={`/tour-cost-calculator/legacy.html#tab=contracts`}>Open in legacy →</Button>
</Alert>
```

The legacy app keeps reading/writing the same Firestore docs, so data flows between the two apps with no migration needed. This is the load-bearing property that makes incremental safe.

### 6.7 Rollback

- **Soft rollback** (instant): users open `/tour-cost-calculator/legacy.html` directly. No deploy needed.
- **Hard rollback** (full revert): `git revert` the cutover PR → push → Actions redeploys legacy `index.html` at root within ~2 min.

### 6.8 Repo hygiene

- Branch protection on `main`: required status checks = `lint`, `typecheck`, `build`. No direct pushes.
- Each PR is squash-merged with a conventional commit message.
- `CONTEXT.md` updated at the end of each phase (not every PR).

### 6.9 Secrets

- Firebase config stays hardcoded in `src/lib/firebase.ts`. Public client key, already in repo.
- No `.env`, no Actions secrets needed beyond default `GITHUB_TOKEN`.

---

## 7. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Preview shuffle in workflow breaks live app | Medium | Test workflow on throwaway branch first; minimize workflow edits between PR-0.1 and cutover. |
| MUI redesign of components introduces visual inconsistency during Phase 3 | High | Accepted trade-off. Communicate to team. Alternative (defer MUI to phase 2) was rejected. |
| Bundle size with MUI + icons + date-pickers + data-grid | Low | Manual chunks split MUI/Firebase/exports for cache efficiency. Net bundle still much smaller than current 800KB unbundled. |
| Re-render storms from coarse Zustand selectors with MUI | Medium | Convention: always select narrowly. Code review must enforce. |
| Firestore-doc shape drift between legacy and Vite app during Phase 3 | Medium | All `fb*` functions in `lib/firebase.ts` mirror legacy signatures exactly. Any schema change must update both apps simultaneously until cutover. |
| Legacy `vte_*` localStorage keys not fully migrated | Low | One-time migration in each store's `init()` reads legacy keys, hydrates, deletes them. |
| 2-week legacy fallback window proves too short / too long | Low | Adjustable. PR-4.2 is gated on operational confidence, not a calendar date. |

---

## 8. Out of scope

- Tests (separate effort).
- Replacing custom auth with Firebase Auth.
- Mobile-first redesign.
- Replacing Zustand with a more sophisticated state library (React Query, Redux Toolkit).
- Replacing single-Firestore-doc-per-collection with subcollections.
- Replacing plaintext password storage.
- Adding new features from CONTEXT.md "Next Steps" (Payment Approval flow, Notification Tab, Acceptance deadline reminders).

These remain backlog items for after the refactor stabilizes.
