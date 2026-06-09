# PR-Menu (Thư viện thực đơn) — Design

_Date: 2026-06-09_
_Phase: Post-3 — alt-template port (2 of 4)_
_Builds on: PR-Itinerary (`f9652d7`)_
_Status: Approved, ready for implementation_

---

## 1. Goal

Port the legacy "Thư viện thực đơn" feature (`public/legacy.html:7239–7569` plus exports at `7086–7236` and Firestore plumbing at `470–487`) into the Vite app, replacing the legacy deep-link with a real template tile.

After this PR users can:

- See a list (`MenuHome`) of saved menus with search + delete + open + new + a "🏪 Nhà hàng" entry-point.
- Manage a Restaurant library (`RestaurantLibrary`) — each restaurant has name/location, rating + review, website, menu link, contact, and multiple per-restaurant "set" menus (dishes + price + currency + rating + review).
- Build/edit a Menu (`MenuBuilder`):
  - Info: code (type/continent/country/seq), destination, days, linked itinerary, linked quote.
  - Day-by-day schedule with **drag-and-drop reordering** (reuses `SortableList`).
  - Each day has multiple meals; each meal: meal-type, restaurant picker, restaurant-menu picker (one-click pull from library), and a 2-column "Đề xuất / Điều chỉnh" panel (dishes + price + currency for each side).
  - **Auto-save** every 1.5s.
- **Export to Word** (`exportMenuDocx`) and **Export to PDF** (`exportMenuPDF`).

**Out of scope:**
- AI features (none in legacy menu).
- Tests.

---

## 2. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Region codes | **Reuse `ITIN_TYPE`, `ITIN_CONTINENT`, `ITIN_COUNTRY`** from `src/components/itinerary/itinCode.ts` | Identical lists. Re-export so the import path stays meaningful from Menu. |
| Drag-drop | Reuse `SortableList` from `src/components/itinerary/SortableList.tsx` | Same UX; sharing keeps consistency. |
| State | Two new stores: `menuStore` (list + crud) + `restaurantStore` (list + save) | Restaurants are shared across many menu drafts; modeling them separately is the legacy mental model. |
| Auto-save | Inside `MenuBuilder` via `useRef<NodeJS.Timeout>` + `useEffect` deps on `[it]` with 1.5s debounce — calls `menuStore.save(it, savedBy)`. | Mirrors legacy 7430-7435 exactly. |
| Save retry / error UI | Silent — same as legacy. Errors surface only via the explicit "💾 Lưu" button. | Don't over-engineer; matches legacy. |
| Type union extension | Add `'menu'` to `Template`. `TEMPLATES.menu = { kind: 'alt', ... }`. | Same pattern as Itinerary. |
| Routing | `QuoteView.tsx` — when `template === 'menu'`, render `<MenuApp onExit={abandon} />`. | Same pattern as Itinerary. |
| Linked-quote dropdown | Reuse `useQuoteHistoryStore().quotes`. | Already subscribed. |
| Linked-itinerary dropdown | Reuse `useItineraryStore().list`. | Already subscribed (since Itinerary init wires in MainApp). |
| Restaurant picker | Plain MUI `Select`; on pick, autofill meal's `restaurantId`, `restaurantName`, `city`. | Same as legacy. |
| Restaurant-menu picker | Plain MUI `Select` populated from the chosen restaurant's `menus[]`; on pick, autofill the meal's `suggestedDishes`, `suggestedPrice`, `suggestedCur` AND mirror to `adjusted*` (matches legacy). | Mirrors legacy 7452-7457. |
| MENU_CUR (15 currencies) | New `MENU_CUR` constant in `src/components/menu/constants.ts`. | Pure data port. |
| `StarRating` component | New `src/components/menu/StarRating.tsx`. | 5-star clickable widget. Reused in both `RestaurantLibrary` and `MenuBuilder` (info badge). |
| Permission | None — legacy uses `perm: 'manageMenu'` on the template tile (line 1663). Apply `hasPerm(currentUser, 'manageMenu')` to gate the tile in TemplateSelectorModal. | Reuse the existing permission. |
| Firestore docs | `viettours/restaurant_list`, `viettours/menu_index`, `tour_menus/{id}`. Mirror legacy. | Two-app coexistence. |
| Firestore signatures | `fbSubscribeRestaurants`, `fbSaveRestaurants`, `fbSaveMenu`, `fbGetMenu`, `fbDeleteMenu`, `fbSubscribeMenus` in `src/lib/firebase.ts`. | Mechanical port. |
| Exports | Port both `exportMenuDocx` and `exportMenuPDF`. PDF uses Helvetica (matches existing convention) and skips the gradient-fill effect (gradient is decorative; preserves the layout). | Bundle hit acceptable. |

---

## 3. Architecture & file plan

