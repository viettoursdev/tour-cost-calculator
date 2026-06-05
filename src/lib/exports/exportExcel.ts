/**
 * Export the active quote draft to a formatted Excel (.xlsx) file.
 * Uses ExcelJS (same library as legacy exportExcelPro at public/legacy.html:2748).
 * Supports domestic and international templates.
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { getCATS } from '@/components/quote/constants';
import type { Item, QuoteDraft } from '@/types';

type ExportParams = {
  draft: QuoteDraft;
  savedBy: { name: string; role: string };
};

export async function exportExcelQuote({ draft, savedBy }: ExportParams): Promise<void> {
  const { info, items, rates, pax, catEnabled, margin, vat, svcBasis, template } = draft;
  if (!template || template === 'dmc') return;

  const foreign = template === 'intl';
  const FONT = 'Calibri';
  const NAVY = 'FF0F3A4A', TEAL = 'FF14A08C', INK = 'FF2B3640', MUTE = 'FF8A9099', WHITE = 'FFFFFFFF';
  const ZEBRA = 'FFF7F9FA', LINE = 'FFE4E8EB', SUBT = 'FFEEF2F4', HILITE = 'FFF4FAF8', YEL = 'FFFFFBE6';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Viettours Tour Cost Calculator';
  wb.created = new Date();

  const ws = wb.addWorksheet(foreign ? 'Báo giá Nước Ngoài' : 'Báo giá Nội Địa', {
    views: [{ showGridLines: false }],
  });

  const ncol = foreign ? 11 : 9;
  const COLW = foreign
    ? [6, 20, 38, 30, 8, 13, 14, 8, 7, 11, 16]
    : [6, 20, 40, 34, 16, 9, 8, 12, 17];
  COLW.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const col = (n: number) => String.fromCharCode(64 + n);
  const LAST = col(ncol);
  const fnt = (o: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FONT, size: 10, color: { argb: INK }, ...o });
  const fill = (c: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } });
  const hair: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: LINE } };
  const cen: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };
  const cv: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' };
  const rt: Partial<ExcelJS.Alignment> = { horizontal: 'right', vertical: 'middle' };
  const lf: Partial<ExcelJS.Alignment> = { horizontal: 'left', vertical: 'middle', wrapText: true };

  // ── Row 1: company header ──
  ws.getRow(1).height = 44;
  ws.mergeCells(`C1:${LAST}1`);
  const t = ws.getCell('C1');
  t.value = 'BẢNG BÁO GIÁ DỊCH VỤ DU LỊCH';
  t.font = fnt({ size: 16, bold: true, color: { argb: NAVY } });
  t.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.mergeCells(`C2:${LAST}2`);
  const sub = ws.getCell('C2');
  sub.value = 'VIETTOURS INCENTIVES & EVENTS   ·   Hotline 1900 1839   ·   www.viettours.com.vn';
  sub.font = fnt({ size: 8.5, color: { argb: TEAL } });
  sub.alignment = { horizontal: 'left' };
  for (let c = 1; c <= ncol; c++) {
    ws.getCell(3, c).border = { bottom: { style: 'medium', color: { argb: NAVY } } };
  }

  // ── Rate block (foreign only) ──
  const rateCell: Record<string, string> = {};
  if (foreign) {
    const used: string[] = [];
    getCATS(template).forEach(cat => {
      (items[cat.id as keyof typeof items] ?? []).forEach((it: Item) => {
        if (it.enabled !== false && !it.foc && it.cur !== 'VND' && !used.includes(it.cur)) used.push(it.cur);
      });
    });
    const j3 = ws.getCell('J3');
    j3.value = 'TỶ GIÁ → VND'; j3.font = fnt({ size: 8, bold: true, color: { argb: MUTE } }); j3.alignment = rt;
    let rb = 4;
    used.forEach(cur => {
      const jc = ws.getCell(`J${rb}`); jc.value = cur; jc.font = fnt({ size: 9 }); jc.alignment = rt;
      const kc = ws.getCell(`K${rb}`); kc.value = rates[cur] || 0; kc.numFmt = '#,##0';
      kc.font = fnt({ size: 9, bold: true }); kc.alignment = rt; kc.fill = fill(YEL);
      rateCell[cur] = `$K$${rb}`; rb++;
    });
  }

  // ── Info block ──
  const b4 = ws.getCell('B4');
  b4.value = info.name || (foreign ? 'Tour' : 'Tour');
  b4.font = fnt({ size: 13, bold: true, color: { argb: NAVY } });
  ws.mergeCells(foreign ? 'C5:E5' : 'C5:D5');
  const infoRows: [string, string | number][] = [
    ['Điểm đến:', info.dest || ''],
    ['Số khách:', pax],
    ['Thời gian:', `${info.days}N${info.nights}Đ`],
    ['Phụ trách:', `${savedBy.name} (${savedBy.role})`],
    ['Ngày xuất:', new Date().toLocaleDateString('vi-VN')],
  ];
  let rr = 5;
  infoRows.forEach(([lab, val]) => {
    const lc = ws.getCell(rr, 2); lc.value = lab; lc.font = fnt({ size: 10, color: { argb: MUTE } });
    const vc = ws.getCell(rr, 3); vc.value = val; vc.font = fnt({ size: 10, bold: true });
    rr++;
  });

  // ── Table header ──
  const H = 11;
  const heads = foreign
    ? ['STT', 'Hạng mục', 'Chi tiết dịch vụ', 'Ghi chú', 'NT', 'Đơn giá (NT)', 'Đơn giá (VNĐ)', 'SL', 'Lần', 'ĐVT', 'Thành tiền (VNĐ)']
    : ['STT', 'Hạng mục', 'Chi tiết dịch vụ', 'Ghi chú', 'Đơn giá (VNĐ)', 'SL', 'Lần', 'ĐVT', 'Thành tiền (VNĐ)'];
  heads.forEach((h, i) => {
    const c = ws.getCell(H, i + 1);
    c.value = h; c.font = fnt({ size: 9.5, bold: true, color: { argb: WHITE } });
    c.fill = fill(NAVY); c.alignment = cen;
    c.border = { top: { style: 'thin', color: { argb: NAVY } }, bottom: { style: 'thin', color: { argb: NAVY } }, left: { style: 'thin', color: { argb: NAVY } }, right: { style: 'thin', color: { argb: NAVY } } };
  });
  ws.getRow(H).height = 28;

  // ── Items ──
  const qtyOf = (it: Item) => it.qtyMode === 'per_pax' ? pax : it.qtyMode === 'per_group' ? 1 : (it.customQty || 1);
  let r = H + 1; const first = r; let idx = 0;
  getCATS(template).forEach(cat => {
    if (catEnabled[cat.id as keyof typeof catEnabled] === false) return;
    const rows = (items[cat.id as keyof typeof items] ?? []).filter((it: Item) => it.enabled !== false && !it.foc);
    if (rows.length === 0) return;
    rows.forEach((it: Item, j: number) => {
      const zebra = idx % 2 ? ZEBRA : WHITE;
      ws.getCell(r, 1).value = r === first ? 1 : { formula: `A${r - 1}+1` } as ExcelJS.CellFormulaValue;
      ws.getCell(r, 2).value = j === 0 ? cat.label : '';
      ws.getCell(r, 3).value = it.name || '';
      ws.getCell(r, 4).value = it.note || '';
      if (foreign) {
        ws.getCell(r, 5).value = it.cur;
        ws.getCell(r, 6).value = +it.price || 0; ws.getCell(r, 6).numFmt = '#,##0.##';
        ws.getCell(r, 7).value = it.cur === 'VND'
          ? { formula: `F${r}` }
          : { formula: `F${r}*${rateCell[it.cur] || 1}` } as ExcelJS.CellFormulaValue;
        ws.getCell(r, 7).numFmt = '#,##0';
        ws.getCell(r, 8).value = qtyOf(it);
        ws.getCell(r, 9).value = +it.times || 1;
        ws.getCell(r, 10).value = (it.unit || '').replace(/^\//, '');
        ws.getCell(r, 11).value = { formula: `G${r}*H${r}*I${r}` } as ExcelJS.CellFormulaValue;
        ws.getCell(r, 11).numFmt = '#,##0';
      } else {
        const vndPrice = Math.round((+it.price || 0) * (rates[it.cur] || 1));
        ws.getCell(r, 5).value = vndPrice; ws.getCell(r, 5).numFmt = '#,##0';
        ws.getCell(r, 6).value = qtyOf(it);
        ws.getCell(r, 7).value = +it.times || 1;
        ws.getCell(r, 8).value = (it.unit || '').replace(/^\//, '');
        ws.getCell(r, 9).value = { formula: `E${r}*F${r}*G${r}` } as ExcelJS.CellFormulaValue;
        ws.getCell(r, 9).numFmt = '#,##0';
      }
      for (let c = 1; c <= ncol; c++) {
        const cc = ws.getCell(r, c);
        cc.fill = fill(zebra); cc.border = { bottom: hair }; cc.font = fnt({ size: 9.5 });
        if (c === 1) cc.alignment = cv;
        else if (c === 3 || c === 4) cc.alignment = lf;
        else if (c === ncol) cc.alignment = rt;
        else cc.alignment = cv;
        if (c === 2 && j === 0) cc.font = fnt({ size: 9.5, bold: true, color: { argb: TEAL } });
      }
      ws.getRow(r).height = String(it.name || '').includes('\n') ? 28 : 19;
      r++; idx++;
    });
  });
  const last = r - 1;
  const KC = LAST;

  // ── Totals ──
  const trow = (rw: number, lab: string, val: number | ExcelJS.CellFormulaValue | string, emphasis?: string) => {
    ws.mergeCells(`B${rw}:${col(ncol - 1)}${rw}`);
    const lc = ws.getCell(rw, 2); lc.value = lab; lc.alignment = rt;
    const kc = ws.getCell(rw, ncol); kc.value = val as ExcelJS.CellValue; kc.alignment = rt;
    if (typeof val === 'object' && val !== null && 'formula' in val) kc.numFmt = '#,##0';
    if (emphasis === 'sub') {
      for (let c = 2; c <= ncol; c++) ws.getCell(rw, c).fill = fill(SUBT);
      lc.font = fnt({ bold: true }); kc.font = fnt({ bold: true }); kc.numFmt = '#,##0';
    } else if (emphasis === 'grand') {
      for (let c = 2; c <= ncol; c++) ws.getCell(rw, c).fill = fill(NAVY);
      lc.font = fnt({ size: 12, bold: true, color: { argb: WHITE } });
      kc.font = fnt({ size: 12, bold: true, color: { argb: WHITE } }); kc.numFmt = '#,##0';
    } else if (emphasis === 'ppax') {
      for (let c = 2; c <= ncol; c++) ws.getCell(rw, c).fill = fill(HILITE);
      lc.font = fnt({ size: 11, bold: true, color: { argb: TEAL } });
      kc.font = fnt({ size: 11, bold: true, color: { argb: TEAL } }); kc.numFmt = '#,##0';
    } else {
      lc.font = fnt(); kc.font = fnt();
    }
    return rw;
  };

  const sumf: ExcelJS.CellFormulaValue = { formula: `SUM(${KC}${first}:${KC}${last})` };
  const subR = trow(r, 'Tổng chi phí (chưa gồm phí QL & VAT)', sumf, 'sub'); r++;
  const mgR = trow(r, `Phí quản lý (${margin}%)`, { formula: `${KC}${subR}*${margin / 100}` } as ExcelJS.CellFormulaValue); r++;
  let grR: number;
  if (foreign) {
    trow(r, 'Thuế VAT', 'Đã bao gồm'); ws.getCell(r, ncol).font = fnt({ italic: true, color: { argb: MUTE } }); r++;
    grR = trow(r, 'TỔNG CỘNG', { formula: `SUM(${KC}${subR}:${KC}${mgR})` } as ExcelJS.CellFormulaValue, 'grand'); r++;
  } else {
    const vtR = trow(r, `Thuế VAT (${vat}%)`, { formula: `SUM(${KC}${subR}:${KC}${mgR})*${vat / 100}` } as ExcelJS.CellFormulaValue); r++;
    grR = trow(r, 'TỔNG CỘNG', { formula: `SUM(${KC}${subR}:${KC}${vtR})` } as ExcelJS.CellFormulaValue, 'grand'); r++;
  }
  trow(r, 'GIÁ / KHÁCH', { formula: `${KC}${grR}/${pax}` } as ExcelJS.CellFormulaValue, 'ppax'); r += 2;

  // ── Service sections ──
  const INC = [
    'Vé máy bay khứ hồi hạng phổ thông theo hành trình, gồm hành lý ký gửi.',
    'Thuế sân bay Việt Nam & nước ngoài và lệ phí an ninh hàng không.',
    'Khách sạn tiêu chuẩn 4* hoặc tương đương: 2 khách 1 phòng.',
    'Xe di chuyển và vé tham quan các nơi theo chương trình.',
    'Hướng dẫn viên địa phương theo chương trình.',
    'Bảo hiểm du lịch mức bồi thường tối đa 50.000 USD/trường hợp.',
    'Visa nhập cảnh (nếu có trong chương trình).',
  ];
  const EXC = [
    'Chi phí làm hộ chiếu (còn hạn trên 6 tháng).',
    'Bữa ăn ngoài chương trình.',
    'Tiền điện thoại, Internet, Mini bar, Giặt ủi.',
    'Hành lý quá cước và chi phí cá nhân.',
    'Phụ thu phòng đơn.',
  ];
  const PAY = [
    'Đợt 1: Cọc 50% trong 07 ngày sau khi ký hợp đồng.',
    'Đợt 2: 50% còn lại, chậm nhất 03 ngày trước khởi hành.',
  ];

  const section = (rw: number, title: string, lines: string[], marker: string) => {
    const c = ws.getCell(rw, 2);
    c.value = title; c.font = fnt({ size: 10.5, bold: true, color: { argb: NAVY } });
    ws.mergeCells(`B${rw}:${LAST}${rw}`);
    c.border = { bottom: { style: 'thin', color: { argb: TEAL } } };
    rw++;
    lines.forEach(ln => {
      const cc = ws.getCell(rw, 2);
      cc.value = `${marker}  ${ln}`; cc.font = fnt({ size: 9 }); cc.alignment = { wrapText: true, vertical: 'top' };
      ws.mergeCells(`B${rw}:${LAST}${rw}`); ws.getRow(rw).height = 14; rw++;
    });
    return rw + 1;
  };

  r = section(r, 'GIÁ BAO GỒM / INCLUSIONS', INC, '✓');
  r = section(r, 'KHÔNG BAO GỒM / EXCLUSIONS', EXC, '✕');
  r = section(r, 'ĐIỀU KHOẢN THANH TOÁN / PAYMENT TERMS', PAY, '•');
  r++;
  const fc = ws.getCell(r, 2);
  fc.value = foreign
    ? 'Báo giá có hiệu lực 07 ngày kể từ ngày xuất. Giá có thể thay đổi theo tỷ giá tại thời điểm xuất vé.'
    : 'Báo giá có hiệu lực 07 ngày kể từ ngày xuất.';
  fc.font = fnt({ size: 8, italic: true, color: { argb: MUTE } });
  ws.mergeCells(`B${r}:${LAST}${r}`);

  // ── Hidden metadata sheet for round-trip import ──
  try {
    const meta = wb.addWorksheet('_vtemeta', { state: 'veryHidden' });
    meta.getCell('A1').value = 'VTE_QUOTE_V1';
    meta.getCell('A2').value = JSON.stringify({ template, info, pax, rates, margin, vat, svcBasis: svcBasis || 0, rounding: draft.rounding || 100000, catEnabled, items });
  } catch (_e) { /* ignore */ }

  // ── Save ──
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const safeName = (info.name || 'Tour').replace(/[^a-zA-Z0-9_]/g, '_');
  const dateStr = new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');
  saveAs(blob, `BaoGia_${safeName}_${dateStr}.xlsx`);
}
