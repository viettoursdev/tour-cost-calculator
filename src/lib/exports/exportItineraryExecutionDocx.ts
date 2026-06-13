/**
 * Xuất "Bản điều hành tour" (Itinerary Execution) ra Word (.docx).
 * Cùng cấu trúc với bản PDF — bản sửa được cho HDV/điều hành.
 */
import {
  AlignmentType, BorderStyle, Document, Packer, Paragraph, ShadingType,
  Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import { saveAs } from 'file-saver';
import { fmtDate } from '@/lib/dateUtils';
import { buildExecModel, mealsLabel } from './execModel';
import type { ExecContact, Itinerary, Menu, Restaurant } from '@/types';

const FONT = 'Aptos';
const NAVY = '0F3A4A';
const TEAL = '14A08C';
const INK = '2B3640';
const MUTE = '8A9099';
const RED = 'C0392B';

type RunOpts = { size?: number; bold?: boolean; italics?: boolean; color?: string };
const tr = (t: string | number | null | undefined, o: RunOpts = {}) =>
  new TextRun({ text: t == null ? '' : String(t), font: FONT, size: o.size ?? 19, bold: !!o.bold, italics: !!o.italics, color: o.color });

const heading = (t: string, color = NAVY) =>
  new Paragraph({ shading: { type: ShadingType.SOLID, color, fill: color }, spacing: { before: 200, after: 90 },
    children: [tr(' ' + t.toUpperCase(), { bold: true, color: 'FFFFFF', size: 22 })] });

const line = (children: TextRun[], indent = 0) =>
  new Paragraph({ spacing: { after: 40 }, indent: indent ? { left: indent } : undefined, children });

const contactParas = (rows: ExecContact[]) =>
  rows.filter((c) => c.role || c.name || c.phone).map((c) =>
    line([tr('• ', { bold: true, color: TEAL }),
      ...(c.role ? [tr(c.role + ': ', { bold: true })] : []),
      tr([c.name, c.phone && `☎ ${c.phone}`, c.note].filter(Boolean).join('  '))], 120));

function simpleTable(headers: string[], rows: string[][], widths: number[]): Table {
  const border = { style: BorderStyle.SINGLE, size: 2, color: 'D7DEE2' };
  const cell = (text: string, opts: { head?: boolean; w: number }) =>
    new TableCell({
      width: { size: opts.w, type: WidthType.PERCENTAGE },
      shading: opts.head ? { type: ShadingType.SOLID, color: TEAL, fill: TEAL } : undefined,
      margins: { top: 40, bottom: 40, left: 60, right: 60 },
      children: [new Paragraph({ children: [tr(text, { bold: opts.head, color: opts.head ? 'FFFFFF' : INK, size: 17 })] })],
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, { head: true, w: widths[i] })) }),
      ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, { w: widths[i] })) })),
    ],
  });
}

