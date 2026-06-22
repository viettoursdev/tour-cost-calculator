/**
 * Export a Menu as a Word document.
 * Source: public/legacy.html:7086-7161.
 * Text-only header (no logo image) — matches the existing export convention.
 */
import {
  AlignmentType, BorderStyle, Document, ImageRun, Packer, Paragraph, ShadingType,
  Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
  type IParagraphOptions, type ITableCellOptions,
} from 'docx';
import { saveAs } from 'file-saver';
import { VTE_LOGO, b64ToU8 } from './vteLogo';
import { BRAND_TEAL_HEX, LOGO_W_PX, LOGO_H_PX } from './brand';
import type { Menu } from '@/types';

const FONT = 'Aptos';
const NAVY = '0F3A4A';
const TEAL = BRAND_TEAL_HEX;
const INK = '2B3640';
const MUTE = '8A9099';
const WHITE = 'FFFFFF';
const TEALH = 'E6F6F3';
const PURP = 'C2410C';
const PURPH = 'FDEBDD';
const CW = 10306;

interface RunOpts { size?: number; bold?: boolean; italics?: boolean; color?: string; }
const tr = (t: string | number | null | undefined, o: RunOpts = {}): TextRun =>
  new TextRun({
    text: t == null ? '' : String(t),
    font: FONT,
    size: o.size ?? 19,
    bold: !!o.bold,
    italics: !!o.italics,
    color: o.color ?? INK,
  });

interface ParaOpts {
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  before?: number;
  after?: number;
  border?: IParagraphOptions['border'];
}
const P = (runs: TextRun | TextRun[], o: ParaOpts = {}): Paragraph =>
  new Paragraph({
    children: Array.isArray(runs) ? runs : [runs],
    alignment: o.align ?? AlignmentType.LEFT,
    spacing: { before: o.before ?? 0, after: o.after ?? 40 },
    border: o.border,
  });

const NB = { style: BorderStyle.NONE };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

interface CellOpts {
  width?: number;
  fill?: string;
  mt?: number; mb?: number; ml?: number; mr?: number;
  valign?: ITableCellOptions['verticalAlign'];
}
const cell = (ch: Paragraph | Paragraph[], o: CellOpts = {}): TableCell => new TableCell({
  children: Array.isArray(ch) ? ch : [ch],
  width: o.width ? { size: o.width, type: WidthType.DXA } : undefined,
  shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
  margins: { top: o.mt ?? 40, bottom: o.mb ?? 40, left: o.ml ?? 110, right: o.mr ?? 110 },
  verticalAlign: o.valign ?? VerticalAlign.TOP,
});

interface TblOpts { borders?: ConstructorParameters<typeof Table>[0]['borders']; }
const tbl = (rows: TableRow[], widths: number[], o: TblOpts = {}): Table => new Table({
  width: { size: CW, type: WidthType.DXA },
  columnWidths: widths,
  borders: o.borders ?? noBorders,
  rows,
});

const money = (n: number, cur: string): string => ((+n || 0).toLocaleString('vi-VN')) + ' ' + (cur || 'VND');

