# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Internal tool for Viettours sales/operations — tour cost calculation, quotes, contracts, suppliers, customers, itineraries, menus, visa & doc translation.

- **Live:** https://viettoursdev.github.io/tour-cost-calculator/
- **Stack:** Vite 5 · React 18 · TypeScript 5 (strict) · MUI v6 + MUI X · Zustand 4 · Supabase (Postgres 17 + Supabase Auth) · GitHub Pages
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

Tests: `npm test` (Vitest unit), `npm run test:integration` (against the local Supabase stack), `npx supabase test db` (pgTAP).

**Editor diagnostics in this repo emit false `Cannot find module '@/...'` path-alias errors** — trust `npm run typecheck` (exit 0) as ground truth, not the inline diagnostics.

## Architecture

```
src/
  main.tsx              # React root, mounts <App/>
  App.tsx               # ThemeProvider + <MainApp/>
  theme.ts              # MUI theme + LEGACY palette tokens
  global.css
  auth/                 # PERMISSIONS, ROLES, DEFAULT_USERS
  lib/                  # supabase.ts, currency, dateUtils, notifications,
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

**Supabase Auth — magic link in production, Email+Password panel in DEV builds only for testing.** Magic-link (`signInWithOtp`) is restricted to `@viettours.com.vn`. `authStore.init()` completes any in-flight magic link and subscribes via `onAuthStateChange`; the verified email is matched (case-insensitive) against `profiles.email` to resolve `currentUser`. Setup steps live in `docs/supabase-setup.md`.

**48h inactivity sign-out (magic-link only).** Magic-link sessions auto-sign-out after 48 hours of no user interaction. `src/auth/sessionTimeout.ts` owns the per-user `vte_session_last_active_{username}` timestamp; `startActivityTracker` listens to `pointerdown`/`keydown` (throttled to one write per 30s) and runs a 60-second interval check plus an immediate check on `focus`/`visibilitychange`. `authStore.expireSession()` signs the user out and shows "Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại." DEV password sign-ins are intentionally exempt — they stay signed in indefinitely for testing convenience.

**Per-user persisted quote draft (gotcha).** `quoteStore` registers persist middleware with a placeholder name and overrides the storage adapter at write time to use `vte_quote_draft_{username}`. The `getItem` handler returns `null` on initial hydration; the real hydration happens in `quoteStore.init(user)` which reads `localStorage` directly. Don't "fix" this by giving persist a static name — you'll cross-leak users.

**DMC view is restricted.** `quoteStore.setView` forces `view` to `cost` or `history` whenever `template === 'dmc'`. Any new top-level view will not be reachable from DMC unless you whitelist it here.

**Dual quote history:** local `HistPanel` (fast, per-user localStorage) + cloud history (versioned, cross-device, collaborative). DMC quotes share the unified `quotes` / `quote_versions` tables, distinguished by `template = 'dmc'`.

**AI features via Cloudflare Worker.** `src/lib/aiWorker.ts:callAIWorker(path, body)` proxies to `cloudflare-worker/viettours-ai-worker.js` (holds `ANTHROPIC_API_KEY` + R2). Endpoints: `/ai` (tour program, Haiku), `/ocr` (structure-preserving Markdown, Sonnet), `/translate` (visa-grade VI→EN, Sonnet), `/chat` (assistant tool-use, Sonnet, optional `web_search`). The worker auto-deploys via `worker-deploy.yml` when `cloudflare-worker/**` or `wrangler.toml` changes on `main` (see CI/CD below). It also has a `scheduled` handler (`runMorningDigest`) for the morning digest, on the `wrangler.toml [triggers]` cron.

**Trợ lý ảo (AI assistant).** `src/components/assistant/AssistantPanel.tsx` (header "🤖 Trợ lý") runs a client-side tool-use loop (`src/lib/assistant/agent.ts`) against permission-filtered data (`assistant/data.ts` → reuses `visibleQuotes`/`canViewAll`/`visibleVisaProjects`). Tools (`assistant/tools.ts`) only READ; `propose_itinerary`/`propose_quote` stage a draft the user opens 1-click (`assistant/draftBuilders.ts`). Unified search index extracted to `src/lib/searchIndex.ts` (shared with `GlobalSearch`).

## Supabase

```
Project ref:  zkzrvctqwnhzklvsoahk
Database:     Postgres 17
Region:       ap-southeast-1 (Singapore)
```

Supabase client config (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) is read from env vars — see `.env.example`. Local dev uses `.env` (gitignored); CI uses repo secrets injected in `.github/workflows/deploy.yml`. Access control is enforced by Row Level Security (RLS) on every table; the helper `public.is_viettours_user()` checks that the authenticated email ends with `@viettours.com.vn`. Anonymous and external-domain clients are denied across the board.

**R2 `pg_dump` backup.** `.github/workflows/backup.yml` runs every UTC hour: dumps the production DB and uploads to Cloudflare R2 with a 14-day lifecycle policy. Worst-case data-loss window: ~1 hour.

**Local dev.** Run `npx supabase start` (Docker required) for a local Postgres stack with all migrations applied. After adding a migration, run `npx supabase db reset` to apply it to the running stack before `npm run test:integration`. pgTAP runs via `npx supabase test db` (fresh shadow DB — auto-applies all migrations). Privileged remote CLI calls need `SUPABASE_ACCESS_TOKEN="$(cat ~/.supabase_token)"` (interactive `supabase login` fails non-TTY). See `docs/supabase-setup.md` for the full workflow.

**Shared single-row tables** (rate-card meta, `guide_schedule`, `email_links`): `one_row boolean primary key default true check (one_row)`, read via `.eq('one_row', true).maybeSingle()`, written via `upsert({ one_row: true, … }, { onConflict: 'one_row' })`. Register any non-`id` primary key in `tests/supabase/_setup.ts` `PK_COL` or `truncate()` won't clear the table in integration tests.

**`todos` is row-per-task** (migration `0036`, was single-row in `0032`). Each task is one row keyed by `id` (text); nested fields (`checklist`, `responses`, `remind_at`, `remind_lead`, `link`) are JSONB, queryable fields (`status`, `priority`, `assignees text[]`, `due_date`, `tags text[]`) are columns. Gateway: `sbSubscribeTodos` / `sbUpsertTodo` / `sbUpsertTodos` / `sbDeleteTodo` in `src/lib/supabase.ts`. `todoStore` writes per-row with optimistic rollback. Won quotes auto-spawn a standard ops task set (`todoStore.spawnQuoteTasks`, `auto = 'quote_won'`, idempotent). Full workspace at view `todo` (`src/components/todo/TodoView.tsx`: list + Kanban + dashboard, filter/search); compact summary stays in `TodoPanel` on Home.

### Postgres Table Map

| Table | Content |
|-------|---------|
| `profiles` | User accounts (mirrors Supabase Auth users; provisioned by DB trigger) |
| `rate_card` | Shared rate card — JSONB blob (hotels, transport, staff, etc.) |
| `fx_rates` | Tỷ giá ĐỒNG BỘ (→ VND). Chỉ CEO ghi (nút "Đồng bộ tỷ giá" → `pushGlobalRates`); chỉ seed cho báo giá MỚI. Mỗi báo giá giữ `draft.rates` riêng — bản đồng bộ KHÔNG ghi đè báo giá cũ. |
| `suppliers` | Supplier list (NCC master) |
| `ncc_products` | Catalog sản phẩm NCC: mỗi sản phẩm tham chiếu supplier + bảng nhiều dòng giá + file R2. Tab "📦 Sản phẩm NCC" (view `nccProducts`, gate `manageNCC`). |
| `customers` | Customer list |
| `contracts` | All contracts |
| `quotes` | Quote metadata index (regular + DMC). `tour_profile_id`/`tour_code` link mỗi báo giá vào một hồ sơ tour. |
| `quote_versions` | Full state per quote version (max 20); shredded children in `quote_items`, `quote_groups`, `quote_collab_payments`, `quote_flights`, `quote_workflow_steps`, `quote_passengers`. DMC quotes share this table, distinguished by `template = 'dmc'`. |
| `tour_profiles` | **Hồ sơ tour** — aggregate root MỎNG làm trung tâm liên kết (1 hồ sơ : N báo giá). Mã `code` `NĐ/NN.DD.MM.YY.NN` sinh atomic qua RPC `next_tour_code` (advisory lock theo ngày). Sở hữu `created_by_username` + `collaborators`/`followers` (jsonb) + `primary_quote_id` (báo giá chính → suy giai đoạn/tổng qua `dealStage`). KHÔNG lưu giai đoạn/tổng. Các thực thể (`contracts`/`visa_projects`/`itineraries`/`menus`/`quotes`) có cột `tour_profile_id` (FK ON DELETE SET NULL, migration 0045) — ĐỌC KÉP: ưu tiên `tour_profile_id`, fallback suy qua `linked_quote_id`→báo giá→hồ sơ. **RLS đọc** scoped qua hàm `tour_profile_can_view` (0047): creator/collab/follower/BGĐ-CEO/Trưởng-Phó Phòng cùng phòng, kiểu KHÔNG-khoá-cứng. Gateway `sb*TourProfile`, store `tourProfileStore`, view `cockpit` = `TourProfilesView`. |
| `itineraries` | Itinerary records |
| `menus` / `restaurants` | Menu and restaurant records |
| `visa_projects` | Visa application projects |
| `tour_payments` / `payment_approvals` | Payment tracking and approval records |
| `notifications` / `notification_threads` | Per-user notification queue + shared comment threads |
| `guide_schedule` | Lịch đi tour HDV (single shared row) |
| `email_links` | Outbound email link tracking |
| `public_quotes` | Báo giá chia sẻ công khai cho khách (token-based, anon-readable) |
| `public_visa_lists` | Link KHÁCH xem danh sách & tình trạng xin visa (token-based). Nhân viên gửi yêu cầu (`status='pending'`); **chỉ Trưởng phòng Visa + CEO/BGĐ** duyệt (RPC `approve_visa_list`/`reject_visa_list`, gate `can_approve_visa_share`) → anon đọc qua `get_public_visa_list` chỉ khi `approved`. 1 dự án : 1 link (`project_id` unique). Route `?visa=<token>` → `PublicVisaListView`; tạo/duyệt ở `VisaShareListDialog`. |
| `app_config` | Application configuration (e.g. CEO bootstrap, feature flags) |
| `chat_messages` | AI assistant conversation history |
| `hr_employees` | Hồ sơ nhân sự in-house (master, KHÔNG đồng nhất với `profiles`); `manager_legacy_id` tự tham chiếu → org chart. Tab "👥 Nhân sự" (view `hr`, gate `viewHR`/`manageHR`). |
| `hr_documents` | Giấy tờ nhân viên (HĐLĐ/bằng cấp/chứng chỉ), `expires_at` để nhắc hết hạn 90/30 ngày; cascade theo `hr_employees`. |
| `hr_guides` | Pool HDV cộng tác viên (freelance, không đăng nhập); thẻ HDV `guide_card_expires` nhắc hạn, `languages`/`regions` để lọc xếp tour, `rating` + `status` (active/paused/blacklist). View `hrguides` ("HDV cộng tác viên", gate `manageNCC`, nhóm Vận hành). |
| `hr_evaluations` | Đánh giá/KPI/lộ trình theo kỳ (`period`) cho 1 nhân viên; `competencies`/`kpis` jsonb, `overall_score`, `promotion`. Tab "Đánh giá" trong HRView (gate `viewHR`/`manageHR`). |
| `hr_job_postings` / `hr_candidates` | ATS tuyển dụng: tin tuyển dụng + ứng viên (Kanban `stage`, `interview_notes` jsonb). "Nhận việc" tạo `hr_employees` + ghi `converted_employee_id`. View `recruit` ("Tuyển dụng", gate `viewHR`/`manageHR`). |
| `hr_leaves` | Nghỉ phép: đơn theo nhân viên (`type`, khoảng ngày, `days`, `status` pending/approved/rejected/cancelled, người duyệt). Tab "Nghỉ phép" trong HRView; duyệt bởi `isApprover` (CEO/BGĐ/Trưởng Phòng). KHÔNG chấm công giờ. |

**Per-quote draft fields (no new table).** Một số tính năng lưu thẳng trong `quoteStore.draft` nên tự lưu/khôi phục theo báo giá & từng bản lịch sử (round-trip qua `applyImport`/`importJSON`): `status` (QuoteStatus), `flights` (QuoteFlight[] — tab ✈️ Chuyến bay, AI parse text/ảnh qua `/chat`), `workflow` (WorkflowStep[] — tab 🗂️ Quy trình vận hành: Kanban/List/Checklist/Gantt, 13 bước mặc định chỉnh được), `tourProfileId`/`tourCode` (hồ sơ tour của báo giá — auto-tạo/gắn ở `saveCloud`, nạp lại từ index entry ở `loadCloud`). Thêm field optional + setter mẫu `setInclusions`; KHÔNG đụng dữ liệu cũ.

## localStorage Keys

| Key | Content |
|-----|---------|
| `vte_users` | Zustand-persisted user list (`authStore`) |
| `vte_pending_signin_email` | Email a magic link was sent to (`authStore`, cleared on completion) |
| `vte_remembered_email` | Last successfully-used email, used to prefill the login screen (`rememberedEmail`). Never cleared on sign-out. |
| `vte_session_method_{username}` | `'link'` or `'password'` — which sign-in method started this session (`authStore` / `sessionTimeout`) |
| `vte_session_last_active_{username}` | Epoch ms of the user's last interaction. Drives the 48h inactivity sign-out for `link` sessions only. |
| Supabase Auth localStorage | Session token (managed by `@supabase/supabase-js`, persists across browser restarts) |
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

**`department` + RLS (migration 0046/0047).** `profiles.department` được đồng bộ từ app qua `sbPushUsers`/`sbPullUsers`/`profileToUser` (TRƯỚC 0046 department KHÔNG được lưu xuống DB → quy tắc "thấy theo phòng" trong `recordAccess` không chạy thật). Role enum DB gồm cả `'Phó Phòng'`. RLS đọc `tour_profiles` siết server-side qua hàm `public.tour_profile_can_view(created_by, collaborators, followers)` (single source of truth cho cả policy lẫn pgTAP). **Lưu ý vận hành:** sau khi áp 0046, admin phải vào Quản lý người dùng → Lưu để populate `department`/`role` xuống `profiles`. **pgTAP RLS:** KHÔNG test row-filtering qua `SET ROLE authenticated` (pg_prove chạy superuser → không kích hoạt lọc RLS); test GỌI THẲNG hàm predicate với `set_config('request.jwt.claims', …)`.

### Shared-data sync + view scope

Shared areas (`SharedArea` in `src/auth/ROLES.ts`): contracts, menu, itinerary,
rateCard, ncc, customers. `ROLE_RANK` gives seniority (CEO 8 … Standard 0).

- **Sync** (continuous Supabase Realtime subscription, wired in `MainApp.tsx`): everyone
  EXCEPT `NO_SYNC_ROLES` = Marketing, Admin, Accountant (`syncsSharedData(role)`).
- **View/manage full list** (`canViewAll(role, area)` — min rank): contracts →
  Ban Giám Đốc+, ncc/menu/itinerary → Operations+, customers → Sales+, rateCard →
  everyone synced. Below the threshold a synced user sees/edits only items whose
  `createdBy` matches their own name. Applied in NCCView, CustomerView,
  ContractView, MenuHome, ItineraryHome.

## CI/CD

Five GitHub Actions workflows. Node 24 pinned across all via `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`.

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `ci.yml` | PR → `main` | lint + unit tests + typecheck + build (PR gate — same checks as deploy, catches errors before merge) |
| `deploy.yml` | push `main` | lint → test → typecheck → build → GitHub Pages. `cp public/legacy.html dist/legacy.html` preserves `/legacy.html`. |
| `migrate.yml` | push `main` (paths: `supabase/migrations/**`) | `supabase db push` to production. Gated by `production-db` GitHub Environment — configure "Required reviewers" or migrations apply automatically without approval. |
| `worker-deploy.yml` | push `main` (paths: `cloudflare-worker/**`, `wrangler.toml`) | Deploys Cloudflare AI worker via Wrangler. Passes `--keep-vars` to preserve dashboard-set vars and `--var SUPABASE_PROJECT_REF:...` to set auth config. Requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` repo secrets. `ANTHROPIC_API_KEY` is a Cloudflare-side secret — not managed here. |
| `supabase-ci.yml` | push/PR touching `supabase/**` | `supabase start` + `supabase test db` (pgTAP). Separate from unit tests (`npm test`). |

Vite `base: '/tour-cost-calculator/'` — any absolute URL/asset construction must respect this. MUI is split into its own vendor chunk; export libs (jspdf/docx/xlsx/etc.) use dynamic imports and are loaded on demand (see `vite.config.ts:manualChunks`).

**Pushing to `origin` and `gh workflow run` require the `viettoursdev` gh account** (the default `vitahoang` lacks org write/admin → 403). Switch with `gh auth switch --user viettoursdev` (push with a credential-helper override — see the project memory for the exact command), then switch back.

## Conventions

- **UI language:** Vietnamese. Code/variable names: English. Alerts/confirms: Vietnamese, often with emoji.
- **React components:** PascalCase. State: `[state, setState]` camelCase.
- **Stores:** Zustand with `create<...>()(...)`; selectors take a slice (`s => s.draft.template`) to avoid wide re-renders. Imperative access via `useFooStore.getState()` is fine and used widely.
- **Git:** Direct push to `main`. One logical change per commit. Conventional Commits format.
- **Linting:** `npm run lint` runs ESLint with `--max-warnings 0` — CI fails on any warning. Run before pushing.
- **Co-author:** `Co-Authored-By: Claude <noreply@anthropic.com>` (use the model tag your harness recommends).