export async function exportItineraryExecutionDocx(
  it: Itinerary,
  menu: Menu | null | undefined,
  restaurants: Restaurant[],
): Promise<void> {
  const m = buildExecModel(it, menu, restaurants);
  const kids: (Paragraph | Table)[] = [];

  // Title
  kids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [tr('VIETTOURS INCENTIVES & EVENTS', { bold: true, color: TEAL, size: 22 })] }));
  kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [tr('BẢN ĐIỀU HÀNH TOUR · ITINERARY EXECUTION', { color: MUTE, size: 16 })] }));
  kids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [tr(m.title.toUpperCase(), { bold: true, color: NAVY, size: 30 })] }));
  const sub = [m.code && `Mã: ${m.code}`, m.destination, `${m.days} ngày ${m.nights} đêm`,
    m.departure && `Khởi hành ${fmtDate(m.departure)}`, m.guests.length ? `${m.guests.length} khách` : '']
    .filter(Boolean).join('   ·   ');
  kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [tr(sub, { color: TEAL, size: 17 })] }));

  // SOS
  const sos = [['Hotline 24/7', m.sos.hotline], ['Điều hành trực', m.sos.operator], ['Bảo hiểm', m.sos.insurance], ['ĐSQ / Lãnh sự', m.sos.embassy], ['Cấp cứu / Y tế', m.sos.medical]].filter(([, v]) => v) as [string, string][];
  if (sos.length) {
    kids.push(heading('🆘 Liên hệ khẩn cấp (SOS 24/7)', RED));
    sos.forEach(([k, v]) => kids.push(line([tr(k + ': ', { bold: true, color: RED }), tr(v)], 120)));
  }

  // Team
  if (m.guides.length || m.drivers.length) {
    kids.push(heading('Đoàn điều hành — HDV & Tài xế', TEAL));
    if (m.guides.length) { kids.push(line([tr('Hướng dẫn viên', { bold: true, color: NAVY })])); kids.push(...contactParas(m.guides)); }
    if (m.drivers.length) { kids.push(line([tr('Tài xế & xe', { bold: true, color: NAVY })])); kids.push(...contactParas(m.drivers)); }
  }

  // Days
  m.dayVMs.forEach((d) => {
    kids.push(heading(`Ngày ${d.dayNum}${d.date ? ' · ' + fmtDate(d.date) : ''}${d.title ? ' · ' + d.title : ''}`));
    kids.push(line([tr('Ăn: ', { bold: true }), tr(mealsLabel(d.meals) + (d.mealNote ? ` (${d.mealNote})` : ''))]));
    d.segments.forEach((s) => {
      if (s.groupLabel || s.transport) kids.push(line([tr([s.groupLabel, s.transport && `🚌 ${s.transport}`].filter(Boolean).join('  ·  '), { bold: true, color: TEAL })]));
      s.activities.forEach((a) => { if (a.time || a.text) kids.push(line([tr('• ', { color: TEAL }), ...(a.time ? [tr(a.time + '  ', { bold: true })] : []), tr(a.text)], 120)); });
    });
    if (d.menuMeals.length) {
      kids.push(line([tr('🍽️ Thực đơn', { bold: true, color: NAVY })]));
      d.menuMeals.forEach((ml) => {
        kids.push(line([tr('• ', { color: TEAL }), tr(`${ml.mealType}: `, { bold: true }), tr([ml.restaurant, ml.dishes && `— ${ml.dishes}`].filter(Boolean).join(' '))], 120));
        if (ml.contact) kids.push(line([tr(`☎ ${ml.contact}`, { color: MUTE, size: 16 })], 260));
        if (ml.note) kids.push(line([tr(`📝 ${ml.note}`, { color: MUTE, size: 16 })], 260));
      });
    }
    if (d.hotelName || d.hotelContact) kids.push(line([tr('🏨 Khách sạn: ', { bold: true }), tr([d.hotelName, d.hotelContact].filter(Boolean).join(' · '))]));
    if (d.venues.length) { kids.push(line([tr('📍 Điểm tham quan', { bold: true, color: NAVY })])); kids.push(...contactParas(d.venues)); }
    if (d.notes) kids.push(line([tr('Lưu ý: ', { bold: true }), tr(d.notes)]));
    if (d.checklist.length) {
      kids.push(line([tr('✓ Checklist', { bold: true, color: NAVY })]));
      d.checklist.forEach((c) => { if (c.text) kids.push(line([tr(`${c.done ? '☑' : '☐'} ${c.text}`)], 120)); });
    }
  });

  // Guests
  if (m.guests.length) {
    kids.push(heading('Danh sách khách & lưu ý đặc biệt'));
    kids.push(simpleTable(['#', 'Tên khách', 'Phòng', 'Ăn kiêng/Dị ứng', 'Y tế', 'VIP'],
      m.guests.map((g, i) => [String(i + 1), g.name || '—', g.room || '', g.dietary || '', g.medical || '', g.vip ? 'VIP' : '']),
      [5, 26, 12, 25, 20, 12]));
    if (m.guestNotes) kids.push(line([tr('Lưu ý đoàn: ', { bold: true }), tr(m.guestNotes)]));
  }

  // Suppliers
  if (m.suppliers.length) {
    kids.push(heading('Danh bạ nhà cung cấp'));
    kids.push(simpleTable(['Loại', 'Tên', 'SĐT', 'Ghi chú'],
      m.suppliers.map((s) => [s.role || '', s.name || '', s.phone || '', s.note || '']), [26, 30, 20, 24]));
  }

  // Includes / Excludes
  if (m.includes.length || m.excludes.length) {
    kids.push(heading('Bao gồm / Không bao gồm'));
    if (m.includes.length) kids.push(line([tr('✅ Bao gồm: ', { bold: true, color: '27AE60' }), tr(m.includes.join('; '))]));
    if (m.excludes.length) kids.push(line([tr('❌ Không gồm: ', { bold: true, color: RED }), tr(m.excludes.join('; '))]));
  }

  if (m.generalNotes) { kids.push(heading('Lưu ý vận hành khác')); kids.push(line([tr(m.generalNotes)])); }

  const doc = new Document({ sections: [{ children: kids }] });
  const blob = await Packer.toBlob(doc);
  const slug = (m.title || '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 28);
  saveAs(blob, `Execution_${m.code || 'Tour'}_${slug}.docx`);
}
