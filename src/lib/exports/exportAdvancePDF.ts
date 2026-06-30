/**
 * Xuất "Đề nghị tạm ứng tour" (kèm quyết toán nếu có) ra PDF để trình duyệt.
 * jsPDF + DejaVu (loadVNFont) cho tiếng Việt — theo mẫu exportItineraryExecutionPDF.
 */
import { jsPDF } from 'jspdf';
import { loadVNFont } from './vnFont';
import { BRAND_TEAL, BRAND_HOTLINE, drawLogo, LOGO_W_MM } from './brand';
import type { AdvanceLine, QuoteInfo, TourAdvance } from '@/types';
import type { AdvanceTotals } from '@/components/quote/advanceCalc';
import { lineAmount, lineActual } from '@/components/quote/advanceCalc';

type RGB = [number, number, number];
const NAVY: RGB = [15, 58, 74];
const TEAL: RGB = BRAND_TEAL;
const INK: RGB = [43, 54, 64];
const MUTE: RGB = [138, 144, 153];
const LINE: RGB = [215, 222, 226];

const vnd = (n: number) => (n || 0).toLocaleString('vi-VN') + ' đ';

export function exportAdvancePDF({
  info, pax, adv, totals, rates, savedBy,
}: {
  info: QuoteInfo; pax: number; adv: TourAdvance; totals: AdvanceTotals; rates: Record<string, number>; savedBy: string;
}): void {
  const priceLabel = (l: AdvanceLine) => `${(l.price || 0).toLocaleString('vi-VN')} ${l.cur && l.cur !== 'VND' ? l.cur : 'đ'}`;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const hasFont = loadVNFont(pdf);
  const FONT = hasFont ? 'DejaVu' : 'helvetica';
  const setF = (s = 'normal') => pdf.setFont(FONT, s);
  const PW = 210, PH = 297, M = 14;
  const CW = PW - 2 * M;
  let y = M;
  const ensure = (h: number) => { if (y + h > PH - M) { pdf.addPage(); y = M; } };
  const showActual = adv.status !== 'draft';

  // ── Header (logo chuẩn 46.5×12.5mm + chữ bên phải, không đè) ──
  const logoBottom = drawLogo(pdf, M, y);
  const brandX = M + LOGO_W_MM + 5;
  setF('bold'); pdf.setFontSize(12); pdf.setTextColor(...TEAL);
  pdf.text('VIETTOURS INCENTIVES & EVENTS', brandX, y + 6);
  setF('normal'); pdf.setFontSize(8.5); pdf.setTextColor(...MUTE);
  pdf.text(`Hotline ${BRAND_HOTLINE} · www.viettours.com.vn`, brandX, y + 11);
  y = logoBottom + 6;

  setF('bold'); pdf.setFontSize(16); pdf.setTextColor(...NAVY);
  pdf.text('ĐỀ NGHỊ TẠM ỨNG TOUR', PW / 2, y, { align: 'center' });
  y += 9;

  setF('normal'); pdf.setFontSize(10); pdf.setTextColor(...INK);
  const meta = [
    `Tour: ${info.name || '—'}`,
    `Điểm đến: ${info.dest || '—'}   ·   Số khách: ${pax}   ·   ${info.days}N${info.nights}Đ`,
    `Ngày đề nghị: ${adv.requestedAt ? new Date(adv.requestedAt).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN')}`
      + (adv.requestedBy ? `   ·   Người đề nghị: ${adv.requestedBy}` : ''),
  ];
  meta.forEach((line) => { pdf.text(line, M, y); y += 5.5; });
  y += 2;

  // ── Tables ──
  const cols = showActual
    ? [{ w: 70, a: 'left' as const }, { w: 18, a: 'center' as const }, { w: 30, a: 'right' as const }, { w: 34, a: 'right' as const }, { w: 30, a: 'right' as const }]
    : [{ w: 86, a: 'left' as const }, { w: 20, a: 'center' as const }, { w: 36, a: 'right' as const }, { w: 40, a: 'right' as const }];
  const heads = showActual ? ['Hạng mục', 'SL', 'Đơn giá', 'Dự toán', 'Quyết toán'] : ['Hạng mục', 'SL', 'Đơn giá', 'Dự toán'];

  const xAt = (i: number) => M + cols.slice(0, i).reduce((s, c) => s + c.w, 0);
  const cellText = (txt: string, i: number, ry: number, bold = false) => {
    setF(bold ? 'bold' : 'normal');
    const c = cols[i];
    const x = c.a === 'right' ? xAt(i) + c.w - 1 : c.a === 'center' ? xAt(i) + c.w / 2 : xAt(i) + 1;
    const lines = pdf.splitTextToSize(txt, c.w - 2) as string[];
    pdf.text(lines, x, ry, { align: c.a });
    return lines.length;
  };

  const drawTable = (title: string, lines: AdvanceLine[]) => {
    ensure(18);
    setF('bold'); pdf.setFontSize(11); pdf.setTextColor(...NAVY);
    pdf.text(title, M, y); y += 6;
    // header row
    setF('bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTE);
    heads.forEach((h, i) => cellText(h, i, y));
    y += 2; pdf.setDrawColor(...LINE); pdf.line(M, y, M + CW, y); y += 4;
    setF('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...INK);
    if (lines.length === 0) { pdf.setTextColor(...MUTE); pdf.text('(chưa có)', M + 1, y); y += 6; }
    lines.forEach((l) => {
      ensure(8);
      const cells = showActual
        ? [l.name || '—', String(l.qty || 0), priceLabel(l), vnd(lineAmount(l, rates)), vnd(lineActual(l, rates))]
        : [l.name || '—', String(l.qty || 0), priceLabel(l), vnd(lineAmount(l, rates))];
      const n = Math.max(...cells.map((txt, i) => cellText(txt, i, y)));
      if (l.note) { pdf.setTextColor(...MUTE); pdf.setFontSize(8); pdf.text(pdf.splitTextToSize(l.note, cols[0].w - 2) as string[], M + 1, y + 4); pdf.setFontSize(9.5); pdf.setTextColor(...INK); }
      y += 5.5 * n + (l.note ? 4 : 0);
    });
    y += 3;
  };

  drawTable('① Chi phí đi tour', adv.tourCosts);
  drawTable('② Chi phí thanh toán khác', adv.otherCosts);

  // ── Totals ──
  ensure(40);
  pdf.setDrawColor(...LINE); pdf.line(M, y, M + CW, y); y += 6;
  const totRow = (label: string, val: string, bold = false, color: RGB = INK) => {
    setF(bold ? 'bold' : 'normal'); pdf.setFontSize(bold ? 11 : 10); pdf.setTextColor(...color);
    pdf.text(label, M + 80, y); pdf.text(val, M + CW, y, { align: 'right' }); y += 6.5;
  };
  totRow('Tổng chi phí đi tour', vnd(totals.tourTotal));
  totRow('Tổng chi phí khác', vnd(totals.otherTotal));
  totRow('TỔNG DỰ TOÁN', vnd(totals.grandTotal), true, NAVY);
  totRow('SỐ TIỀN ĐỀ NGHỊ TẠM ỨNG', vnd(adv.advanceRequested || totals.grandTotal), true, [209, 138, 19]);
  if (showActual) {
    totRow('Tổng quyết toán (thực tế)', vnd(totals.actualTotal), true, [194, 65, 12]);
    totRow(totals.balance >= 0 ? 'Hoàn lại công ty' : 'Chi vượt — cần chi thêm', vnd(Math.abs(totals.balance)), true, totals.balance >= 0 ? [27, 127, 75] : [220, 50, 80]);
  }

  if (adv.note) {
    y += 2; ensure(14); setF('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...INK);
    pdf.text('Ghi chú: ', M, y);
    pdf.text(pdf.splitTextToSize(adv.note, CW - 18) as string[], M + 16, y); y += 8;
  }

  // ── Signatures: người đề nghị + 2 người duyệt ──
  ensure(34); y = Math.max(y, PH - 42);
  const cx = [M + 22, PW / 2, PW - M - 22];
  const titles = ['NGƯỜI ĐỀ NGHỊ', 'NGƯỜI DUYỆT 1', 'NGƯỜI DUYỆT 2'];
  const names = [adv.requestedBy || savedBy, adv.approver1?.name ?? '', adv.approver2?.name ?? ''];
  setF('bold'); pdf.setFontSize(10); pdf.setTextColor(...NAVY);
  titles.forEach((tt, i) => pdf.text(tt, cx[i], y, { align: 'center' }));
  setF('normal'); pdf.setFontSize(8); pdf.setTextColor(...MUTE);
  cx.forEach((x) => pdf.text('(Ký, ghi rõ họ tên)', x, y + 5, { align: 'center' }));
  setF('normal'); pdf.setFontSize(9); pdf.setTextColor(...INK);
  names.forEach((nm, i) => { if (nm) pdf.text(nm, cx[i], y + 24, { align: 'center' }); });

  const slug = (info.name || 'Tour').replace(/[^a-zA-Z0-9_À-ỹ]/g, '_').slice(0, 30);
  pdf.save(`DeNghiTamUng_${slug}.pdf`);
}
