/**
 * Ẩn/hiện + sắp xếp CỘT của các bảng dữ liệu lớn theo TỪNG user.
 * Logic thuần — store lưu/đồng bộ ở `src/stores/tableColPrefStore.ts`,
 * UI chọn cột dùng chung ở `src/components/common/ColumnChooserDialog.tsx`.
 */

/** Tuỳ chọn 1 bảng: thứ tự cột + các cột đang ẩn. */
export type TableColPref = { order: string[]; hidden: string[] };
/** Tất cả bảng, khoá theo tableId (vd 'quoteHistory', 'guestlist_visa'). */
export type TableColPrefs = Record<string, TableColPref>;

function validPref(raw: unknown): TableColPref | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as TableColPref;
  return Array.isArray(p.order) && Array.isArray(p.hidden)
    ? { order: p.order.filter((k) => typeof k === 'string'), hidden: p.hidden.filter((k) => typeof k === 'string') }
    : null;
}

/** Chuẩn hoá blob thô (localStorage/cloud) — bỏ entry sai hình dạng. */
export function normalizeTableColPrefs(raw: unknown): TableColPrefs {
  if (!raw || typeof raw !== 'object') return {};
  const out: TableColPrefs = {};
  for (const [id, p] of Object.entries(raw as Record<string, unknown>)) {
    const v = validPref(p);
    if (v) out[id] = v;
  }
  return out;
}

export type LockedCols = {
  /** Cột khoá ĐẦU bảng (vd cột sticky) — luôn hiện, không đổi chỗ. */
  start?: string[];
  /** Cột khoá CUỐI bảng (vd cột nút thao tác) — luôn hiện, không đổi chỗ. */
  end?: string[];
};

/**
 * Hợp nhất tuỳ chọn đã lưu với danh mục cột hiện tại (robust như navLayout):
 * - GIỮ thứ tự đã lưu cho cột còn tồn tại; BỎ cột không còn; THÊM cột mới vào cuối
 *   (trước nhóm khoá cuối).
 * - Cột khoá luôn hiện đúng vị trí (đầu/cuối theo thứ tự catalog), không bao giờ ẩn.
 */
export function reconcileColumns(
  allKeys: string[],
  pref: TableColPref | null | undefined,
  locked: LockedCols = {},
): { order: string[]; hidden: Set<string> } {
  const avail = new Set(allKeys);
  const start = (locked.start ?? []).filter((k) => avail.has(k));
  const end = (locked.end ?? []).filter((k) => avail.has(k));
  const lockedSet = new Set([...start, ...end]);

  const saved = (pref?.order ?? []).filter((k) => avail.has(k) && !lockedSet.has(k));
  const savedSet = new Set(saved);
  const fresh = allKeys.filter((k) => !lockedSet.has(k) && !savedSet.has(k));

  const order = [...start, ...saved, ...fresh, ...end];
  const hidden = new Set((pref?.hidden ?? []).filter((k) => avail.has(k) && !lockedSet.has(k)));
  return { order, hidden };
}

/** Các cột đang hiển thị, đúng thứ tự (tiện dùng thẳng khi render). */
export function visibleColumns(
  allKeys: string[],
  pref: TableColPref | null | undefined,
  locked: LockedCols = {},
): string[] {
  const { order, hidden } = reconcileColumns(allKeys, pref, locked);
  return order.filter((k) => !hidden.has(k));
}
