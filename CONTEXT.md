# PROJECT CONTEXT — Viettours Tour Cost Calculator

_Last updated: 2026-05-30_

---

## 1. Project Overview

- **Company:** Viettours Incentives & Events (viettoursdev)
- **Industry:** MICE — Meetings, Incentives, Conferences, Exhibitions; Outbound/Inbound Tour Operations
- **Live URL:** https://viettoursdev.github.io/tour-cost-calculator/
- **Repo:** https://github.com/viettoursdev/tour-cost-calculator
- **Tech stack:** Single HTML file · React 18 (Babel/JSX in-browser) · Firebase Firestore (named DB: `viettours`) · GitHub Pages
- **Goal:** A full-featured internal tool for Sales/Operations to calculate tour costs, manage quotes, contracts, suppliers, customers, and synchronise all data in real-time across all team accounts via Firebase.

---

## 2. Campaign Planning Context

Not a marketing campaign — this is an **internal SaaS-style operations tool**.

- **Target users:** Viettours internal staff — Sales, Operations, Trưởng Phòng, CEO, Marketing, Accountant, Admin
- **Key value:** Replace manual Excel sheets with a cloud-synced, role-gated app that covers the full quote-to-contract lifecycle
- **Channels:** Hosted on GitHub Pages, accessed via browser (no mobile-first requirement)
- **Phases completed:**
  1. Core cost calculator (domestic + international tour)
  2. Firebase integration (rate cards, users, NCC, customers, contracts, quotes)
  3. DMC Breakdown template
  4. Notification system
  5. Role-based access control (8 roles)

---

## 3. Automation Workflows Built

### 3.1 Master Rate Card Auto-Sync
- **Trigger:** Any user with `editRateCard` permission modifies a rate card (hotel/transport/staff/etc.)
- **Steps:** `localStorage.setItem` interceptor → 2s debounce → `fbPushMasterRC()` → Firestore `viettours/master_rate_card`
- **Real-time push:** `onSnapshot` listener applies cloud changes to other users' localStorage
- **Status:** ✅ Done

### 3.2 User Account Sync
- **Trigger:** App load (initial) or `svUsers()` called (create/edit/delete account)
- **Steps:** On load → `syncUsersFromCloud()` waits for Firebase (max 5s) → pulls `viettours/user_accounts` → merges with localStorage. On save → `pushSingleUser()` → Firestore
- **Login flow:** `doLogin()` always calls `syncUsersFromCloud()` before checking credentials, so new accounts created on any device are immediately usable everywhere
- **Status:** ✅ Done

### 3.3 Contract Auto-Sync to Firestore
- **Trigger:** `svContracts(info, list)` called (any contract create/edit/delete from any tour)
- **Steps:** `localStorage.setItem` → `_fbSyncContracts(tourKey, list, info)` → merge with Firestore `viettours/contracts_master`
- **Migration:** On first open of "Hợp đồng" tab, scans localStorage for `vte_contracts_*` keys not in Firestore and uploads them
- **Status:** ✅ Done

### 3.4 Quote History Versioning
- **Trigger:** User clicks "💾 Lưu lịch sử" (header) or "Lưu" in local HistPanel
- **Steps:** Save metadata → `viettours/quote_history` · Save full state → `quote_projects/{quoteId}` (max 20 versions)
- **Collaboration:** Collaborators stored on both `quote_projects/{id}` and `viettours/quote_history` entry (for client-side visibility filter)
- **Visibility rule:** User sees only quotes they created OR are listed as collaborator
- **Status:** ✅ Done

### 3.5 DMC Quote History (Separate)
- **Trigger:** Same as above but when `template === "dmc"`
- **Firestore docs:** `viettours/dmc_quote_history` + `dmc_quote_projects/{id}`
- **Status:** ✅ Done

### 3.6 Deadline Notifications
- **Trigger:** On user login (3s delay)
- **Steps:** `checkContractDeadlines(user)` → fetches all contracts → finds pending payments due ≤7 days → sends `payment_due` notification to that user via `fbSendNotification(username, notif)` → stored in `user_notifications/{username}`
- **Status:** ✅ Done

### 3.7 Collaboration Invite Notification
- **Trigger:** User adds a collaborator to a quote in `QuoteHistoryView`
- **Steps:** After `fbUpdateCollaborators()` → `fbSendNotification(invitedUser.u, collab_invite notif)`
- **Status:** ✅ Done

---

## 4. File Structure

```
tour-cost-calculator/
├── index.html          # Entire application — ~8,000+ lines single-file React app
├── CONTEXT.md          # This file
└── (no other source files — everything is in index.html)
```

