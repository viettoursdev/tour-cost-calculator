/**
 * Xuất "Bản điều hành tour" (Itinerary Execution) ra Word (.docx).
 * Bản cao cấp — đồng bộ thiết kế với PDF: letterhead (logo + mã), dải thông tin,
 * thẻ SOS, thẻ ngày có badge số, bảng khách/NCC, 2 cột bao gồm, chân trang đánh số.
 */
import {
  AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, PageNumber,
  Paragraph, ShadingType, Table, TableCell, TableRow, TabStopType, TextRun, VerticalAlign, WidthType,
  type ITableCellOptions,
} from 'docx';
import { saveAs } from 'file-saver';
import { fmtDayDate } from '@/lib/dateUtils';
import { buildExecModel, mealsLabel } from './execModel';
import { BRAND_TEAL_HEX, LOGO_W_PX, LOGO_H_PX } from './brand';
import { VTE_LOGO, b64ToU8 } from './vteLogo';
import { dayLabel, weekdayVN } from '@/components/itinerary/itinCode';
import type { ExecExportOpts } from './exportItineraryExecutionPDF';
import type { ExecContact, Itinerary, Menu, Restaurant } from '@/types';

const FONT = 'Aptos';
const NAVY = '0F3A4A';
const TEAL = BRAND_TEAL_HEX;
const TEALH = 'E8F6F3';
const INK = '2B3640';
const MUTE = '8A9099';
const RED = 'C0392B';
const REDH = 'FBEEEC';
const GREEN = '21915A';
const GREENH = 'E9F7EF';
const GOLD = 'BF8410';
const LIGHT = 'DFE5E9';
const CW = 10306;

type RunOpts = { size?: number; bold?: boolean; italics?: boolean; color?: string };
const tr = (t: string | number | null | undefined, o: RunOpts = {}) =>
  new TextRun({ text: t == null ? '' : String(t), font: FONT, size: o.size ?? 19, bold: !!o.bold, italics: !!o.italics, color: o.color });

const safeArrow = (s: string) => (s ?? '').replace(/\s*[→⟶➔➜➞›»]\s*/g, ' - ');

const heading = (t: string, color = NAVY) =>
  new Paragraph({
    shading: { type: ShadingType.SOLID, color, fill: color }, spacing: { before: 360, after: 130 },
    border: { left: { style: BorderStyle.SINGLE, size: 28, color: TEAL, space: 0 } },
    children: [tr('  ' + t.toUpperCase(), { bold: true, color: 'FFFFFF', size: 22 })],
  });

const line = (children: TextRun[], indent = 0) =>
  new Paragraph({ spacing: { after: 40 }, indent: indent ? { left: indent } : undefined, children });

const contactParas = (rows: ExecContact[]) =>
  rows.filter((c) => c.role || c.name || c.phone).map((c) =>
    line([tr('● ', { bold: true, color: TEAL, size: 16 }),
      ...(c.role || c.name ? [tr([c.role && `${c.role}:`, c.name].filter(Boolean).join(' ') + '  ', { bold: true, color: NAVY })] : []),
      tr([c.phone && `☎ ${c.phone}`, c.note].filter(Boolean).join('   '), { color: INK })], 120));

const NB = { style: BorderStyle.NONE };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

const cell = (children: Paragraph[], o: { w?: number; fill?: string; valign?: ITableCellOptions['verticalAlign']; ml?: number; mr?: number; mt?: number; mb?: number } = {}): TableCell =>
  new TableCell({
    children,
    width: o.w ? { size: o.w, type: WidthType.DXA } : undefined,
    shading: o.fill ? { type: ShadingType.SOLID, color: o.fill, fill: o.fill } : undefined,
    margins: { top: o.mt ?? 60, bottom: o.mb ?? 60, left: o.ml ?? 120, right: o.mr ?? 120 },
    verticalAlign: o.valign ?? VerticalAlign.CENTER,
  });

