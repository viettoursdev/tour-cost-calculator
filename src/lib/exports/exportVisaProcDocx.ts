/**
 * Export a Visa procedure dossier as a Word document.
 * Source: public/legacy.html:7798-7856.
 * Skips the logo image (text-only header convention).
 */
import {
  AlignmentType, BorderStyle, Document, Packer, Paragraph, ShadingType,
  Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
  type IParagraphOptions, type ITableCellOptions,
} from 'docx';
import { saveAs } from 'file-saver';
import { PROC_KIND_ICON } from '@/components/visa/constants';
import type { VisaProcDoc } from '@/types';

const FONT = 'Aptos';
const NAVY = '0F3A4A';
const TEAL = '14A08C';
const INK = '2B3640';
const MUTE = '8A9099';
const WHITE = 'FFFFFF';
const TEALH = 'E6F6F3';
const ZEBRA = 'F7F9FA';
const LINE = 'D7DEE2';
const CW = 10306;

interface RunOpts { size?: number; bold?: boolean; italics?: boolean; color?: string; }
const tr = (t: string | number | null | undefined, o: RunOpts = {}): TextRun =>
  new TextRun({
    text: t == null ? '' : String(t),
    font: FONT,
    size: o.size ?? 18,
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
    spacing: { before: o.before ?? 0, after: o.after ?? 30 },
    border: o.border,
  });

const NB = { style: BorderStyle.NONE };
const noB = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };
const TL = { style: BorderStyle.SINGLE, size: 2, color: LINE };
const grid = { top: TL, bottom: TL, left: TL, right: TL, insideHorizontal: TL, insideVertical: TL };

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
  margins: { top: o.mt ?? 34, bottom: o.mb ?? 34, left: o.ml ?? 90, right: o.mr ?? 90 },
  verticalAlign: o.valign ?? VerticalAlign.CENTER,
});

interface TblOpts { borders?: ConstructorParameters<typeof Table>[0]['borders']; }
const tbl = (rows: TableRow[], widths: number[], o: TblOpts = {}): Table => new Table({
  width: { size: CW, type: WidthType.DXA },
  columnWidths: widths,
  borders: o.borders ?? noB,
  rows,
});

