# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Single-file internal tool for Viettours sales/operations — tour cost calculation, quotes, contracts, suppliers, customers.

- **Live:** https://viettoursdev.github.io/tour-cost-calculator/
- **Stack:** One `index.html` (~8000+ lines) · React 18 (Babel in-browser, no build step) · Firebase Firestore (named DB: `viettours`) · GitHub Pages
- **No build system.** There is no `npm`, no `package.json`, no bundler. Deploy = `git push origin main`. GitHub Pages auto-deploys from `main:/` root with a ~60–120s lag.

## Development

Open `index.html` in a browser directly, or serve via any static server:

```bash
python3 -m http.server 8080
# or
npx serve .
```

Babel compiles JSX in-browser on page load. No compilation step needed.

To test Firebase changes, use the live URL — Firestore rules are open (`allow read, write: if true`).

## Architecture

Everything lives in `index.html`. Internal structure by approximate line range:

| Lines | Content |
|-------|---------|
| 1–14 | HTML head · CDN scripts (React, Babel, SheetJS, jsPDF, html2canvas, docx, FileSaver) |
| 15–41 | Firebase modular SDK (`type="module"`) — app + Firestore init |
| 42–80 | Browser notification utilities in plain `<script>` (globals: `requestBrowserNotifPermission`, `showBrowserNotif`) |
| 81–320 | CSS |
| 321+ | `<script type="text/babel">` — entire React app |
| ~322–600 | Auth/user: `PERMISSIONS`, `DEFAULT_USERS`, `ldUsers`, `svUsers`, `syncUsersFromCloud` |
| ~601–1200 | Rate card modals: `HotelModal`, `VisaModal`, `RateCardModal` |
| ~1200–2150 | Core calc: `RatesPanel`, `HistPanel`, `LineRow`, `CatBlock` |
| ~2150–2700 | Export: `exportExcel`, `exportPDFImage`, `exportPDFVector`, `exportInvoice`, `InvoiceModal`, `SummaryView`, `DashboardView` |
| ~2700–3100 | `PaymentView` |
| ~3100–3400 | DMC: `CurrencySelector`, `toOutputCurrency`, `fmtCurrency`, `DMCComparePanel`, `CostView`, `QuoteView` |
| ~3400–5650 | Contracts: export functions, `ContractModal`, `ContractManagerModal` |
| ~5650–6100 | Quote history: `SaveQuoteModal`, `QuoteHistoryView` |
| ~6100–6700 | Contract tab: `PaymentPanel`, `AcceptanceCertModal`, `ContractView` |
| ~6700–7200 | `CustomerView`, `NCCView` |
| ~7200–7650 | `TemplateSelector`, `MainApp`, `NotificationBell`, `checkContractDeadlines`, `App` root |

## Key Design Decisions

**No Firebase Auth.** Custom username/password in Firestore (`viettours/user_accounts`). Passwords stored as plaintext (internal tool, accepted risk). Login calls `syncUsersFromCloud()` before checking credentials.

**Single-document collections.** Arrays stored in one Firestore doc (e.g., `viettours/ncc_master.suppliers[]`). Simpler for a single-file app; 1MB doc limit not yet a concern.

**Named Firestore database.** Must use `viettours` — there is no `(default)` database in this Firebase project.

**Firebase globals exposed as `window.fb[ActionName]`.** The module script cannot share scope with the Babel script, so Firebase functions are attached to `window` (e.g., `window.fbPushNCC`, `window.fbSendNotification`).

**Three templates:** `"domestic"`, `"intl"`, `"dmc"`. DMC only shows 2 tabs (Breakdown + History), has its own category set, currency output selector, and compare panel. Quote history for DMC is stored separately (`viettours/dmc_quote_history`, `dmc_quote_projects/{id}`).

**Dual history:** Local `HistPanel` (fast, localStorage per user) + cloud history (versioned, cross-device, collaborative).

## Firebase Project

```
Project ID:    viettours-cost-calculator
Database name: viettours
Location:      asia-southeast1
API Key:       AIzaSyAL-pifSBDDrbek3s2uwkeIYw5Y1GZO9Iw
Auth Domain:   viettours-cost-calculator.firebaseapp.com
```

Firestore rules needed (must be applied manually in Firebase Console):
```
match /user_notifications/{username} { allow read, write: if true; }
match /dmc_quote_projects/{quoteId} { allow read, write: if true; }
```

## Firestore Document Map

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

## Key localStorage Keys

| Key | Content |
|-----|---------|
| `vte_users` | User accounts array |
| `vte_s` (sessionStorage) | Current session |
| `vte_hotels_v2_{city}` | Hotel rate cards per city |
| `vte_visa_rates` | Visa rate overrides |
| `vte_rate_{template}_{type}_{selector}` | Other rate cards |
| `vte_contracts_{tourName}` | Contracts per tour |
| `vte_q` | Local quote save history |
| `vte_payments_{tourKey}` | Payment tracking per tour |

## Role Hierarchy

`CEO → Trưởng Phòng → Sales = Operations = Marketing → Admin → Accountant → Standard`

- `Admin`: view-only on contracts and history, no create/edit/delete
- `Accountant`: view history only, no exports or rate card edits

## Conventions

- **UI language:** Vietnamese. Code/variable names: English. Alerts/confirms: Vietnamese with emoji.
- **React components:** PascalCase. State: `[state, setState]` camelCase.
- **Git:** Direct push to `main`. One logical change per commit. Conventional Commits format.
- **Large file edits:** The file exceeds 1MB. Use `offset`/`limit` on Read, and prefer targeted `Edit` over full rewrites. Python `str.replace()` can be used for programmatic large edits if needed.
- **Co-author:** `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
