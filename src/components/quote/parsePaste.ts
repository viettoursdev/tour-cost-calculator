import { parseAmountVN } from '@/lib/numParse';
import type { Item } from '@/types';

/**
 * Phân tích khối dán từ Excel thành các dòng có xem trước:
 *  - Tự nhận & bỏ dòng TIÊU ĐỀ (nếu ô khớp từ khoá: Tên/Đơn giá/Đơn vị/Lần/Ghi chú).
 *  - Khi có tiêu đề → ánh xạ cột theo tên; ngược lại dùng thứ tự mặc định.
 *  - Đánh dấu dòng lỗi (thiếu tên) để người dùng soát trước khi thêm.
 */
export type ParseField = 'name' | 'price' | 'unit' | 'times' | 'note' | 'skip';

const HEADER_KEYS: [RegExp, ParseField][] = [
  [/tên|name|hạng ?mục|mô tả|nội dung/, 'name'],
  [/đơn ?giá|^giá|price|amount|cost|thành tiền/, 'price'],
  [/đơn ?vị|unit/, 'unit'],
  [/số ?lần|^lần|times|số ?lượng|\bqty\b|\bsl\b/, 'times'],
  [/ghi ?chú|note|chi ?tiết|remark/, 'note'],
];

const DEFAULT_ORDER: ParseField[] = ['name', 'price', 'unit', 'times', 'note'];

export const FIELD_LABEL: Record<Exclude<ParseField, 'skip'>, string> = {
  name: 'Tên', price: 'Đơn giá', unit: 'Đơn vị', times: 'Số lần', note: 'Ghi chú',
};

function headerField(cell: string): ParseField | null {
  const s = cell.trim().toLowerCase();
  for (const [re, f] of HEADER_KEYS) if (re.test(s)) return f;
  return null;
}

export type ParsedRow = { item: Partial<Item>; ok: boolean; reason?: string; cells: string[] };
export type PasteResult = { headerDetected: boolean; map: ParseField[]; rows: ParsedRow[]; validCount: number };

function buildRow(cells: string[], map: ParseField[]): ParsedRow {
  const item: Partial<Item> = {};
  cells.forEach((c, i) => {
    const f = map[i] ?? 'skip';
    const v = (c ?? '').trim();
    if (!v || f === 'skip') return;
    if (f === 'name') item.name = v;
    else if (f === 'price') item.price = parseAmountVN(v);
    else if (f === 'unit') item.unit = v;
    else if (f === 'times') item.times = Math.max(1, Math.round(parseAmountVN(v)) || 1);
    else if (f === 'note') item.note = v;
  });
  const ok = !!item.name?.trim();
  return { item, ok, reason: ok ? undefined : 'Thiếu tên', cells };
}

export function parsePasteGrid(text: string): PasteResult {
  const grid = text.split(/\r?\n/)
    .map((l) => l.split('\t'))
    .filter((cells) => cells.some((c) => c.trim() !== ''));
  if (grid.length === 0) return { headerDetected: false, map: DEFAULT_ORDER, rows: [], validCount: 0 };

  // Nhận dòng tiêu đề: ≥2 ô khớp từ khoá tiêu đề.
  const firstMapped = grid[0].map(headerField);
  const headerDetected = firstMapped.filter(Boolean).length >= 2;
  const map: ParseField[] = headerDetected
    ? firstMapped.map((f, i) => f ?? DEFAULT_ORDER[i] ?? 'skip')
    : DEFAULT_ORDER;

  const rows = grid.slice(headerDetected ? 1 : 0).map((cells) => buildRow(cells, map));
  return { headerDetected, map, rows, validCount: rows.filter((r) => r.ok).length };
}
