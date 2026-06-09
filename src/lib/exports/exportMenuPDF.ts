/**
 * Export a Menu as a PDF.
 * Source: public/legacy.html:7163-7236.
 * Helvetica only + ASCII-stripped Vietnamese (matches the existing PDF convention).
 * Skips the gradient-fill effect — uses flat fills for the same layout.
 */
import { jsPDF } from 'jspdf';
import type { Menu } from '@/types';

type RGB = [number, number, number];

const NAVY: RGB = [15, 58, 74];
const TEAL: RGB = [20, 160, 140];
const PURP: RGB = [194, 65, 12];
const INK: RGB = [43, 54, 64];
const MUTE: RGB = [138, 144, 153];
const WHITE: RGB = [255, 255, 255];
const SUG_FILL: RGB = [218, 240, 233];
const ADJ_FILL: RGB = [252, 221, 194];

export function exportMenuPDF(it: Menu, code: string): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const FONT = 'helvetica';
  const setF = (style = 'normal') => pdf.setFont(FONT, style);
  const PW = 210, PH = 297, M = 14;
  const CW = PW - 2 * M;
  const money = (n: number, cur: string) => ((+n || 0).toLocaleString('vi-VN')) + ' ' + (cur || 'VND');
  let y = M;

  const ensure = (h: number) => {
    if (y + h > PH - M) { pdf.addPage(); y = M; }
  };

  // Header (no logo image)
  setF('bold'); pdf.setFontSize(13); pdf.setTextColor(...TEAL);
  pdf.text('VIETTOURS INCENTIVES & EVENTS', M, y + 6);
  setF('normal'); pdf.setFontSize(7); pdf.setTextColor(...MUTE);
  pdf.text('Tour Cost Calculator', M, y + 11);

  setF('bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTE);
  pdf.text('MA THUC DON', PW - M, y + 5, { align: 'right' });
  pdf.setFontSize(13); pdf.setTextColor(...NAVY);
  pdf.text(code, PW - M, y + 12, { align: 'right' });
  y += 22;

  setF('normal'); pdf.setFontSize(10); pdf.setTextColor(...MUTE);
  pdf.text('THUC DON CHUONG TRINH', PW / 2, y, { align: 'center' });
  y += 8;
  setF('bold'); pdf.setFontSize(20); pdf.setTextColor(...NAVY);
  pdf.text((it.destination || it.title || 'THUC DON').toUpperCase(), PW / 2, y, { align: 'center' });
  y += 7;

  const sub: string[] = [];
  if (it.days) sub.push(`${it.days} ngay`);
  if (it.linkedItineraryName) sub.push('CT: ' + it.linkedItineraryName);
  if (it.linkedQuoteName) sub.push('BG: ' + it.linkedQuoteName);
  if (sub.length) {
    setF('normal'); pdf.setFontSize(9); pdf.setTextColor(...TEAL);
    pdf.text(sub.join('   ·   '), PW / 2, y, { align: 'center' });
    y += 5;
  }
  pdf.setDrawColor(...TEAL); pdf.setLineWidth(0.5); pdf.line(M, y, PW - M, y);
  y += 6;

  const totals: Record<string, number> = {};

  (it.schedule ?? []).forEach((d) => {
    ensure(14);
    pdf.setFillColor(...NAVY); pdf.rect(M, y, CW, 8, 'F');
    setF('bold'); pdf.setFontSize(11); pdf.setTextColor(...WHITE);
    let dl = `NGAY ${d.dayNum}`;
    if (d.date) dl += '   ·   ' + d.date;
    if (d.city) dl += '   ·   ' + d.city;
    pdf.text(dl, M + 3, y + 5.6);
    y += 11;

    (d.meals ?? []).forEach((meal) => {
      const sCur = meal.suggestedCur || meal.cur || 'VND';
      const aCur = meal.adjustedCur || meal.cur || 'VND';
      ensure(12);
      setF('bold'); pdf.setFontSize(10); pdf.setTextColor(...TEAL);
      let mh = meal.mealType || 'Bua an';
      if (meal.restaurantName) mh += '  —  ' + meal.restaurantName;
      if (meal.city) mh += '  (' + meal.city + ')';
      const lines: string[] = pdf.splitTextToSize(mh, CW);
      pdf.text(lines[0], M, y + 3);
      y += 6;

      const colW = (CW - 4) / 2;
      const x1 = M, x2 = M + colW + 4;
      setF('normal'); pdf.setFontSize(8.5);

      const wrap = (txt: string): string[] => {
        const ls = (txt || '').split(/\n/).map((s) => s.trim()).filter(Boolean);
        const out: string[] = [];
        ls.forEach((l) => {
          const wrapped: string[] = pdf.splitTextToSize('•  ' + l, colW - 5);
          wrapped.forEach((w) => out.push(w));
        });
        return out.length ? out : ['—'];
      };
      const sW = wrap(meal.suggestedDishes);
      const aW = wrap(meal.adjustedDishes);
      const rows = Math.max(sW.length, aW.length);
      const lineH = 4.2, headH = 6, priceH = 6, pad = 2;
      const boxH = headH + rows * lineH + priceH + pad;
      ensure(boxH + 2);

      pdf.setFillColor(...SUG_FILL); pdf.rect(x1, y, colW, boxH, 'F');
      pdf.setFillColor(...ADJ_FILL); pdf.rect(x2, y, colW, boxH, 'F');

      setF('bold'); pdf.setFontSize(7.5); pdf.setTextColor(...TEAL);
      pdf.text('DE XUAT TU NHA HANG', x1 + 2, y + 4);
      pdf.setTextColor(...PURP);
      pdf.text('DIEU CHINH THEO FEEDBACK', x2 + 2, y + 4);

      setF('normal'); pdf.setFontSize(8.5); pdf.setTextColor(...INK);
      const yy = y + headH + 2;
      sW.forEach((l, i) => pdf.text(l, x1 + 2, yy + i * lineH));
      aW.forEach((l, i) => pdf.text(l, x2 + 2, yy + i * lineH));

      const py = y + headH + rows * lineH + 5;
      setF('bold'); pdf.setFontSize(8.5); pdf.setTextColor(...TEAL);
      pdf.text('Don gia: ' + money(meal.suggestedPrice, sCur), x1 + 2, py);
      pdf.setTextColor(...PURP);
      pdf.text('Don gia: ' + money(meal.adjustedPrice, aCur), x2 + 2, py);

      y += boxH + 2;

      if (meal.note && meal.note.trim()) {
        ensure(7);
        setF('normal'); pdf.setFontSize(8); pdf.setTextColor(...MUTE);
        const nl: string[] = pdf.splitTextToSize('Luu y: ' + meal.note.trim(), CW);
        pdf.text(nl, M, y + 3);
        y += nl.length * 4 + 2;
      }

      const useCur = meal.adjustedPrice ? aCur : sCur;
      const useVal = meal.adjustedPrice || meal.suggestedPrice || 0;
      if (useVal) totals[useCur] = (totals[useCur] ?? 0) + useVal;
      y += 2;
    });
    y += 2;
  });

  const keys = Object.keys(totals).filter((k) => totals[k] > 0);
  if (keys.length) {
    ensure(12 + keys.length * 6);
    setF('bold'); pdf.setFontSize(10); pdf.setTextColor(...NAVY);
    pdf.text('TONG HOP DON GIA (theo dieu chinh)', M, y + 4);
    y += 6;
    pdf.setDrawColor(...TEAL); pdf.line(M, y, PW - M, y);
    y += 5;
    keys.forEach((k) => {
      setF('bold'); pdf.setFontSize(10); pdf.setTextColor(...NAVY);
      pdf.text('•  ' + money(totals[k], k), M + 2, y);
      y += 6;
    });
  }

  ensure(14);
  setF('normal'); pdf.setFontSize(8); pdf.setTextColor(...MUTE);
  const dl2: string[] = pdf.splitTextToSize('* Thuc don co the dieu chinh theo mua, nguyen lieu va yeu cau thuc te cua doan.', CW);
  pdf.text(dl2, M, y + 4);
  y += dl2.length * 4 + 4;
  pdf.text('VIETTOURS INCENTIVES & EVENTS  ·  Hotline 1900 1839  ·  www.viettours.com.vn', PW / 2, y + 2, { align: 'center' });

  const slug = (it.destination || 'Tour').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 30);
  pdf.save(`ThucDon_${code}_${slug}.pdf`);
}
