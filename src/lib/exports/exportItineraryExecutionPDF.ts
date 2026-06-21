/**
 * Xuất "Bản điều hành tour" (Itinerary Execution) ra PDF cho HDV.
 * Gộp lịch trình + thực đơn đã link + contact nhà hàng + khối vận hành.
 * jsPDF + DejaVu (loadVNFont) cho tiếng Việt — theo mẫu exportVisaProjectPDF.
 */
import { jsPDF } from 'jspdf';
import { loadVNFont } from './vnFont';
import { VTE_LOGO } from './vteLogo';
import { fmtDate } from '@/lib/dateUtils';
import { buildExecModel, mealsLabel } from './execModel';
import { dayLabel } from '@/components/itinerary/itinCode';
import type { ExecContact, Itinerary, Menu, Restaurant } from '@/types';

type RGB = [number, number, number];
const NAVY: RGB = [15, 58, 74];
const TEAL: RGB = [20, 160, 140];
const INK: RGB = [43, 54, 64];
const MUTE: RGB = [138, 144, 153];
const WHITE: RGB = [255, 255, 255];
const ZEBRA: RGB = [247, 249, 250];
const LINE: RGB = [215, 222, 226];
const RED: RGB = [192, 57, 43];
const REDH: RGB = [252, 237, 235];

