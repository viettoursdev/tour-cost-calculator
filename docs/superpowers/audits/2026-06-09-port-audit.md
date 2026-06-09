# Port Audit — Legacy vs Vite

_Date: 2026-06-09_
_Method: 6 parallel Explore agents per the design at `docs/superpowers/specs/2026-06-09-port-audit-design.md`._

This audit compares `public/legacy.html` (the original monolith) against the Vite + TS app under `src/`. Findings are grouped by severity. Confirmed-parity items are listed as counts at the bottom.

**Reader's note:** Each finding cites a legacy line and (when ported) a Vite location. Suggested fixes are starting points, not commitments. Several MUI redesign tradeoffs are deliberate per the refactor spec (`docs/superpowers/specs/2026-05-31-vite-react-refactor-design.md`) — those are tagged `cosmetic` rather than reported as regressions. Two agent findings were filtered as false-positives after manual verification (noted at the end).

---

## Summary

| Chunk | CRITICAL | FUNCTIONAL | UX | COSMETIC | CONFIRMED |
|---|---:|---:|---:|---:|---:|
| 1. Auth + login + admin | 0 | 1 | 4 | 4 | 14 groups |
| 2. Rates + rate-card modals | **3** | **5** | 4 | 6 | 7 |
| 3. Quote + cloud history + Payment + DMC | 0 | 0 | 0 | 0 | 14 groups |
| 4. Contract + Customer + NCC + Notifications | 0 | 2 | 3 | 0 | 2 |
| 5. Exports (Excel/PDF/DOCX) | 0 | 1 | 4 | 5 | 11 |
| 6. Alt-templates (Itin/Menu/Visa/DocTr) | 0 | 0 | 0 | 1 | 24 |
| **Total** | **3** | **9** | **15** | **16** | **72** |

**TL;DR — three real gaps to triage:**

1. **HotelModal / VisaModal / RateCardModal have no `onPick` callback** (Chunk 2). Legacy used these rate-card modals as item-pickers from the Cost view: clicking a row inserted the item into the active quote with name/price/unit auto-filled. Vite ports them as rate-card *editors* (used inside the Rates tab) but lost the picker side of the role.
2. **VisaModal lost its per-cost-type "➕" picker buttons and the "Trọn gói" bulk-add** (Chunk 2). Adjacent to #1; surfaces when re-wiring.
3. **Logo and Vietnamese diacritics dropped from PDF/Excel exports** (Chunk 5). Accepted tradeoff per refactor spec §2 (Helvetica + ASCII-strip is the established convention) — but the team should sign off that this is permanent. Affects: Invoice, Contract, Acceptance Cert, Payment Request PDFs + Excel quote header.

Everything else is minor UX / cosmetic drift, or already-correct ports the agents flagged for review.

---

## CRITICAL findings

### Chunk 2 — Rates + rate-card modals

- **HotelModal / VisaModal / RateCardModal lost the `onPick` integration with Cost view** (legacy lines 1740, 1973, 2038, 2221) ↔ `src/components/rates/{HotelModal,VisaModal,RateCardModal}.tsx`
  - Legacy: clicking a hotel option / rate row / visa fee in these modals called `onPick(item)` which inserted a fully-formed line item (name, price, unit, cur, qtyMode) into the active cost block via `pickFromRate`.
  - Vite: modals are pure editors used from the Rates tab. They have no `onPick` prop and the Cost view has no `setRateModal` plumbing.
  - Severity: **critical** — feature parity break for the legacy "Chọn từ rate card" workflow.
  - Suggested fix: extend the three modals with `open`/`onClose`/`onPick`, add a `setRateModal` state in `CostView`, and add per-category 📋 buttons in `CatBlock` (we already did this for `visa` via `VisaPickerModal` in commit `d67c3c5`). The same shape extends naturally to hotel + transport + others.

