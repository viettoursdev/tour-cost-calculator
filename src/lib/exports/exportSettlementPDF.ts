/**
 * Xuất "Quyết toán tour" (đối chiếu dự toán ↔ thực chi → biên lợi thật) ra PDF.
 * jsPDF + DejaVu (loadVNFont) cho tiếng Việt — theo mẫu exportAdvancePDF.
 */
import { jsPDF } from 'jspdf';
import { loadVNFont } from './vnFont';
import { BRAND_TEAL, drawLogo, LOGO_W_MM } from './brand';
import type { QuoteInfo } from '@/types';
import type { SettlementResult } from '@/components/quote/paymentUtils';

type RGB = [number, number, number];
const NAVY: RGB = [15, 58, 74];
const TEAL: RGB = BRAND_TEAL;
const INK: RGB = [43, 54, 64];
const MUTE: RGB = [138, 144, 153];
const LINE: RGB = [215, 222, 226];
const RED: RGB = [220, 50, 80];
const GREEN: RGB = [27, 127, 75];

const vnd = (n: number) => Math.round(n || 0).toLocaleString('vi-VN') + ' đ';
const pct = (n: number) => `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(1)}%`;
const delta = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${vnd(Math.abs(n))}`;

export function exportSettlementPDF({
  info, s, lockedAt, lockedBy, savedBy,
}: {
  info: QuoteInfo;
  s: SettlementResult;
  lockedAt?: string;
  lockedBy?: string;
  savedBy: string;
}): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const hasFont = loadVNFont(pdf);
  const FONT = hasFont ? 'DejaVu' : 'helvetica';
  const setF = (st = 'normal') => pdf.setFont(FONT, st);
  const PW = 210, PH = 297, M = 14;
  const CW = PW - 2 * M;
  let y = M;
  const ensure = (h: number) => { if (y + h > PH - M) { pdf.addPage(); y = M; } };

  // ── Header ──
  const logoBottom = drawLogo(pdf, M, y);
  const brandX = M + LOGO_W_MM + 5;
  setF('bold'); pdf.setFontSize(12); pdf.setTextColor(...TEAL);
  pdf.text('VIETTOURS INCENTIVES & EVENTS', brandX, y + 6);
  setF('normal'); pdf.setFontSize(8.5); pdf.setTextColor(...MUTE);
  pdf.text('Hotline 091 951 7777 · www.viettours.com.vn', brandX, y + 11);
  y = logoBottom + 6;

  setF('bold'); pdf.setFontSize(16); pdf.setTextColor(...NAVY);
  pdf.text('QUYẾT TOÁN TOUR', PW / 2, y, { align: 'center' });
  y += 6;
  setF('normal'); pdf.setFontSize(9); pdf.setTextColor(...MUTE);
  pdf.text('Đối chiếu dự toán giá vốn ↔ chi thực tế', PW / 2, y, { align: 'center' });
  y += 8;

  setF('normal'); pdf.setFontSize(10); pdf.setTextColor(...INK);
  const meta = [
    `Tour: ${info.name || '—'}`,
    `Điểm đến: ${info.dest || '—'}   ·   Số khách: ${s.pax}   ·   ${info.days}N${info.nights}Đ`,
    lockedAt
      ? `Đã chốt: ${new Date(lockedAt).toLocaleString('vi-VN')}${lockedBy ? `   ·   Người chốt: ${lockedBy}` : ''}`
      : `Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}   ·   Người xuất: ${savedBy}   ·   (CHƯA chốt)`,
  ];
  meta.forEach((line) => { pdf.text(line, M, y); y += 5.5; });
  y += 2;

  // ── Bảng đối chiếu hạng mục ──
  const cols = [
    { w: 60, a: 'left' as const },
    { w: 38, a: 'right' as const },
    { w: 38, a: 'right' as const },
    { w: CW - 136, a: 'right' as const },
  ];
  const heads = ['Hạng mục', 'Dự toán', 'Thực chi', 'Chênh lệch'];
  const xAt = (i: number) => M + cols.slice(0, i).reduce((acc, c) => acc + c.w, 0);
  const cellText = (txt: string, i: number, ry: number, color: RGB = INK, bold = false) => {
    setF(bold ? 'bold' : 'normal'); pdf.setTextColor(...color);
    const c = cols[i];
    const x = c.a === 'right' ? xAt(i) + c.w - 1 : xAt(i) + 1;
    pdf.text(txt, x, ry, { align: c.a });
  };

  setF('bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTE);
  heads.forEach((h, i) => cellText(h, i, y, MUTE, true));
  y += 2; pdf.setDrawColor(...LINE); pdf.line(M, y, M + CW, y); y += 4.5;

  pdf.setFontSize(9.5);
  s.byCat.forEach((c) => {
    ensure(7);
    const dColor = c.delta > 0 ? RED : c.delta < 0 ? GREEN : MUTE;
    cellText(c.label, 0, y);
    cellText(vnd(c.budget), 1, y);
    cellText(vnd(c.actual), 2, y, INK, true);
    cellText(c.delta === 0 ? '—' : delta(c.delta), 3, y, dColor, true);
    y += 6;
  });

  pdf.setDrawColor(...LINE); pdf.line(M, y, M + CW, y); y += 5;
  cellText('TỔNG GIÁ VỐN', 0, y, NAVY, true);
  cellText(vnd(s.budgetCost), 1, y, NAVY, true);
  cellText(vnd(s.actualCost), 2, y, NAVY, true);
  cellText(s.costVariance === 0 ? '—' : delta(s.costVariance), 3, y, s.costVariance > 0 ? RED : GREEN, true);
  y += 9;

  // ── Lợi nhuận: dự kiến vs thật ──
  ensure(50);
  setF('bold'); pdf.setFontSize(11); pdf.setTextColor(...NAVY);
  pdf.text('Lợi nhuận: dự kiến vs thật', M, y); y += 7;

  const row = (label: string, planned: string, actual: string, color: RGB = INK, bold = false) => {
    setF(bold ? 'bold' : 'normal'); pdf.setFontSize(bold ? 10.5 : 10); pdf.setTextColor(...color);
    pdf.text(label, M, y);
    pdf.text(planned, M + 110, y, { align: 'right' });
    pdf.text(actual, M + CW, y, { align: 'right' });
    y += 6.5;
  };
  setF('bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTE);
  pdf.text('Theo dự toán', M + 110, y, { align: 'right' });
  pdf.text('Theo thực chi', M + CW, y, { align: 'right' });
  y += 5.5;
  row('Doanh thu thuần', vnd(s.netRevenue), vnd(s.actualRevenue) + (s.revenueOverridden ? ' *' : ''));
  row('Giá vốn', vnd(s.budgetCost), vnd(s.actualCost));
  pdf.setDrawColor(...LINE); pdf.line(M, y - 2, M + CW, y - 2); y += 1;
  row('Lãi gộp', vnd(s.plannedProfit), vnd(s.actualProfit), NAVY, true);
  const mColor: RGB = s.actualMarginPct < 0 ? RED : s.actualMarginPct < s.plannedMarginPct ? [194, 65, 12] : GREEN;
  row('Biên lợi nhuận', pct(s.plannedMarginPct), pct(s.actualMarginPct), mColor, true);

  y += 2;
  setF('normal'); pdf.setFontSize(8); pdf.setTextColor(...MUTE);
  pdf.text(`Đã thực chi tiền cho NCC: ${vnd(s.paidCost)} / ${vnd(s.actualCost)}`, M, y); y += 4.5;
  if (s.revenueOverridden) { pdf.text('* Doanh thu thực do người dùng nhập (khác giá báo giá).', M, y); y += 4.5; }
  pdf.text('Doanh thu thuần = giá bán cả đoàn − VAT. Lãi gộp = doanh thu thuần − giá vốn (chưa trừ chi phí quản lý/bán hàng).',
    M, y, { maxWidth: CW }); y += 8;

  // ── Chữ ký ──
  ensure(34); y = Math.max(y, PH - 42);
  const cx = [M + 28, PW / 2, PW - M - 28];
  const titles = ['NGƯỜI LẬP', 'KẾ TOÁN', 'BAN GIÁM ĐỐC'];
  setF('bold'); pdf.setFontSize(10); pdf.setTextColor(...NAVY);
  titles.forEach((tt, i) => pdf.text(tt, cx[i], y, { align: 'center' }));
  setF('normal'); pdf.setFontSize(8); pdf.setTextColor(...MUTE);
  cx.forEach((x) => pdf.text('(Ký, ghi rõ họ tên)', x, y + 5, { align: 'center' }));
  if (lockedBy) { setF('normal'); pdf.setFontSize(9); pdf.setTextColor(...INK); pdf.text(lockedBy, cx[0], y + 24, { align: 'center' }); }

  const slug = (info.name || 'Tour').replace(/[^a-zA-Z0-9_À-ỹ]/g, '_').slice(0, 30);
  pdf.save(`QuyetToan_${slug}.pdf`);
}