export function exportItineraryExecutionPDF(
  it: Itinerary,
  menu: Menu | null | undefined,
  restaurants: Restaurant[],
): void {
  const m = buildExecModel(it, menu, restaurants);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const hasFont = loadVNFont(pdf);
  const FONT = hasFont ? 'DejaVu' : 'helvetica';
  const setF = (s = 'normal') => pdf.setFont(FONT, s);
  const PW = 210, PH = 297, M = 12;
  const CW = PW - 2 * M;
  let y = M;
  const ensure = (h: number) => { if (y + h > PH - M) { pdf.addPage(); y = M; } };
  const wrap = (t: string, w: number) => pdf.splitTextToSize(String(t ?? ''), w) as string[];

  // ── Header ──
  try { pdf.addImage(VTE_LOGO, 'PNG', M, y, 30, 8, undefined, 'FAST'); } catch { /* ignore */ }
  setF('bold'); pdf.setFontSize(13); pdf.setTextColor(...TEAL);
  pdf.text('VIETTOURS INCENTIVES & EVENTS', M + 34, y + 8);
  setF('bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTE);
  pdf.text('MÃ TOUR', PW - M, y + 5, { align: 'right' });
  pdf.setFontSize(12); pdf.setTextColor(...NAVY);
  pdf.text(m.code || '—', PW - M, y + 12, { align: 'right' });
  y += 22;

  setF('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...MUTE);
  pdf.text('BẢN ĐIỀU HÀNH TOUR · ITINERARY EXECUTION', PW / 2, y, { align: 'center' });
  y += 7;
  setF('bold'); pdf.setFontSize(17); pdf.setTextColor(...NAVY);
  wrap(m.title.toUpperCase(), CW).forEach((l) => { pdf.text(l, PW / 2, y, { align: 'center' }); y += 7; });
  setF('normal'); pdf.setFontSize(9); pdf.setTextColor(...TEAL);
  const sub = [m.destination && `Điểm đến: ${m.destination}`, `${m.days} ngày ${m.nights} đêm`,
    m.departure && `Khởi hành: ${fmtDate(m.departure)}`, m.guests.length ? `${m.guests.length} khách` : '']
    .filter(Boolean).join('   ·   ');
  if (sub) { pdf.text(sub, PW / 2, y, { align: 'center' }); y += 5; }
  pdf.setDrawColor(...TEAL); pdf.setLineWidth(0.5); pdf.line(M, y, PW - M, y);
  y += 6;

  // ── helpers ──
  const sectionHead = (t: string, color: RGB = NAVY) => {
    ensure(12);
    pdf.setFillColor(...color); pdf.rect(M, y, CW, 8, 'F');
    setF('bold'); pdf.setFontSize(10.5); pdf.setTextColor(...WHITE);
    pdf.text(t.toUpperCase(), M + 3, y + 5.6); y += 10;
  };
  const para = (label: string, value: string, labelW = 34) => {
    if (!value) return;
    const ls = wrap(value, CW - labelW - 2);
    const h = Math.max(5, ls.length * 4.2 + 1);
    ensure(h);
    setF('bold'); pdf.setFontSize(8.5); pdf.setTextColor(...NAVY); pdf.text(label, M, y + 4);
    setF('normal'); pdf.setTextColor(...INK);
    ls.forEach((l, i) => pdf.text(l, M + labelW, y + 4 + i * 4.2));
    y += h;
  };
  const contactLines = (rows: ExecContact[]) => {
    rows.forEach((c) => {
      const t = [c.role && `${c.role}:`, c.name, c.phone && `DT ${c.phone}`, c.note].filter(Boolean).join('  ');
      if (!t) return;
      ensure(5);
      setF('normal'); pdf.setFontSize(8.5); pdf.setTextColor(...INK);
      wrap('• ' + t, CW - 2).forEach((l, i) => { ensure(4.5); pdf.text(l, M + (i ? 4 : 2), y + 3.5); y += 4.2; });
    });
  };
  const drawRow = (cells: string[], widths: number[], opt: { head?: boolean; fill?: RGB }) => {
    pdf.setFontSize(8.3);
    let mh = 5.5;
    cells.forEach((c, i) => { mh = Math.max(mh, wrap(String(c ?? ''), widths[i] - 3).length * 4 + 2.5); });
    ensure(mh + 1);
    let x = M;
    cells.forEach((c, i) => {
      pdf.setFillColor(...(opt.fill ?? WHITE)); pdf.rect(x, y, widths[i], mh, 'F');
      pdf.setDrawColor(...LINE); pdf.setLineWidth(0.2); pdf.rect(x, y, widths[i], mh, 'S');
      setF(opt.head ? 'bold' : 'normal'); pdf.setTextColor(...(opt.head ? WHITE : INK));
      wrap(String(c ?? ''), widths[i] - 3).forEach((l, li) => pdf.text(l, x + 1.5, y + 4 + li * 4));
      x += widths[i];
    });
    y += mh;
  };

  // ── SOS card ──
  const sosItems = [
    ['Hotline 24/7', m.sos.hotline], ['Điều hành trực', m.sos.operator],
    ['Bảo hiểm', m.sos.insurance], ['ĐSQ / Lãnh sự', m.sos.embassy], ['Cấp cứu / Y tế', m.sos.medical],
  ].filter(([, v]) => v) as [string, string][];
  if (sosItems.length) {
    const boxH = 8 + sosItems.length * 5 + 3;
    ensure(boxH);
    pdf.setFillColor(...REDH); pdf.setDrawColor(...RED); pdf.setLineWidth(0.6);
    pdf.rect(M, y, CW, boxH, 'FD');
    setF('bold'); pdf.setFontSize(10.5); pdf.setTextColor(...RED);
    pdf.text('LIEN HE KHAN CAP (SOS 24/7)', M + 3, y + 6);
    let yy = y + 11;
    setF('normal'); pdf.setFontSize(9); pdf.setTextColor(...INK);
    sosItems.forEach(([k, v]) => {
      setF('bold'); pdf.setTextColor(...RED); pdf.text(k + ':', M + 4, yy);
      setF('normal'); pdf.setTextColor(...INK); pdf.text(String(v), M + 46, yy);
      yy += 5;
    });
    y += boxH + 5;
  }

  // ── Team (HDV + tài xế) ──
  if (m.guides.length || m.drivers.length) {
    sectionHead('Đoàn điều hành — HDV & Tài xế', TEAL);
    if (m.guides.length) { setF('bold'); pdf.setFontSize(9); pdf.setTextColor(...NAVY); ensure(5); pdf.text('Hướng dẫn viên', M, y + 3.5); y += 5; contactLines(m.guides); }
    if (m.drivers.length) { setF('bold'); pdf.setFontSize(9); pdf.setTextColor(...NAVY); ensure(5); pdf.text('Tài xế & xe', M, y + 3.5); y += 5; contactLines(m.drivers); }
    y += 3;
  }

  // ── Day by day ──
  m.dayVMs.forEach((d) => {
    sectionHead(`Ngày ${dayLabel(d.dayNum, it.dayStart)}${d.date ? ' · ' + fmtDate(d.date) : ''}${d.title ? ' · ' + d.title : ''}`);
    para('Ăn:', mealsLabel(d.meals) + (d.mealNote ? ` (${d.mealNote})` : ''));
    // schedule
    d.segments.forEach((s) => {
      if (s.groupLabel || s.transport) {
        ensure(5); setF('bold'); pdf.setFontSize(8.5); pdf.setTextColor(...TEAL);
        pdf.text([s.groupLabel, s.transport && `Xe: ${s.transport}`].filter(Boolean).join('  ·  '), M, y + 3.5); y += 5;
      }
      s.activities.forEach((a) => {
        if (!a.time && !a.text) return;
        ensure(4.5); setF('normal'); pdf.setFontSize(8.5); pdf.setTextColor(...INK);
        const head = a.time ? `${a.time}  ` : '';
        wrap(head + a.text, CW - 6).forEach((l, i) => { ensure(4.3); pdf.text((i ? '   ' : '• ') + l, M + 2, y + 3.3); y += 4.3; });
      });
    });
    // meals from menu
    if (d.menuMeals.length) {
      ensure(5); setF('bold'); pdf.setFontSize(8.5); pdf.setTextColor(...NAVY); pdf.text('THUC DON', M, y + 3.5); y += 5;
      d.menuMeals.forEach((ml) => {
        const t = [`${ml.mealType}:`, ml.restaurant, ml.dishes && `— ${ml.dishes}`].filter(Boolean).join(' ');
        ensure(4.5); setF('normal'); pdf.setFontSize(8.3); pdf.setTextColor(...INK);
        wrap('• ' + t, CW - 4).forEach((l, i) => { ensure(4.2); pdf.text(l, M + (i ? 4 : 2), y + 3.3); y += 4.2; });
        if (ml.contact) { ensure(4); pdf.setTextColor(...MUTE); pdf.setFontSize(7.8); wrap(`   DT ${ml.contact}`, CW - 6).forEach((l) => { pdf.text(l, M + 4, y + 3); y += 3.8; }); }
        if (ml.note) { ensure(4); pdf.setTextColor(...MUTE); pdf.setFontSize(7.8); wrap(`   📝 ${ml.note}`, CW - 6).forEach((l) => { pdf.text(l, M + 4, y + 3); y += 3.8; }); }
      });
    }
    if (d.hotelName || d.hotelContact) para('Khach san:', [d.hotelName, d.hotelContact].filter(Boolean).join(' · '));
    if (d.venues.length) { ensure(5); setF('bold'); pdf.setFontSize(8.5); pdf.setTextColor(...NAVY); pdf.text('Diem tham quan', M, y + 3.5); y += 5; contactLines(d.venues); }
    if (d.notes) para('Lưu ý:', d.notes);
    if (d.checklist.length) {
      ensure(5); setF('bold'); pdf.setFontSize(8.5); pdf.setTextColor(...NAVY); pdf.text('Checklist', M, y + 3.5); y += 5;
      d.checklist.forEach((c) => { if (!c.text) return; ensure(4.2); setF('normal'); pdf.setFontSize(8.3); pdf.setTextColor(...INK); pdf.text(`${c.done ? '[x]' : '[ ]'} ${c.text}`, M + 2, y + 3.2); y += 4.2; });
    }
    y += 3;
  });

  // ── Guests ──
  if (m.guests.length) {
    sectionHead('Danh sách khách & lưu ý đặc biệt');
    const w = [10, CW * 0.26, CW * 0.12, CW * 0.24, CW * 0.18, CW * 0.1 - 10];
    drawRow(['#', 'Tên khách', 'Phòng', 'Ăn kiêng/Dị ứng', 'Y tế', 'VIP'], w, { head: true, fill: TEAL });
    m.guests.forEach((g, i) => drawRow([String(i + 1), g.name || '—', g.room || '', g.dietary || '', g.medical || '', g.vip ? 'VIP' : ''], w, { fill: i % 2 ? ZEBRA : WHITE }));
    if (m.guestNotes) { y += 1; para('Lưu ý đoàn:', m.guestNotes); }
    y += 3;
  }

  // ── Suppliers ──
  if (m.suppliers.length) {
    sectionHead('Danh bạ nhà cung cấp');
    const w = [CW * 0.26, CW * 0.3, CW * 0.2, CW * 0.24];
    drawRow(['Loại', 'Tên', 'SĐT', 'Ghi chú'], w, { head: true, fill: TEAL });
    m.suppliers.forEach((s, i) => drawRow([s.role || '', s.name || '', s.phone || '', s.note || ''], w, { fill: i % 2 ? ZEBRA : WHITE }));
    y += 3;
  }

  // ── Includes / Excludes ──
  if (m.includes.length || m.excludes.length) {
    sectionHead('Bao gồm / Không bao gồm');
    if (m.includes.length) { para('Bao gom:', m.includes.join('; ')); }
    if (m.excludes.length) { para('Khong gom:', m.excludes.join('; ')); }
    y += 2;
  }

  if (m.generalNotes) { sectionHead('Lưu ý vận hành khác'); para('', m.generalNotes, 2); y += 2; }

  const slug = (m.title || '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 28);
  pdf.save(`Execution_${m.code || 'Tour'}_${slug}.pdf`);
}