- **VisaModal lost per-cost-type "➕" picker buttons** (legacy lines 2077–2100) ↔ `src/components/rates/VisaModal.tsx`
  - Legacy: each cost type row had an "➕" button that inserted a single fee item; a "Trọn gói" bulk row let users multi-select and add one combined line.
  - Vite: only rate edits, no add-to-quote action.
  - Severity: **critical** — same workflow as above.
  - Suggested fix: superseded by `VisaPickerModal` for the *catalog* path, but legacy's per-fee picker via the *rate card* path is still missing. Decide whether to retire it or restore alongside the catalog picker.

- **VisaModal "Trọn gói" bulk-add feature** (legacy lines 2088–2100) ↔ `src/components/rates/VisaModal.tsx`
  - Legacy: header "Chọn tất cả / Bỏ chọn" toggle + checkbox per cost type + total preview + single combined "Chèn trọn gói" insert.
  - Vite: no bulk selection or insertion.
  - Severity: critical — UX shortcut for a common task.
  - Suggested fix: depends on the decision about #1 above.

---

## FUNCTIONAL findings

### Chunk 2 — Rates

- **`template` parameter not threaded into modals** (legacy lines 1740, 2221) ↔ `src/components/rates/{HotelModal,RateCardModal}.tsx`
  - Legacy: modals received `template` and filtered visible rate-card categories (`domestic`/`intl`/`dmc`).
  - Vite: modals ignore template entirely.
  - Severity: functional. Surfaces only when the modals are wired as pickers from a template-specific cost view.
  - Suggested fix: add `template?: Template` prop; filter `RATE_CATEGORIES`/`CATS` accordingly.

- **`canEdit` parameter dropped** (legacy line 1740) ↔ `src/components/rates/HotelModal.tsx`
  - Legacy: read-only mode for users without `editRateCard` perm.
  - Vite: always editable.
  - Severity: functional — bypasses permissions when used as a picker.
  - Suggested fix: add `canEdit?: boolean` and gate price-editing UI.

- **RateCardModal location selector** (legacy lines 2222–2351) ↔ `src/components/rates/RateCardModal.tsx`
  - Legacy: a row of city/country buttons drove rate-card scoping (e.g., `TRANSPORT_CITIES`, `INTL_COUNTRIES`).
  - Vite: shows a single flat rate card with no location filter.
  - Severity: functional. Practically: transport/sight rates can't be filtered by city.
  - Suggested fix: introduce a location selector — even a simple `Select` of unique city/country values from the rate-card payload would close the gap.

- **RateCardModal min/max picker mode** (legacy lines 2358–2400) ↔ `src/components/rates/RateCardModal.tsx`
  - Legacy: non-edit mode showed each rate entry as a min/max range; clicking inserted an item priced at `(min+max)/2`.
  - Vite: only a generic row editor; no avg-of-range pick.
  - Severity: functional. Closely tied to the `onPick` workflow.
  - Suggested fix: when rates have `min`/`max` columns, render a "pick at avg" affordance.

- **`fmtDate` / `calcEndDate` not exposed module-level** (legacy lines 1695–1701)
  - Legacy: top-level helpers reused across the app.
  - Vite: only defined inline inside `exportInvoicePDF.ts`. Other components reinvent the wheel.
  - Severity: functional (low) — minor DRY issue.
  - Suggested fix: extract to `src/lib/dateUtils.ts` and reuse.

### Chunk 4 — Contracts + Notifications

- **Contract `dueDate` format normalization** (legacy `checkContractDeadlines` line ~10572) ↔ `src/lib/notifications.ts:35-36`
  - Legacy: stores `dueDate` as a Date-parseable string and parses directly.
  - Vite: requires `"DD/MM/YYYY"` → `"YYYY-MM-DD"` conversion before parsing. Two-app coexistence on the same `contracts_master` doc means data written by one app may be misparsed by the other.
  - Severity: functional. Could cause deadline-notification false negatives if a contract is written by legacy with one format and read by Vite expecting another.
  - Suggested fix: pick one canonical format (ISO 8601 preferred) and document it. Migrate any legacy DD/MM/YYYY entries on read.

