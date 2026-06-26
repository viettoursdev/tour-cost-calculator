/**
 * Xuất DANH SÁCH KHÁCH XIN VISA ra Excel — bản trình bày đẹp, chuyên nghiệp, có
 * thể gửi thẳng cho khách hàng. Người dùng tự chọn CỘT nào xuất và THỨ TỰ cột
 * (xem visaExportColumns.ts cho danh mục cột).
 *
 * Mỗi lần xuất phải qua cổng mật khẩu (do Trưởng Phòng đặt) — kiểm ở UI trước khi
 * gọi hàm này (xem VisaExportDialog).
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { BRAND_TEAL_ARGB } from './brand';
import { VTE_LOGO } from './vteLogo';
import { VISA_EXPORT_COLUMNS, type VisaExportColumn } from './visaExportColumns';
import { fmtDate } from '@/lib/dateUtils';
import { isApplicantOverdue } from '@/components/visa/constants';
import type { Passenger, VisaProjectDoc } from '@/types';

const COL_BY_KEY = new Map(VISA_EXPORT_COLUMNS.map((c) => [c.key, c]));

const slug = (s: string) => (s || 'Visa').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 28);

const THIN = { style: 'thin' as const, color: { argb: 'FFD7DEE2' } };
const ALL_BORDERS = { top: THIN, left: THIN, bottom: THIN, right: THIN };

/**
 * Xuất file Excel theo các cột đã chọn (đúng thứ tự `columnKeys`).
 */
export async function exportVisaApplicantListExcel(
  project: VisaProjectDoc,
  applicants: Passenger[],
  columnKeys: string[],
): Promise<void> {
  const cols = columnKeys.map((k) => COL_BY_KEY.get(k)).filter((c): c is VisaExportColumn => !!c);
  if (!cols.length) throw new Error('Chưa chọn cột nào để xuất.');
  const nCol = cols.length;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Viettours Incentives & Events';
  wb.created = new Date();
  const ws = wb.addWorksheet('Danh sách khách', {
    views: [{ state: 'frozen', ySplit: 6 }],
    pageSetup: {
      orientation: nCol > 7 ? 'landscape' : 'portrait',
      fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });
  ws.properties.defaultRowHeight = 18;

  // Bề rộng cột theo registry.
  ws.columns = cols.map((c) => ({ width: c.width }));

  const lastColLetter = ws.getColumn(nCol).letter;

  // ── Khối tiêu đề (rows 1–5) ─────────────────────────────────────────────
  // Hàng 1: logo (ảnh nổi bên trái) + chừa chỗ.
  ws.getRow(1).height = 30;
  try {
    const logoId = wb.addImage({ base64: VTE_LOGO.split(',')[1] ?? VTE_LOGO, extension: 'png' });
    ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 150, height: 40 } });
  } catch { /* logo lỗi vẫn xuất bình thường */ }

  // Hàng 2: tiêu đề lớn.
  ws.mergeCells(`A2:${lastColLetter}2`);
  const titleCell = ws.getCell('A2');
  titleCell.value = 'DANH SÁCH KHÁCH XIN VISA';
  titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF0F3A4A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 26;

  // Hàng 3: tên chương trình + nước.
  ws.mergeCells(`A3:${lastColLetter}3`);
  const subCell = ws.getCell('A3');
  subCell.value = `${project.name || project.code}${project.country ? `  ·  ${project.country}` : ''}`;
  subCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: BRAND_TEAL_ARGB } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(3).height = 18;

  // Hàng 4: dòng thông tin phụ.
  ws.mergeCells(`A4:${lastColLetter}4`);
  const metaCell = ws.getCell('A4');
  const metaParts = [
    `Mã: ${project.code}`,
    project.departureDate ? `Khởi hành: ${fmtDate(project.departureDate)}` : '',
    `Số khách: ${applicants.length}`,
    `Ngày xuất: ${fmtDate(new Date().toISOString())}`,
  ].filter(Boolean);
  metaCell.value = metaParts.join('     ·     ');
  metaCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF8A9099' } };
  metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(5).height = 6; // spacer mảnh

  // ── Hàng tiêu đề bảng (row 6) ───────────────────────────────────────────
  const HEADER_ROW = 6;
  const header = ws.getRow(HEADER_ROW);
  cols.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.label;
    cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_TEAL_ARGB } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = ALL_BORDERS;
  });
  header.height = 26;

  // ── Dữ liệu ─────────────────────────────────────────────────────────────
  applicants.forEach((p, i) => {
    const r = ws.addRow(cols.map((c) => c.value(p, i, project)));
    const overdue = isApplicantOverdue(p);
    r.eachCell({ includeEmpty: true }, (cell, colNo) => {
      const def = cols[colNo - 1];
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF2B3640' } };
      cell.alignment = {
        horizontal: def?.align ?? 'left', vertical: 'middle',
        wrapText: def?.align !== 'center',
      };
      cell.border = ALL_BORDERS;
      if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F9FA' } };
      // Tô đỏ ô "Quá hạn".
      if (def?.key === 'overdue' && overdue) {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFDC3250' } };
      }
    });
  });

  // ── Chân bảng ───────────────────────────────────────────────────────────
  const totalRowIdx = HEADER_ROW + 1 + applicants.length;
  ws.mergeCells(totalRowIdx, 1, totalRowIdx, nCol);
  const totalCell = ws.getCell(totalRowIdx, 1);
  totalCell.value = `Tổng cộng: ${applicants.length} khách`;
  totalCell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF0F3A4A' } };
  totalCell.alignment = { horizontal: 'right', vertical: 'middle' };
  totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9F5F2' } };
  totalCell.border = ALL_BORDERS;

  ws.mergeCells(totalRowIdx + 2, 1, totalRowIdx + 2, nCol);
  const footCell = ws.getCell(totalRowIdx + 2, 1);
  footCell.value = 'VIETTOURS INCENTIVES & EVENTS — Tài liệu nội bộ, vui lòng bảo mật thông tin khách hàng.';
  footCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF8A9099' } };
  footCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Lọc + lặp tiêu đề khi in.
  ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: nCol } };
  ws.pageSetup.printTitlesRow = `${HEADER_ROW}:${HEADER_ROW}`;

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `Danh_sach_khach_visa_${slug(project.name || project.code)}.xlsx`);
}
