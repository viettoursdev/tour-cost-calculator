# PR-Visa (Quản lý Visa) — Design

_Date: 2026-06-09_
_Phase: Post-3 — alt-template port (3 of 4)_
_Builds on: PR-Menu (`4ebac9d`)_
_Status: Approved, ready for implementation_

---

## 1. Goal

Port the legacy "Quản lý Visa" feature (`public/legacy.html:7572–8158` plus the visa-proc exports at `7798–7932`, factories at `7573–7578`, and Firestore plumbing at `489–506`).

After this PR users can:

- **VisaCatalog** — manage a shared library of visa products. Each product has: country, type (Evisa/Visa lẻ/…), validity, location (HCM/HAN/DAD), multiple **fees** (per-pax or per-group, amount + currency), **markup** (percent or fixed), active toggle, note. Catalog also stores a 15-currency **FX rate table** used to convert all fees to VND for the live preview.
- **VisaProc** (Hồ sơ thủ tục) — a section-based dossier editor:
  - Sections of kinds: `enterprise` / `applicant` / `content` / `relative` / `custom`.
  - Each section has **editable field definitions** + **rows**.
  - **Repeatable** sections render as a table (e.g. applicant list); single sections render as a 2-col field/value grid.
  - **Versions** (max 10) saved manually as snapshots.
  - **Collaborators** (multi-select of other users) granted edit/view access.
  - Linked-quote dropdown.
- **Export to Word + PDF** for each procedure document.

**Out of scope:**
- `VisaPickerModal` integration with the Cost view (legacy at `7732–7795`). It pulls products from the catalog and inserts visa fees as line items. Re-wiring this into the ported Quote view is a follow-up.
- Auto-sync collaborator-side updates via Firestore subscription on the per-procedure doc — legacy uses index-only subscribe. Keep parity.
- Tests.

---

## 2. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Catalog doc shape | `viettours/visa_products` = `{ products: VisaProduct[], rates: Record<string,number>, updatedAt, updatedBy }` | Verbatim legacy. |
| Auto-save catalog | Direct on every product/rate mutation (no debounce) | Matches legacy `saveProducts/saveRates` pattern. Catalog is sparse; cost is low. |
| Proc doc shape | `visa_procedures/{id}` + `viettours/visa_proc_index` (metadata items, max 500) | Mirrors legacy. |
| Auto-save proc | 1.5s debounce inside `VisaProcBuilder` — same pattern as Menu | Familiar. |
| Versions | Stored inline on the doc as `versions: VisaProcVersion[]` (max 10) | Matches legacy. |
| Permission gating on tile | `hasPerm(currentUser, 'manageVisa')` | Legacy uses this same key. |
| Visibility filter on list | `createdByUsername === user.u` OR `collaborators.includes(user.u)` OR `user.role === 'CEO'` | Matches legacy 7964. |
| FX rates seed | Start from existing `RATES_INIT` constant (used by Cost view) | Avoids reseeding 15 currencies. |
| Currency list for fees | Reuse `MENU_CUR` from `src/components/menu/constants.ts` | 15 currencies match between Menu and Visa. |
| Region codes (none) | Visa products don't use region selectors | N/A. |
| Sections drag-drop | **Skip** — legacy doesn't reorder sections | Out of scope for parity. |
| Type union | Add `'visa'` to `Template`; `TEMPLATES.visa = { kind: 'alt', ... }` | Same pattern as Itinerary / Menu. |
| Routing | `QuoteView.tsx` routes to `<VisaApp onExit={abandon} />` when `template === 'visa'` | Same pattern. |
| `RATES_INIT` location | Already exported from `src/components/quote/constants.ts` | Reuse. |
| Catalog FX panel auto-save | Yes — every keystroke pushes (mirror legacy line 7667). | Catalog is shared infrequent state; OK to push often. |
| Proc CollabModal user list | Read from `useAuthStore((s) => s.users)` (already loaded). Don't subscribe again. | The user list is already synced via `authStore`. |
| Linked-quote dropdown source | `useQuoteHistoryStore.quotes` | Already subscribed. |

---

## 3. Architecture & file plan

```
src/
├── lib/
│   ├── firebase.ts                      EDIT — fb* visa products + procedures
│   └── exports/
│       ├── exportVisaProcDocx.ts        NEW
│       └── exportVisaProcPDF.ts         NEW
├── stores/
│   ├── visaProductsStore.ts             NEW
│   └── visaProcStore.ts                 NEW
├── types/
│   └── visa.ts                          NEW — VisaProduct, VisaFee, VisaProcDoc, VisaProcSection,
│                                              VisaProcField, VisaProcRow, VisaProcIndexEntry,
│                                              VisaProcVersion
└── components/
    └── visa/                            NEW DIR
        ├── constants.ts                 NEW — VISAP_TYPES, VISA_VALIDITY, VISA_LOCS,
        │                                       VISA_FEE_PRESET, PROC_KIND_ICON, factories
        ├── VisaApp.tsx                  NEW
        ├── VisaCatalog.tsx              NEW
        ├── VisaProcManager.tsx          NEW
        ├── VisaProcHome.tsx             NEW
        ├── VisaProcBuilder.tsx          NEW
        └── VisaProcCollabModal.tsx      NEW
```