```
src/
├── lib/
│   ├── firebase.ts                          EDIT — fb* menus + restaurants
│   └── exports/
│       ├── exportMenuDocx.ts                NEW
│       └── exportMenuPDF.ts                 NEW
├── stores/
│   ├── menuStore.ts                         NEW
│   └── restaurantStore.ts                   NEW
├── types/
│   └── menu.ts                              NEW — Restaurant, RestaurantMenu, Menu, MenuDay, MenuMeal, MenuIndexEntry
└── components/
    └── menu/                                NEW DIR
        ├── constants.ts                     NEW — MENU_CUR, factories, generateMenuCode, MEAL_TYPES
        ├── StarRating.tsx                   NEW
        ├── MenuApp.tsx                      NEW
        ├── MenuHome.tsx                     NEW
        ├── RestaurantLibrary.tsx            NEW
        └── MenuBuilder.tsx                  NEW
```

Extensions:
- `src/types/quote.ts` — extend `Template` with `'menu'`.
- `src/components/quote/constants.ts` — add `menu` to `TEMPLATES`.
- `src/components/quote/TemplateSelectorModal.tsx` — remove `menu` from `COMING_SOON_TILES`. Gate the tile by `hasPerm(currentUser, 'manageMenu')`.
- `src/components/quote/QuoteView.tsx` — route to `<MenuApp />` when `template === 'menu'`.
- `src/components/quote/QuoteHistoryView.tsx` — add `menu: 'Thực đơn'` to `TEMPLATE_LABEL`.

---

## 4. Types — `src/types/menu.ts`

```ts
export interface RestaurantMenu {
  id: string;
  name: string;
  dishes: string;       // newline-separated
  price: number;
  cur: string;          // MENU_CUR
  rating: number;       // 0-5
  review: string;
}

export interface Restaurant {
  id: string;
  name: string;
  continent: string;
  country: string;
  city: string;
  website?: string;
  menuLink?: string;
  contact?: string;
  note?: string;
  rating: number;
  review: string;
  menus: RestaurantMenu[];
}

export interface MenuMeal {
  id: string;
  mealType: string;
  restaurantId: string;
  restaurantName: string;
  city: string;
  restMenuId?: string;
  suggestedDishes: string;
  suggestedPrice: number;
  suggestedCur: string;
  adjustedDishes: string;
  adjustedPrice: number;
  adjustedCur: string;
  cur: string;
  note: string;
}

export interface MenuDay {
  id: string;
  dayNum: number;
  date: string;
  city: string;
  meals: MenuMeal[];
}

import type { ItineraryType } from './itinerary';

export interface Menu {
  id: string;
  code?: string;
  type: ItineraryType;
  continent: string;
  country: string;
  seq: number;
  title: string;
  destination: string;
  days: number;
  linkedItineraryId: string | null;
  linkedItineraryName: string;
  linkedQuoteId: string | null;
  linkedQuoteName: string;
  schedule: MenuDay[];
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface MenuIndexEntry {
  id: string;
  code: string;
  title: string;
  destination: string;
  days: number;
  linkedItineraryName: string;
  linkedQuoteName: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt: string;
  updatedBy: string;
}
```

---

## 5. Firestore signatures

```ts
export function fbSubscribeRestaurants(cb: (list: Restaurant[]) => void): Unsubscribe;
export async function fbSaveRestaurants(list: Restaurant[], savedBy: string): Promise<void>;

export async function fbSaveMenu(m: Menu, savedBy: string): Promise<void>;
export async function fbGetMenu(id: string): Promise<Menu | null>;
export async function fbDeleteMenu(id: string): Promise<void>;
export function fbSubscribeMenus(cb: (list: MenuIndexEntry[]) => void): Unsubscribe;
```

Doc map:
- `viettours/restaurant_list` — `{ restaurants[], updatedAt, updatedBy }`
- `viettours/menu_index` — `{ items[] }` (max 500)
- `tour_menus/{id}` — full menu

---

## 6. Manual verification

- **V1:** TemplateSelector tile "Thư viện thực đơn" visible for users with `manageMenu` perm.
- **V2:** Click → `MenuHome` loads from cloud; "🏪 Nhà hàng" button opens `RestaurantLibrary`.
- **V3:** In RestaurantLibrary: add a restaurant, fill name/city, set rating, add 2 set-menus with dishes + price + currency. Confirm Firestore `viettours/restaurant_list.restaurants[]` updates.
- **V4:** Back to MenuHome; "+ Tạo thực đơn" opens a fresh `MenuBuilder` with code `TD-NN-CA-TQ-001`.
- **V5:** Pick a destination + days; type 1.5s pause → menu auto-saved (Firestore `tour_menus/{id}` + index entry).
- **V6:** On day 1's lunch meal: pick the restaurant created in V3 → city + restaurantName autofill. Pick a set → suggested+adjusted dishes/price/cur all populate.
- **V7:** Override "Điều chỉnh" dishes/price/cur; save (auto or explicit). Reload → values round-trip.
- **V8:** Drag day 2 above day 1; numbers re-flow.
- **V9:** Link an Itinerary + link a Quote → dropdowns work, destination auto-fills from itinerary/quote if blank.
- **V10:** "📄 Word" downloads `ThucDon_{code}_{slug}.docx` — opens with code header, destination + days, day blocks, suggested+adjusted columns, totals.
- **V11:** "📑 PDF" downloads the PDF; same layout, ASCII-stripped Vietnamese.
- **V12:** Delete a menu from Home → cloud doc + index entry removed.
- **V13:** Switch template back to a normal quote — no Menu state leaks.