### index.html internal structure (in order):
| Lines (approx) | Content |
|----------------|---------|
| 1–14 | HTML head, CDN scripts (React, Babel, SheetJS, jsPDF, html2canvas, docx, FileSaver) |
| 15–41 | Firebase modular SDK module script (app + firestore) |
| 42–80 | Browser notification utilities (`requestBrowserNotifPermission`, `showBrowserNotif`) |
| 81–320 | CSS styles |
| 321 | `<script type="text/babel">` — main React app starts |
| 322–450 | Constants: `PERMISSIONS`, `DEFAULT_USERS`, `ldUsers`, `svUsers`, `syncUsersFromCloud` |
| 451–600 | `RATES_INIT`, `CATS`, `getCATS`, `UNITS`, `TEMPLATES` (domestic/intl/dmc), `TPL_*` |
| 601–1200 | Rate card modal components: `HotelModal`, `VisaModal`, `RateCardModal` |
| 1200–2150 | Core components: `RatesPanel`, `HistPanel`, `LineRow`, `CatBlock` |
| 2150–2200 | Export functions: `exportExcel`, `exportPDFImage`, `exportPDFVector`, `exportInvoice` |
| 2200–2400 | `InvoiceModal` |
| 2400–2700 | `SummaryView`, `DashboardView` |
| 2700–3100 | `PaymentView` |
| 3100–3200 | DMC components: `CurrencySelector`, `toOutputCurrency`, `fmtCurrency`, `DMCComparePanel` |
| 3200–3300 | `CostView` |
| 3300–3400 | `QuoteView` |
| 3400–4000 | Export functions: `exportContractPDF`, `exportContractDocx`, `exportAcceptanceCertPDF` |
| 4000–4100 | `ContractModal` |
| 4100–4200 | `UserManagementModal`, `RateCardSyncModal` |
| 4400–4650 | Contract constants: `DEFAULT_PAYMENTS`, `DEFAULT_INCLUDES`, contract storage helpers |
| 4650–5300 | `ContractModal` (full form) |
| 5300–5650 | `ContractManagerModal` |
| 5650–6100 | Quote history: `SaveQuoteModal`, `QuoteHistoryView` |
| 6100–6700 | Contract tab: `PaymentPanel`, `AcceptanceCertModal`, `ContractView` |
| 6700–6900 | Customer tab: `CustomerModal`, `CustomerView` |
| 6900–7200 | NCC tab: `NCCModal`, `NCCView` |
| 7200–7480 | `TemplateSelector`, `MainApp` component |
| 7480–7560 | `NotificationBell` component |
| 7560–7650 | `checkContractDeadlines`, `App` root component |

---

## 5. Key Decisions Made

### Firebase Named Database
- **Decision:** Use named database `viettours` (not `(default)`)
- **Why:** User created `viettours` database in Firebase Console; `(default)` never existed

### Single Document for Collections (not subcollections)
- **Decision:** Store arrays in single Firestore documents (e.g., `viettours/ncc_master.suppliers[]`)
- **Why:** Simpler for a single-HTML-file app; acceptable for scale (hundreds of records, not millions)
- **Limit:** 1MB per document — monitored but not yet an issue

### No Firebase Auth
- **Decision:** Custom username/password stored in Firestore (`viettours/user_accounts`)
- **Why:** App was originally localStorage-only; full Firebase Auth would require significant refactor
- **Tradeoff:** Passwords stored as plaintext in Firestore (internal tool, acceptable risk)

### Firestore Rules: `allow read, write: if true`
- **Decision:** Open rules on all app-used collections
- **Why:** No Firebase Auth means can't use `request.auth`; app has own permission layer
- **Collections allowed:** `viettours/{document}`, `quote_projects/{id}`, `dmc_quote_projects/{id}`, `user_notifications/{username}`

### Separate Firestore Docs for DMC vs Regular Quotes
- **Decision:** `viettours/dmc_quote_history` + `dmc_quote_projects/` (separate from regular)
- **Why:** User explicitly requested DMC history not to mix with tour history

### HistPanel (local) + Cloud History (separate)
- **Decision:** Keep local HistPanel (per-user localStorage, quick save) AND cloud history (cross-device, versioned)
- **Why:** Local is for speed; cloud is for collaboration and persistence

### Template System
- **Decision:** Three templates: `"domestic"`, `"intl"`, `"dmc"`
- **DMC:** Only shows 2 tabs (Breakdown + History), has its own CATS (no visa/insurance/gala/dmc), has currency output selector and DMC compare panel

### No Build System
- **Decision:** Everything in one HTML file, Babel transpiles JSX in-browser
- **Why:** Deployment simplicity (GitHub Pages, no CI/CD needed)
- **Tradeoff:** Large file (~800KB), slow initial compile, no tree-shaking

### Role Hierarchy
From highest to lowest permissions:
`CEO → Trưởng Phòng → Sales = Operations = Marketing → Admin → Accountant → Standard`
- `Admin`: New role — can VIEW all contracts + nghiệm thu but CANNOT create/edit/delete
- `Accountant`: Can view history but cannot export quotes or edit rate cards

---

## 6. Current Status