Extensions:
- `src/types/quote.ts` — `Template` union extended.
- `src/components/quote/constants.ts` — add `visa` to TEMPLATES.
- `src/components/quote/TemplateSelectorModal.tsx` — remove `visa` from coming-soon, gate tile by `manageVisa`.
- `src/components/quote/QuoteView.tsx` — route to VisaApp.
- `src/components/quote/QuoteHistoryView.tsx` — add `visa: 'Visa'` to `TEMPLATE_LABEL`.

---

## 4. Types

```ts
export interface VisaFee {
  id: string;
  name: string;
  amount: number;
  cur: string;
  perPax: boolean;
}

export type VisaMarkupType = 'percent' | 'fixed';

export interface VisaProduct {
  id: string;
  country: string;
  visaType: string;     // VISAP_TYPES
  validity: string;     // VISA_VALIDITY
  location: string;     // VISA_LOCS
  fees: VisaFee[];
  markupType: VisaMarkupType;
  markupValue: number;
  markupCur: string;
  note: string;
  active: boolean;
}

export interface VisaProductsDoc {
  products: VisaProduct[];
  rates: Record<string, number>;
  updatedAt?: string;
  updatedBy?: string;
}

export type VisaProcKind = 'enterprise' | 'applicant' | 'content' | 'relative' | 'custom';

export interface VisaProcField { id: string; label: string; }
export interface VisaProcRow {
  id: string;
  values: Record<string, string>;
}
export interface VisaProcSection {
  id: string;
  kind: VisaProcKind;
  title: string;
  repeatable: boolean;
  fieldDefs: VisaProcField[];
  rows: VisaProcRow[];
}

export interface VisaProcVersion {
  versionNo: number;
  savedAt: string;
  savedBy: string;
  sections: VisaProcSection[];
}

export interface VisaProcDoc {
  id: string;
  code: string;
  title: string;
  country: string;
  linkedQuoteId: string | null;
  linkedQuoteName: string;
  createdByUsername: string;
  createdByName: string;
  collaborators: string[];   // usernames
  sections: VisaProcSection[];
  versions: VisaProcVersion[];
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface VisaProcIndexEntry {
  id: string;
  code: string;
  title: string;
  country: string;
  linkedQuoteName: string;
  collaborators: string[];
  createdByUsername: string;
  createdByName: string;
  createdAt?: string;
  updatedAt: string;
  updatedBy: string;
}
```

---

## 5. Firestore signatures

```ts
// Products + FX rates
export function fbSubscribeVisaProducts(cb: (data: VisaProductsDoc | null) => void): Unsubscribe;
export async function fbSaveVisaProducts(data: { products: VisaProduct[]; rates: Record<string, number> }, savedBy: string): Promise<void>;

// Procedures
export async function fbSaveVisaProc(d: VisaProcDoc, savedBy: string): Promise<void>;
export async function fbGetVisaProc(id: string): Promise<VisaProcDoc | null>;
export async function fbDeleteVisaProc(id: string): Promise<void>;
export function fbSubscribeVisaProcs(cb: (list: VisaProcIndexEntry[]) => void): Unsubscribe;
```

Doc map:
- `viettours/visa_products` — single doc with `{ products, rates, ... }`
- `viettours/visa_proc_index` — `{ items: VisaProcIndexEntry[] }`, max 500
- `visa_procedures/{id}` — full VisaProcDoc

---

## 6. Manual verification

- **V1:** TemplateSelector tile "Quản lý Visa" visible to users with `manageVisa` perm.
- **V2:** Click → VisaCatalog tab loads.
- **V3:** Click "+ Thêm sản phẩm visa" → new card. Fill country/type/validity/location, add fees (per-pax + per-group), set markup percent. Live preview shows unit + per-group converted via FX.
- **V4:** Click 💱 Tỷ giá → expand FX panel, edit USD rate → unit price recomputes.
- **V5:** Toggle a product to inactive → opacity dims. Refresh → state persists.
- **V6:** Switch to "🗂️ Hồ sơ thủ tục" tab. List loads. Visibility filter applies.
- **V7:** "+ Tạo hồ sơ thủ tục" → fresh `VisaProcBuilder` with the 4 seed sections (enterprise / applicant / content / relative). Auto-save kicks in 1.5s after edits.
- **V8:** Edit applicant rows (repeatable) — add 3 rows of holders. Edit non-repeatable enterprise fields. Add a custom section. Add a column to a section. Delete a row.
- **V9:** 💾 Lưu phiên bản → versions modal shows v1.
- **V10:** 👥 Cộng tác (owner only) → pick a collaborator. As that other user, hồ sơ now appears in their list with "Cộng tác" badge.
- **V11:** 📄 Word and 📑 PDF export the dossier with header + section blocks + tables.
- **V12:** Delete a hồ sơ → Firestore doc + index entry removed (owner only — collaborator's hồ sơ shows no delete button).