function dishParas(txt: string, color: string): Paragraph[] {
  const lines = (txt || '').split(/\n/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return [P(tr('—', { size: 17, color: MUTE }), { after: 0 })];
  return lines.map((l) => P([
    tr('• ', { size: 17, bold: true, color }),
    tr(l, { size: 17, color: INK }),
  ], { after: 24 }));
}

export async function exportMenuDocx(it: Menu, code: string, includePrices = true): Promise<void> {
  const C: (Paragraph | Table)[] = [];

  // Header: brand text + code
  C.push(tbl([new TableRow({
    children: [
      cell([
        new Paragraph({
          children: [new ImageRun({
            type: 'png',
            data: b64ToU8(VTE_LOGO),
            transformation: { width: LOGO_W_PX, height: LOGO_H_PX },
          })],
          spacing: { after: 0 },
        }),
      ], { width: 5153, valign: VerticalAlign.CENTER }),
      cell([
        P(tr('MÃ THỰC ĐƠN', { size: 14, bold: true, color: MUTE }), { align: AlignmentType.RIGHT, after: 0 }),
        P(tr(code, { size: 22, bold: true, color: NAVY }), { align: AlignmentType.RIGHT, after: 0 }),
      ], { width: 5153, valign: VerticalAlign.CENTER }),
    ],
  })], [5153, 5153]));

  C.push(P(tr('THỰC ĐƠN CHƯƠNG TRÌNH', { size: 18, bold: true, color: MUTE }),
    { align: AlignmentType.CENTER, before: 140 }));
  C.push(P(tr((it.destination || it.title || 'THỰC ĐƠN').toUpperCase(),
    { size: 40, bold: true, color: NAVY }),
    { align: AlignmentType.CENTER }));

  const sub: string[] = [];
  if (it.days) sub.push(it.days + ' ngày');
  if (it.linkedItineraryName) sub.push('Chương trình: ' + it.linkedItineraryName);
  if (it.linkedQuoteName) sub.push('Báo giá: ' + it.linkedQuoteName);
  if (sub.length) {
    C.push(P(tr(sub.join('   ·   '), { size: 18, bold: true, color: TEAL }),
      { align: AlignmentType.CENTER, after: 0 }));
  }
  C.push(new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: TEAL, space: 2 } },
    spacing: { after: 160, before: 90 },
  }));

  const totals: Record<string, number> = {};

  (it.schedule ?? []).forEach((d) => {
    // Day header bar
    const dh: TextRun[] = [tr(`NGÀY ${d.dayNum}`, { size: 20, bold: true, color: WHITE })];
    if (d.date) dh.push(tr(`   ·   ${d.date}`, { size: 16, bold: true, color: 'CFE6E0' }));
    if (d.city) dh.push(tr(`   ·   ${d.city}`, { size: 16, bold: true, color: 'CFE6E0' }));
    C.push(tbl([new TableRow({
      children: [cell(
        [new Paragraph({ children: dh, spacing: { after: 0 } })],
        { fill: NAVY, mt: 55, mb: 55, ml: 160 },
      )],
    })], [CW]));

    (d.meals ?? []).forEach((meal) => {
      const sCur = meal.suggestedCur || meal.cur || 'VND';
      const aCur = meal.adjustedCur || meal.cur || 'VND';
      const mh: TextRun[] = [tr(meal.mealType || 'Bữa ăn', { size: 18, bold: true, color: TEAL })];
      if (meal.restaurantName) mh.push(tr(`   —   ${meal.restaurantName}`, { size: 17, bold: true, color: NAVY }));
      if (meal.city) mh.push(tr(`  (${meal.city})`, { size: 15, color: MUTE }));
      C.push(P(mh, { before: 90, after: 30 }));

      const half = Math.floor(CW / 2);
      const colSug: Paragraph[] = [P(tr('📋 ĐỀ XUẤT TỪ NHÀ HÀNG', { size: 13, bold: true, color: TEAL }), { after: 40 })];
      dishParas(meal.suggestedDishes, TEAL).forEach((p) => colSug.push(p));
      if (includePrices) {
        colSug.push(P(tr('Đơn giá: ' + money(meal.suggestedPrice, sCur),
          { size: 16, bold: true, color: TEAL }), { before: 30, after: 0 }));
      }
      const colAdj: Paragraph[] = [P(tr('✏️ ĐIỀU CHỈNH THEO FEEDBACK', { size: 13, bold: true, color: PURP }), { after: 40 })];
      dishParas(meal.adjustedDishes, PURP).forEach((p) => colAdj.push(p));
      if (includePrices) {
        colAdj.push(P(tr('Đơn giá: ' + money(meal.adjustedPrice, aCur),
          { size: 16, bold: true, color: PURP }), { before: 30, after: 0 }));
      }

      C.push(tbl([new TableRow({
        children: [
          cell(colSug, { width: half, fill: TEALH, mt: 90, mb: 90, ml: 140, mr: 120 }),
          cell(colAdj, { width: half, fill: PURPH, mt: 90, mb: 90, ml: 140, mr: 120 }),
        ],
      })], [half, half], {
        borders: { ...noBorders, insideVertical: { style: BorderStyle.SINGLE, size: 8, color: WHITE } },
      }));

      if (meal.note && meal.note.trim()) {
        C.push(P([tr('📝 ', { size: 15 }), tr(meal.note.trim(), { size: 15, italics: true, color: MUTE })],
          { before: 30, after: 0 }));
      }

      const useCur = meal.adjustedPrice ? aCur : sCur;
      const useVal = meal.adjustedPrice || meal.suggestedPrice || 0;
      if (useVal) totals[useCur] = (totals[useCur] ?? 0) + useVal;

      C.push(P(tr('', {}), { after: 60 }));
    });
  });

  const curKeys = Object.keys(totals).filter((k) => totals[k] > 0);
  if (includePrices && curKeys.length) {
    C.push(P(tr('TỔNG HỢP ĐƠN GIÁ (theo điều chỉnh)', { size: 18, bold: true, color: NAVY }), {
      before: 120, after: 50,
      border: { bottom: { style: BorderStyle.SINGLE, size: 5, color: TEAL, space: 2 } },
    }));
    curKeys.forEach((k) => C.push(P(
      [tr('• ', { size: 17, bold: true, color: TEAL }), tr(money(totals[k], k), { size: 18, bold: true, color: NAVY })],
      { after: 24 },
    )));
  }

  C.push(P(tr('✱ Thực đơn có thể điều chỉnh theo mùa, tình hình nguyên liệu và yêu cầu thực tế của đoàn.',
    { size: 14, italics: true, color: MUTE }), { before: 120, after: 0 }));
  C.push(P(tr('VIETTOURS INCENTIVES & EVENTS  ·  Hotline 1900 1839  ·  www.viettours.com.vn',
    { size: 14, color: MUTE }), { align: AlignmentType.CENTER, before: 200 }));

  const docDoc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 19 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 800, right: 800, bottom: 800, left: 800 },
        },
      },
      children: C,
    }],
  });

  try {
    const blob = await Packer.toBlob(docDoc);
    const slug = (it.destination || 'Tour').replace(/[^a-zA-Z0-9_À-ỹ]/g, '_').slice(0, 30);
    const fn = `ThucDon_${code}_${slug}.docx`;
    saveAs(blob, fn);
  } catch (err) {
    console.error(err);
    window.alert('Lỗi xuất Word: ' + (err as Error).message);
  }
}