- **ContractModal payment-mode toggle (% ↔ ₫)** (legacy lines 5683–5694, 5880) ↔ `src/components/contract/ContractModal.tsx:39-51`
  - Legacy: each payment row had a `%` / `₫` toggle for users to enter fixed-amount installments instead of percentage.
  - Vite: percent-only.
  - Severity: functional. Some contracts have fixed deposit amounts not aligned to a clean %.
  - Suggested fix: add a small toggle per row; store `mode: 'percent' | 'fixed'` on the payment and recompute the missing field.

### Chunk 5 — Exports

- **`exportPDFImage` (html2canvas screenshot)** (legacy line 3218)
  - Legacy: alternative quote-PDF path that screenshots the rendered DOM via html2canvas and embeds as JPEG.
  - Vite: only the vector PDF (`exportPDFQuote`) is ported.
  - Severity: functional (low). Rarely useful — the vector path is sharper and supports text selection — but it was a legacy option for users who wanted a literal screenshot.
  - Suggested fix: skip unless someone complains. Document the loss.

---

## UX findings

### Chunk 1 — Auth + login + admin

- **Login error doesn't auto-clear** (legacy line 2450) ↔ `src/components/shell/LoginScreen.tsx`
  - Legacy: error message clears after 3 s.
  - Vite: persists until the user changes the form.
  - Severity: ux. Minor — the persistent error is arguably clearer.
  - Suggested fix: add a `useEffect` with `setTimeout(setError, 3000)` if matching legacy is preferred.

- **Login input placeholders** (legacy lines 2463, 2468)
  - Legacy: "ceo / sale1 / manager1..." + "••••••".
  - Vite: generic "Tài khoản" / "Mật khẩu".
  - Severity: ux.
  - Suggested fix: copy legacy placeholders if the demo-credentials hint is desired.

- **Demo-accounts info box on login** (legacy lines 2474–2480)
  - Legacy: shows a legend "ceo / ceo123, manager1 / mgr123..." below the form.
  - Vite: omitted.
  - Severity: ux. Useful for non-technical users / demo deployments.
  - Suggested fix: add an Alert below the form (`severity="info"`) listing the seed credentials.

- **Login screen logo + subtitle** (legacy lines 2454–2458)
  - Legacy: VTE_LOGO image + "Bảng tính chi phí tour" subtitle.
  - Vite: text-only "Đăng nhập — Viettours".
  - Severity: ux.
  - Suggested fix: import the legacy logo (base64) into LoginScreen, or use a brand SVG.

### Chunk 2 — Rates

- **Hotel modal int'l info banner** (legacy lines 1837–1854)
  - Legacy: when `template === 'intl'`, shows an info message recommending DMC or manual entry.
  - Vite: no banner.
  - Severity: ux.
  - Suggested fix: conditionally render an `Alert` when `template === 'intl'`.

- **Dynamic rate-card categories per template** (legacy line 8711–8716)
  - Legacy: rate-card dropdown hides categories irrelevant to the active template.
  - Vite: `RatesPanel` shows the full static list.
  - Severity: ux.
  - Suggested fix: thread `template` from the active draft into `RatesPanel`; filter the categories list.

- **RateCardModal edit/view-mode toggle** (legacy line 2322)
  - Legacy: explicit "✏️ Sửa" / "✓ Xong" button; price fields are read-only by default.
  - Vite: every field is always editable.
  - Severity: ux. Prevents accidental rate edits.
  - Suggested fix: add an `editMode` state; render TextField vs read-only Typography accordingly.

- **RateCardModal subtitle / context line** (legacy line 2319)
  - Legacy: "✏️ Chế độ chỉnh sửa – Click số để sửa" or "Click dòng để thêm".
  - Vite: shows the raw localStorage key (debug residue).
  - Severity: ux.
  - Suggested fix: replace the storage-key caption with the legacy contextual hints.

