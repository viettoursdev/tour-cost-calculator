# Rate-card pickers — Design

_Date: 2026-06-09_
_Phase: Audit follow-up (Chunk 2 critical items + dateUtils)_
_Builds on: VisaPicker integration (`d67c3c5`)_

---

## 1. Goal

Restore the legacy "rate card → Cost view" picker workflow. In legacy, clicking a row inside `HotelModal` / `VisaModal` / `RateCardModal` inserted a fully-formed line item into the active quote. The Vite ports kept these modals as editors (used from RatesPanel) but lost the `onPick` callback that drove the picker side.

Additionally extract `fmtDate` / `calcEndDate` into a shared `src/lib/dateUtils.ts`.

**Out of scope (deferred audit items, separate PRs if needed):**
- Hotel intl info banner
- Dynamic rate-card category filtering per template (RatesPanel-side)
- RateCardModal edit/view-mode toggle (sidestepped — picker mode is always read-only)
- RateCardModal location selector (Vite data model already flat per `type`)
- VisaModal per-fee picker re-integration — the canonical visa picker is now `VisaPickerModal` (catalog). The legacy `rates.visaRates` rate-card path is preserved for editing only.

---

## 2. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Modal shape | Extend existing modals with optional `onPick` prop (user-confirmed) | One source of truth per rate-card modal; no editor/picker drift. |
| Picker mode behavior | When `onPick` is set, rows become clickable with a "Chọn" affordance. Always read-only (no row-level price editing). | Avoids accidental edits when the user just wants to pick. |
| Visa picker source | `VisaPickerModal` (catalog) only — drop the legacy `rates.visaRates` picker path | The catalog is richer (fees, markup, FX) and supersedes the rate-card shortcut. |
| Hotel pick payload | `{ name: 'Khách sạn ' + row.name + ' · ' + city, cur: 'VND', price: row.priceVND, unit: '/phòng/đêm', qtyMode: 'custom', customQty: Math.ceil(pax/2), note: row.note }` | Matches legacy at `public/legacy.html:1973`. |
| RateCardModal pick payload | `{ name: row.name, cur: 'VND', price: (row.min + row.max) / 2 if both exist else row.price, unit: row.unit, qtyMode: 'custom', customQty: 1 }` | Matches legacy avg-of-range pattern (line 2358-2400). |
| Bulk add | VisaModal had a "Trọn gói" bulk-add in legacy. With Visa picker delegated to the catalog, we skip the bulk-add. | Catalog already supports combined fees. |
| `dateUtils.ts` | Move `fmtDate` + `calcEndDate` from `exportInvoicePDF.ts` to a new shared module | Audit DRY finding. |

---

## 3. File plan

```
src/
├── lib/
│   └── dateUtils.ts                       NEW
├── components/
│   ├── rates/
│   │   ├── HotelModal.tsx                 EDIT — add onPick + pax props, per-row "Chọn" button
│   │   ├── RateCardModal.tsx              EDIT — add onPick prop, per-row "Chọn" button, picker-mode read-only
│   │   └── VisaModal.tsx                  (no change — legacy picker path retired)
│   └── quote/
│       └── CostView.tsx                   EDIT — picker state + handlers + wire onPickFromLibrary on hotel/transport/sight/meeting/teambuild/gala/logistics/staff/insurance
└── lib/exports/
    └── exportInvoicePDF.ts                EDIT — drop inline fmtDate/calcEndDate, import from dateUtils
```

---

## 4. CatBlock wiring (rules)

| CategoryId | Picker modal | Notes |
|---|---|---|
| `hotel` | `HotelModal` with `onPick` | Per-hotel pick |
| `transport` | `RateCardModal` (`type='transport'`) | |
| `sight` | `RateCardModal` (`type='sight'`) | |
| `meeting` | `RateCardModal` (`type='meeting'`) | Domestic only |
| `teambuild` | `RateCardModal` (`type='teambuild'`) | Domestic only |
| `gala` | `RateCardModal` (`type='gala'`) | |
| `logistics` | `RateCardModal` (`type='logistics'`) | |
| `staff` | `RateCardModal` (`type='staff'`) | |
| `insurance` | `RateCardModal` (`type='insurance'`) | |
| `visa` | already wired to `VisaPickerModal` (catalog) | Unchanged |
| `flight` | none | No legacy rate card |
| `meal` | none | No legacy rate card |
| `dmc` | none | Manual input only |
| `service_fee` | none | DMC-only, manual |

`CatBlock` already accepts `onPickFromLibrary` (added in `d67c3c5`). No code change needed there.

---

## 5. Plan (tasks)

1. **`dateUtils.ts`** — extract `fmtDate` + `calcEndDate`. Update `exportInvoicePDF.ts` import.
2. **`HotelModal.tsx`** — add `onPick` + `pax` props; render "Chọn" buttons when `onPick` set.
3. **`RateCardModal.tsx`** — add `onPick` prop; render "Chọn" buttons when set; picker-mode rows read-only.
4. **`CostView.tsx`** — picker state, wire `onPickFromLibrary` for each rate-card-backed category.
5. **Build + lint + typecheck** sanity sweep + push.

Each task verifies via `npm run typecheck && npm run lint`. One commit per task.
