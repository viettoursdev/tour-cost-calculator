/**
 * Export the active quote draft to a PDF file.
 * Ported from legacy exportPDFVector at public/legacy.html:3256.
 * Vietnamese characters rendered via jsPDF's built-in UTF-8 support.
 */
import { jsPDF } from 'jspdf';
import { getCATS } from '@/components/quote/constants';
import { plainNote } from '@/lib/util';
import { calcVND, computeTotals, fmtVND } from '@/components/quote/calc';
import { pricingLines } from '@/components/quote/pricing';
import { loadVNFont } from './vnFont';
import { BRAND_TEAL, BRAND_HOTLINE, drawLogo, LOGO_W_MM } from './brand';
import type { Item, QuoteDraft } from '@/types';

type ExportParams = {
  draft: QuoteDraft;
  savedBy: { name: string; role: string; email?: string; phone?: string };
  /** 'detailed' = full breakdown + profit summary (internal);
   *  'package'  = customer-facing trọn gói: giá/khách × số khách = tổng, no costs/margin. */
  mode?: 'detailed' | 'package';
};

export function exportPDFQuote({ draft, savedBy, mode = 'detailed' }: ExportParams): void {
  const { info, items, rates, pax, catEnabled, template, margin, vat, inclusions, exclusions, payments } = draft;
  if (!template || template === 'dmc') return;
  const isPackage = mode === 'package';

  // Multi group-size: reconcile the active group's stored snapshot with the
  // live top-level draft (which is fresher), then compute a price per group.
  const groupVariants = (draft.groups && draft.groups.length)
    ? draft.groups.map((g) => (g.id === draft.activeGroupId
        ? { label: g.label, pax, items, catEnabled }
        : { label: g.label, pax: g.pax, items: g.items, catEnabled: g.catEnabled }))
    : null;

  const totals = computeTotals(draft);
  const roundedPPax = totals.roundedPPax;
  const activeCATS = getCATS(template);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const hasFont = loadVNFont(pdf);
  const FONT = hasFont ? 'DejaVu' : 'helvetica';
  const pageW = 210, mX = 15;
  let y = 18;

  const teal: [number, number, number] = BRAND_TEAL;
  const dark: [number, number, number] = [15, 58, 74];
  const gray: [number, number, number] = [120, 130, 140];
  const red: [number, number, number] = [220, 50, 80];
  const gold: [number, number, number] = [245, 166, 35];

  const checkPage = (need: number) => {
    if (y + need > 279) { pdf.addPage(); y = 18; }
  };

  // Header band
  pdf.setFillColor(...teal);
  pdf.rect(0, 0, pageW, 8, 'F');

  // Logo (chuẩn 46.5×12.5mm) + tên công ty. Khối chữ đặt BÊN PHẢI logo, bắt đầu
  // sau mép phải logo để không đè; chiều rộng giới hạn để tránh chạm cột nhân viên.
  const logoBottom = drawLogo(pdf, mX, y);
  const brandX = mX + LOGO_W_MM + 5;
  // Chừa ~36mm bên phải cho cột nhân viên báo giá.
  const brandMaxW = pageW - mX - 36 - brandX;
  // Tên công ty: THU NHỎ vừa 1 dòng (không xuống dòng đè lên hotline).
  pdf.setFont(FONT, 'bold');
  let brandSize = 12;
  pdf.setFontSize(brandSize);
  const brandW = pdf.getTextWidth('VIETTOURS INCENTIVES & EVENTS');
  if (brandW > brandMaxW) brandSize = Math.max(8, (brandSize * brandMaxW) / brandW);
  pdf.setFontSize(brandSize); pdf.setTextColor(...teal);
  pdf.text('VIETTOURS INCENTIVES & EVENTS', brandX, y + 6);
  pdf.setFontSize(7.5); pdf.setTextColor(...gray); pdf.setFont(FONT, 'normal');
  pdf.text(`Hotline ${BRAND_HOTLINE}  ·  www.viettours.com.vn`, brandX, y + 11, { maxWidth: brandMaxW });

  // Salesperson contact (right side)
  pdf.setFontSize(7); pdf.setTextColor(...gray); pdf.setFont(FONT, 'normal');
  pdf.text('NHÂN VIÊN BÁO GIÁ', pageW - mX, y + 2, { align: 'right' });
  pdf.setFontSize(9.5); pdf.setTextColor(...dark); pdf.setFont(FONT, 'bold');
  pdf.text(savedBy.name, pageW - mX, y + 7, { align: 'right' });
  pdf.setFont(FONT, 'normal'); pdf.setFontSize(8); pdf.setTextColor(...gray);
  let cy = y + 11.5;
  if (savedBy.phone) { pdf.text(`ĐT: ${savedBy.phone}`, pageW - mX, cy, { align: 'right' }); cy += 4; }
  if (savedBy.email) { pdf.text(savedBy.email, pageW - mX, cy, { align: 'right' }); }
  // Đặt mốc kế tiếp DƯỚI điểm thấp nhất của logo & khối liên hệ (không đè).
  y = Math.max(logoBottom, cy) + 4;

  // Quote title band
  pdf.setFillColor(...teal);
  pdf.roundedRect(mX, y, pageW - mX * 2, 26, 3, 3, 'F');
  pdf.setTextColor(255, 255, 255); pdf.setFont(FONT, 'bold'); pdf.setFontSize(9);
  pdf.text('BÁO GIÁ TOUR / QUOTATION', pageW / 2, y + 7, { align: 'center' });
  pdf.setFontSize(16);
  const tourTitle = (info.name || 'Tour').slice(0, 50); // truncate long names
  pdf.text(tourTitle, pageW / 2, y + 15, { align: 'center' });
  pdf.setFontSize(10); pdf.setTextColor(255, 224, 130); pdf.setFont(FONT, 'normal');
  pdf.text(`${info.dest || ''} · ${info.days}N${info.nights}Đ · ${pax} khách`, pageW / 2, y + 22, { align: 'center' });
  y += 34;

  if (info.startDate) {
    pdf.setFontSize(9); pdf.setTextColor(...dark); pdf.setFont(FONT, 'normal');
    const startD = new Date(info.startDate);
    const endD = new Date(startD.getTime() + (info.days - 1) * 86400000);
    const fmtD = (d: Date) => d.toLocaleDateString('vi-VN');
    // KHÔNG dùng "→": font VN nhúng (DejaVu subset) thiếu glyph mũi tên → vỡ chữ. Dùng "-".
    pdf.text(`Khởi hành: ${fmtD(startD)}  -  Kết thúc: ${fmtD(endD)}`, pageW / 2, y, { align: 'center' });
    y += 7;
  }

  // Price highlight box
  pdf.setFillColor(255, 248, 225);
  pdf.roundedRect(mX, y, pageW - mX * 2, 24, 3, 3, 'F');
  pdf.setDrawColor(...gold); pdf.setLineWidth(0.5);
  pdf.roundedRect(mX, y, pageW - mX * 2, 24, 3, 3, 'S');
  pdf.setFontSize(9); pdf.setTextColor(...teal); pdf.setFont(FONT, 'bold');
  pdf.text('GIÁ TRỌN GÓI / KHÁCH · PACKAGE PRICE / PAX', pageW / 2, y + 8, { align: 'center' });
  pdf.setFontSize(22); pdf.setTextColor(...red);
  pdf.text(fmtVND(roundedPPax), pageW / 2, y + 18, { align: 'center' });
  y += 30;
  pdf.setFontSize(9); pdf.setTextColor(...dark); pdf.setFont(FONT, 'normal');
  pdf.text(`Tổng đoàn ${pax} khách: ${fmtVND(roundedPPax * pax)}`, pageW / 2, y, { align: 'center' });
  y += 12;

  // Services section
  pdf.setFontSize(11); pdf.setTextColor(...teal); pdf.setFont(FONT, 'bold');
  pdf.text('DỊCH VỤ BAO GỒM / INCLUDED SERVICES', mX, y);
  y += 3;
  pdf.setDrawColor(...teal); pdf.setLineWidth(0.5);
  pdf.line(mX, y, pageW - mX, y);
  y += 7;

  activeCATS.forEach(cat => {
    if (!catEnabled[cat.id as keyof typeof catEnabled]) return;
    const catItems = (items[cat.id as keyof typeof items] ?? [])
      .filter((i: Item) => i.name && !i.optional && (calcVND(i, rates, pax) > 0 || i.foc === true || i.included === true));
    if (catItems.length === 0) return;
    const sub = catItems.reduce((s: number, i: Item) => s + calcVND(i, rates, pax), 0);
    checkPage(13);
    pdf.setFontSize(10); pdf.setTextColor(...dark); pdf.setFont(FONT, 'bold');
    pdf.text(`${cat.label} / ${cat.labelEn}`, mX, y);
    if (!isPackage) {
      pdf.setTextColor(...teal);
      pdf.text(pax > 0 ? fmtVND(sub / pax) + '/khách' : '', pageW - mX, y, { align: 'right' });
    }
    y += 7;
    pdf.setFont(FONT, 'normal'); pdf.setFontSize(9);
    catItems.forEach((it: Item) => {
      checkPage(12);
      const itVnd = calcVND(it, rates, pax);
      pdf.setTextColor(...dark);
      const nameText = `• ${(it.name || '').slice(0, 55)}`;
      pdf.text(nameText, mX + 4, y);
      if (it.foc) {
        pdf.setTextColor(39, 174, 96); pdf.setFont(FONT, 'bold');
        pdf.text('FOC - Miễn phí', pageW - mX, y, { align: 'right' });
        pdf.setFont(FONT, 'normal');
      } else if (it.included) {
        pdf.setTextColor(37, 99, 235); pdf.setFont(FONT, 'bold');
        pdf.text('Đã bao gồm', pageW - mX, y, { align: 'right' });
        pdf.setFont(FONT, 'normal');
      } else if (!isPackage) {
        pdf.setTextColor(...teal);
        pdf.text(fmtVND(itVnd), pageW - mX, y, { align: 'right' });
      }
      y += 5.4;
      if (it.note) {
        checkPage(6);
        pdf.setTextColor(...gray); pdf.setFontSize(8);
        const noteOneLine = plainNote(it.note).replace(/\s*\n\s*/g, ' · ');
        pdf.text(`   ${noteOneLine.slice(0, 70)}`, mX + 6, y);
        y += 5; pdf.setFontSize(9);
      }
    });
    y += 4.5;
  });

  // Optional add-on items (not counted in the total).
  const optItems: { name: string; vnd: number }[] = [];
  activeCATS.forEach((cat) => {
    if (!catEnabled[cat.id as keyof typeof catEnabled]) return;
    (items[cat.id as keyof typeof items] ?? []).forEach((i: Item) => {
      if (i.optional && i.name && !i.foc) optItems.push({ name: i.name, vnd: calcVND(i, rates, pax) });
    });
  });
  if (optItems.length) {
    checkPage(14 + optItems.length * 5);
    y += 2;
    pdf.setFontSize(11); pdf.setTextColor(...gold); pdf.setFont(FONT, 'bold');
    pdf.text('CHI PHÍ TUỲ CHỌN / OPTIONAL (chưa gồm trong giá)', mX, y);
    y += 3;
    pdf.setDrawColor(...gold); pdf.setLineWidth(0.5);
    pdf.line(mX, y, pageW - mX, y);
    y += 6;
    pdf.setFont(FONT, 'normal'); pdf.setFontSize(9);
    optItems.forEach((o) => {
      checkPage(7);
      pdf.setTextColor(...dark);
      pdf.text(`• ${o.name.slice(0, 55)}`, mX + 4, y);
      pdf.setTextColor(194, 65, 12);
      pdf.text(fmtVND(o.vnd), pageW - mX, y, { align: 'right' });
      y += 5.4;
    });
  }

  const col1 = mX + 5, col2 = pageW - mX - 5;
  if (isPackage && groupVariants) {
    // Multi group-size package table.
    const colPpax = pageW - mX - 62;
    const rowH = 7;
    const boxH = 14 + groupVariants.length * rowH + 4;
    checkPage(boxH + 4);
    y += 4;
    pdf.setFillColor(...dark);
    pdf.roundedRect(mX, y, pageW - mX * 2, boxH, 2, 2, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont(FONT, 'bold'); pdf.setFontSize(9);
    pdf.text('GIÁ TRỌN GÓI THEO MỨC KHÁCH / PACKAGE BY GROUP SIZE', pageW / 2, y + 6, { align: 'center' });
    pdf.setFontSize(8); pdf.setTextColor(200, 230, 224);
    pdf.text('Mức khách', col1, y + 12);
    pdf.text('Giá / khách', colPpax, y + 12, { align: 'right' });
    pdf.text('Tổng tiền', col2, y + 12, { align: 'right' });
    let ry = y + 12 + rowH;
    groupVariants.forEach((g) => {
      const gv = computeTotals({ template, info, pax: g.pax, rates, margin, vat, svcBasis: draft.svcBasis, rounding: draft.rounding, items: g.items, catEnabled: g.catEnabled, currentQuoteId: null });
      pdf.setFont(FONT, 'normal'); pdf.setFontSize(9); pdf.setTextColor(255, 255, 255);
      pdf.text(`${g.label} (${g.pax} khách)`, col1, ry);
      pdf.text(fmtVND(gv.roundedPPax), colPpax, ry, { align: 'right' });
      pdf.setFont(FONT, 'bold'); pdf.setTextColor(255, 224, 130);
      pdf.text(fmtVND(gv.roundedPPax * g.pax), col2, ry, { align: 'right' });
      ry += rowH;
    });
    y += boxH + 4;
  } else if (isPackage) {
    // Single package total box: giá bán/khách × số khách = tổng tiền
    checkPage(40);
    y += 4;
    pdf.setFillColor(...dark);
    pdf.roundedRect(mX, y, pageW - mX * 2, 36, 2, 2, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont(FONT, 'bold'); pdf.setFontSize(9);
    pdf.text('TRỌN GÓI / PACKAGE', pageW / 2, y + 7, { align: 'center' });
    pdf.setFont(FONT, 'normal'); pdf.setFontSize(10);
    let ry = y + 16;
    pdf.text('Giá bán / khách:', col1, ry);
    pdf.text(fmtVND(roundedPPax), col2, ry, { align: 'right' });
    ry += 7;
    pdf.text('Số lượng khách:', col1, ry);
    pdf.text(`${pax} khách`, col2, ry, { align: 'right' });
    ry += 8;
    pdf.setDrawColor(255, 224, 130); pdf.setLineWidth(0.3);
    pdf.line(col1, ry - 4, col2, ry - 4);
    pdf.setFont(FONT, 'bold'); pdf.setFontSize(12); pdf.setTextColor(255, 224, 130);
    pdf.text('TỔNG TIỀN / TOTAL:', col1, ry);
    pdf.text(fmtVND(roundedPPax * pax), col2, ry, { align: 'right' });
    y += 40;
  } else {
    // Pricing summary (internal — costs + margin)
    checkPage(50);
    y += 4;
    pdf.setFillColor(...dark);
    pdf.roundedRect(mX, y, pageW - mX * 2, 46, 2, 2, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont(FONT, 'bold'); pdf.setFontSize(9);
    pdf.text('TỔNG BÁO GIÁ / QUOTATION SUMMARY', pageW / 2, y + 7, { align: 'center' });
    pdf.setFont(FONT, 'normal'); pdf.setFontSize(9);
    const rows: [string, string][] = [
      [`Tổng chi phí gốc (${pax} khách):`, fmtVND(totals.totalCost)],
      [`Phí dịch vụ (${margin}%):`, fmtVND(totals.totalProfit)],
      [`Thuế VAT (${vat}%):`, fmtVND(totals.totalVAT)],
    ];
    let ry = y + 14;
    rows.forEach(([lab, val]) => {
      pdf.text(lab, col1, ry); pdf.text(val, col2, ry, { align: 'right' });
      ry += 6;
    });
    pdf.setFont(FONT, 'bold'); pdf.setFontSize(11);
    pdf.setTextColor(255, 224, 130);
    pdf.text('Giá bán / khách:', col1, ry);
    pdf.text(fmtVND(roundedPPax), col2, ry, { align: 'right' });
    y += 50;
  }

  // Pricing add-ons (package mode): single-room supplement, child, infant, tips…
  if (isPackage) {
    const addOns = pricingLines(draft.pricingOptions, roundedPPax);
    if (addOns.length) {
      checkPage(16 + addOns.length * 6);
      y += 4;
      pdf.setFontSize(11); pdf.setTextColor(...teal); pdf.setFont(FONT, 'bold');
      pdf.text('PHỤ THU / GIÁ KHÁC · SUPPLEMENTS', mX, y);
      y += 2.5;
      pdf.setDrawColor(...teal); pdf.setLineWidth(0.4);
      pdf.line(mX, y, pageW - mX, y);
      y += 6;
      addOns.forEach((l) => {
        checkPage(7);
        pdf.setFont(FONT, 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(...dark);
        pdf.text(`${l.label}`, mX + 1, y);
        pdf.setTextColor(...gray); pdf.setFontSize(8);
        pdf.text(`(${l.detail})`, mX + 70, y);
        pdf.setFontSize(9.5); pdf.setTextColor(...teal); pdf.setFont(FONT, 'bold');
        pdf.text(fmtVND(l.resolved), pageW - mX, y, { align: 'right' });
        y += 6;
      });
    }
  }

  // Customer-facing terms: inclusions / exclusions / payments
  const renderBullets = (title: string, lines: string[], accent: [number, number, number]) => {
    const valid = lines.map((s) => s.trim()).filter(Boolean);
    if (!valid.length) return;
    checkPage(16);
    y += 4;
    pdf.setFontSize(11); pdf.setTextColor(...accent); pdf.setFont(FONT, 'bold');
    pdf.text(title, mX, y);
    y += 2.5;
    pdf.setDrawColor(...accent); pdf.setLineWidth(0.4);
    pdf.line(mX, y, pageW - mX, y);
    y += 6;
    valid.forEach((line) => {
      const wrapped: string[] = pdf.splitTextToSize(line, pageW - mX * 2 - 6);
      checkPage(wrapped.length * 4.5 + 2);
      pdf.setFont(FONT, 'bold'); pdf.setFontSize(9); pdf.setTextColor(...accent);
      pdf.text('•', mX + 1, y);
      pdf.setFont(FONT, 'normal'); pdf.setTextColor(...dark);
      pdf.text(wrapped, mX + 6, y);
      y += wrapped.length * 4.5 + 1.5;
    });
  };
  renderBullets('GIÁ BAO GỒM / INCLUDED', inclusions ?? [], teal);
  renderBullets('KHÔNG BAO GỒM / EXCLUDED', exclusions ?? [], red);

  const validPayments = (payments ?? []).filter((p) => p.label.trim() || p.amount || p.note.trim());
  if (validPayments.length) {
    checkPage(16);
    y += 4;
    pdf.setFontSize(11); pdf.setTextColor(...teal); pdf.setFont(FONT, 'bold');
    pdf.text('THÔNG TIN THANH TOÁN / PAYMENT TERMS', mX, y);
    y += 2.5;
    pdf.setDrawColor(...teal); pdf.setLineWidth(0.4);
    pdf.line(mX, y, pageW - mX, y);
    y += 6;
    validPayments.forEach((p) => {
      checkPage(10);
      pdf.setFont(FONT, 'bold'); pdf.setFontSize(10); pdf.setTextColor(...dark);
      pdf.text(p.label || '', mX + 1, y);
      if (p.amount) {
        pdf.setTextColor(...teal);
        pdf.text(fmtVND(p.amount), pageW - mX, y, { align: 'right' });
      }
      y += 5;
      if (p.note && p.note.trim()) {
        pdf.setFont(FONT, 'normal'); pdf.setFontSize(9); pdf.setTextColor(...gray);
        const wn: string[] = pdf.splitTextToSize(p.note.trim(), pageW - mX * 2 - 6);
        checkPage(wn.length * 4.2 + 2);
        pdf.text(wn, mX + 6, y);
        y += wn.length * 4.2 + 2;
      }
      y += 1.5;
    });
  }

  // Footer
  checkPage(15);
  pdf.setFontSize(8); pdf.setTextColor(...gray); pdf.setFont(FONT, 'normal');
  const contactBits = [savedBy.phone, savedBy.email].filter(Boolean).join(' · ');
  pdf.text(
    `Báo giá có hiệu lực 07 ngày · Phụ trách: ${savedBy.name}${contactBits ? ' · ' + contactBits : ''} · ${new Date().toLocaleDateString('vi-VN')}`,
    pageW / 2, y, { align: 'center' },
  );

  const safeName = (info.name || 'Tour').replace(/[^a-zA-Z0-9_]/g, '_');
  const dateStr = new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');
  pdf.save(`BaoGia${isPackage ? 'TronGoi' : ''}_${safeName}_${dateStr}.pdf`);
}
