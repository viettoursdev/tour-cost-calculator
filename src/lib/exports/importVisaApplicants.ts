/**
 * Import / xuất mẫu danh sách khách visa từ .xlsx.
 * Cột nhận diện theo TÊN tiêu đề (không phân biệt dấu/hoa-thường) nên thứ tự cột
 * linh hoạt. Dùng chung helper ExcelJS như importExcelQuote.
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { normalizeVN } from '@/lib/search';
import { newVisaApplicant } from '@/components/visa/constants';
import type { VisaApplicant } from '@/types';

// Bí danh tiêu đề → field. Khoá đã normalizeVN (bỏ dấu, lowercase).
const HEADER_MAP: Record<string, keyof VisaApplicant> = {
  'ho ten': 'name', 'ho va ten': 'name', 'ho ten co dau': 'name', 'ten': 'name',
  'ho ten khong dau': 'nameNoAccent', 'ten khong dau': 'nameNoAccent',
  'gioi tinh': 'gender',
  'ngay sinh': 'dob', 'ns': 'dob',
  'so ho chieu': 'passport', 'ho chieu': 'passport', 'passport': 'passport', 'so hc': 'passport',
  'ngay cap': 'passportIssue', 'ngay cap hc': 'passportIssue',
  'ngay het han': 'passportExpiry', 'ngay het han hc': 'passportExpiry', 'het han': 'passportExpiry',
  'cac quoc gia da tung di': 'countriesVisited', 'quoc gia da di': 'countriesVisited', 'quoc gia da tung di': 'countriesVisited',
  'luu y khac': 'note', 'luu y': 'note', 'ghi chu': 'note',
};

const TEMPLATE_HEADERS = [
  'Họ tên (có dấu)', 'Họ tên (không dấu)', 'Giới tính', 'Ngày sinh', 'Số hộ chiếu',
  'Ngày cấp', 'Ngày hết hạn', 'Các quốc gia đã từng đi', 'Lưu ý khác',
];

const DATE_FIELDS = new Set<keyof VisaApplicant>(['dob', 'passportIssue', 'passportExpiry']);

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

/** Chuẩn hoá ngày về YYYY-MM-DD (chấp nhận Date, dd/mm/yyyy, yyyy-mm-dd, serial). */
function toISODate(v: unknown): string {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    const y = v.getFullYear(); const m = v.getMonth() + 1; const d = v.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  let mt = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (mt) return `${mt[1]}-${mt[2].padStart(2, '0')}-${mt[3].padStart(2, '0')}`;
  mt = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s); // dd/mm/yyyy
  if (mt) return `${mt[3]}-${mt[2].padStart(2, '0')}-${mt[1].padStart(2, '0')}`;
  return s; // để nguyên nếu không nhận dạng được
}

function normGender(v: string): VisaApplicant['gender'] {
  const n = normalizeVN(v);
  if (n === 'nam' || n === 'male' || n === 'm') return 'Nam';
  if (n === 'nu' || n === 'female' || n === 'f') return 'Nữ';
  return v ? 'Khác' : '';
}

/** Đọc file Excel → danh sách khách (id mới). Bỏ qua dòng trống hoàn toàn. */
export async function parseVisaApplicantsExcel(file: File): Promise<VisaApplicant[]> {
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('File Excel rỗng.');

  // Tìm hàng tiêu đề trong 10 hàng đầu (hàng có ≥2 ô khớp HEADER_MAP).
  let headerRow = 0;
  const colMap: Record<number, keyof VisaApplicant> = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const found: Record<number, keyof VisaApplicant> = {};
    for (let c = 1; c <= Math.min(40, ws.columnCount || 40); c++) {
      const key = normalizeVN(String(cellRaw(ws, r, c)));
      if (HEADER_MAP[key]) found[c] = HEADER_MAP[key];
    }
    if (Object.keys(found).length >= 2) { headerRow = r; Object.assign(colMap, found); break; }
  }
  if (!headerRow) throw new Error('Không tìm thấy hàng tiêu đề. Hãy dùng "Tải mẫu Excel" để đúng định dạng (cần ít nhất cột Họ tên và Số hộ chiếu).');

  const out: VisaApplicant[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const a = newVisaApplicant();
    let any = false;
    for (const [cStr, field] of Object.entries(colMap)) {
      const raw = cellRaw(ws, r, Number(cStr));
      if (raw === '' || raw == null) continue;
      if (DATE_FIELDS.has(field)) {
        const iso = toISODate(raw);
        if (iso) { (a as unknown as Record<string, unknown>)[field] = iso; any = true; }
      } else if (field === 'gender') {
        a.gender = normGender(String(raw)); any = true;
      } else {
        (a as unknown as Record<string, unknown>)[field] = String(raw).trim(); any = true;
      }
    }
    if (!any || (!a.name?.trim() && !a.passport?.trim())) continue; // bỏ dòng trống
    if (!a.nameNoAccent && a.name) a.nameNoAccent = a.name; // để UI tự bù sau cũng được
    out.push(a);
  }
  return out;
}

/** Tải file Excel mẫu (1 hàng tiêu đề + 1 dòng ví dụ) để nhập danh sách khách. */
export async function downloadVisaApplicantsTemplate(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('DanhSachKhach');
  ws.addRow(TEMPLATE_HEADERS);
  ws.getRow(1).font = { bold: true };
  ws.addRow(['Nguyễn Văn A', 'Nguyen Van A', 'Nam', '1990-01-15', 'C1234567', '2020-03-01', '2030-03-01', 'Nhật Bản, Hàn Quốc', 'Khách VIP']);
  ws.columns.forEach((c) => { c.width = 18; });
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, 'Mau_DanhSachKhachVisa.xlsx');
}