### Chunk 4 — Notifications

- **NotificationBell missing "approval_request" toast** (legacy line ~10503 `TOAST_CONFIG`) ↔ `src/components/notifications/NotificationBell.tsx`
  - Legacy: in addition to in-popover items, fires a toast with icon "💰" and title "Yêu cầu duyệt" on receive.
  - Vite: only the popover badge updates; no toast.
  - Severity: ux. Acceptable if browser push permission is granted (which CONTEXT.md notes is configured), but useful in foreground tabs.
  - Suggested fix: add a lightweight in-app toast (e.g., MUI `Snackbar`) on `payment_approval` subscription delivery.

- **AcceptanceCertModal — verify title parity** (legacy ~6148) ↔ `src/components/contract/AcceptanceCertModal.tsx:1`
  - Vite has a standalone modal with title "📋 Biên bản nghiệm thu". Legacy didn't have a dedicated modal — the BBNT was inline.
  - Severity: ux (low). Probably an improvement in Vite.
  - Suggested fix: none unless user feedback objects.

- **NotificationBell: fewer notification type colors** (legacy ~10503-10508 vs `NotificationBell.tsx:13-17`)
  - Legacy: 8 toast types (info/warning/error/etc).
  - Vite: 3 colors (payment_due, payment_approval, collab_invite) — the only types actively used.
  - Severity: ux. Future-proofing concern only.
  - Suggested fix: none until more types are introduced.

### Chunk 5 — Exports

- **VTE_LOGO dropped from Invoice + Payment Request PDFs** (legacy lines 3457, 4976)
  - Legacy: embeds the brand logo via `pdf.addImage(VTE_LOGO, ...)`.
  - Vite: text-only "VIETTOURS INCENTIVES & EVENTS" header.
  - Severity: ux. Customer-visible branding regression on professional documents.
  - Suggested fix: inline the logo as a base64 PNG in a new `src/lib/exports/vteLogo.ts` and use it across Invoice + PaymentRequest + Contract + Acceptance Cert + Itinerary + Menu + Visa Proc DOCX exports (all 7 currently text-only).

- **VTE_LOGO dropped from Excel quote header** (legacy line 2776)
  - Legacy: embeds image in A1–B3.
  - Vite: text only.
  - Severity: ux. Same branding consideration as above.
  - Suggested fix: use SheetJS image API to embed the logo.

- **Contract "Bên A" address has stripped diacritics** (legacy line 5994) ↔ `src/lib/exports/exportContractPDF.ts:76`
  - Legacy: full Vietnamese "Phường Tân Định, TP. Hồ Chí Minh".
  - Vite: "Phuong Tan Dinh, TP. Ho Chi Minh".
  - Severity: ux. Legally-sensitive for printed contracts.
  - Suggested fix: tied to the broader font decision below (CRITICAL).

- **Acceptance cert address has stripped diacritics** (legacy line 9285) ↔ `src/lib/exports/exportAcceptanceCert.ts:50`
  - Same as above for the BBNT.
  - Suggested fix: same.

---

## COSMETIC findings

These are tagged `cosmetic` per the user's "everything" severity-bar request. Most are deliberate MUI redesign choices accepted by the refactor spec.

### Chunk 1 — Auth

- **Login heading font size:** legacy 22 / 800 vs Vite `h6` ~20 / 600.
- **UserManagement form layout:** grid 1fr 1fr vs row Stack (visual parity, slightly different breakpoint behavior).
- **TemplateSelectorModal decorative orbs** (legacy lines 7491–7493): legacy had two gradient blob backdrops in the header; Vite Dialog omits them.
- **TemplateSelectorModal grid card gap & minmax:** 190px/20px gap vs 220px/16px gap.

### Chunk 2 — Rates

