/**
 * Bố cục thanh điều hướng tùy biến theo từng user (lưu localStorage).
 *
 * Mỗi mục nav có 1 id ổn định (= view key, hoặc 'app:itinerary'… cho mục mở app).
 * Layout đặt mỗi id vào ĐÚNG MỘT container theo thứ tự:
 *  - 'top'        : tab phẳng nằm ngang
 *  - 'grp:sales'  : nhóm Bán hàng (dropdown)
 *  - 'grp:ops'    : nhóm Vận hành
 *  - 'grp:catalog': nhóm Danh mục
 *  - 'hidden'     : đã ẩn (không hiển thị)
 *
 * Logic ở đây THUẦN (chỉ thao tác id dạng chuỗi) để test & tách khỏi React/icon.
 */

export const GROUP_IDS = ['grp:sales', 'grp:ops', 'grp:catalog'] as const;
export type GroupId = (typeof GROUP_IDS)[number];

export const GROUP_LABELS: Record<GroupId, string> = {
  'grp:sales': 'Bán hàng',
  'grp:ops': 'Vận hành',
  'grp:catalog': 'Danh mục',
};

/** Container đặt được mục (trừ 'hidden' là nơi mặc định KHÔNG ai rơi vào). */
export type PlaceableContainer = 'top' | GroupId;
export type ContainerId = PlaceableContainer | 'hidden';

export const CONTAINER_IDS: ContainerId[] = ['top', ...GROUP_IDS, 'hidden'];

export type NavLayout = Record<ContainerId, string[]>;

/** Mục nav khả dụng (đã lọc quyền) + container mặc định của nó. */
export interface NavCatalogEntry {
  id: string;
  container: PlaceableContainer;
}

export function emptyLayout(): NavLayout {
  return { top: [], 'grp:sales': [], 'grp:ops': [], 'grp:catalog': [], hidden: [] };
}

function clone(l: NavLayout): NavLayout {
  return {
    top: [...l.top],
    'grp:sales': [...l['grp:sales']],
    'grp:ops': [...l['grp:ops']],
    'grp:catalog': [...l['grp:catalog']],
    hidden: [...l.hidden],
  };
}

/** Layout mặc định = mỗi mục về đúng container gốc, theo thứ tự catalog. */
export function defaultLayout(catalog: NavCatalogEntry[]): NavLayout {
  const out = emptyLayout();
  for (const c of catalog) out[c.container].push(c.id);
  return out;
}

/**
 * Hợp nhất layout đã lưu với catalog hiện tại (robust như catOrder):
 *  - GIỮ vị trí đã lưu cho mục còn khả dụng (kể cả đang ẩn).
 *  - BỎ id không còn khả dụng (mất quyền / gỡ khỏi code).
 *  - THÊM mục mới (chưa có trong layout) vào container mặc định, ở cuối.
 */
export function reconcileLayout(catalog: NavCatalogEntry[], saved: NavLayout | null | undefined): NavLayout {
  const avail = new Set(catalog.map((c) => c.id));
  const out = emptyLayout();
  const placed = new Set<string>();
  if (saved) {
    for (const cid of CONTAINER_IDS) {
      for (const id of saved[cid] ?? []) {
        if (avail.has(id) && !placed.has(id)) { out[cid].push(id); placed.add(id); }
      }
    }
  }
  for (const c of catalog) {
    if (!placed.has(c.id)) { out[c.container].push(c.id); placed.add(c.id); }
  }
  return out;
}

/** Di chuyển 1 id sang container đích tại vị trí toIndex (gỡ khỏi container cũ). */
export function moveItem(layout: NavLayout, id: string, to: ContainerId, toIndex: number): NavLayout {
  const out = clone(layout);
  for (const cid of CONTAINER_IDS) {
    const i = out[cid].indexOf(id);
    if (i >= 0) out[cid].splice(i, 1);
  }
  const arr = out[to];
  const idx = Math.max(0, Math.min(toIndex, arr.length));
  arr.splice(idx, 0, id);
  return out;
}

/** Sắp xếp lại trong cùng 1 container. */
export function reorder(layout: NavLayout, container: ContainerId, from: number, to: number): NavLayout {
  const arr = layout[container];
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return layout;
  const out = clone(layout);
  const [m] = out[container].splice(from, 1);
  out[container].splice(to, 0, m);
  return out;
}

/** Ẩn 1 mục (đưa xuống cuối 'hidden'). */
export function hideItem(layout: NavLayout, id: string): NavLayout {
  return moveItem(layout, id, 'hidden', layout.hidden.length);
}

/** Bỏ ẩn: đưa mục về container mặc định của nó (cuối danh sách). */
export function unhideItem(layout: NavLayout, catalog: NavCatalogEntry[], id: string): NavLayout {
  const def = catalog.find((c) => c.id === id)?.container ?? 'top';
  return moveItem(layout, id, def, layout[def].length);
}
