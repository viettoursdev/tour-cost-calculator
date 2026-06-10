# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Internal tool for Viettours sales/operations — tour cost calculation, quotes, contracts, suppliers, customers, itineraries, menus, visa & doc translation.

- **Live:** https://viettoursdev.github.io/tour-cost-calculator/
- **Stack:** Vite 5 · React 18 · TypeScript 5 (strict) · MUI v6 + MUI X · Zustand 4 · Firebase 10 (Firestore, named DB `viettours`) · GitHub Pages
- **Build step required** — this is no longer a single-file Babel-in-browser app. See `package.json` and `vite.config.ts`.

## Commands

```bash
npm install          # first time
npm run dev          # Vite dev server on :5173 (base path /tour-cost-calculator/)
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint (--max-warnings 0)
npm run build        # typecheck + vite build → dist/
npm run preview      # serve the built dist/
npm run format       # Prettier on src/**/*.{ts,tsx,css}
```

There is no test runner configured.

## Architecture

```
src/
  main.tsx              # React root, mounts <App/>
  App.tsx               # ThemeProvider + <MainApp/>
  theme.ts              # MUI theme + LEGACY palette tokens
  global.css
  auth/                 # PERMISSIONS, ROLES, DEFAULT_USERS
  lib/                  # firebase.ts, currency, dateUtils, notifications,
                        # exports/ (PDF/DOCX/Excel/Invoice generators)
  stores/               # 15 Zustand stores (auth, quote, rateCard,
                        # quoteHistory, contract, customer, ncc, payment,
                        # paymentApproval, itinerary, menu, restaurant,
                        # notification, visaProc, visaProducts)
  types/                # Shared TypeScript types
  components/
    shell/              # MainApp, AppShell, LoginScreen
    quote/              # QuoteView (template router), QuoteToolbar,
                        # CostView, SummaryView, DashboardView,
                        # PaymentView, QuoteHistoryView, DMCComparePanel,
                        # CatBlock, LineRow, modals
    rates/              # HotelModal, VisaModal, RateCardModal
    contract/ customer/ ncc/ notifications/ admin/
    itinerary/ menu/ visa/ doctranslate/   # "alt" templates
public/
  legacy.html           # the original single-file build, preserved for reference;
                        # copied to dist/legacy.html by CI for /legacy.html access
```

Mount chain: `main.tsx → App → MainApp → AppShell → QuoteView → {CostView | SummaryView | … | ItineraryApp | MenuApp | …}`.

TypeScript path alias: `@/* → src/*` (see `tsconfig.json` and `vite.config.ts`).

## Templates (7)

Defined in `src/components/quote/constants.ts:TEMPLATES`.

| Key | Kind | Notes |
|-----|------|-------|
| `domestic` | standard | Quote with full cost categories |
| `intl` | standard | Quote with intl-specific seed items |
| `dmc` | standard | Breakdown + History tabs only; own DMC_CAT_IDS, currency selector, compare panel |
| `itinerary` | alt | `ItineraryApp` — own UI |
| `menu` | alt | `MenuApp` — own UI |
| `visa` | alt | `VisaApp` — own UI |
| `doctranslate` | alt | `DocTranslateApp` — own UI |

`QuoteView` routes by template; "alt" templates skip the cost-view scaffolding entirely.

## Key Design Decisions

**No Firebase Auth.** Custom username/password in Firestore (`viettours/user_accounts`). Passwords plaintext (internal tool). `authStore.login()` calls `init()` to sync users before checking credentials.

**Named Firestore database.** Must use `viettours`. `getFirestore(app, 'viettours')` at `src/lib/firebase.ts:13` — there is no `(default)` DB in this Firebase project.

**Per-user persisted quote draft (gotcha).** `quoteStore` registers persist middleware with a placeholder name and overrides the storage adapter at write time to use `vte_quote_draft_{username}`. The `getItem` handler returns `null` on initial hydration; the real hydration happens in `quoteStore.init(user)` which reads `localStorage` directly. Don't "fix" this by giving persist a static name — you'll cross-leak users.

**DMC view is restricted.** `quoteStore.setView` forces `view` to `cost` or `history` whenever `template === 'dmc'`. Any new top-level view will not be reachable from DMC unless you whitelist it here.