- HotelModal/VisaModal/RateCardModal dialog title gradients and emoji icons not ported.
- Hotel option-row card styling (white card + border) replaced by generic MUI Table.
- Modal close button styling (legacy custom ✕ button vs MUI default).
- RateCardModal empty-state copy: "khu vực" vs "hạng mục".
- Excel header font: legacy "Aptos" vs Vite "Calibri".

### Chunk 5 — Exports

- **Invoice number format:** legacy `VTE-YYYYMMDD-Hmm` (1-3 digit hour); Vite always `VTE-YYYYMMDD-HHmm` (2-digit hour). **Vite is arguably the improvement** — consistent 4-digit time stamp. Recommend keeping Vite's form.
- **Hardcoded company VN/EN names** in Invoice PDF use ASCII-stripped strings (`CONG TY TNHH DU LICH...`). Tied to the font decision.
- **Payment-request header line spacing:** minor.
- **Contract legal-basis lines:** ASCII-stripped. Tied to font.
- **Excel header font:** Aptos → Calibri.

### Chunk 6 — Alt-templates

- **VTE_LOGO dropped from DOCX exports** (Itinerary, Menu, Visa Proc): text-only header. Same root issue as Chunk 5.

---

## Global note: font + logo strategy

Spans Chunks 5 + 6. The legacy app used `loadVNFont()` to register the DejaVu TTF inside jsPDF so Vietnamese diacritics render correctly in PDFs, falling back to Helvetica when the font wasn't bundled. The Vite ports drop the DejaVu pipeline entirely and ASCII-strip Vietnamese text everywhere ("Phường" → "Phuong"). All embedded brand logos (VTE_LOGO, ~144 KB base64 PNG) were also removed from PDF and DOCX exports to avoid bloating the bundle.

This is an **accepted tradeoff per the refactor spec** (`docs/superpowers/specs/2026-05-31-vite-react-refactor-design.md` §2). Re-enabling proper Vietnamese in PDFs is a separate effort — it requires either bundling DejaVu via Vite's `?url` import or shipping it on a CDN — and re-adding the logo is a single `src/lib/exports/vteLogo.ts` away. Decision is the user's, but if customer-visible documents (Invoice, Contract, BBNT, Payment Request) must keep correct diacritics, this should be its own follow-up PR.

---

## Verified parity (CONFIRMED)

These items were inspected and confirmed identical (or equivalent within the accepted MUI redesign tradeoff). Counts per chunk:

- **Chunk 1 (14 groups):** Zustand persist for users; Firebase config; full PERMISSIONS matrix (8 roles × 11 keys); USER_COLORS palette; DEFAULT_USERS seed; `hasPerm()` logic; RateCardSyncModal 3-tab structure (cloud / export / import); user-creation validation; user-delete guards (self-delete + last-CEO); reset-defaults flow; NotificationBell integration; logout placement; TemplateSelectorModal gate pattern; export/import JSON `_meta` shape; Enter-to-submit on login.

- **Chunk 2 (7):** RATES_INIT values (10 currencies); CATS definitions (14 cats × all flags); `mkItem` factory defaults; `getCATS` filter logic; TPL_DOMESTIC seed; TPL_INTL seed; TPL_DMC seed.

- **Chunk 3 (14 groups, no findings of any severity):** CostView totals + rounding (Math.ceil per-pax, svcBasis-before-margin); SummaryView breakdown chain; QuoteView print template; PaymentView 1s debounce + cloud sync + tracked/custom items + installments; PaymentRequestModal 2-stage approval + intendedApprover preservation + PDF export; InvoiceModal customer/lang/terms editor with localStorage; DMCComparePanel group sizes [20,25,30,35,40] + margin math + rate-guarded display; CurrencySelector DMC_CURRENCIES + flags; QuoteHistoryView visibility filter (created OR collab); fbSaveQuote/State factory's 500-quote + 20-version caps + quoteCode generation; paymentStore debounce; paymentApprovalStore subscription; calc helpers (`fmtVND`, `fmtCurrency`, `toOutputCurrency`, `fmtOutput` rate guards); paymentUtils helpers.

