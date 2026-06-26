/**
 * Xuất "Bản điều hành tour" (Itinerary Execution) ra PDF cho HDV.
 * Gộp lịch trình + thực đơn đã link + contact nhà hàng + khối vận hành.
 * Thiết kế cao cấp: masthead + dải thông tin, thẻ ngày có badge số + timeline,
 * thẻ SOS, bảng khách/NCC tinh gọn, chân trang đánh số. jsPDF + DejaVu (tiếng Việt).
 */
import { jsPDF } from 'jspdf';
import { loadVNFont } from './vnFont';
import { BRAND_TEAL, drawLogo } from './brand';
import { fmtDayDate } from '@/lib/dateUtils';
import { buildExecModel } from './execModel';
import { dayLabel, weekdayVN } from '@/components/itinerary/itinCode';
import type { ExecContact, Itinerary, Menu, Restaurant } from '@/types';

type RGB = [number, number, number];
const NAVY: RGB = [15, 58, 74];
const NAVY2: RGB = [30, 86, 107];
const TEAL: RGB = BRAND_TEAL;
const TEALH: RGB = [232, 246, 243];
const INK: RGB = [43, 54, 64];
const MUTE: RGB = [140, 146, 155];
const WHITE: RGB = [255, 255, 255];
const ZEBRA: RGB = [247, 249, 250];
const LINE: RGB = [223, 229, 233];
const RED: RGB = [192, 57, 43];
const REDH: RGB = [252, 237, 235];
const GREEN: RGB = [33, 145, 90];
const GREENH: RGB = [233, 247, 239];
const GOLD: RGB = [191, 132, 16];

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
  const PW = 210, PH = 297, M = 13;
  const CW = PW - 2 * M;
  const TOP = 14, BOT = 15;
  let y = TOP;
  const ensure = (h: number) => { if (y + h > PH - BOT) { pdf.addPage(); y = TOP; } };
  const wrap = (t: string, w: number) => pdf.splitTextToSize(String(t ?? ''), w) as string[];
  const tw = (t: string) => pdf.getTextWidth(t);

  // ── Masthead (logo + mã tour + ngày lập) ──
  const logoBottom = drawLogo(pdf, M, y);
  setF('bold'); pdf.setFontSize(8); pdf.setTextColor(...MUTE);
  pdf.text('MÃ TOUR', PW - M, y + 3.5, { align: 'right' });
  setF('bold'); pdf.setFontSize(13); pdf.setTextColor(...NAVY);
  pdf.text(m.code || '—', PW - M, y + 9.5, { align: 'right' });
  setF('normal'); pdf.setFontSize(7.5); pdf.setTextColor(...MUTE);
  pdf.text(`Lập ngày ${fmtDayDate(new Date().toISOString().slice(0, 10))}`, PW - M, y + 13.5, { align: 'right' });
  y = logoBottom + 7;

  // Eyebrow + tiêu đề
  setF('bold'); pdf.setFontSize(8.5); pdf.setTextColor(...TEAL);
  pdf.text('B Ả N   Đ I Ề U   H À N H   T O U R   ·   I T I N E R A R Y   E X E C U T I O N', PW / 2, y, { align: 'center' });
  y += 7;
  setF('bold'); pdf.setFontSize(18); pdf.setTextColor(...NAVY);
  wrap(m.title.toUpperCase(), CW).forEach((l) => { ensure(8); pdf.text(l, PW / 2, y, { align: 'center' }); y += 7.5; });
  y += 2;

  // Dải thông tin (chips): Điểm đến · Thời lượng · Khởi hành · Số khách
  const meta = ([
    ['ĐIỂM ĐẾN', m.destination],
    ['THỜI LƯỢNG', `${m.days} ngày ${m.nights} đêm`],
    ['KHỞI HÀNH', m.departure ? fmtDayDate(m.departure) : ''],
    ['SỐ KHÁCH', m.guests.length ? `${m.guests.length} khách` : ''],
  ] as [string, string][]).filter(([, v]) => v);
  if (meta.length) {
    const gap = 3, ch = 13, cw = (CW - gap * (meta.length - 1)) / meta.length;
    ensure(ch + 3);
    meta.forEach(([label, val], i) => {
      const cx = M + i * (cw + gap);
      pdf.setFillColor(...TEALH); pdf.setDrawColor(...LINE); pdf.setLineWidth(0.2);
      pdf.roundedRect(cx, y, cw, ch, 1.6, 1.6, 'FD');
      setF('bold'); pdf.setFontSize(6.3); pdf.setTextColor(...TEAL); pdf.text(label, cx + 3, y + 4.6);
      setF('bold'); pdf.setFontSize(9.5); pdf.setTextColor(...NAVY);
      wrap(val, cw - 6).slice(0, 1).forEach((l) => pdf.text(l, cx + 3, y + 10));
    });
    y += ch + 6;
  } else { y += 2; }

  // ── helpers ──
  const sectionHead = (t: string, color: RGB = NAVY) => {
    ensure(13);
    pdf.setFillColor(...color); pdf.roundedRect(M, y, CW, 8.5, 1.8, 1.8, 'F');
    pdf.setFillColor(...TEAL); pdf.roundedRect(M, y, 2.4, 8.5, 1.2, 1.2, 'F'); // accent trái
    pdf.setFillColor(...color); pdf.rect(M + 1.4, y, 1.4, 8.5, 'F');
    setF('bold'); pdf.setFontSize(10.5); pdf.setTextColor(...WHITE);
    pdf.text(t.toUpperCase(), M + 5, y + 5.8); y += 11;
  };
  const subLabel = (t: string, color: RGB = NAVY) => {
    ensure(6); setF('bold'); pdf.setFontSize(8.6); pdf.setTextColor(...color);
    pdf.text(t, M + 1, y + 3.7);
    const lx = M + 1 + tw(t) + 3;
    pdf.setDrawColor(...LINE); pdf.setLineWidth(0.2); pdf.line(lx, y + 2.6, PW - M, y + 2.6);
    y += 6;
  };
  const para = (label: string, value: string, labelW = 34) => {
    if (!value) return;
    const ls = wrap(value, CW - labelW - 2);
    const h = Math.max(5, ls.length * 4.4 + 1);
    ensure(h);
    setF('bold'); pdf.setFontSize(8.5); pdf.setTextColor(...NAVY); pdf.text(label, M + 1, y + 4);
    setF('normal'); pdf.setTextColor(...INK);
    ls.forEach((l, i) => pdf.text(l, M + 1 + labelW, y + 4 + i * 4.4));
    y += h;
  };
  const contactLines = (rows: ExecContact[]) => {
    rows.forEach((c) => {
      const lead = [c.role && `${c.role}:`, c.name].filter(Boolean).join(' ');
      const rest = [c.phone && `☎ ${c.phone}`, c.note].filter(Boolean).join('   ');
      if (!lead && !rest) return;
      ensure(5);
      pdf.setFillColor(...TEAL); pdf.circle(M + 2, y + 2.4, 0.8, 'F');
      setF('bold'); pdf.setFontSize(8.5); pdf.setTextColor(...NAVY);
      const w1 = tw(lead + ' ');
      pdf.text(lead, M + 5, y + 3.4);
      setF('normal'); pdf.setTextColor(...INK);
      wrap(rest, CW - 7 - w1).forEach((l, i) => { if (i) { ensure(4.4); y += 4.4; } pdf.text(l, M + 5 + (i ? 0 : w1), y + 3.4); });
      y += 4.8;
    });
  };
  const table = (headers: string[], rows: string[][], widths: number[], vipCol = -1) => {
    const drawHead = () => {
      ensure(8);
      pdf.setFillColor(...NAVY); pdf.rect(M, y, CW, 7, 'F');
      setF('bold'); pdf.setFontSize(8.2); pdf.setTextColor(...WHITE);
      let x = M; headers.forEach((c, i) => { pdf.text(c, x + 2.2, y + 4.7); x += widths[i]; });
      y += 7;
    };
    drawHead();
    rows.forEach((r, ri) => {
      pdf.setFontSize(8.2);
      let mh = 6.5;
      r.forEach((c, i) => { mh = Math.max(mh, wrap(String(c ?? ''), widths[i] - 4).length * 4.2 + 2.8); });
      if (y + mh > PH - BOT) { pdf.addPage(); y = TOP; drawHead(); }
      const isVip = vipCol >= 0 && r[vipCol];
      pdf.setFillColor(...(isVip ? [253, 248, 235] as RGB : ri % 2 ? ZEBRA : WHITE));
      pdf.rect(M, y, CW, mh, 'F');
      pdf.setDrawColor(...LINE); pdf.setLineWidth(0.15);
      pdf.line(M, y + mh, PW - M, y + mh);
      let x = M;
      r.forEach((c, i) => {
        const vip = i === vipCol && c;
        setF(vip ? 'bold' : 'normal'); pdf.setTextColor(...(vip ? GOLD : INK));
        wrap(String(c ?? ''), widths[i] - 4).forEach((l, li) => pdf.text(l, x + 2.2, y + 4.4 + li * 4.2));
        x += widths[i];
      });
      y += mh;
    });
  };

  // ── SOS card (2 cột) ──
  const sosItems = ([
    ['Hotline 24/7', m.sos.hotline], ['Điều hành trực', m.sos.operator],
    ['Bảo hiểm', m.sos.insurance], ['ĐSQ / Lãnh sự', m.sos.embassy], ['Cấp cứu / Y tế', m.sos.medical],
  ] as [string, string][]).filter(([, v]) => v);
  if (sosItems.length) {
    const rowsN = Math.ceil(sosItems.length / 2);
    const boxH = 9.5 + rowsN * 5.4 + 2.5;
    ensure(boxH + 2);
    pdf.setFillColor(...REDH); pdf.setDrawColor(...RED); pdf.setLineWidth(0.5);
    pdf.roundedRect(M, y, CW, boxH, 2, 2, 'FD');
    pdf.setFillColor(...RED); pdf.roundedRect(M, y, CW, 6.5, 2, 2, 'F'); pdf.rect(M, y + 3.5, CW, 3, 'F');
    setF('bold'); pdf.setFontSize(9.5); pdf.setTextColor(...WHITE);
    pdf.text('LIÊN HỆ KHẨN CẤP — SOS 24/7', M + 4, y + 4.7);
    const colX = [M + 4, M + CW / 2 + 2];
    setF('normal'); pdf.setFontSize(8.8);
    sosItems.forEach(([k, v], i) => {
      const cx = colX[i % 2]; const ry = y + 11 + Math.floor(i / 2) * 5.4;
      setF('bold'); pdf.setTextColor(...RED); pdf.text(k + ':', cx, ry);
      const lw = tw(k + ':'); // đo khi đang bold → khoảng cách đúng, không dính chữ
      setF('normal'); pdf.setTextColor(...INK); pdf.text(String(v), cx + lw + 2.5, ry);
    });
    y += boxH + 6;
  }

  // ── Team (HDV + tài xế) ──
  if (m.guides.length || m.drivers.length) {
    sectionHead('Đoàn điều hành — HDV & Tài xế', TEAL);
    if (m.guides.length) { subLabel('Hướng dẫn viên', TEAL); contactLines(m.guides); y += 1; }
    if (m.drivers.length) { subLabel('Tài xế & xe', TEAL); contactLines(m.drivers); }
    y += 4;
  }

  // ── Lịch trình theo ngày ──
  const railX = M + 24, xTime = railX - 2.5, xText = railX + 5, textW = CW - (xText - M) - 2;

  const dayHeader = (d: typeof m.dayVMs[number]) => {
    ensure(12 + 14); // dành chỗ tối thiểu để không mồ côi tiêu đề ngày
    const h = 11;
    pdf.setFillColor(...NAVY); pdf.roundedRect(M, y, CW, h, 2, 2, 'F');
    const bw = 17;
    pdf.setFillColor(...TEAL); pdf.roundedRect(M + 2.5, y + 2, bw, h - 4, 1.6, 1.6, 'F');
    setF('bold'); pdf.setFontSize(5.6); pdf.setTextColor(...WHITE);
    pdf.text('NGÀY', M + 2.5 + bw / 2, y + 4.3, { align: 'center' });
    setF('bold'); pdf.setFontSize(10.5);
    pdf.text(String(dayLabel(d.dayNum, it.dayStart)), M + 2.5 + bw / 2, y + 9.2, { align: 'center' });
    const tx = M + 2.5 + bw + 5;
    setF('bold'); pdf.setFontSize(10.5); pdf.setTextColor(...WHITE);
    pdf.text(wrap(d.title || 'Lịch trình', CW - (tx - M) - 4)[0] || '', tx, y + 5);
    const wd = weekdayVN(d.date);
    const dateStr = [d.date && fmtDayDate(d.date), wd].filter(Boolean).join('  ·  ');
    if (dateStr) { setF('normal'); pdf.setFontSize(8); pdf.setTextColor(206, 230, 224); pdf.text(dateStr, tx, y + 9); }
    y += h + 3.5;
  };

  m.dayVMs.forEach((d, di) => {
    if (di > 0) y += 4;
    dayHeader(d);

    // Bữa ăn bao gồm — nhãn + pill Sáng/Trưa/Tối
    const anyMeal = d.meals.B || d.meals.L || d.meals.D;
    if (anyMeal || d.mealNote) {
      ensure(7);
      setF('bold'); pdf.setFontSize(8.2); pdf.setTextColor(...NAVY);
      pdf.text('Bữa ăn bao gồm:', M + 1, y + 4);
      let px = M + 1 + tw('Bữa ăn bao gồm:') + 4;
      ([['B', 'Sáng'], ['L', 'Trưa'], ['D', 'Tối']] as [keyof typeof d.meals, string][]).forEach(([k, name]) => {
        const on = d.meals[k]; const pw = tw(name) + 6;
        pdf.setFillColor(...(on ? TEAL : ZEBRA));
        pdf.roundedRect(px, y + 0.4, pw, 5.2, 2.6, 2.6, 'F');
        setF('bold'); pdf.setFontSize(7.4); pdf.setTextColor(...(on ? WHITE : MUTE));
        pdf.text((on ? '✓ ' : '') + name, px + pw / 2, y + 3.9, { align: 'center' });
        px += pw + 2;
      });
      y += 6.6;
      if (d.mealNote) { setF('normal'); pdf.setFontSize(7.8); pdf.setTextColor(...MUTE); wrap('Ghi chú: ' + d.mealNote, CW - 4).forEach((l) => { ensure(4); pdf.text(l, M + 1, y + 3); y += 4; }); }
      y += 2;
    }

    // Lịch trình — timeline rail
    d.segments.forEach((s) => {
      if (s.groupLabel || s.transport) {
        const t = [s.groupLabel, s.transport && `Xe: ${s.transport}`].filter(Boolean).join('   ·   ');
        const ls = wrap(t, textW); const hh = ls.length * 4.6 + 2.6;
        ensure(hh + 1);
        pdf.setFillColor(...TEALH); pdf.roundedRect(xText - 2.5, y, textW + 2.5, hh, 1.4, 1.4, 'F');
        setF('bold'); pdf.setFontSize(8); pdf.setTextColor(...TEAL);
        ls.forEach((l, i) => pdf.text(l, xText, y + 4.2 + i * 4.6));
        y += hh + 2;
      }
      s.activities.forEach((a) => {
        if (!a.time && !a.text && !a.ops) return;
        const ls = wrap(a.text || '', textW);
        const ops = a.ops ? wrap(a.ops, textW - 3) : [];
        const blockH = Math.max(5, ls.length * 4.8) + (ops.length ? ops.length * 4.2 + 2.5 : 0);
        ensure(blockH + 1.5);
        const top = y;
        pdf.setDrawColor(...LINE); pdf.setLineWidth(0.5); pdf.line(railX, top + 0.6, railX, top + blockH + 1.5);
        pdf.setFillColor(...TEAL); pdf.circle(railX, top + 2.7, 1.2, 'F');
        if (a.time) { setF('bold'); pdf.setFontSize(8.4); pdf.setTextColor(...TEAL); pdf.text(a.time, xTime, top + 3.5, { align: 'right' }); }
        setF('normal'); pdf.setFontSize(8.9); pdf.setTextColor(...INK);
        ls.forEach((l, i) => pdf.text(l, xText, top + 3.5 + i * 4.8));
        let yy = top + 3.5 + Math.max(1, ls.length) * 4.8;
        if (ops.length) {
          const oH = ops.length * 4.2 + 1.6;
          pdf.setFillColor(248, 250, 249); pdf.roundedRect(xText, yy - 1, textW, oH, 1.2, 1.2, 'F');
          pdf.setFillColor(...TEAL); pdf.rect(xText, yy - 1, 1, oH, 'F');
          setF('bold'); pdf.setFontSize(7.6); pdf.setTextColor(...TEAL);
          pdf.text('VẬN HÀNH', xText + 2.5, yy + 2.4);
          setF('normal'); pdf.setTextColor(...INK);
          ops.forEach((l, i) => pdf.text(l, xText + 2.5 + (i ? 0 : tw('VẬN HÀNH ') + 1), yy + 2.4 + i * 4.2));
        }
        y = top + blockH + 2;
      });
    });

    // ── THỰC ĐƠN ──
    if (d.menuMeals.length) {
      y += 2.5;
      subLabel('THỰC ĐƠN', TEAL);
      y += 0.5;
      d.menuMeals.forEach((ml, mi) => {
        if (mi > 0) y += 4;
        const top = y;
        ensure(6);
        setF('bold'); pdf.setFontSize(8.8); pdf.setTextColor(...TEAL);
        pdf.text(ml.mealType || 'Bữa ăn', M + 6, y + 3.7); y += 5.6;
        if (ml.restaurant) {
          setF('bold'); pdf.setFontSize(8.4); pdf.setTextColor(...INK);
          wrap('Nhà hàng: ' + ml.restaurant, CW - 10).forEach((l) => { ensure(4.5); pdf.text(l, M + 6, y + 3.2); y += 4.5; });
        }
        if (ml.address) {
          setF('normal'); pdf.setFontSize(8); pdf.setTextColor(...MUTE);
          wrap('Địa chỉ · SĐT: ' + ml.address, CW - 10).forEach((l) => { ensure(4.2); pdf.text(l, M + 6, y + 3); y += 4.2; });
        }
        if (ml.contact) {
          setF('normal'); pdf.setFontSize(8); pdf.setTextColor(...MUTE);
          wrap('Website: ' + ml.contact, CW - 10).forEach((l) => { ensure(4.2); pdf.text(l, M + 6, y + 3); y += 4.2; });
        }
        const dishLines = (ml.dishes || '').split(/\n/).map((x) => x.trim()).filter(Boolean);
        if (dishLines.length) {
          ensure(4.6); setF('bold'); pdf.setFontSize(8.3); pdf.setTextColor(...NAVY2);
          pdf.text('Menu:', M + 6, y + 3.2); y += 4.8;
          setF('normal'); pdf.setFontSize(8.4); pdf.setTextColor(...INK);
          dishLines.forEach((dl) => {
            wrap(dl, CW - 18).forEach((l, i) => {
              ensure(4.3);
              if (i === 0) { pdf.setFillColor(...TEAL); pdf.circle(M + 11, y + 2.1, 0.7, 'F'); }
              pdf.text(l, M + 14, y + 3); y += 4.3;
            });
          });
        }
        if (ml.note) {
          setF('normal'); pdf.setFontSize(8); pdf.setTextColor(...MUTE);
          wrap('Nhận xét set: ' + ml.note, CW - 10).forEach((l) => { ensure(4.2); pdf.text(l, M + 6, y + 3); y += 4.2; });
        }
        // thanh accent trái cho mỗi bữa
        if (y > top) { pdf.setFillColor(...TEAL); pdf.rect(M + 2.5, top + 1, 1.1, (y - top) - 1, 'F'); }
      });
      y += 3;
    }

    if (d.hotelName || d.hotelContact) { y += 1; para('🏨 Khách sạn:', [d.hotelName, d.hotelContact].filter(Boolean).join('   ·   '), 30); }
    if (d.venues.length) { y += 1.5; subLabel('Điểm tham quan'); contactLines(d.venues); }
    if (d.notes) { y += 1; para('Lưu ý:', d.notes); }
    if (d.checklist.length) {
      y += 1.5; subLabel('Checklist HDV');
      d.checklist.forEach((c) => {
        if (!c.text) return; ensure(4.6);
        const bx = M + 1.5, by = y + 1.2, bs = 3;
        pdf.setDrawColor(...(c.done ? TEAL : MUTE)); pdf.setLineWidth(0.3);
        pdf.roundedRect(bx, by, bs, bs, 0.6, 0.6, 'S');
        if (c.done) { pdf.setFillColor(...TEAL); pdf.roundedRect(bx, by, bs, bs, 0.6, 0.6, 'F'); pdf.setTextColor(...WHITE); setF('bold'); pdf.setFontSize(5.6); pdf.text('✓', bx + bs / 2, by + bs - 0.6, { align: 'center' }); }
        setF('normal'); pdf.setFontSize(8.3); pdf.setTextColor(...INK);
        pdf.text(c.text, bx + bs + 2.5, y + 3.6); y += 4.8;
      });
    }
    y += 4;
  });

  // ── Khách ──
  if (m.guests.length) {
    sectionHead('Danh sách khách & lưu ý đặc biệt');
    const w = [9, 56, 18, 44, 41, 16]; // tổng = CW (184); cột VIP đủ rộng cho "VIP"
    table(['#', 'Tên khách', 'Phòng', 'Ăn kiêng / Dị ứng', 'Y tế', 'VIP'],
      m.guests.map((g, i) => [String(i + 1), g.name || '—', g.room || '', g.dietary || '', g.medical || '', g.vip ? 'VIP' : '']),
      w, 5);
    if (m.guestNotes) { y += 2; para('Lưu ý đoàn:', m.guestNotes); }
    y += 4;
  }

  // ── NCC ──
  if (m.suppliers.length) {
    sectionHead('Danh bạ nhà cung cấp');
    const w = [CW * 0.26, CW * 0.3, CW * 0.2, CW * 0.24];
    table(['Loại', 'Tên', 'SĐT', 'Ghi chú'],
      m.suppliers.map((s) => [s.role || '', s.name || '', s.phone || '', s.note || '']), w);
    y += 4;
  }

  // ── Bao gồm / Không bao gồm (2 hộp tô màu) ──
  if (m.includes.length || m.excludes.length) {
    sectionHead('Bao gồm / Không bao gồm');
    const gap = 8, colW = (CW - gap) / 2, x1 = M, x2 = M + colW + gap;
    const incW = m.includes.filter(Boolean).map((t) => wrap(t, colW - 8));
    const excW = m.excludes.filter(Boolean).map((t) => wrap(t, colW - 8));
    const headH = 7, rowH = 4.5;
    const incH = headH + 2 + incW.reduce((s, a) => s + a.length, 0) * rowH + 2;
    const excH = headH + 2 + excW.reduce((s, a) => s + a.length, 0) * rowH + 2;
    const boxH = Math.max(incH, excH, headH + 8);
    ensure(boxH + 2);
    // khung
    pdf.setDrawColor(...LINE); pdf.setLineWidth(0.25);
    pdf.roundedRect(x1, y, colW, boxH, 1.8, 1.8, 'S');
    pdf.roundedRect(x2, y, colW, boxH, 1.8, 1.8, 'S');
    pdf.setFillColor(...GREENH); pdf.roundedRect(x1, y, colW, headH, 1.8, 1.8, 'F'); pdf.rect(x1, y + headH - 2, colW, 2, 'F');
    pdf.setFillColor(...REDH); pdf.roundedRect(x2, y, colW, headH, 1.8, 1.8, 'F'); pdf.rect(x2, y + headH - 2, colW, 2, 'F');
    setF('bold'); pdf.setFontSize(8.6);
    pdf.setTextColor(...GREEN); pdf.text('✓  GIÁ BAO GỒM', x1 + 3.5, y + 4.7);
    pdf.setTextColor(...RED); pdf.text('✕  KHÔNG BAO GỒM', x2 + 3.5, y + 4.7);
    const drawCol = (cx: number, lists: string[][], color: RGB) => {
      let yy = y + headH + 3.5;
      lists.forEach((a) => a.forEach((l, i) => {
        if (i === 0) { pdf.setFillColor(...color); pdf.circle(cx + 4, yy - 1, 0.8, 'F'); }
        setF('normal'); pdf.setFontSize(8.3); pdf.setTextColor(...INK);
        pdf.text(l, cx + 7, yy); yy += rowH;
      }));
    };
    drawCol(x1, incW, GREEN); drawCol(x2, excW, RED);
    y += boxH + 4;
  }

  if (m.generalNotes) { sectionHead('Lưu ý vận hành khác'); para('', m.generalNotes, 1); y += 2; }

  // ── Trang trí mọi trang: dải teal trên + chân trang đánh số ──
  const pages = pdf.internal.pages.length - 1;
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setFillColor(...TEAL); pdf.rect(0, 0, PW, 2.4, 'F');
    const fy = PH - 8;
    pdf.setDrawColor(...LINE); pdf.setLineWidth(0.2); pdf.line(M, fy - 3.5, PW - M, fy - 3.5);
    setF('normal'); pdf.setFontSize(7); pdf.setTextColor(...MUTE);
    pdf.text('VIETTOURS INCENTIVES & EVENTS · Tài liệu điều hành nội bộ', M, fy);
    if (m.code) pdf.text(m.code, PW / 2, fy, { align: 'center' });
    pdf.text(`Trang ${p}/${pages}`, PW - M, fy, { align: 'right' });
  }

  const slug = (m.title || '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 28);
  pdf.save(`Execution_${m.code || 'Tour'}_${slug}.pdf`);
}
