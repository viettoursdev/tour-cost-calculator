# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Internal tool for Viettours sales/operations — tour cost calculation, quotes, contracts, suppliers, customers, itineraries, menus, visa & doc translation.

- **Live:** https://viettoursdev.github.io/tour-cost-calculator/
- **Stack:** Vite 5 · React 18 · TypeScript 5 (strict) · MUI v6 + MUI X · Zustand 4 · Firebase 10 (Firestore, default DB) · GitHub Pages
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

**Firebase Auth — magic link in production, Email+Password panel in DEV builds only for testing.** `sendSignInLinkToEmail` restricted to `@viettours.com.vn`. `authStore.init()` completes any in-flight magic link and subscribes via `onIdTokenChanged`; the verified email is matched (case-insensitive) against `User.email` in `viettours/user_accounts` to resolve `currentUser`. Legacy plaintext `User.p` is unused and slated for Phase 4 cleanup. Console setup steps live in `docs/firebase-setup.md`; project switch workflow in `docs/firebase-migration.md`.

**48h inactivity sign-out (magic-link only).** Magic-link sessions auto-sign-out after 48 hours of no user interaction. `src/auth/sessionTimeout.ts` owns the per-user `vte_session_last_active_{username}` timestamp; `startActivityTracker` listens to `pointerdown`/`keydown` (throttled to one write per 30s) and runs a 60-second interval check plus an immediate check on `focus`/`visibilitychange`. `authStore.expireSession()` signs the user out and shows "Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại." DEV password sign-ins are intentionally exempt — they stay signed in indefinitely for testing convenience.

**Default Firestore database.** The current project `tour-cost-calculator-v2` uses the default (unnamed) database — `getFirestore(app)` at `src/lib/firebase.ts`. The string `'viettours'` still appears throughout `src/lib/firebase.ts` as a *collection* name within that database, not as a database name.

**Per-user persisted quote draft (gotcha).** `quoteStore` registers persist middleware with a placeholder name and overrides the storage adapter at write time to use `vte_quote_draft_{username}`. The `getItem` handler returns `null` on initial hydration; the real hydration happens in `quoteStore.init(user)` which reads `localStorage` directly. Don't "fix" this by giving persist a static name — you'll cross-leak users.

**DMC view is restricted.** `quoteStore.setView` forces `view` to `cost` or `history` whenever `template === 'dmc'`. Any new top-level view will not be reachable from DMC unless you whitelist it here.

**Single-document collections.** Most domain data lives in one Firestore doc per area (e.g., `viettours/ncc_master.suppliers[]`). 1 MB doc limit not yet a concern.

**Dual quote history:** local `HistPanel` (fast, per-user localStorage) + cloud history (versioned, cross-device, collaborative). DMC quotes are stored separately (`viettours/dmc_quote_history`, `dmc_quote_projects/{id}`).

**AI features via Cloudflare Worker.** `src/lib/aiWorker.ts:callAIWorker(path, body)` proxies to `cloudflare-worker/viettours-ai-worker.js` (holds `ANTHROPIC_API_KEY` + R2). Endpoints: `/ai` (tour program, Haiku), `/ocr` (structure-preserving Markdown, Sonnet), `/translate` (visa-grade VI→EN, Sonnet), `/chat` (assistant tool-use, Sonnet, optional `web_search`). **The worker is NOT auto-deployed by CI — redeploy manually** after editing it.

**Trợ lý ảo (AI assistant).** `src/components/assistant/AssistantPanel.tsx` (header "🤖 Trợ lý") runs a client-side tool-use loop (`src/lib/assistant/agent.ts`) against permission-filtered data (`assistant/data.ts` → reuses `visibleQuotes`/`canViewAll`/`visibleVisaProjects`). Tools (`assistant/tools.ts`) only READ; `propose_itinerary`/`propose_quote` stage a draft the user opens 1-click (`assistant/draftBuilders.ts`). Unified search index extracted to `src/lib/searchIndex.ts` (shared with `GlobalSearch`).

## Firebase

```
Project ID:    tour-cost-calculator-v2
Database name: (default)
Location:      asia-southeast1
Auth Domain:   tour-cost-calculator-v2.firebaseapp.com
```

