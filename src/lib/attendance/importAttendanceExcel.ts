/**
 * Đọc file chấm công tháng (.xlsx) của bộ phận nhân sự Viettours → danh sách bảng công.
 * Bố cục ma trận: mỗi DÒNG = 1 nhân viên; cột "MÃ NV"/"HỌ TÊN" + nhiều cột NGÀY (mỗi ngày
 * 1 mã công như X/P/NB…). Nhận diện cột tiêu đề + hàng ngày theo nội dung (linh hoạt vị trí),
 * khớp nhân viên theo MÃ NV (ưu tiên) rồi tới tên. Dùng chung helper ExcelJS như import khác.
 */
import ExcelJS from 'exceljs';
import { normalizeVN } from '@/lib/search';
import { normalizeCode } from './attendanceCodes';
import type { AttendanceDays, HrEmployee } from '@/types';

/** Một dòng nhân viên đã parse từ file (trước khi ghi). */
export type ParsedAttendanceRow = {
  rowIndex: number;            // số dòng trong sheet (để báo lỗi)
  employeeCode: string;        // MÃ NV đọc từ file
  fullName: string;            // HỌ TÊN đọc từ file
  days: AttendanceDays;        // mã công theo ngày
  matchedEmployeeId?: string;  // hr_employees.id (legacy_id) nếu khớp
  matchedBy?: 'code' | 'name'; // cách khớp
};

export type AttendanceImportResult = {
  period: string;              // "YYYY-MM" suy từ hàng ngày
  dateColumns: string[];       // các ngày ISO phát hiện được
  rows: ParsedAttendanceRow[];
  matched: number;             // số dòng khớp nhân viên
  unmatched: number;           // số dòng KHÔNG khớp
  warnings: string[];
};

function cellRaw(ws: ExcelJS.Worksheet, r: number, c: number): unknown {
  const v = ws.getCell(r, c).value;
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string };
    if (o.result != null) return o.result;
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if (o.text != null) return o.text;
    return '';
  }
  return v;
}

function cellText(ws: ExcelJS.Worksheet, r: number, c: number): string {
  const v = cellRaw(ws, r, c);
  if (v instanceof Date) return v.toISOString();
  return String(v ?? '').trim();
}

/** Một giá trị ô có phải là ngày trong khoảng hợp lý không (để dò hàng ngày). */
function asDate(v: unknown): Date | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  return null;
}

function isoFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Khoá khớp theo mã NV: bỏ khoảng trắng + bỏ số 0 ở đầu (00601 ≡ 601). */
function codeKey(raw: string): string {
  const s = String(raw).replace(/\s+/g, '').toUpperCase();
  return s.replace(/^0+(?=\d)/, '');
}

const SCAN_ROWS = 20;   // số dòng đầu tối đa để dò tiêu đề / hàng ngày
const SCAN_COLS = 45;   // số cột tối đa quét

export async function parseAttendanceExcel(
  file: File,
  employees: HrEmployee[],
): Promise<AttendanceImportResult> {
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('File không có sheet nào.');

  const maxCol = Math.min(ws.columnCount || SCAN_COLS, SCAN_COLS);
  const warnings: string[] = [];

  // 1) Dò cột "MÃ NV" và "HỌ TÊN" trong vài dòng đầu.
  let codeCol = 0, nameCol = 0, headerRow = 0;
  for (let r = 1; r <= Math.min(ws.rowCount, SCAN_ROWS) && !headerRow; r++) {
    for (let c = 1; c <= maxCol; c++) {
      const k = normalizeVN(cellText(ws, r, c));
      if (!codeCol && (k === 'ma nv' || k === 'ma nhan vien' || k === 'manv')) codeCol = c;
      if (!nameCol && (k === 'ho ten' || k === 'ho va ten' || k === 'ten nhan vien')) nameCol = c;
    }
    if (codeCol && nameCol) headerRow = r;
  }
  if (!headerRow) throw new Error('Không tìm thấy cột "MÃ NV" và "HỌ TÊN" trong file.');

  // 2) Dò hàng NGÀY = hàng có nhiều ô là Date nhất (trong vùng đầu).
  let dateRow = 0, bestCount = 0;
  for (let r = 1; r <= Math.min(ws.rowCount, SCAN_ROWS); r++) {
    let cnt = 0;
    for (let c = 1; c <= maxCol; c++) if (asDate(cellRaw(ws, r, c))) cnt++;
    if (cnt > bestCount) { bestCount = cnt; dateRow = r; }
  }
  if (!dateRow || bestCount < 5) throw new Error('Không tìm thấy hàng chứa các NGÀY trong tháng.');

  // 3) Map cột → ngày ISO (chỉ giữ ngày thuộc tháng phổ biến nhất → bỏ cột tổng cuối).
  const colDate: { col: number; iso: string; ym: string }[] = [];
  const ymCount: Record<string, number> = {};
  for (let c = 1; c <= maxCol; c++) {
    const d = asDate(cellRaw(ws, dateRow, c));
    if (!d) continue;
    const iso = isoFromDate(d);
    const ym = iso.slice(0, 7);
    ymCount[ym] = (ymCount[ym] ?? 0) + 1;
    colDate.push({ col: c, iso, ym });
  }
  const period = Object.entries(ymCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const dayCols = colDate.filter((x) => x.ym === period);
  const dateColumns = dayCols.map((x) => x.iso);
  if (!period || !dayCols.length) throw new Error('Không xác định được kỳ công (tháng/năm) từ hàng ngày.');

  // 4) Chỉ mục nhân viên để khớp: theo mã (chuẩn hoá) và theo tên (không dấu).
  const byCode = new Map<string, HrEmployee>();
  const byName = new Map<string, HrEmployee>();
  for (const e of employees) {
    if (e.employeeCode) byCode.set(codeKey(e.employeeCode), e);
    if (e.fullName) byName.set(normalizeVN(e.fullName), e);
  }

  // 5) Đọc từng dòng dữ liệu (từ sau hàng ngày).
  const startRow = Math.max(headerRow, dateRow) + 1;
  const rows: ParsedAttendanceRow[] = [];
  for (let r = startRow; r <= ws.rowCount; r++) {
    const code = cellText(ws, r, codeCol);
    const name = cellText(ws, r, nameCol);
    if (!code && !name) continue; // dòng trống

    const days: AttendanceDays = {};
    for (const { col, iso } of dayCols) {
      const raw = cellText(ws, r, col);
      if (raw && normalizeCode(raw) !== '') days[iso] = { code: raw.replace(/\s+/g, ' ').trim() };
    }
    if (!Object.keys(days).length && !code) continue; // dòng chú thích/legend lọt vào

    let matched: HrEmployee | undefined;
    let matchedBy: 'code' | 'name' | undefined;
    if (code && byCode.has(codeKey(code))) { matched = byCode.get(codeKey(code)); matchedBy = 'code'; }
    else if (name && byName.has(normalizeVN(name))) { matched = byName.get(normalizeVN(name)); matchedBy = 'name'; }

    rows.push({
      rowIndex: r,
      employeeCode: code,
      fullName: name || matched?.fullName || '',
      days,
      matchedEmployeeId: matched?.id,
      matchedBy,
    });
  }

  const matched = rows.filter((x) => x.matchedEmployeeId).length;
  const unmatched = rows.length - matched;
  if (unmatched) warnings.push(`${unmatched} dòng KHÔNG khớp nhân viên (theo MÃ NV/tên) — sẽ bỏ qua khi ghi.`);
  if (!rows.length) warnings.push('Không đọc được dòng nhân viên nào.');

  return { period, dateColumns, rows, matched, unmatched, warnings };
}
