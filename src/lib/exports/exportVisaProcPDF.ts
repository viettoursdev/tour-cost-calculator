/**
 * Export a Visa procedure dossier as a PDF.
 * Source: public/legacy.html:7858-7932.
 * Helvetica + ASCII-stripped Vietnamese. Skips the logo image.
 */
import { jsPDF } from 'jspdf';
import { loadVNFont } from './vnFont';
import { BRAND_TEAL, drawLogo, LOGO_W_MM } from './brand';
import type { VisaProcDoc } from '@/types';

type RGB = [number, number, number];

const NAVY: RGB = [15, 58, 74];
const TEAL: RGB = BRAND_TEAL;
const INK: RGB = [43, 54, 64];
const MUTE: RGB = [138, 144, 153];
const WHITE: RGB = [255, 255, 255];
const ZEBRA: RGB = [247, 249, 250];
const LINE: RGB = [215, 222, 226];
const TEALH: RGB = [230, 246, 243];

export function exportVisaProcPDF(it: VisaProcDoc): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const hasFont = loadVNFont(pdf);
  const FONT = hasFont ? 'DejaVu' : 'helvetica';
  const setF = (style = 'normal') => pdf.setFont(FONT, style);
  const PW = 210, PH = 297, M = 12;
  const CW = PW - 2 * M;
  let y = M;

  const ensure = (h: number) => {
    if (y + h > PH - M) { pdf.addPage(); y = M; }
  };

  // Header (logo + brand)
  drawLogo(pdf, M, y);
  const brandX = M + LOGO_W_MM + 5;
  setF('bold'); pdf.setFontSize(13); pdf.setTextColor(...TEAL);
  pdf.text('VIETTOURS INCENTIVES & EVENTS', brandX, y + 6);
  setF('normal'); pdf.setFontSize(7); pdf.setTextColor(...MUTE);
  pdf.text('Tour Cost Calculator', brandX, y + 11);

  setF('bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTE);
  pdf.text('MA HO SO', PW - M, y + 5, { align: 'right' });
  pdf.setFontSize(13); pdf.setTextColor(...NAVY);
  pdf.text(it.code ?? '', PW - M, y + 11, { align: 'right' });
  y += 22;

  setF('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...MUTE);
  pdf.text('HO SO THU TUC XIN VISA', PW / 2, y, { align: 'center' });
  y += 7;
  setF('bold'); pdf.setFontSize(18); pdf.setTextColor(...NAVY);
  const titleLines: string[] = pdf.splitTextToSize(
    (it.title || 'HO SO THU TUC').toUpperCase(), CW,
  );
  pdf.text(titleLines, PW / 2, y, { align: 'center' });
  y += 7;

  const sub: string[] = [];
  if (it.country) sub.push('Quoc gia: ' + it.country);
  if (it.linkedQuoteName) sub.push('BG: ' + it.linkedQuoteName);
  if (it.createdByName) sub.push('PT: ' + it.createdByName);
  if (sub.length) {
    setF('normal'); pdf.setFontSize(9); pdf.setTextColor(...TEAL);
    pdf.text(sub.join('   ·   '), PW / 2, y, { align: 'center' });
    y += 5;
  }
  pdf.setDrawColor(...TEAL); pdf.setLineWidth(0.5); pdf.line(M, y, PW - M, y);
  y += 6;

  function rowHeight(cells: string[], widths: number[]): number {
    let mx = 6;
    pdf.setFontSize(8.5);
    cells.forEach((c, i) => {
      const ls: string[] = pdf.splitTextToSize(String(c ?? ''), widths[i] - 3);
      mx = Math.max(mx, ls.length * 4 + 3);
    });
    return mx;
  }
  function drawRow(
    cells: string[],
    widths: number[],
    yy: number,
    opt: { fill?: RGB; bold?: boolean; head?: boolean; color?: RGB },
  ): number {
    const h = rowHeight(cells, widths);
    let x = M;
    cells.forEach((c, i) => {
      if (opt.fill) {
        pdf.setFillColor(...opt.fill);
        pdf.rect(x, yy, widths[i], h, 'F');
      }
      pdf.setDrawColor(...LINE);
      pdf.setLineWidth(0.2);
      pdf.rect(x, yy, widths[i], h, 'S');
      setF(opt.bold ? 'bold' : 'normal');
      pdf.setFontSize(opt.head ? 8 : 8.5);
      pdf.setTextColor(...(opt.color ?? INK));
      const ls: string[] = pdf.splitTextToSize(String(c ?? ''), widths[i] - 3);
      ls.forEach((l, li) => pdf.text(l, x + 1.6, yy + 4.5 + li * 4));
      x += widths[i];
    });
    return h;
  }

  (it.sections ?? []).forEach((sec) => {
    ensure(16);
    pdf.setFillColor(...NAVY); pdf.rect(M, y, CW, 8, 'F');
    setF('bold'); pdf.setFontSize(10.5); pdf.setTextColor(...WHITE);
    pdf.text((sec.title || 'Muc').toUpperCase(), M + 3, y + 5.6);
    y += 10;

    const cols = sec.fieldDefs ?? [];
    if (!cols.length) {
      setF('normal'); pdf.setFontSize(9); pdf.setTextColor(...MUTE);
      pdf.text('—', M, y + 4); y += 8;
      return;
    }

    if (sec.repeatable) {
      const numW = 10;
      const restW = (CW - numW) / cols.length;
      const widths = [numW, ...cols.map(() => restW)];
      const headCells = ['STT', ...cols.map((c) => c.label)];
      ensure(rowHeight(headCells, widths) + 2);
      y += drawRow(headCells, widths, y, { fill: TEAL, color: WHITE, bold: true, head: true });

      (sec.rows ?? []).forEach((r, ri) => {
        const cells = [String(ri + 1), ...cols.map((c) => r.values[c.id] ?? '')];
        ensure(rowHeight(cells, widths) + 1);
        y += drawRow(cells, widths, y, { fill: ri % 2 ? ZEBRA : WHITE });
      });
    } else {
      const labW = CW * 0.34;
      const valW = CW - labW;
      const widths = [labW, valW];
      const r0 = (sec.rows && sec.rows[0]) || { values: {} as Record<string, string> };
      cols.forEach((f) => {
        const cells = [f.label, r0.values[f.id] ?? ''];
        ensure(rowHeight(cells, widths) + 1);
        const h = rowHeight(cells, widths);
        let x = M;
        const fills: RGB[] = [TEALH, WHITE];
        [0, 1].forEach((ci) => {
          pdf.setFillColor(...fills[ci]);
          pdf.rect(x, y, widths[ci], h, 'F');
          pdf.setDrawColor(...LINE);
          pdf.setLineWidth(0.2);
          pdf.rect(x, y, widths[ci], h, 'S');
          setF(ci === 0 ? 'bold' : 'normal');
          pdf.setFontSize(8.5);
          pdf.setTextColor(...(ci === 0 ? NAVY : INK));
          const ls: string[] = pdf.splitTextToSize(String(cells[ci] ?? ''), widths[ci] - 3);
          ls.forEach((l, li) => pdf.text(l, x + 1.6, y + 4.5 + li * 4));
          x += widths[ci];
        });
        y += h;
      });
    }
    y += 6;
  });

  ensure(14);
  setF('normal'); pdf.setFontSize(8); pdf.setTextColor(...MUTE);
  const dl: string[] = pdf.splitTextToSize(
    'Ho so lap boi Viettours Incentives & Events. Kiem tra & bo sung theo yeu cau lanh su quan.',
    CW,
  );
  pdf.text(dl, M, y + 4);
  y += dl.length * 4 + 4;
  pdf.text('VIETTOURS INCENTIVES & EVENTS  ·  Hotline 091 951 7777  ·  www.viettours.com.vn',
    PW / 2, y + 2, { align: 'center' });

  const slug = (it.title ?? '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 28);
  pdf.save(`HoSoVisa_${it.code ?? 'HS'}_${slug}.pdf`);
}
