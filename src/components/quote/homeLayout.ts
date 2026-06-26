/**
 * Bố cục trang "Hôm nay" tùy biến theo TỪNG user (lưu localStorage + đồng bộ Supabase).
 *
 * Mỗi thẻ (section) trên trang chủ có 1 id ổn định. Layout giữ:
 *  - `order`    : thứ tự hiển thị của TẤT CẢ thẻ khả dụng (kể cả thẻ đang ẩn).
 *  - `hidden`   : tập id đã tắt (không hiển thị).
 *  - `collapsed`: tập id đang thu gọn (chỉ hiện tiêu đề + số đếm).
 *  - `rowsPer`  : số dòng tối đa hiển thị mỗi thẻ dạng danh sách.
 *
 * Logic ở đây THUẦN (chỉ thao tác id dạng chuỗi) để test & tách khỏi React/MUI.
 */

/** Id thẻ trang chủ — phải trùng với khóa render trong HomeView. */
export const HOME_SECTION_IDS = [
  'todo',
  'process',
  'myRuns',
  'deadlines',
  'soon',
  'myOverdue',
  'nccDue',
  'owing',
  'docs',
  'leaves',
  'followups',
] as const;

export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

/** Lựa chọn số dòng mỗi thẻ (9999 = tất cả). */
export const ROWS_OPTIONS = [3, 5, 10, 9999] as const;
export const DEFAULT_ROWS = 5;

export interface HomeLayout {
  order: string[];
  hidden: string[];
  collapsed: string[];
  rowsPer: number;
}

/** Layout mặc định = thứ tự catalog, không ẩn/thu gọn gì. */
export function defaultHomeLayout(catalog: string[]): HomeLayout {
  return { order: [...catalog], hidden: [], collapsed: [], rowsPer: DEFAULT_ROWS };
}

function sanitizeRows(n: unknown): number {
  return typeof n === 'number' && (ROWS_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_ROWS;
}

/**
 * Hợp nhất layout đã lưu với catalog hiện tại (robust):
 *  - GIỮ thứ tự đã lưu cho id còn khả dụng.
 *  - BỎ id không còn khả dụng (gỡ khỏi code / mất quyền).
 *  - THÊM id mới (chưa có trong order) vào cuối, mặc định HIỆN.
 *  - `hidden`/`collapsed` chỉ giữ id còn khả dụng; `rowsPer` chuẩn hóa.
 */
export function reconcileHomeLayout(catalog: string[], saved: Partial<HomeLayout> | null | undefined): HomeLayout {
  const avail = new Set(catalog);
  const order: string[] = [];
  const seen = new Set<string>();
  if (saved && Array.isArray(saved.order)) {
    for (const id of saved.order) {
      if (avail.has(id) && !seen.has(id)) { order.push(id); seen.add(id); }
    }
  }
  for (const id of catalog) {
    if (!seen.has(id)) { order.push(id); seen.add(id); }
  }
  const keep = (arr: unknown) => [...new Set((Array.isArray(arr) ? arr : []).filter((id) => avail.has(id)))];
  return { order, hidden: keep(saved?.hidden), collapsed: keep(saved?.collapsed), rowsPer: sanitizeRows(saved?.rowsPer) };
}

export function isHidden(layout: HomeLayout, id: string): boolean {
  return layout.hidden.includes(id);
}

export function isCollapsed(layout: HomeLayout, id: string): boolean {
  return layout.collapsed.includes(id);
}

function toggleIn(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Bật/tắt hiển thị 1 thẻ. */
export function toggleHidden(layout: HomeLayout, id: string): HomeLayout {
  return { ...layout, hidden: toggleIn(layout.hidden, id) };
}

/** Bật/tắt thu gọn 1 thẻ. */
export function toggleCollapsed(layout: HomeLayout, id: string): HomeLayout {
  return { ...layout, collapsed: toggleIn(layout.collapsed, id) };
}

/** Đổi số dòng tối đa mỗi thẻ. */
export function setRowsPer(layout: HomeLayout, rowsPer: number): HomeLayout {
  return { ...layout, rowsPer: sanitizeRows(rowsPer) };
}

/** Sắp xếp lại: đưa id ở vị trí `from` tới vị trí `to` trong `order`. */
export function reorderSection(layout: HomeLayout, from: number, to: number): HomeLayout {
  const arr = layout.order;
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return layout;
  const order = [...arr];
  const [m] = order.splice(from, 1);
  order.splice(to, 0, m);
  return { ...layout, order };
}