Web SDK config (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`) is read from `VITE_FIREBASE_*` env vars — see `.env.example`. Local dev uses `.env` (gitignored); CI uses repo secrets injected in `.github/workflows/deploy.yml`. The values are public (shipped in the browser bundle); access control is enforced by Firestore Rules + Auth domain allowlist.

**Project history (2026-06-15 → 06-16).** One prior Firebase project sits retired: `viettours-cost-calculator` (named DB `viettours`, retired in the first migration). The second prior project `tour-cost-calculator-4336c` (default DB, browser API key suspended) was thought lost mid-migration when its owner Google account was banned, but the account was later recovered. Its historical Firestore data was imported into `tour-cost-calculator-v2` on 2026-06-16 — quotes, DMC quotes, customers, NCC, FX rates, visa products/projects, payment approvals, user_accounts (16 documents and 5 collection docs total). `tour-cost-calculator-4336c` is now repurposed as the **live backup destination** for the hourly mirror — its browser API key remains suspended (it is not served to clients).

**Hourly mirror + artifact backup.** `.github/workflows/backup.yml` runs every UTC hour with two safety nets: (1) it imports the production export into `tour-cost-calculator-4336c` so the backup project's Firestore lags production by at most ~1 hour, and (2) it uploads `firestore-dump.json` as a workflow artifact with 30-day retention for point-in-time recovery. Secrets: `FIREBASE_BACKUP_SRC_SA_JSON` (production project SA) and `FIREBASE_BACKUP_DEST_SA_JSON` (backup project SA). To restore from the mirror: repoint `VITE_FIREBASE_*` to the backup project (the suspension would need to be lifted first, or use a fresh project plus a one-off `firestore-import.mjs` from the latest artifact). Worst-case data-loss window: ~1 hour. Cost: ~720 read+write cycles/month, negligible.

Firestore rules live in `firestore.rules` (root). Deploy with `npx firebase-tools deploy --only firestore:rules`. Every collection requires `request.auth != null` plus a `@viettours.com.vn` email — anonymous and external-domain clients are denied across the board.

### Firestore Document Map

| Document/Collection | Content |
|--------------------|---------|
| `viettours/master_rate_card` | Shared rate card (hotels, transport, staff, etc.) |
| `viettours/fx_rates` | Tỷ giá ĐỒNG BỘ (→ VND). Chỉ CEO ghi (nút "Đồng bộ tỷ giá" → `pushGlobalRates`); chỉ seed cho báo giá MỚI. Mỗi báo giá giữ `draft.rates` riêng (lưu trong từng bản lịch sử) — bản đồng bộ KHÔNG ghi đè báo giá cũ. DMC linked mirror tỷ giá báo giá khi load. |
| `viettours/ncc_products` | Catalog sản phẩm NCC (`nccProductsStore`): mỗi sản phẩm tham chiếu NCC master + bảng nhiều dòng giá + file R2. Tab "📦 Sản phẩm NCC" (view `nccProducts`, gate `manageNCC`); nút "Thanh toán" thêm `CustomCostItem` + supplier vào `paymentStore` của tour hiện tại. |

**Per-quote draft fields (no new collection).** Một số tính năng lưu thẳng trong `quoteStore.draft` nên tự lưu/khôi phục theo báo giá & từng bản lịch sử (round-trip qua `applyImport`/`importJSON`): `status` (QuoteStatus), `flights` (QuoteFlight[] — tab ✈️ Chuyến bay, AI parse text/ảnh qua `/chat`), `workflow` (WorkflowStep[] — tab 🗂️ Quy trình vận hành: Kanban/List/Checklist/Gantt, 13 bước mặc định chỉnh được). Thêm field optional + setter mẫu `setInclusions`; KHÔNG đụng dữ liệu cũ.
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
| `vte_pending_signin_email` | Email a magic link was sent to (`authStore`, cleared on completion) |
| `vte_remembered_email` | Last successfully-used email, used to prefill the login screen (`rememberedEmail`). Never cleared on sign-out. |
| `vte_session_method_{username}` | `'link'` or `'password'` — which sign-in method started this session (`authStore` / `sessionTimeout`) |
| `vte_session_last_active_{username}` | Epoch ms of the user's last interaction. Drives the 48h inactivity sign-out for `link` sessions only. |
| Firebase Auth IndexedDB | Session token (managed by `firebase/auth`, persists across browser restarts) |
| `vte_quote_draft_{username}` | Per-user persisted quote draft (`quoteStore`) |
| `vte_hotels_v2_{city}` | Hotel rate cards per city |
| `vte_visa_rates` | Visa rate overrides |
| `vte_rate_{template}_{type}_{selector}` | Other rate cards |
| `vte_contracts_{tourName}` | Contracts per tour |
| `vte_q` | Local quote save history |
| `vte_payments_{tourKey}` | Payment tracking per tour |

When debugging hydration-time bugs, dump these in DevTools console first.

## Role Hierarchy

`CEO → Ban Giám Đốc → Trưởng Phòng → Sales = Operations = Marketing → Admin → Accountant → Standard`

Defined in `src/auth/ROLES.ts` and `src/auth/PERMISSIONS.ts`.

- `Ban Giám Đốc`: full permissions like CEO (incl. `manageUsers`); sits just below CEO. Also a payment approver.
- `Admin`: view-only on contracts and history, no create/edit/delete
- `Accountant`: view history only, no exports or rate card edits

Check with `hasPerm(user, 'permName')`. Payment-approver roles: `APPROVER_ROLES` / `isApprover()` in `src/auth/ROLES.ts` (CEO, Ban Giám Đốc, Trưởng Phòng).

### Shared-data sync + view scope

Shared areas (`SharedArea` in `src/auth/ROLES.ts`): contracts, menu, itinerary,
rateCard, ncc, customers. `ROLE_RANK` gives seniority (CEO 8 … Standard 0).

- **Sync** (continuous Firestore subscription, wired in `MainApp.tsx`): everyone
  EXCEPT `NO_SYNC_ROLES` = Marketing, Admin, Accountant (`syncsSharedData(role)`).
- **View/manage full list** (`canViewAll(role, area)` — min rank): contracts →
  Ban Giám Đốc+, ncc/menu/itinerary → Operations+, customers → Sales+, rateCard →
  everyone synced. Below the threshold a synced user sees/edits only items whose
  `createdBy` matches their own name. Applied in NCCView, CustomerView,
  ContractView, MenuHome, ItineraryHome.

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
