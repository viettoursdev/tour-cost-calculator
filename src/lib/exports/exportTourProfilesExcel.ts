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
  kind: string;          // 'Nội địa' | 'Nước ngoài'
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
  value: number;         // giá trị báo giá chính (VND)
  payableRemaining: number; // công nợ NCC còn lại (VND)
  actualProfit: number | '';  // biên lợi thực (nếu đã quyết toán)
  owner: string;
  status: string;        // 'Đang mở' | 'Lưu trữ'
};

const HEADERS = [
  'Mã hồ sơ', 'Tên tour', 'Loại', 'Khách hàng', 'Ngày khởi hành', 'Số khách', 'Giai đoạn',
  'Số báo giá', 'Hợp đồng', 'Visa', 'Thực đơn', 'Chương trình', 'Lịch HDV',
  'Giá trị (VND)', 'Công nợ còn lại (VND)', 'Biên lợi thực (VND)', 'Chủ sở hữu', 'Trạng thái',
];

export async function exportTourProfilesExcel(rows: TourProfileExportRow[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Viettours Tour Cost Calculator';
  wb.created = new Date();

  const ws = wb.addWorksheet('Hồ sơ tour', { views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }] });
  ws.addRow(HEADERS);
  const head = ws.getRow(1);
  head.height = 22;
  head.eachCell((c) => {
    c.font = { name: FONT, bold: true, size: 11, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_TEAL_ARGB } };
    c.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  const data: (string | number)[][] = rows.map((r) => [
    r.code, r.name, r.kind, r.customer, r.departDate, r.pax, r.stage,
    r.quotes, r.contracts, r.visa, r.menus, r.itineraries, r.guide,
    r.value, r.payableRemaining, r.actualProfit, r.owner, r.status,
  ]);
  data.forEach((r) => {
    const row = ws.addRow(r);
    row.eachCell((c) => {
      c.font = { name: FONT, size: 10, color: { argb: NAVY } };
      c.alignment = { vertical: 'middle', wrapText: true };
      c.border = { bottom: { style: 'thin', color: { argb: LINE } } };
    });
  });

  // Định dạng số tiền cho 3 cột VND (14,15,16).
  [14, 15, 16].forEach((col) => { ws.getColumn(col).numFmt = '#,##0'; });

  HEADERS.forEach((h, i) => {
    const maxLen = Math.max(h.length, ...data.map((r) => String(r[i] ?? '').length));
    ws.getColumn(i + 1).width = Math.min(Math.max(maxLen + 2, 10), 40);
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADERS.length } };

  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  saveAs(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Ho-so-tour-Viettours-${stamp}.xlsx`,
  );
}
