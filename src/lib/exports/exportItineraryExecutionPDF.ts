/**
 * Xuất "Bản điều hành tour" (Itinerary Execution) ra PDF cho HDV.
 * Gộp lịch trình + thực đơn đã link + contact nhà hàng + khối vận hành.
 * jsPDF + DejaVu (loadVNFont) cho tiếng Việt — theo mẫu exportVisaProjectPDF.
 */
import { jsPDF } from 'jspdf';
import { loadVNFont } from './vnFont';
import { BRAND_TEAL, drawLogo } from './brand';
import { fmtDayDate } from '@/lib/dateUtils';
import { buildExecModel, mealsLabel } from './execModel';
import { dayLabel } from '@/components/itinerary/itinCode';
import type { ExecContact, Itinerary, Menu, Restaurant } from '@/types';

type RGB = [number, number, number];
const NAVY: RGB = [15, 58, 74];
const TEAL: RGB = BRAND_TEAL;
const INK: RGB = [43, 54, 64];
const MUTE: RGB = [138, 144, 153];
const WHITE: RGB = [255, 255, 255];
const ZEBRA: RGB = [247, 249, 250];
const LINE: RGB = [215, 222, 226];
const RED: RGB = [192, 57, 43];
const REDH: RGB = [252, 237, 235];
const GREEN: RGB = [39, 174, 96];

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

  // ── Header (logo trái + mã tour phải — KHÔNG in tên thương hiệu) ──
  const logoBottom = drawLogo(pdf, M, y);
  setF('bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTE);
  pdf.text('MÃ TOUR', PW - M, y + 5, { align: 'right' });
  pdf.setFontSize(12); pdf.setTextColor(...NAVY);
  pdf.text(m.code || '—', PW - M, y + 11, { align: 'right' });
  y = logoBottom + 6;

  setF('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...MUTE);
  pdf.text('BẢN ĐIỀU HÀNH TOUR · ITINERARY EXECUTION', PW / 2, y, { align: 'center' });
  y += 7;
  setF('bold'); pdf.setFontSize(17); pdf.setTextColor(...NAVY);
  wrap(m.title.toUpperCase(), CW).forEach((l) => { pdf.text(l, PW / 2, y, { align: 'center' }); y += 7; });
  setF('normal'); pdf.setFontSize(9); pdf.setTextColor(...TEAL);
  const sub = [m.destination && `Điểm đến: ${m.destination}`, `${m.days} ngày ${m.nights} đêm`,
    m.departure && `Khởi hành: ${fmtDayDate(m.departure)}`, m.guests.length ? `${m.guests.length} khách` : '']
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
  // Cột thời gian dời nhẹ qua phải; cột lịch trình bắt đầu xa hơn cho rộng rãi.
  const X_TIME = M + 4;
  const X_TEXT = M + 26;
  const TEXT_W = CW - (X_TEXT - M) - 2;
  m.dayVMs.forEach((d, di) => {
    if (di > 0) y += 5; // #12 khoảng cách giữa các ngày rộng rãi hơn
    sectionHead(`Ngày ${dayLabel(d.dayNum, it.dayStart)}${d.date ? ' · ' + fmtDayDate(d.date) : ''}${d.title ? ' · ' + d.title : ''}`);
    // #8/#9 "Bữa ăn bao gồm:  Sáng · Trưa · Tối"; #3 ẩn nếu không chọn bữa & không ghi chú
    const anyMeal = d.meals.B || d.meals.L || d.meals.D;
    if (anyMeal || d.mealNote) {
      const mealVal = [anyMeal ? mealsLabel(d.meals) : '', d.mealNote].filter(Boolean).join('   ·   ');
      para('Bữa ăn bao gồm:', mealVal, 42);
      y += 1.5;
    }
    // schedule
    d.segments.forEach((s) => {
      if (s.groupLabel || s.transport) {
        ensure(5.5); setF('bold'); pdf.setFontSize(8.5); pdf.setTextColor(...TEAL);
        pdf.text([s.groupLabel, s.transport && `Xe: ${s.transport}`].filter(Boolean).join('  ·  '), M, y + 3.6); y += 5.5;
      }
      s.activities.forEach((a) => {
        if (!a.time && !a.text && !a.ops) return;
        const lines = wrap(a.text || '', TEXT_W);
        const blockH = Math.max(4.8, lines.length * 4.8);
        ensure(blockH);
        if (a.time) { setF('bold'); pdf.setFontSize(8.6); pdf.setTextColor(...TEAL); pdf.text(a.time, X_TIME, y + 3.6); }
        setF('normal'); pdf.setFontSize(8.8); pdf.setTextColor(...INK);
        lines.forEach((l, i) => pdf.text(l, X_TEXT, y + 3.6 + i * 4.8));
        y += blockH;
        if (a.ops) {
          setF('bold'); pdf.setFontSize(8); pdf.setTextColor(...TEAL);
          wrap('Vận hành: ' + a.ops, TEXT_W).forEach((l) => { ensure(4.2); pdf.text(l, X_TEXT, y + 3); y += 4.2; });
          setF('normal');
        }
        y += 1; // hơi thoáng giữa các mốc
      });
    });
    // ── THỰC ĐƠN (mỗi nội dung xuống hàng) ──
    if (d.menuMeals.length) {
      y += 2.5;
      ensure(7); setF('bold'); pdf.setFontSize(9.2); pdf.setTextColor(...NAVY);
      pdf.text('THỰC ĐƠN', M, y + 4); y += 7;
      d.menuMeals.forEach((ml, mi) => {
        if (mi > 0) y += 4.5; // #13 cách giữa các bữa & nhà hàng rộng rãi
        ensure(5.4); setF('bold'); pdf.setFontSize(8.8); pdf.setTextColor(...TEAL);
        pdf.text(ml.mealType || 'Bữa ăn', M + 2, y + 3.7); y += 5.6;
        if (ml.restaurant) {
          setF('bold'); pdf.setFontSize(8.4); pdf.setTextColor(...INK);
          wrap('Nhà hàng: ' + ml.restaurant, CW - 8).forEach((l) => { ensure(4.5); pdf.text(l, M + 6, y + 3.2); y += 4.5; });
        }
        if (ml.address) {
          setF('normal'); pdf.setFontSize(8); pdf.setTextColor(...MUTE);
          wrap('Địa chỉ · SĐT: ' + ml.address, CW - 8).forEach((l) => { ensure(4.2); pdf.text(l, M + 6, y + 3); y += 4.2; });
        }
        if (ml.contact) {
          setF('normal'); pdf.setFontSize(8); pdf.setTextColor(...MUTE);
          wrap('Website: ' + ml.contact, CW - 8).forEach((l) => { ensure(4.2); pdf.text(l, M + 6, y + 3); y += 4.2; });
        }
        const dishLines = (ml.dishes || '').split(/\n/).map((x) => x.trim()).filter(Boolean);
        if (dishLines.length) {
          ensure(4.6); setF('bold'); pdf.setFontSize(8.3); pdf.setTextColor(...NAVY);
          pdf.text('Menu:', M + 6, y + 3.2); y += 4.8; // #14 menu xuống 1 hàng so với dòng bữa ăn
          setF('normal'); pdf.setFontSize(8.4); pdf.setTextColor(...INK);
          dishLines.forEach((dl) => {
            wrap('•  ' + dl, CW - 16).forEach((l, i) => { ensure(4.3); pdf.text(l, M + 10 + (i ? 3 : 0), y + 3); y += 4.3; });
          });
        }
        if (ml.note) {
          setF('normal'); pdf.setFontSize(8); pdf.setTextColor(...MUTE);
          wrap('Nhận xét set: ' + ml.note, CW - 8).forEach((l) => { ensure(4.2); pdf.text(l, M + 6, y + 3); y += 4.2; });
        }
      });
      y += 2.5;
    }
    if (d.hotelName || d.hotelContact) { y += 1; para('Khách sạn:', [d.hotelName, d.hotelContact].filter(Boolean).join('  ·  '), 30); }
    if (d.venues.length) { y += 1; ensure(5.5); setF('bold'); pdf.setFontSize(8.5); pdf.setTextColor(...NAVY); pdf.text('Điểm tham quan', M, y + 3.6); y += 5.5; contactLines(d.venues); }
    if (d.notes) { y += 1; para('Lưu ý:', d.notes); }
    if (d.checklist.length) {
      y += 1; ensure(5.5); setF('bold'); pdf.setFontSize(8.5); pdf.setTextColor(...NAVY); pdf.text('Checklist', M, y + 3.6); y += 5.5;
      d.checklist.forEach((c) => { if (!c.text) return; ensure(4.4); setF('normal'); pdf.setFontSize(8.3); pdf.setTextColor(...INK); pdf.text(`${c.done ? '[x]' : '[ ]'} ${c.text}`, M + 2, y + 3.3); y += 4.4; });
    }
    y += 4;
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

  // ── Includes / Excludes (2 cột, trình bày đẹp như file lịch trình) ──
  if (m.includes.length || m.excludes.length) {
    sectionHead('Bao gồm / Không bao gồm');
    const gap = 8;
    const colW = (CW - gap) / 2;
    const x1 = M, x2 = M + colW + gap;
    ensure(8);
    setF('bold'); pdf.setFontSize(9.2);
    pdf.setTextColor(...GREEN); pdf.text('✓  GIÁ BAO GỒM', x1, y + 4);
    pdf.setTextColor(...RED); pdf.text('✕  KHÔNG BAO GỒM', x2, y + 4);
    y += 7.5;
    const incW = m.includes.filter(Boolean).map((t) => wrap('•  ' + t, colW - 4));
    const excW = m.excludes.filter(Boolean).map((t) => wrap('•  ' + t, colW - 4));
    const incRows = incW.reduce((s, a) => s + a.length, 0);
    const excRows = excW.reduce((s, a) => s + a.length, 0);
    ensure(Math.max(incRows, excRows) * 4.4 + 3);
    setF('normal'); pdf.setFontSize(8.4); pdf.setTextColor(...INK);
    let yL = y; incW.forEach((a) => a.forEach((l, i) => { pdf.text(l, x1 + (i ? 3 : 0), yL + 3.2); yL += 4.4; }));
    let yR = y; excW.forEach((a) => a.forEach((l, i) => { pdf.text(l, x2 + (i ? 3 : 0), yR + 3.2); yR += 4.4; }));
    y = Math.max(yL, yR) + 3;
  }

  if (m.generalNotes) { sectionHead('Lưu ý vận hành khác'); para('', m.generalNotes, 2); y += 2; }

  const slug = (m.title || '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 28);
  pdf.save(`Execution_${m.code || 'Tour'}_${slug}.pdf`);
}
