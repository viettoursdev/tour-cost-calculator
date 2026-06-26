/**
 * Bố cục trang "Hôm nay" tùy biến theo TỪNG user (lưu localStorage).
 *
 * Mỗi thẻ (section) trên trang chủ có 1 id ổn định. Layout giữ:
 *  - `order`  : thứ tự hiển thị của TẤT CẢ thẻ khả dụng (kể cả thẻ đang ẩn).
 *  - `hidden` : tập id đã tắt (không hiển thị).
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
  'owing',
  'followups',
] as const;

export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

export interface HomeLayout {
  order: string[];
  hidden: string[];
}

/** Layout mặc định = thứ tự catalog, không ẩn gì. */
export function defaultHomeLayout(catalog: string[]): HomeLayout {
  return { order: [...catalog], hidden: [] };
}

/**
 * Hợp nhất layout đã lưu với catalog hiện tại (robust):
 *  - GIỮ thứ tự đã lưu cho id còn khả dụng.
 *  - BỎ id không còn khả dụng (gỡ khỏi code).
 *  - THÊM id mới (chưa có trong order) vào cuối, mặc định HIỆN.
 *  - `hidden` chỉ giữ id còn khả dụng.
 */
export function reconcileHomeLayout(catalog: string[], saved: HomeLayout | null | undefined): HomeLayout {
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
  const hidden = (saved?.hidden ?? []).filter((id) => avail.has(id));
  return { order, hidden: [...new Set(hidden)] };
}

export function isHidden(layout: HomeLayout, id: string): boolean {
  return layout.hidden.includes(id);
}

/** Bật/tắt hiển thị 1 thẻ. */
export function toggleHidden(layout: HomeLayout, id: string): HomeLayout {
  const hidden = layout.hidden.includes(id)
    ? layout.hidden.filter((x) => x !== id)
    : [...layout.hidden, id];
  return { order: [...layout.order], hidden };
}

/** Sắp xếp lại: đưa id ở vị trí `from` tới vị trí `to` trong `order`. */
export function reorderSection(layout: HomeLayout, from: number, to: number): HomeLayout {
  const arr = layout.order;
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return layout;
  const order = [...arr];
  const [m] = order.splice(from, 1);
  order.splice(to, 0, m);
  return { order, hidden: [...layout.hidden] };
}