function simpleTable(headers: string[], rows: string[][], widths: number[], vipCol = -1): Table {
  const border = { style: BorderStyle.SINGLE, size: 2, color: LIGHT };
  const tc = (text: string, opts: { head?: boolean; w: number; vip?: boolean; zebra?: boolean }) =>
    new TableCell({
      width: { size: opts.w, type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.SOLID, color: opts.head ? NAVY : opts.vip ? 'FDF8EB' : opts.zebra ? 'F7F9FA' : 'FFFFFF', fill: opts.head ? NAVY : opts.vip ? 'FDF8EB' : opts.zebra ? 'F7F9FA' : 'FFFFFF' },
      margins: { top: 55, bottom: 55, left: 90, right: 90 },
      children: [new Paragraph({ children: [tr(text, { bold: opts.head || (opts.vip && text === 'VIP'), color: opts.head ? 'FFFFFF' : text === 'VIP' ? GOLD : INK, size: 17 })] })],
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: { style: BorderStyle.NONE } },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => tc(h, { head: true, w: widths[i] })) }),
      ...rows.map((r, ri) => new TableRow({ children: r.map((c, i) => tc(c, { w: widths[i], vip: vipCol >= 0 && !!r[vipCol], zebra: ri % 2 === 1 })) })),
    ],
  });
}

