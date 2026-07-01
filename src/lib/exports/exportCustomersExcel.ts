/**
 * Xuất DANH SÁCH KHÁCH HÀNG ra Excel — bản trình bày đẹp, thương hiệu Viettours.
 * Xuất đúng danh sách đang lọc/hiển thị ở CustomerView (không kèm PII hộ chiếu).
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { BRAND_TEAL_ARGB, LOGO_H_PX, LOGO_W_PX } from './brand';
import { VTE_LOGO } from './vteLogo';
import { fmtDate } from '@/lib/dateUtils';
import type { Customer } from '@/types';

const THIN = { style: 'thin' as const, color: { argb: 'FFD7DEE2' } };
const ALL_BORDERS = { top: THIN, left: THIN, bottom: THIN, right: THIN };

type Col = { label: string; width: number; align?: 'left' | 'center'; value: (c: Customer, i: number) => string | number };

const typeLabel = (c: Customer) => (c.type === 'company' ? 'Công ty' : 'Cá nhân');
const mainContact = (c: Customer) => (c.contacts ?? []).find((ct) => ct.name || ct.phone || ct.email);
const followUpText = (c: Customer, todayISO: string) => {
  const fu = c.nextFollowUp;
  if (!fu?.date) return '';
  return `${fmtDate(fu.date)}${fu.date < todayISO ? ' (QUÁ HẠN)' : ''}${fu.note ? ` — ${fu.note}` : ''}`;
};

const COLS = (todayISO: string): Col[] => [
  { label: 'STT', width: 6, align: 'center', value: (_c, i) => i + 1 },
  { label: 'Tên khách hàng', width: 30, value: (c) => c.name },
  { label: 'Loại', width: 10, align: 'center', value: typeLabel },
  { label: 'Mã số thuế', width: 16, value: (c) => c.taxCode ?? '' },
  { label: 'Địa chỉ', width: 30, value: (c) => c.address ?? '' },
  { label: 'Người liên hệ', width: 22, value: (c) => { const ct = mainContact(c); return ct ? `${ct.name}${ct.position ? ` (${ct.position})` : ''}` : ''; } },
  { label: 'Điện thoại', width: 15, value: (c) => mainContact(c)?.phone ?? '' },
  { label: 'Email', width: 24, value: (c) => mainContact(c)?.email ?? '' },
  { label: 'Nguồn', width: 16, value: (c) => c.source ?? '' },
  { label: 'Nhãn', width: 18, value: (c) => (c.tags ?? []).join(', ') },
  { label: 'Sales phụ trách', width: 18, value: (c) => c.ownerName || c.createdBy || '' },
  { label: 'Hẹn liên hệ lại', width: 26, value: (c) => followUpText(c, todayISO) },
  { label: 'Lần chăm sóc', width: 12, align: 'center', value: (c) => (c.interactions ?? []).length },
  { label: 'Ghi chú', width: 30, value: (c) => c.note ?? '' },
  { label: 'Ngày tạo', width: 14, align: 'center', value: (c) => (c.createdAt ? fmtDate(c.createdAt) : '') },
];

export async function exportCustomersExcel(customers: Customer[]): Promise<void> {
  const todayISO = new Date().toISOString().slice(0, 10);
  const cols = COLS(todayISO);
  const nCol = cols.length;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Viettours Incentives & Events';
  wb.created = new Date();
  const ws = wb.addWorksheet('Khách hàng', {
    views: [{ state: 'frozen', ySplit: 6 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
  });
  ws.properties.defaultRowHeight = 18;
  ws.columns = cols.map((c) => ({ width: c.width }));
  const lastColLetter = ws.getColumn(nCol).letter;

  ws.getRow(1).height = 36;
  try {
    const logoId = wb.addImage({ base64: VTE_LOGO.split(',')[1] ?? VTE_LOGO, extension: 'png' });
    ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: LOGO_W_PX, height: LOGO_H_PX } });
  } catch { /* logo lỗi vẫn xuất bình thường */ }

  ws.mergeCells(`A2:${lastColLetter}2`);
  const titleCell = ws.getCell('A2');
  titleCell.value = 'DANH SÁCH KHÁCH HÀNG';
  titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF0F3A4A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 26;

  ws.mergeCells(`A3:${lastColLetter}3`);
  const subCell = ws.getCell('A3');
  subCell.value = 'VIETTOURS INCENTIVES & EVENTS';
  subCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: BRAND_TEAL_ARGB } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(3).height = 18;

  ws.mergeCells(`A4:${lastColLetter}4`);
  const metaCell = ws.getCell('A4');
  metaCell.value = [`Số khách hàng: ${customers.length}`, `Ngày xuất: ${fmtDate(new Date().toISOString())}`].join('     ·     ');
  metaCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF8A9099' } };
  metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(5).height = 6;

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

  customers.forEach((c, i) => {
    const r = ws.addRow(cols.map((col) => col.value(c, i)));
    const overdue = !!c.nextFollowUp?.date && c.nextFollowUp.date < todayISO;
    r.eachCell({ includeEmpty: true }, (cell, colNo) => {
      const def = cols[colNo - 1];
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF2B3640' } };
      cell.alignment = { horizontal: def?.align ?? 'left', vertical: 'middle', wrapText: def?.align !== 'center' };
      cell.border = ALL_BORDERS;
      if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F9FA' } };
      if (def?.label === 'Hẹn liên hệ lại' && overdue) {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFDC3250' } };
      }
    });
  });

  const totalRowIdx = HEADER_ROW + 1 + customers.length;
  ws.mergeCells(totalRowIdx, 1, totalRowIdx, nCol);
  const totalCell = ws.getCell(totalRowIdx, 1);
  totalCell.value = `Tổng cộng: ${customers.length} khách hàng`;
  totalCell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF0F3A4A' } };
  totalCell.alignment = { horizontal: 'right', vertical: 'middle' };
  totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9F5F2' } };
  totalCell.border = ALL_BORDERS;

  ws.mergeCells(totalRowIdx + 2, 1, totalRowIdx + 2, nCol);
  const footCell = ws.getCell(totalRowIdx + 2, 1);
  footCell.value = 'VIETTOURS INCENTIVES & EVENTS — Tài liệu nội bộ, vui lòng bảo mật thông tin khách hàng.';
  footCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF8A9099' } };
  footCell.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: nCol } };
  ws.pageSetup.printTitlesRow = `${HEADER_ROW}:${HEADER_ROW}`;

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `Danh_sach_khach_hang_${todayISO}.xlsx`);
}