**Single-document collections.** Most domain data lives in one Firestore doc per area (e.g., `viettours/ncc_master.suppliers[]`). 1 MB doc limit not yet a concern.

**Dual quote history:** local `HistPanel` (fast, per-user localStorage) + cloud history (versioned, cross-device, collaborative). DMC quotes are stored separately (`viettours/dmc_quote_history`, `dmc_quote_projects/{id}`).

## Firebase

```
Project ID:    viettours-cost-calculator
Database name: viettours
Location:      asia-southeast1
API Key:       AIzaSyAL-pifSBDDrbek3s2uwkeIYw5Y1GZO9Iw
Auth Domain:   viettours-cost-calculator.firebaseapp.com
```

Open rules required for these paths (apply manually in Firebase Console):

```
match /user_notifications/{username}    { allow read, write: if true; }
match /dmc_quote_projects/{quoteId}      { allow read, write: if true; }
match /notification_threads/{threadId}   { allow read, write: if true; }
```

### Firestore Document Map

| Document/Collection | Content |
|--------------------|---------|
| `viettours/master_rate_card` | Shared rate card (hotels, transport, staff, etc.) |
| `viettours/user_accounts` | All user accounts |
| `viettours/ncc_master` | Supplier list |
| `viettours/contracts_master` | All contracts |
| `viettours/quote_history` | Metadata index for regular quotes |
| `viettours/dmc_quote_history` | Metadata index for DMC quotes |
| `quote_projects/{id}` | Full state per regular quote version (max 20) |
| `dmc_quote_projects/{id}` | Full state per DMC quote version |
| `user_notifications/{username}` | Per-user notification queue |
| `notification_threads/{threadId}` | Shared comment thread for a collaboration group |

## localStorage Keys

| Key | Content |
|-----|---------|
| `vte_users` | Zustand-persisted user list (`authStore`) |
| `vte_s` (sessionStorage) | Current session user |
| `vte_quote_draft_{username}` | Per-user persisted quote draft (`quoteStore`) |
| `vte_hotels_v2_{city}` | Hotel rate cards per city |
| `vte_visa_rates` | Visa rate overrides |
| `vte_rate_{template}_{type}_{selector}` | Other rate cards |
| `vte_contracts_{tourName}` | Contracts per tour |
| `vte_q` | Local quote save history |
| `vte_payments_{tourKey}` | Payment tracking per tour |

When debugging hydration-time bugs, dump these in DevTools console first.

## Role Hierarchy

`CEO → Trưởng Phòng → Sales = Operations = Marketing → Admin → Accountant → Standard`

Defined in `src/auth/ROLES.ts` and `src/auth/PERMISSIONS.ts`.

- `Admin`: view-only on contracts and history, no create/edit/delete
- `Accountant`: view history only, no exports or rate card edits

Check with `hasPerm(user, 'permName')`.

## Deploy

GitHub Pages via `.github/workflows/deploy.yml` on push to `main`:

1. `npm ci`
2. `npm run lint` (zero-warnings)
3. `npm run typecheck`
4. `npm run build` (Vite → `dist/`)
5. `cp public/legacy.html dist/legacy.html` (preserves `/legacy.html` URL)
6. `actions/upload-pages-artifact` + `actions/deploy-pages`

Vite `base: '/tour-cost-calculator/'` — any absolute URL/asset construction must respect this. Vendor chunks split into `mui`, `firebase`, `exports` (see `vite.config.ts:manualChunks`).

## Conventions

- **UI language:** Vietnamese. Code/variable names: English. Alerts/confirms: Vietnamese, often with emoji.
- **React components:** PascalCase. State: `[state, setState]` camelCase.
- **Stores:** Zustand with `create<...>()(...)`; selectors take a slice (`s => s.draft.template`) to avoid wide re-renders. Imperative access via `useFooStore.getState()` is fine and used widely.
- **Git:** Direct push to `main`. One logical change per commit. Conventional Commits format.
- **Linting:** `npm run lint` runs ESLint with `--max-warnings 0` — CI fails on any warning. Run before pushing.
- **Co-author:** `Co-Authored-By: Claude <noreply@anthropic.com>` (use the model tag your harness recommends).