- **Chunk 4 (2):** `DEFAULT_INCLUDES` (8 items identical); `DEFAULT_EXCLUDES` (8 items identical). Also worth noting: PaymentPanel inline-editable received-amount; AcceptanceCert re-export; checkContractDeadlines 7-day threshold; collab-invite notification on quote save (all in the matched code path).

- **Chunk 5 (11):** `exportExcelQuote` (consolidates legacy `exportExcelPro` + `exportExcel`); `exportPDFQuote` (from `exportPDFVector`); `exportInvoicePDF`; `exportContractPDF`; `exportContractDocx`; `exportAcceptanceCertPDF`; `exportPaymentRequestPDF`; `exportItineraryDocx`; `exportMenuDocx`; `exportMenuPDF`; `exportVisaProcDocx`; `exportVisaProcPDF`; `exportTranslationDocx`; `exportTranslationPDF`; `numberToVietWords`.

- **Chunk 6 (24):** newActivity / newSegment / newDay (itinerary); ITIN_DEFAULT_INC/EXC; TRANSPORT_PRESETS; `parseFlights`; ITIN_TYPE/CONTINENT/COUNTRY; `generateItinCode`; SortableList DOM-revert pattern; `reorder`; getAIWorker/setAIWorker/callAIWorker; MENU_CUR; newRestMenu/newMenuMeal/newMenuDay; newRestaurant; StarRating; VISAP_TYPES / VISA_VALIDITY / VISA_LOCS / VISA_FEE_PRESET; newVisaFee / newVisaProduct; newProcField/Row/Section; `generateVisaProcCode`; newVisaProcDoc seed structure; PROC_KIND_ICON; fileToB64 + extractDocx + extractPdf + extractImage; `chunkText` paragraph chunking; `exportTranslationDocx` + `exportTranslationPDF`; VisaPickerModal picker (PR `d67c3c5`); Firestore plumbing for all alt-templates.

---

## Agent false-positives (filtered)

For transparency:

1. **Chunk 6 reported `generateMenuCode` missing the "TD-" prefix.** Verified false — `src/components/menu/constants.ts:84` returns `\`TD-${t}-${c}-${ct}-…\``. The agent confused `generateMenuCode` (TD-) with `generateItinCode` (no prefix), which is also correct in Vite.
2. **Chunk 1 reported several "logic drift" items** (login sync timing, RateCardSyncModal push wrapping, reload delay, import validation) as `functional`, then marked them equivalent in the suggested fix. Re-tagged here as **CONFIRMED** rather than drift.

---

## Recommended next steps

In rough order of customer-impact:

1. **Restore the rate-card → cost-view picker workflow** (3 critical items in Chunk 2). One PR covering HotelModal + VisaModal + RateCardModal with `onPick` props + a `CatBlock` 📋 button per category type. Follows the pattern established by `VisaPickerModal` already in commit `d67c3c5`.
2. **Decide the font + logo question** for PDFs (Chunk 5 UX cluster). If we want customer-visible diacritics + logo on Invoice / Contract / BBNT / Payment Request, do this as one cross-cutting PR (~half day): re-introduce a `loadVNFont()` equivalent + a `vteLogo.ts` reused across all exports.
3. **Wire contract payment-mode toggle** (Chunk 4). Modest single-file change to `ContractModal.tsx`.
4. **Login screen polish** (Chunk 1 UX cluster): logo + subtitle + demo legend + placeholder hints. ~30 min cosmetic PR.
5. **Everything else** is low-priority cosmetic drift and accepted MUI tradeoffs — leave parked unless someone complains.

If you want any of these promoted to an implementation plan, say which and I'll run the brainstorming → spec → plan → execute flow on it.
