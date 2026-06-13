/** Bộ lọc dùng chung cho các danh sách: khoảng thời gian + người tạo/phụ trách. */

export type DateRangeKey = 'all' | 'today' | '7d' | '30d' | 'custom';

export const DATE_RANGE_OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: 'all', label: 'Mọi thời gian' },
  { key: 'today', label: 'Hôm nay' },
  { key: '7d', label: '7 ngày qua' },
  { key: '30d', label: '30 ngày qua' },
  { key: 'custom', label: 'Tùy chọn…' },
];

/** Một mốc ISO có nằm trong khoảng đã chọn không. */
export function inDateRange(iso: string | undefined | null, key: DateRangeKey, from?: string, to?: string): boolean {
  if (key === 'all') return true;
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const now = Date.now();
  if (key === 'today') { const s = new Date(); s.setHours(0, 0, 0, 0); return d.getTime() >= s.getTime(); }
  if (key === '7d') return d.getTime() >= now - 7 * 86400000;
  if (key === '30d') return d.getTime() >= now - 30 * 86400000;
  // custom
  if (from) { const f = new Date(from); f.setHours(0, 0, 0, 0); if (d.getTime() < f.getTime()) return false; }
  if (to) { const t = new Date(to); t.setHours(23, 59, 59, 999); if (d.getTime() > t.getTime()) return false; }
  return true;
}
