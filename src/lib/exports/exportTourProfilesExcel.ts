/**
 * Xuất danh sách Hồ sơ tour ra Excel (.xlsx) — 1 sheet, header brand teal.
 * Mỗi dòng là một hồ sơ tour với chỉ số gom từ báo giá chính & các liên kết.
 * ExcelJS nạp động khi bấm (tránh kéo lib nặng vào bundle chính).
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { BRAND_TEAL_ARGB } from './brand';

const FONT = 'Aptos';
const NAVY = 'FF0F3A4A', WHITE = 'FFFFFFFF', LINE = 'FFE4E8EB';

/** Một dòng xuất — đã quy về kiểu vô danh, tính sẵn ở UI (nơi có meta hồ sơ). */
export type TourProfileExportRow = {
  code: string;
  name: string;
  category: string;      // nhãn loại hồ sơ (Incentive NĐ/NN, Visa, Event, Dịch vụ)
  customer: string;
  departDate: string;    // dd/mm/yyyy hoặc ''
  pax: number;
  stage: string;         // nhãn giai đoạn
  quotes: number;
  contracts: number;
  visa: number;
  menus: number;
  itineraries: number;
  guide: number;
  valueCurrent: number | '';    // báo giá hiện tại (VND)
  valueContract: number | '';   // báo giá hợp đồng (VND)
  valueSettlement: number | ''; // báo giá nghiệm thu (VND)
  payableRemaining: number; // công nợ NCC còn lại (VND)
  actualProfit: number | '';  // biên lợi thực (nếu đã quyết toán)
  owner: string;
  status: string;        // 'Đang mở' | 'Lưu trữ'
};

const HEADERS = [
  'Mã hồ sơ', 'Tên tour', 'Loại hồ sơ', 'Khách hàng', 'Ngày khởi hành', 'Số khách', 'Giai đoạn',
  'Số báo giá', 'Hợp đồng', 'Visa', 'Thực đơn', 'Chương trình', 'Lịch HDV',
  'Báo giá hiện tại (VND)', 'Báo giá hợp đồng (VND)', 'Báo giá nghiệm thu (VND)',
  'Công nợ còn lại (VND)', 'Biên lợi thực (VND)', 'Chủ sở hữu', 'Trạng thái',
];

/** Metadata trang bìa cho file xuất (điều kiện lọc + người xuất). */
export type TourProfileExportMeta = {
  filterSummary?: string; // tóm tắt điều kiện (số hồ sơ · phân loại · khoảng ngày)
  generatedBy?: string;   // người xuất
};

/** Các cột VND (1-based) — dùng cho định dạng số + dòng tổng. */
const VND_COLS = [14, 15, 16, 17, 18];
const LAST_COL = HEADERS.length;

export async function exportTourProfilesExcel(
  rows: TourProfileExportRow[],
  meta: TourProfileExportMeta = {},
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Viettours Tour Cost Calculator';
  wb.created = new Date();

  // Header row đặt SAU khối tiêu đề (3 dòng) → freeze dưới header.
  const HEAD_ROW = 4;
  const ws = wb.addWorksheet('Hồ sơ tour', { views: [{ showGridLines: false, state: 'frozen', ySplit: HEAD_ROW }] });

  // ── Khối tiêu đề (merge ngang toàn bảng) ──
  const titleLine = (text: string, opts: { size: number; color: string; bold?: boolean }) => {
    const r = ws.addRow([text]);
    ws.mergeCells(r.number, 1, r.number, LAST_COL);
    const cell = r.getCell(1);
    cell.font = { name: FONT, bold: opts.bold ?? true, size: opts.size, color: { argb: opts.color } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    return r;
  };
  titleLine('VIETTOURS', { size: 14, color: BRAND_TEAL_ARGB }).height = 20;
  titleLine('DANH SÁCH HỒ SƠ TOUR', { size: 12, color: NAVY }).height = 18;
  const stampVi = new Date().toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const subParts = [
    meta.filterSummary ? `Điều kiện: ${meta.filterSummary}` : `${rows.length} hồ sơ`,
    `Xuất: ${stampVi}`,
    meta.generatedBy ? `Người xuất: ${meta.generatedBy}` : '',
  ].filter(Boolean);
  titleLine(subParts.join('   ·   '), { size: 9.5, color: 'FF6B7280', bold: false }).height = 16;

  // ── Header bảng ──
  const head = ws.addRow(HEADERS); // = HEAD_ROW
  head.height = 22;
  head.eachCell((c) => {
    c.font = { name: FONT, bold: true, size: 11, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_TEAL_ARGB } };
    c.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  const data: (string | number)[][] = rows.map((r) => [
    r.code, r.name, r.category, r.customer, r.departDate, r.pax, r.stage,
    r.quotes, r.contracts, r.visa, r.menus, r.itineraries, r.guide,
    r.valueCurrent, r.valueContract, r.valueSettlement, r.payableRemaining, r.actualProfit, r.owner, r.status,
  ]);
  data.forEach((r) => {
    const row = ws.addRow(r);
    row.eachCell((c) => {
      c.font = { name: FONT, size: 10, color: { argb: NAVY } };
      c.alignment = { vertical: 'middle', wrapText: true };
      c.border = { bottom: { style: 'thin', color: { argb: LINE } } };
    });
  });

  // ── Dòng TỔNG (cộng các cột VND + đếm hồ sơ) ──
  const sumOf = (key: keyof TourProfileExportRow) =>
    rows.reduce((acc, r) => acc + (typeof r[key] === 'number' ? (r[key] as number) : 0), 0);
  const totalCells: (string | number)[] = new Array(LAST_COL).fill('');
  totalCells[0] = `TỔNG (${rows.length} hồ sơ)`;
  totalCells[13] = sumOf('valueCurrent');
  totalCells[14] = sumOf('valueContract');
  totalCells[15] = sumOf('valueSettlement');
  totalCells[16] = sumOf('payableRemaining');
  totalCells[17] = sumOf('actualProfit');
  const totalRow = ws.addRow(totalCells);
  totalRow.height = 20;
  totalRow.eachCell((c) => {
    c.font = { name: FONT, bold: true, size: 10.5, color: { argb: NAVY } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F4' } };
    c.alignment = { vertical: 'middle' };
    c.border = { top: { style: 'medium', color: { argb: BRAND_TEAL_ARGB } } };
  });

  // Định dạng số tiền cho các cột VND (14..18).
  VND_COLS.forEach((col) => { ws.getColumn(col).numFmt = '#,##0'; });

  HEADERS.forEach((h, i) => {
    const maxLen = Math.max(h.length, ...data.map((r) => String(r[i] ?? '').length));
    ws.getColumn(i + 1).width = Math.min(Math.max(maxLen + 2, 10), 40);
  });
  ws.autoFilter = { from: { row: HEAD_ROW, column: 1 }, to: { row: HEAD_ROW, column: LAST_COL } };

  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  saveAs(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Ho-so-tour-Viettours-${stamp}.xlsx`,
  );
}
