/**
 * Export an Itinerary as a Word document.
 * Source: public/legacy.html:6474-6579.
 * Skips the logo image (matches the existing text-only convention from
 * exportContractDocx/exportContractPDF). Uses Aptos font for Vietnamese text.
 */
import {
  AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, Paragraph, ShadingType,
  Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
  type IParagraphOptions, type ITableCellOptions,
} from 'docx';
import { saveAs } from 'file-saver';
import { VTE_LOGO, b64ToU8 } from './vteLogo';
import { BRAND_TEAL_HEX, LOGO_W_PX, LOGO_H_PX } from './brand';
import { flightDepStr, flightArrStr } from '@/components/itinerary/flightFields';
import { dayLabel } from '@/components/itinerary/itinCode';
import { parseInlineRich, splitLines } from '@/lib/richText';
import type { Itinerary } from '@/types';

const FONT = 'Aptos';
const NAVY = '0F3A4A';
const TEAL = BRAND_TEAL_HEX;
const INK = '2B3640';
const MUTE = '8A9099';
const WHITE = 'FFFFFF';
const TEALH = 'E6F6F3';
const ZEBRA = 'F7F9FA';
const LINE = 'E4E8EB';
const GRPC = '2980B9';
const CW = 10306;

interface RunOpts {
  size?: number;
  bold?: boolean;
  italics?: boolean;
  color?: string;
}
const tr = (t: string | number | null | undefined, o: RunOpts = {}): TextRun =>
  new TextRun({
    text: t == null ? '' : String(t),
    font: FONT,
    size: o.size ?? 19,
    bold: !!o.bold,
    italics: !!o.italics,
    color: o.color ?? INK,
  });

/** Nội dung nhiều dòng + đậm/nghiêng (markdown) thành mảng TextRun (xuống dòng bằng break). */
const richRuns = (text: string, o: RunOpts = {}): TextRun[] => {
  const out: TextRun[] = [];
  splitLines(text).forEach((line, li) => {
    parseInlineRich(line).forEach((r, ri) => {
      out.push(new TextRun({
        text: r.text, font: FONT, size: o.size ?? 19,
        bold: r.bold || !!o.bold, italics: r.italic || !!o.italics, color: o.color ?? INK,
        ...(li > 0 && ri === 0 ? { break: 1 } : {}),
      }));
    });
  });
  return out.length ? out : [tr('', o)];
};

interface ParaOpts {
  align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  before?: number;
  after?: number;
  border?: IParagraphOptions['border'];
  indent?: number;
}
const P = (runs: TextRun | TextRun[], o: ParaOpts = {}): Paragraph =>
  new Paragraph({
    children: Array.isArray(runs) ? runs : [runs],
    alignment: o.align ?? AlignmentType.LEFT,
    spacing: { before: o.before ?? 0, after: o.after ?? 40 },
    border: o.border,
    indent: o.indent ? { left: o.indent } : undefined,
  });

const NB = { style: BorderStyle.NONE };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

interface CellOpts {
  width?: number;
  fill?: string;
  mt?: number; mb?: number; ml?: number; mr?: number;
  valign?: ITableCellOptions['verticalAlign'];
  columnSpan?: number;
}
const cell = (ch: Paragraph | Paragraph[], o: CellOpts = {}): TableCell => new TableCell({
  children: Array.isArray(ch) ? ch : [ch],
  columnSpan: o.columnSpan,
  width: o.width ? { size: o.width, type: WidthType.DXA } : undefined,
  shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
  margins: {
    top: o.mt ?? 30, bottom: o.mb ?? 30,
    left: o.ml ?? 90, right: o.mr ?? 90,
  },
  verticalAlign: o.valign ?? VerticalAlign.CENTER,
});

interface TblOpts {
  borders?: ConstructorParameters<typeof Table>[0]['borders'];
}
const tbl = (rows: TableRow[], widths: number[], o: TblOpts = {}): Table => new Table({
  width: { size: CW, type: WidthType.DXA },
  columnWidths: widths,
  borders: o.borders ?? noBorders,
  rows,
});

// Footer công ty (Times New Roman, căn giữa) — giữ nguyên theo mẫu.
const ftrLine = (t: string, bold = false): Paragraph =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 0 },
    children: [new TextRun({ text: t, font: 'Times New Roman', size: 16, bold, color: INK })],
  });