export async function exportVisaProcDocx(it: VisaProcDoc): Promise<void> {
  const C: (Paragraph | Table)[] = [];

  C.push(tbl([new TableRow({
    children: [
      cell([
        P(tr('VIETTOURS INCENTIVES & EVENTS', { size: 22, bold: true, color: TEAL }), { after: 0 }),
        P(tr('Tour Cost Calculator', { size: 13, color: MUTE }), { after: 0 }),
      ], { width: 5153, valign: VerticalAlign.CENTER }),
      cell([
        P(tr('MÃ HỒ SƠ', { size: 14, bold: true, color: MUTE }), { align: AlignmentType.RIGHT, after: 0 }),
        P(tr(it.code ?? '', { size: 22, bold: true, color: NAVY }), { align: AlignmentType.RIGHT, after: 0 }),
      ], { width: 5153, valign: VerticalAlign.CENTER }),
    ],
  })], [5153, 5153]));

  C.push(P(tr('HỒ SƠ THỦ TỤC XIN VISA', { size: 18, bold: true, color: MUTE }),
    { align: AlignmentType.CENTER, before: 140 }));
  C.push(P(tr((it.title || 'HỒ SƠ THỦ TỤC').toUpperCase(),
    { size: 34, bold: true, color: NAVY }),
    { align: AlignmentType.CENTER }));

  const sub: string[] = [];
  if (it.country) sub.push('Quốc gia: ' + it.country);
  if (it.linkedQuoteName) sub.push('Báo giá: ' + it.linkedQuoteName);
  if (it.createdByName) sub.push('Phụ trách: ' + it.createdByName);
  if (sub.length) {
    C.push(P(tr(sub.join('   ·   '), { size: 17, bold: true, color: TEAL }),
      { align: AlignmentType.CENTER, after: 0 }));
  }
  C.push(new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: TEAL, space: 2 } },
    spacing: { after: 150, before: 90 },
  }));

  (it.sections ?? []).forEach((sec) => {
    const icon = PROC_KIND_ICON[sec.kind] ?? '📋';
    C.push(tbl([new TableRow({
      children: [cell(
        [P(tr(`${icon}  ${(sec.title || 'Mục').toUpperCase()}`,
          { size: 18, bold: true, color: WHITE }), { after: 0 })],
        { fill: NAVY, mt: 48, mb: 48, ml: 150 },
      )],
    })], [CW]));
    C.push(P(tr('', {}), { after: 30 }));

    const cols = sec.fieldDefs ?? [];
    if (!cols.length) {
      C.push(P(tr('—', { color: MUTE }), { after: 80 }));
      return;
    }
    if (sec.repeatable) {
      const numW = 620;
      const restW = Math.floor((CW - numW) / cols.length);
      const widths = [numW, ...cols.map(() => restW)];
      const head = new TableRow({
        tableHeader: true,
        children: [
          cell([P(tr('STT', { size: 14, bold: true, color: WHITE }),
            { align: AlignmentType.CENTER, after: 0 })],
            { width: numW, fill: TEAL, mt: 30, mb: 30 }),
          ...cols.map((c) => cell(
            [P(tr(c.label, { size: 14, bold: true, color: WHITE }), { after: 0 })],
            { width: restW, fill: TEAL, mt: 30, mb: 30 },
          )),
        ],
      });
      const body = (sec.rows ?? []).map((r, ri) => new TableRow({
        children: [
          cell([P(tr(ri + 1, { size: 15, bold: true, color: MUTE }),
            { align: AlignmentType.CENTER, after: 0 })],
            { width: numW, fill: ri % 2 ? ZEBRA : WHITE }),
          ...cols.map((c) => cell(
            [P(tr(r.values[c.id] ?? '', { size: 16 }), { after: 0 })],
            { width: restW, fill: ri % 2 ? ZEBRA : WHITE },
          )),
        ],
      }));
      C.push(tbl([head, ...body], widths, { borders: grid }));
    } else {
      const labW = 3300;
      const valW = CW - labW;
      const r0 = (sec.rows && sec.rows[0]) || { values: {} as Record<string, string> };
      const rows: TableRow[] = cols.map((f, i) => new TableRow({
        children: [
          cell([P(tr(f.label, { size: 16, bold: true, color: NAVY }), { after: 0 })],
            { width: labW, fill: i % 2 ? ZEBRA : TEALH }),
          cell([P(tr(r0.values[f.id] ?? '', { size: 16 }), { after: 0 })],
            { width: valW, fill: i % 2 ? ZEBRA : WHITE }),
        ],
      }));
      C.push(tbl(rows, [labW, valW], { borders: grid }));
    }
    C.push(P(tr('', {}), { after: 120 }));
  });

  C.push(P(tr('Hồ sơ được lập bởi Viettours Incentives & Events. Vui lòng kiểm tra & bổ sung theo yêu cầu lãnh sự quán.',
    { size: 14, italics: true, color: MUTE }), { before: 120, after: 0 }));
  C.push(P(tr('VIETTOURS INCENTIVES & EVENTS  ·  Hotline 1900 1839  ·  www.viettours.com.vn',
    { size: 14, color: MUTE }), { align: AlignmentType.CENTER, before: 160 }));

  const docDoc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 18 } } } },
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
    const slug = (it.title ?? '').replace(/[^a-zA-Z0-9_À-ỹ]/g, '_').slice(0, 28);
    const fn = `HoSoVisa_${it.code ?? 'HS'}_${slug}.docx`;
    saveAs(blob, fn);
  } catch (err) {
    console.error(err);
    window.alert('Lỗi xuất Word: ' + (err as Error).message);
  }
}
