/**
 * Xuất "Quyết toán tour" ra Excel (.xlsx) — bảng đối chiếu dự toán ↔ thực chi
 * + lợi nhuận dự kiến vs thật. ExcelJS, brand teal Viettours.
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { BRAND_TEAL_ARGB } from './brand';
import type { QuoteInfo } from '@/types';
import type { SettlementResult } from '@/components/quote/paymentUtils';

export async function exportSettlementExcel({
  info, s, lockedAt, lockedBy, savedBy,
}: {
  info: QuoteInfo;
  s: SettlementResult;
  lockedAt?: string;
  lockedBy?: string;
  savedBy: string;
}): Promise<void> {
  const FONT = 'Aptos';
  const TEAL = BRAND_TEAL_ARGB, NAVY = 'FF0F3A4A', INK = 'FF2B3640', MUTE = 'FF8A9099', WHITE = 'FFFFFFFF';
  const LINE = 'FFE4E8EB', HEAD = 'FFEEF2F4', RED = 'FFDC3250', GREEN = 'FF1B7F4B';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Viettours Tour Cost Calculator';
  wb.created = new Date();
  const ws = wb.addWorksheet('Quyết toán', { views: [{ showGridLines: false }] });

  ws.getColumn(1).width = 34;
  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 20;
  ws.getColumn(4).width = 20;
  ws.getColumn(5).width = 18;

  const money = '#,##0 "đ"';
  const pctFmt = '0.0"%"';
  let r = 1;

  // Title
  ws.mergeCells(r, 1, r, 5);
  const t = ws.getCell(r, 1);
  t.value = 'QUYẾT TOÁN TOUR';
  t.font = { name: FONT, bold: true, size: 16, color: { argb: NAVY } };
  t.alignment = { horizontal: 'left' };
  r++;
  ws.mergeCells(r, 1, r, 5);
  ws.getCell(r, 1).value = 'Đối chiếu dự toán giá vốn ↔ chi thực tế → biên lợi nhuận thật';
  ws.getCell(r, 1).font = { name: FONT, size: 10, color: { argb: MUTE } };
  r += 2;

  const meta = (label: string, value: string) => {
    ws.getCell(r, 1).value = label; ws.getCell(r, 1).font = { name: FONT, bold: true, size: 10, color: { argb: INK } };
    ws.mergeCells(r, 2, r, 5);
    ws.getCell(r, 2).value = value; ws.getCell(r, 2).font = { name: FONT, size: 10, color: { argb: INK } };
    r++;
  };
  meta('Tour', info.name || '—');
  meta('Điểm đến', `${info.dest || '—'} · ${s.pax} khách · ${info.days}N${info.nights}Đ`);
  meta('Trạng thái', lockedAt ? `Đã chốt ${new Date(lockedAt).toLocaleString('vi-VN')}${lockedBy ? ` · ${lockedBy}` : ''}` : `Chưa chốt · xuất bởi ${savedBy}`);
  r++;

  // Bảng hạng mục
  const headRow = ws.getRow(r);
  ['Hạng mục', 'Dự toán', 'Thực chi', 'Chênh lệch', 'Đã trả'].forEach((h, i) => {
    const c = headRow.getCell(i + 1);
    c.value = h;
    c.font = { name: FONT, bold: true, size: 10, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
    c.alignment = { horizontal: i === 0 ? 'left' : 'right' };
  });
  r++;

  const numCell = (row: number, col: number, val: number, opts: { bold?: boolean; color?: string } = {}) => {
    const c = ws.getCell(row, col);
    c.value = val;
    c.numFmt = money;
    c.font = { name: FONT, size: 10, bold: opts.bold, color: { argb: opts.color ?? INK } };
    c.alignment = { horizontal: 'right' };
  };

  s.byCat.forEach((cat) => {
    ws.getCell(r, 1).value = cat.label;
    ws.getCell(r, 1).font = { name: FONT, size: 10, color: { argb: INK } };
    numCell(r, 2, cat.budget);
    numCell(r, 3, cat.actual, { bold: true });
    numCell(r, 4, cat.delta, { bold: true, color: cat.delta > 0 ? RED : cat.delta < 0 ? GREEN : MUTE });
    numCell(r, 5, cat.paid, { color: MUTE });
    r++;
  });

  // Tổng
  ws.getCell(r, 1).value = 'TỔNG GIÁ VỐN';
  ws.getCell(r, 1).font = { name: FONT, bold: true, size: 10.5, color: { argb: NAVY } };
  numCell(r, 2, s.budgetCost, { bold: true, color: NAVY });
  numCell(r, 3, s.actualCost, { bold: true, color: NAVY });
  numCell(r, 4, s.costVariance, { bold: true, color: s.costVariance > 0 ? RED : GREEN });
  numCell(r, 5, s.paidCost, { bold: true, color: NAVY });
  for (let col = 1; col <= 5; col++) ws.getCell(r, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } };
  r += 2;

  // Lợi nhuận dự kiến vs thật
  ws.getCell(r, 1).value = 'LỢI NHUẬN: DỰ KIẾN vs THẬT';
  ws.getCell(r, 1).font = { name: FONT, bold: true, size: 11, color: { argb: NAVY } };
  r++;
  const profHead = ws.getRow(r);
  ['', 'Theo dự toán', 'Theo thực chi'].forEach((h, i) => {
    const c = profHead.getCell(i + 1);
    c.value = h; c.font = { name: FONT, bold: true, size: 10, color: { argb: MUTE } };
    c.alignment = { horizontal: i === 0 ? 'left' : 'right' };
  });
  r++;
  const profRow = (label: string, planned: number, actual: number, fmt: string, opts: { bold?: boolean; color?: string } = {}) => {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = { name: FONT, size: 10, bold: opts.bold, color: { argb: opts.color ?? INK } };
    [planned, actual].forEach((v, i) => {
      const c = ws.getCell(r, 2 + i);
      c.value = fmt === pctFmt ? v : v;
      c.numFmt = fmt;
      c.font = { name: FONT, size: 10, bold: opts.bold, color: { argb: opts.color ?? INK } };
      c.alignment = { horizontal: 'right' };
    });
    r++;
  };
  profRow('Doanh thu thuần', s.netRevenue, s.actualRevenue, money);
  profRow('Giá vốn', s.budgetCost, s.actualCost, money);
  const mColor = s.actualMarginPct < 0 ? RED : s.actualMarginPct < s.plannedMarginPct ? 'FFC2410C' : GREEN;
  profRow('Lãi gộp', s.plannedProfit, s.actualProfit, money, { bold: true, color: NAVY });
  profRow('Biên lợi nhuận %', s.plannedMarginPct, s.actualMarginPct, pctFmt, { bold: true, color: mColor });

  // border nhẹ cho vùng dữ liệu
  for (let row = 1; row <= r; row++) {
    for (let col = 1; col <= 5; col++) {
      const c = ws.getCell(row, col);
      c.border = { bottom: { style: 'hair', color: { argb: LINE } } };
    }
  }

  const slug = (info.name || 'Tour').replace(/[^a-zA-Z0-9_À-ỹ]/g, '_').slice(0, 30);
  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `QuyetToan_${slug}.xlsx`);
}