### Phase 2 refactor cutover (2026-06-01)
Phase 2 refactor cutover complete. App now served from Vite + React + TS build at root URL. Legacy monolith preserved at `/tour-cost-calculator/legacy.html` for ~2 weeks; only the Rate Card tab is ported in the new build, all other tabs link to legacy via the placeholder.
- Phase 2 PRs landed: PR-0.1 (scaffold), PR-0.2 (shell), PR-1.1–1.4 (types/firebase/storage/auth), PR-2.1 (Rates port), PR-2.2 (cutover).

### Last completed tasks:
1. Push Notifications system (bell icon, in-app + browser push, deadline checks)
2. DMC Breakdown history separated from regular quote history
3. `Profit Margin & Service Charge` row in DMC breakdown (% or fixed amount)
4. Payment tracking in contracts (inline editable received amount)
5. Acceptance certificate (BBNT) re-export button
6. `Admin` role (view-only contracts)
7. User account Firestore sync (login works across all devices)

### In progress:
- None currently

### Known issues / watch points:
- File size (~800KB) may cause slow initial load on poor connections
- `Notification.permission` browser push requires HTTPS (GitHub Pages ✅)
- `user_notifications` Firestore Rules must be added manually by user
- DMC `dmc_quote_projects` Firestore Rules must be added manually
- Payments in contracts default to 0 amount (user must fill in); `DEFAULT_PAYMENTS` now has `id` fields (`"dp1"`, `"dp2"`)

---

## 7. Next Steps

Ordered by priority based on recent conversations:

1. **Firestore Rules update** — User must add to Firebase Console:
   ```
   match /user_notifications/{username} { allow read, write: if true; }
   match /dmc_quote_projects/{quoteId} { allow read, write: if true; }
   ```

2. **Payment Approval flow** — "Gửi đề nghị thanh toán" button in PaymentPanel → notifies CEO/Trưởng Phòng → they can approve → notification back to sender

3. **Notification Tab** — Full-page tab to view all notification history (currently only dropdown bell)

4. **Acceptance deadline reminders** — Check contracts where `hasAcceptance === false` and tour end date is approaching

5. **Mobile responsiveness** — Current UI is desktop-first; could improve for tablet use

---

## 8. Conventions & Rules

### Naming
- Firebase functions exposed globally: `window.fb[ActionName]` (e.g., `window.fbPushNCC`, `window.fbSendNotification`)
- Firestore documents: snake_case (e.g., `master_rate_card`, `user_accounts`, `quote_history`)
- Firestore collections for per-item data: `quote_projects/{id}`, `dmc_quote_projects/{id}`, `user_notifications/{username}`
- React components: PascalCase
- State variables: camelCase with `[state, setState]` pattern

### Code style
- All JSX in `<script type="text/babel">`
- Python `str.replace()` used for large edits (file too big for direct Edit tool reliably)
- Firebase module uses `type="module"` with `import` from gstatic CDN
- Non-module globals (`requestBrowserNotifPermission`, `showBrowserNotif`) in plain `<script>` tags

### Git workflow
- Direct push to `main` branch
- GitHub Pages auto-deploys from `main:/` (root)
- Deploy lag: ~60–120 seconds after push
- Co-author: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

### Language
- UI labels: Vietnamese
- Code/variable names: English
- Comments: Mix of Vietnamese and English
- Alert/confirm messages: Vietnamese with emoji (e.g., `"✅ Đồng bộ thành công!"`)

### Permissions model
```js
const PERMISSIONS = {
  "CEO":          { manageUsers, editRateCard, exportQuote, importQuote, viewHistory, syncRateCard, manageNCC, manageCustomers, manageContracts, viewContracts },
  "Trưởng Phòng": { same as CEO minus manageUsers },
  "Sales":        { same as Trưởng Phòng },
  "Operations":   { same as Sales },
  "Marketing":    { same as Sales },
  "Admin":        { viewHistory:true, viewContracts:true, rest:false },
  "Accountant":   { viewHistory:true, rest:false },
  "Standard":     { all:false },
}
```

### Firebase Project Details
```
Project ID:    viettours-cost-calculator
Database name: viettours (named, not default)
Location:      asia-southeast1
API Key:       AIzaSyAL-pifSBDDrbek3s2uwkeIYw5Y1GZO9Iw
Auth Domain:   viettours-cost-calculator.firebaseapp.com
```

### Key localStorage keys
| Key | Content |
|-----|---------|
| `vte_users` | Array of user accounts |
| `vte_s` | Current session (sessionStorage) |
| `vte_hotels_v2_{city}` | Hotel rate cards per city |
| `vte_visa_rates` | Visa rate overrides |
| `vte_rate_{template}_{type}_{selector}` | Other rate cards |
| `vte_contracts_{tourName}` | Contracts per tour (also synced to Firestore) |
| `vte_q` | Local quote save history (per user) |
| `vte_payments_{tourKey}` | Payment tracking per tour |