export async function exportItineraryExecutionDocx(
  it: Itinerary,
  menu: Menu | null | undefined,
  restaurants: Restaurant[],
  opts: ExecExportOpts = {},
): Promise<void> {
  const m = buildExecModel(it, menu, restaurants);
  const kids: (Paragraph | Table)[] = [];

  // Khách sạn theo đêm + QR Google Maps (tùy chọn) — chuẩn bị trước (QR bất đồng bộ).
  const hotelNights = m.dayVMs.filter((d) => d.hotelName || d.hotelContact);
  let hotelQRs: (Uint8Array | null)[] = [];
  if (opts.hotelQR && hotelNights.length) {
    const QRCode = (await import('qrcode')).default;
    hotelQRs = await Promise.all(hotelNights.map(async (d) => {
      const q = [d.hotelName, m.destination].filter(Boolean).join(' ').trim();
      if (!q) return null;
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
      try { const u = await QRCode.toDataURL(url, { margin: 0, width: 200 }); return b64ToU8(u.split(',')[1] ?? ''); } catch { return null; }
    }));
  }

  // ── Letterhead: logo + mã tour (KHÔNG in tên thương hiệu ở tiêu đề) ──
  kids.push(new Table({
    width: { size: CW, type: WidthType.DXA }, columnWidths: [CW / 2, CW / 2], borders: noBorders,
    rows: [new TableRow({ children: [
      cell([new Paragraph({ spacing: { after: 0 }, children: [new ImageRun({ type: 'png', data: b64ToU8(VTE_LOGO), transformation: { width: LOGO_W_PX, height: LOGO_H_PX } })] })], { valign: VerticalAlign.CENTER }),
      cell([
        new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [tr('MÃ TOUR', { size: 14, bold: true, color: MUTE })] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [tr(m.code || '—', { size: 24, bold: true, color: NAVY })] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [tr('Lập ngày ' + fmtDayDate(new Date().toISOString().slice(0, 10)), { size: 14, color: MUTE })] }),
      ], { valign: VerticalAlign.CENTER }),
    ] })],
  }));

  kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 40 }, children: [tr('BẢN ĐIỀU HÀNH TOUR  ·  ITINERARY EXECUTION', { color: TEAL, size: 16, bold: true })] }));
  kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [tr(m.title.toUpperCase(), { bold: true, color: NAVY, size: 32 })] }));

  // ── Dải thông tin (4 ô) ──
  const meta = ([
    ['ĐIỂM ĐẾN', m.destination],
    ['THỜI LƯỢNG', `${m.days} ngày ${m.nights} đêm`],
    ['KHỞI HÀNH', m.departure ? fmtDayDate(m.departure) : ''],
    ['SỐ KHÁCH', m.guests.length ? `${m.guests.length} khách` : ''],
  ] as [string, string][]).filter(([, v]) => v);
  if (meta.length) {
    const cwc = Math.floor(CW / meta.length);
    kids.push(new Table({
      width: { size: CW, type: WidthType.DXA }, columnWidths: meta.map(() => cwc),
      borders: { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: { style: BorderStyle.SINGLE, size: 12, color: 'FFFFFF' } },
      rows: [new TableRow({ children: meta.map(([label, val]) => cell([
        new Paragraph({ spacing: { after: 20 }, children: [tr(label, { size: 13, bold: true, color: TEAL })] }),
        new Paragraph({ spacing: { after: 0 }, children: [tr(val, { size: 19, bold: true, color: NAVY })] }),
      ], { w: cwc, fill: TEALH, mt: 90, mb: 90 })) })],
    }));
    kids.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
  }

  // ── Tóm tắt hành trình (mục lục ngày) ──
  if (m.dayVMs.length > 1) {
    kids.push(new Paragraph({ spacing: { before: 80, after: 80 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LIGHT, space: 2 } }, children: [tr('TÓM TẮT HÀNH TRÌNH', { bold: true, color: TEAL, size: 18 })] }));
    m.dayVMs.forEach((d) => {
      const dt = [d.date && fmtDayDate(d.date), safeArrow(d.title)].filter(Boolean).join('   ·   ');
      kids.push(new Paragraph({ spacing: { after: 30 }, children: [tr(`Ngày ${dayLabel(d.dayNum, it.dayStart)}    `, { bold: true, color: TEAL }), tr(dt, { color: INK })] }));
    });
  }

  // ── SOS (thẻ tô đỏ, 2 cột) ──
  const sos = ([['Hotline 24/7', m.sos.hotline], ['Điều hành trực', m.sos.operator], ['Bảo hiểm', m.sos.insurance], ['ĐSQ / Lãnh sự', m.sos.embassy], ['Cấp cứu / Y tế', m.sos.medical]] as [string, string][]).filter(([, v]) => v);
  if (sos.length) {
    const redBorder = { style: BorderStyle.SINGLE, size: 6, color: RED };
    const sosRows: TableRow[] = [
      new TableRow({ children: [new TableCell({
        columnSpan: 2, shading: { type: ShadingType.SOLID, color: RED, fill: RED }, margins: { top: 60, bottom: 60, left: 140, right: 140 },
        children: [new Paragraph({ children: [tr('LIÊN HỆ KHẨN CẤP — SOS 24/7', { bold: true, color: 'FFFFFF', size: 21 })] })],
      })] }),
    ];
    for (let i = 0; i < sos.length; i += 2) {
      const pair = [sos[i], sos[i + 1]].filter(Boolean) as [string, string][];
      sosRows.push(new TableRow({ children: [0, 1].map((j) => {
        const it2 = pair[j];
        return new TableCell({
          width: { size: CW / 2, type: WidthType.DXA }, shading: { type: ShadingType.SOLID, color: REDH, fill: REDH }, margins: { top: 50, bottom: 50, left: 140, right: 140 },
          children: [new Paragraph({ children: it2 ? [tr(it2[0] + ':  ', { bold: true, color: RED }), tr(it2[1], { color: INK })] : [tr('')] })],
        });
      }) }));
    }
    kids.push(new Table({
      width: { size: CW, type: WidthType.DXA }, columnWidths: [CW / 2, CW / 2],
      borders: { top: redBorder, bottom: redBorder, left: redBorder, right: redBorder, insideHorizontal: NB, insideVertical: NB },
      rows: sosRows,
    }));
  }

  // ── Đoàn điều hành ──
  if (m.guides.length || m.drivers.length) {
    kids.push(heading('Đoàn điều hành — HDV & Tài xế', TEAL));
    if (m.guides.length) { kids.push(line([tr('Hướng dẫn viên', { bold: true, color: NAVY })])); kids.push(...contactParas(m.guides)); }
    if (m.drivers.length) { kids.push(line([tr('Tài xế & xe', { bold: true, color: NAVY })])); kids.push(...contactParas(m.drivers)); }
  }

  // ── Chuyến bay ──
  if (m.flights.length) {
    kids.push(heading('Chuyến bay', TEAL));
    kids.push(simpleTable(['Nhóm / Chặng', 'Số hiệu', 'Khởi hành', 'Hạ cánh'],
      m.flights.map((f) => [[f.group, f.leg].filter(Boolean).join(' · ') || '—', f.flightNo || '—', f.dep || '—', f.arr || '—']),
      [22, 16, 31, 31]));
  }

  // ── Thẻ ngày (badge số + tiêu đề + ngày) ──
  const dayBar = (d: typeof m.dayVMs[number]) => {
    const wd = weekdayVN(d.date);
    const dateStr = [d.date && fmtDayDate(d.date), wd].filter(Boolean).join('  ·  ');
    return new Table({
      width: { size: CW, type: WidthType.DXA }, columnWidths: [1150, CW - 1150], borders: noBorders,
      rows: [new TableRow({ children: [
        new TableCell({
          width: { size: 1150, type: WidthType.DXA }, shading: { type: ShadingType.SOLID, color: TEAL, fill: TEAL }, verticalAlign: VerticalAlign.CENTER, margins: { top: 70, bottom: 70, left: 0, right: 0 },
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [tr('NGÀY', { bold: true, color: 'FFFFFF', size: 12 })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [tr(String(dayLabel(d.dayNum, it.dayStart)), { bold: true, color: 'FFFFFF', size: 26 })] }),
          ],
        }),
        new TableCell({
          width: { size: CW - 1150, type: WidthType.DXA }, shading: { type: ShadingType.SOLID, color: NAVY, fill: NAVY }, verticalAlign: VerticalAlign.CENTER, margins: { top: 70, bottom: 70, left: 200, right: 140 },
          children: [
            new Paragraph({ spacing: { after: dateStr ? 20 : 0 }, children: [tr(safeArrow(d.title || 'Lịch trình').toUpperCase(), { bold: true, color: 'FFFFFF', size: 22 })] }),
            ...(dateStr ? [new Paragraph({ spacing: { after: 0 }, children: [tr(dateStr, { color: 'CFE6E0', size: 16 })] })] : []),
          ],
        }),
      ] })],
    });
  };

  m.dayVMs.forEach((d) => {
    kids.push(new Paragraph({ spacing: { before: 320, after: 0 }, children: [] }));
    kids.push(dayBar(d));
    const anyMeal = d.meals.B || d.meals.L || d.meals.D;
    if (anyMeal || d.mealNote) {
      const mealVal = [anyMeal ? mealsLabel(d.meals) : '', d.mealNote].filter(Boolean).join('   ·   ');
      kids.push(new Paragraph({ spacing: { before: 100, after: 40 }, children: [tr('🍽 Bữa ăn bao gồm:  ', { bold: true, color: NAVY }), tr(mealVal)] }));
    }
    d.segments.forEach((s) => {
      if (s.groupLabel || s.transport) kids.push(line([tr([s.groupLabel, s.transport && `🚌 ${s.transport}`].filter(Boolean).join('  ·  '), { bold: true, color: TEAL })], 120));
      s.activities.forEach((a) => {
        if (a.time || a.text) kids.push(line([...(a.time ? [tr(a.time + '   ', { bold: true, color: TEAL })] : []), tr(a.text)], 200));
        if (a.ops) kids.push(new Paragraph({ spacing: { after: 50 }, indent: { left: 420 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: TEAL, space: 8 } }, children: [tr('VẬN HÀNH  ', { bold: true, color: TEAL, size: 16 }), tr(a.ops, { size: 17 })] }));
      });
    });
    // THỰC ĐƠN
    if (d.menuMeals.length) {
      kids.push(new Paragraph({ spacing: { before: 160, after: 40 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LIGHT, space: 2 } }, children: [tr('THỰC ĐƠN', { bold: true, color: TEAL, size: 19 })] }));
      d.menuMeals.forEach((ml, mi) => {
        kids.push(new Paragraph({ spacing: { before: mi > 0 ? 140 : 60, after: 20 }, indent: { left: 160 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: TEAL, space: 8 } }, children: [tr(ml.mealType || 'Bữa ăn', { bold: true, color: TEAL, size: 20 })] }));
        if (ml.restaurant) kids.push(line([tr('Nhà hàng: ', { bold: true }), tr(ml.restaurant)], 320));
        if (ml.address) kids.push(line([tr('Địa chỉ · SĐT: ', { bold: true, color: MUTE }), tr(ml.address, { color: MUTE })], 320));
        if (ml.contact) kids.push(line([tr('Website: ', { bold: true, color: MUTE }), tr(ml.contact, { color: MUTE })], 320));
        const dishLines = (ml.dishes || '').split(/\n/).map((x) => x.trim()).filter(Boolean);
        if (dishLines.length) {
          kids.push(line([tr('Menu:', { bold: true, color: NAVY })], 320));
          dishLines.forEach((dl) => kids.push(line([tr('•  ', { color: TEAL }), tr(dl)], 480)));
        }
        if (ml.note) kids.push(line([tr('Nhận xét set: ', { bold: true, color: MUTE }), tr(ml.note, { color: MUTE })], 320));
      });
    }
    if (d.hotelName || d.hotelContact) kids.push(line([tr('🏨 Khách sạn: ', { bold: true }), tr([d.hotelName, d.hotelContact].filter(Boolean).join('  ·  '))]));
    if (d.venues.length) { kids.push(line([tr('📍 Điểm tham quan', { bold: true, color: NAVY })])); kids.push(...contactParas(d.venues)); }
    if (d.notes) kids.push(line([tr('Lưu ý: ', { bold: true }), tr(d.notes)]));
    if (d.checklist.length) {
      kids.push(line([tr('Checklist HDV', { bold: true, color: NAVY })]));
      d.checklist.forEach((c) => { if (c.text) kids.push(line([tr(`${c.done ? '☑' : '☐'} `, { color: c.done ? TEAL : MUTE }), tr(c.text)], 120)); });
    }
  });

  // ── Khách sạn lưu trú ──
  if (hotelNights.length) {
    kids.push(heading('Khách sạn lưu trú'));
    if (opts.hotelQR && hotelQRs.some(Boolean)) {
      const border = { style: BorderStyle.SINGLE, size: 2, color: LIGHT };
      const rows = hotelNights.map((d, i) => new TableRow({
        children: [
          new TableCell({
            width: { size: 1500, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, margins: { top: 70, bottom: 70, left: 90, right: 90 },
            children: [hotelQRs[i]
              ? new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: hotelQRs[i] as Uint8Array, transformation: { width: 66, height: 66 } })] })
              : new Paragraph({ children: [tr('—', { color: MUTE })] })],
          }),
          new TableCell({
            verticalAlign: VerticalAlign.CENTER, margins: { top: 70, bottom: 70, left: 160, right: 140 },
            children: [
              new Paragraph({ spacing: { after: 10 }, children: [tr(`Đêm ${dayLabel(d.dayNum, it.dayStart)}${d.date ? '  ·  ' + fmtDayDate(d.date) : ''}`, { bold: true, color: TEAL, size: 15 })] }),
              new Paragraph({ spacing: { after: 10 }, children: [tr(d.hotelName || '—', { bold: true, color: NAVY, size: 19 })] }),
              ...(d.hotelContact ? [new Paragraph({ spacing: { after: 10 }, children: [tr(d.hotelContact, { color: INK, size: 17 })] })] : []),
              new Paragraph({ children: [tr('Quét QR → Google Maps', { color: MUTE, size: 13 })] }),
            ],
          }),
        ],
      }));
      kids.push(new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [1500, CW - 1500], borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: { style: BorderStyle.NONE } }, rows }));
    } else {
      kids.push(simpleTable(['Đêm', 'Ngày', 'Khách sạn', 'Liên hệ'],
        hotelNights.map((d) => [`Đêm ${dayLabel(d.dayNum, it.dayStart)}`, d.date ? fmtDayDate(d.date) : '—', d.hotelName || '—', d.hotelContact || '—']),
        [14, 20, 38, 28]));
    }
  }

  // ── Khách ──
  if (m.guests.length) {
    kids.push(heading('Danh sách khách & lưu ý đặc biệt'));
    kids.push(simpleTable(['#', 'Tên khách', 'Phòng', 'Ăn kiêng/Dị ứng', 'Y tế', 'VIP'],
      m.guests.map((g, i) => [String(i + 1), g.name || '—', g.room || '', g.dietary || '', g.medical || '', g.vip ? 'VIP' : '']),
      [5, 26, 12, 25, 20, 12], 5));
    if (m.guestNotes) kids.push(line([tr('Lưu ý đoàn: ', { bold: true }), tr(m.guestNotes)]));
  }

  // ── NCC ──
  if (m.suppliers.length) {
    kids.push(heading('Danh bạ nhà cung cấp'));
    kids.push(simpleTable(['Loại', 'Tên', 'SĐT', 'Ghi chú'],
      m.suppliers.map((s) => [s.role || '', s.name || '', s.phone || '', s.note || '']), [26, 30, 20, 24]));
  }

  // ── Bao gồm / Không bao gồm (2 cột, đầu cột tô màu) ──
  if (m.includes.length || m.excludes.length) {
    kids.push(heading('Bao gồm / Không bao gồm'));
    const bulletCell = (items: string[], color: string, headerFill: string, header: string) => {
      const ps: Paragraph[] = [new Paragraph({ shading: { type: ShadingType.SOLID, color: headerFill, fill: headerFill }, spacing: { after: 80 }, children: [tr(' ' + header, { bold: true, color, size: 19 })] })];
      const real = items.filter(Boolean);
      if (real.length) real.forEach((t) => ps.push(new Paragraph({ spacing: { after: 40 }, children: [tr('•  ', { bold: true, color }), tr(t)] })));
      else ps.push(new Paragraph({ children: [tr('—', { color: MUTE })] }));
      return new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, margins: { top: 80, bottom: 120, left: 160, right: 160 }, children: ps });
    };
    const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: LIGHT };
    kids.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder, insideHorizontal: NB, insideVertical: { style: BorderStyle.SINGLE, size: 12, color: 'FFFFFF' } },
      rows: [new TableRow({ children: [
        bulletCell(m.includes, GREEN, GREENH, '✓  GIÁ BAO GỒM'),
        bulletCell(m.excludes, RED, REDH, '✕  KHÔNG BAO GỒM'),
      ] })],
    }));
  }

  if (m.generalNotes) { kids.push(heading('Lưu ý vận hành khác')); kids.push(line([tr(m.generalNotes)])); }

  // ── Chân trang đánh số trên mọi trang ──
  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 60 },
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: LIGHT, space: 6 } },
      children: [
        tr('VIETTOURS INCENTIVES & EVENTS · Tài liệu điều hành nội bộ', { size: 14, color: MUTE }),
        ...(m.code ? [tr('     ·     ' + m.code, { size: 14, color: MUTE })] : []),
        tr('     ·     Trang ', { size: 14, color: MUTE }),
        new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 14, color: MUTE }),
        tr('/', { size: 14, color: MUTE }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 14, color: MUTE }),
      ],
    })],
  });

  // Running header trang tiếp (trang 1 dùng letterhead nên để trống nhờ titlePage).
  const runHeader = new Header({
    children: [new Paragraph({
      spacing: { after: 40 }, tabStops: [{ type: TabStopType.RIGHT, position: CW }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LIGHT, space: 4 } },
      children: [tr(m.code || '', { bold: true, color: NAVY, size: 15 }), new TextRun({ text: '\t', font: FONT }), tr(safeArrow(m.title), { color: MUTE, size: 15 })],
    })],
  });
  const firstHeader = new Header({ children: [new Paragraph({ children: [] })] });

  const pageProps = { size: { width: 11906, height: 16838 }, margin: { top: 800, right: 800, bottom: 800, left: 800 } };

  // ── Trang bìa (tùy chọn — section riêng để không dính running header) ──
  const coverKids: (Paragraph | Table)[] = [];
  if (opts.coverPage) {
    coverKids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1700, after: 240 }, children: [new ImageRun({ type: 'png', data: b64ToU8(VTE_LOGO), transformation: { width: Math.round(LOGO_W_PX * 1.5), height: Math.round(LOGO_H_PX * 1.5) } })] }));
    coverKids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 40 }, children: [tr('BẢN ĐIỀU HÀNH TOUR', { bold: true, color: TEAL, size: 20 })] }));
    coverKids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: [tr('ITINERARY EXECUTION', { color: MUTE, size: 15 })] }));
    coverKids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [tr(safeArrow(m.title).toUpperCase(), { bold: true, color: NAVY, size: 50 })] }));
    coverKids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 700 }, children: [tr([m.destination, `${m.days} ngày ${m.nights} đêm`, m.departure && `Khởi hành ${fmtDayDate(m.departure)}`].filter(Boolean).join('     ·     '), { color: TEAL, size: 22, bold: true })] }));
    coverKids.push(new Table({
      width: { size: 5200, type: WidthType.DXA }, alignment: AlignmentType.CENTER, columnWidths: [5200], borders: noBorders,
      rows: [new TableRow({ children: [new TableCell({ shading: { type: ShadingType.SOLID, color: TEALH, fill: TEALH }, margins: { top: 160, bottom: 160, left: 220, right: 220 }, children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [tr('MÃ TOUR', { bold: true, color: TEAL, size: 14 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [tr(m.code || '—', { bold: true, color: NAVY, size: 28 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [tr('Lập ngày ' + fmtDayDate(new Date().toISOString().slice(0, 10)), { color: MUTE, size: 14 })] }),
      ] })] })],
    }));
  }

  const contentSection = {
    properties: { titlePage: true, page: pageProps },
    headers: { default: runHeader, first: firstHeader },
    footers: { default: footer, first: footer },
    children: kids,
  };
  const sections = opts.coverPage
    ? [{ properties: { page: pageProps }, footers: { default: footer }, children: coverKids }, contentSection]
    : [contentSection];

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 19 } } } },
    sections,
  });
  const blob = await Packer.toBlob(doc);
  const slug = (m.title || '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 28);
  saveAs(blob, `Execution_${m.code || 'Tour'}_${slug}.docx`);
}