export async function exportItineraryDocx(it: Itinerary, code: string): Promise<void> {
  const C: (Paragraph | Table)[] = [];

  // Title block (theo mẫu: bắt đầu thẳng bằng tiêu đề, không logo/mã ở đầu trang)
  C.push(P(tr('CHƯƠNG TRÌNH THAM QUAN DU LỊCH', { size: 18, bold: true, color: MUTE }),
    { align: AlignmentType.CENTER, before: 140 }));
  C.push(P(tr((it.destination || 'ĐIỂM ĐẾN').toUpperCase(), { size: 48, bold: true, color: NAVY }),
    { align: AlignmentType.CENTER }));
  C.push(P(tr(`${it.days} NGÀY ${it.nights} ĐÊM`, { size: 22, bold: true, color: TEAL }),
    { align: AlignmentType.CENTER, after: 0 }));
  C.push(new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: TEAL, space: 2 } },
    spacing: { after: 140, before: 80 },
  }));

  // Intro
  if (it.intro && it.intro.trim()) {
    C.push(tbl([new TableRow({
      children: [cell([P(tr(it.intro.trim(), { size: 19, italics: true, color: INK }), { after: 0 })],
        { fill: TEALH, mt: 110, mb: 110, ml: 150, mr: 150 })],
    })], [CW]));
    C.push(P(tr('', {}), { after: 40 }));
  }

  // Flight table
  const fl = (it.flights || []).filter((f) => f.flightNo || flightDepStr(f) || flightArrStr(f));
  if (fl.length) {
    C.push(P(tr('✈  THÔNG TIN CHUYẾN BAY', { size: 18, bold: true, color: NAVY }),
      {
        before: 120, after: 50,
        border: { bottom: { style: BorderStyle.SINGLE, size: 5, color: TEAL, space: 2 } },
      }));
    const fw = [1500, 2400, 3100, 3100];
    const fwTotal = fw.reduce((a, b) => a + b, 0);
    const fhead = ['Chặng', 'Chuyến bay', 'Khởi hành', 'Hạ cánh'];
    const depCell = (f: typeof fl[number]) => flightDepStr(f) + (f.depDate ? ` (${f.depDate})` : '');
    const arrCell = (f: typeof fl[number]) => flightArrStr(f) + (f.arrDate ? ` (${f.arrDate})` : '');
    // Gom theo nhóm/booking, giữ thứ tự xuất hiện.
    const order: string[] = [];
    const gmap = new Map<string, typeof fl>();
    fl.forEach((f) => { const g = f.group?.trim() || 'Nhóm 1'; if (!gmap.has(g)) { gmap.set(g, []); order.push(g); } gmap.get(g)!.push(f); });
    const rows: TableRow[] = [new TableRow({
      children: fhead.map((h, i) =>
        cell([P(tr(h, { size: 16, bold: true, color: WHITE }), { align: AlignmentType.CENTER, after: 0 })],
          { width: fw[i], fill: NAVY, mt: 30, mb: 30 })),
    })];
    order.forEach((g) => {
      rows.push(new TableRow({
        children: [cell([P(tr(`🧳  ${g}`, { size: 16, bold: true, color: GRPC }), { after: 0 })],
          { columnSpan: 4, width: fwTotal, fill: 'EAF3F1', mt: 22, mb: 22 })],
      }));
      gmap.get(g)!.forEach((f, ri) => rows.push(new TableRow({
        children: [f.leg, f.flightNo, depCell(f), arrCell(f)].map((v, ci) =>
          cell([P(tr(v, { size: 16, color: INK }), { after: 0 })],
            { width: fw[ci], fill: ri % 2 ? ZEBRA : WHITE, mt: 24, mb: 24 })),
      })));
    });
    C.push(tbl(rows, fw));
    C.push(P(tr('', {}), { after: 40 }));
  }

  // Days
  (it.schedule || []).forEach((d) => {
    // Day header bar
    C.push(tbl([new TableRow({
      children: [cell(
        [new Paragraph({
          children: [
            tr(`NGÀY ${dayLabel(d.dayNum, it.dayStart)}`, { size: 22, bold: true, color: WHITE }),
            tr(`     ${d.title || ''}`, { size: 19, bold: true, color: 'CFE6E0' }),
          ],
          spacing: { after: 0 },
        })],
        { fill: NAVY, mt: 50, mb: 50, ml: 150 },
      )],
    })], [CW]));

    (d.segments || []).forEach((seg) => {
      if (d.segments.length > 1 && seg.groupLabel) {
        C.push(P(tr(seg.groupLabel, { size: 16, bold: true, color: GRPC }),
          { before: 50, after: 20 }));
      }
      if (seg.transport && seg.transport.trim()) {
        C.push(tbl([new TableRow({
          children: [cell([P(tr(seg.transport.trim(), { size: 15, bold: true, color: TEAL }), { after: 0 })],
            { fill: TEALH, mt: 22, mb: 22, ml: 150 })],
        })], [CW]));
      }
      const acts = (seg.activities || []).filter((a) => (a.time && a.time.trim()) || (a.text && a.text.trim()));
      if (acts.length) {
        const tW = 820, cW = CW - tW;
        const arows = acts.map((a, i) => new TableRow({
          children: [
            cell([P(tr(a.time, { size: 18, bold: true, color: TEAL }), { after: 0 })],
              { width: tW, fill: i % 2 ? ZEBRA : WHITE, mt: 16, mb: 16, ml: 90, mr: 20 }),
            cell([P(richRuns(a.text, { size: 19, color: INK }), { after: 0 })],
              { width: cW, fill: i % 2 ? ZEBRA : WHITE, mt: 16, mb: 16, ml: 90, mr: 130 }),
          ],
        }));
        C.push(tbl(arows, [tW, cW], {
          borders: {
            top: NB, bottom: NB, left: NB, right: NB,
            insideVertical: NB,
            insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: LINE },
          },
        }));
      }
    });

    const mealLabels = ([['B', 'Sáng'], ['L', 'Trưa'], ['D', 'Tối']] as const)
      .filter(([m]) => d.meals?.[m])
      .map(([, name]) => name);
    const mealRuns: TextRun[] = [
      tr('🍽 Bữa ăn bao gồm: ', { size: 16, bold: true, color: MUTE }),
      tr(mealLabels.length ? mealLabels.join('  ·  ') : '—', { size: 16, bold: true, color: TEAL }),
    ];
    if (d.mealNote && d.mealNote.trim()) {
      mealRuns.push(tr('  (' + d.mealNote.trim() + ')', { size: 15, italics: true, color: MUTE }));
    }
    C.push(P(mealRuns, { before: 40, after: 140 }));
  });

  // Note
  C.push(P(tr('✱ Chương trình có thể thay đổi thứ tự tùy thời tiết & tình hình thực tế, vẫn đảm bảo đầy đủ nội dung.',
    { size: 15, italics: true, color: MUTE }), { after: 120 }));

  // Includes / Excludes columns
  const half = Math.floor(CW / 2);
  const incCol: Paragraph[] = [P(tr('GIÁ BAO GỒM', { size: 20, bold: true, color: NAVY }),
    {
      after: 60,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: TEAL, space: 2 } },
    })];
  (it.includes || []).filter((x) => x && x.trim()).forEach((x) =>
    incCol.push(P([tr('✓  ', { size: 17, bold: true, color: '27AE60' }), tr(x, { size: 17, color: INK })], { after: 30 })));
  const excCol: Paragraph[] = [P(tr('KHÔNG BAO GỒM', { size: 20, bold: true, color: NAVY }),
    {
      after: 60,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: TEAL, space: 2 } },
    })];
  (it.excludes || []).filter((x) => x && x.trim()).forEach((x) =>
    excCol.push(P([tr('✕  ', { size: 17, bold: true, color: 'C0392B' }), tr(x, { size: 17, color: INK })], { after: 30 })));
  C.push(tbl([new TableRow({
    children: [
      cell(incCol, { width: half, mr: 120, valign: VerticalAlign.TOP }),
      cell(excCol, { width: half, ml: 120, valign: VerticalAlign.TOP }),
    ],
  })], [half, half]));

  // Footer
  C.push(P(tr('Kính chúc Quý khách một hành trình lý thú và trọn vẹn!',
    { size: 20, bold: true, italics: true, color: TEAL }),
    { align: AlignmentType.CENTER, before: 240 }));

  // Word Header (lặp mỗi trang): logo (trái) + mã chương trình (phải) — theo mẫu.
  const docHeader = new Header({
    children: [tbl([new TableRow({
      children: [
        cell([new Paragraph({
          // Logo đúng kích thước yêu cầu: 4.65cm × 1.25cm (≈ 176 × 47 px @96dpi) — đúng tỉ lệ gốc.
          children: [new ImageRun({ type: 'png', data: b64ToU8(VTE_LOGO), transformation: { width: LOGO_W_PX, height: LOGO_H_PX } })],
          spacing: { after: 0 },
        })], { width: 5153, valign: VerticalAlign.CENTER }),
        cell([
          P(tr('MÃ CHƯƠNG TRÌNH', { size: 14, bold: true, color: MUTE }), { align: AlignmentType.RIGHT, after: 0 }),
          P(tr(code, { size: 22, bold: true, color: NAVY }), { align: AlignmentType.RIGHT, after: 0 }),
        ], { width: 5153, valign: VerticalAlign.CENTER }),
      ],
    })], [5153, 5153])],
  });

  // Word Footer (lặp mỗi trang): địa chỉ HCM + Hà Nội — giữ nguyên theo mẫu.
  const docFooter = new Footer({
    children: [
      ftrLine('Head office: 19B Mai Thị Lựu, Tân Định Ward, HCM City – Vietnam - Tel: (84.8) 38 218 218 – 38 217 217 – Fax: (84.8) 38 218 999'),
      ftrLine('Email: viettours@viettours.com.vn – Website: www.viettours.com.vn'),
      ftrLine('Hanoi Branch: 36 Đào Tấn, Giảng Võ Ward, Hanoi – Vietnam - Tel: (84.4) 37 66 36 36 - Fax: (84.4) 37 66 36 37'),
      ftrLine('Email: viettourshanoi@viettours.com.vn – Website: www.viettours.com.vn'),
    ],
  });

  const docDoc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 19 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1560, right: 800, bottom: 1340, left: 800, header: 360, footer: 280 },
        },
      },
      headers: { default: docHeader },
      footers: { default: docFooter },
      children: C,
    }],
  });

  try {
    const blob = await Packer.toBlob(docDoc);
    const slug = (it.destination || 'Tour').replace(/[^a-zA-Z0-9_À-ỹ]/g, '_').slice(0, 30);
    const fn = `ChuongTrinh_${code}_${slug}.docx`;
    saveAs(blob, fn);
  } catch (err) {
    console.error(err);
    window.alert('Lỗi xuất Word: ' + (err as Error).message);
  }
}
