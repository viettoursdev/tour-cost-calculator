/**
 * Export the active quote draft to a PDF file.
 * Ported from legacy exportPDFVector at public/legacy.html:3256.
 * Vietnamese characters rendered via jsPDF's built-in UTF-8 support.
 */
import { jsPDF } from 'jspdf';
import { getCATS } from '@/components/quote/constants';
import { calcVND, computeTotals, fmtVND } from '@/components/quote/calc';
import { loadVNFont } from './vnFont';
import { VTE_LOGO } from './vteLogo';
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

  const totals = computeTotals(draft);
  const roundedPPax = totals.roundedPPax;
  const activeCATS = getCATS(template);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const hasFont = loadVNFont(pdf);
  const FONT = hasFont ? 'DejaVu' : 'helvetica';
  const pageW = 210, mX = 15;
  let y = 18;

  const teal: [number, number, number] = [20, 160, 140];
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

  // Logo + company name
  try { pdf.addImage(VTE_LOGO, 'PNG', mX, y, 36, 21, undefined, 'FAST'); } catch { /* ignore */ }
  pdf.setFontSize(15); pdf.setTextColor(...teal); pdf.setFont(FONT, 'bold');
  pdf.text('VIETTOURS INCENTIVES & EVENTS', mX + 40, y + 9);
  pdf.setFontSize(7.5); pdf.setTextColor(...gray); pdf.setFont(FONT, 'normal');
  pdf.text('Hotline 1900 1839  ·  www.viettours.com.vn', mX + 40, y + 14);

  // Salesperson contact (right side)
  pdf.setFontSize(7); pdf.setTextColor(...gray); pdf.setFont(FONT, 'normal');
  pdf.text('NHAN VIEN BAO GIA', pageW - mX, y + 2, { align: 'right' });
  pdf.setFontSize(9.5); pdf.setTextColor(...dark); pdf.setFont(FONT, 'bold');
  pdf.text(savedBy.name, pageW - mX, y + 7, { align: 'right' });
  pdf.setFont(FONT, 'normal'); pdf.setFontSize(8); pdf.setTextColor(...gray);
  let cy = y + 11.5;
  if (savedBy.phone) { pdf.text(`DT: ${savedBy.phone}`, pageW - mX, cy, { align: 'right' }); cy += 4; }
  if (savedBy.email) { pdf.text(savedBy.email, pageW - mX, cy, { align: 'right' }); }
  y += 24;

  // Quote title band
  pdf.setFillColor(...teal);
  pdf.roundedRect(mX, y, pageW - mX * 2, 26, 3, 3, 'F');
  pdf.setTextColor(255, 255, 255); pdf.setFont(FONT, 'bold'); pdf.setFontSize(9);
  pdf.text('BAO GIA TOUR / QUOTATION', pageW / 2, y + 7, { align: 'center' });
  pdf.setFontSize(16);
  const tourTitle = (info.name || 'Tour').slice(0, 50); // truncate long names
  pdf.text(tourTitle, pageW / 2, y + 15, { align: 'center' });
  pdf.setFontSize(10); pdf.setTextColor(255, 224, 130); pdf.setFont(FONT, 'normal');
  pdf.text(`${info.dest || ''} - ${info.days}N${info.nights}D - ${pax} khach`, pageW / 2, y + 22, { align: 'center' });
  y += 34;

  if (info.startDate) {
    pdf.setFontSize(9); pdf.setTextColor(...dark); pdf.setFont(FONT, 'normal');
    const startD = new Date(info.startDate);
    const endD = new Date(startD.getTime() + (info.days - 1) * 86400000);
    const fmtD = (d: Date) => d.toLocaleDateString('en-GB');
    pdf.text(`Khoi hanh: ${fmtD(startD)}  ->  Ket thuc: ${fmtD(endD)}`, pageW / 2, y, { align: 'center' });
    y += 7;
  }

  // Price highlight box
  pdf.setFillColor(255, 248, 225);
  pdf.roundedRect(mX, y, pageW - mX * 2, 24, 3, 3, 'F');
  pdf.setDrawColor(...gold); pdf.setLineWidth(0.5);
  pdf.roundedRect(mX, y, pageW - mX * 2, 24, 3, 3, 'S');
  pdf.setFontSize(9); pdf.setTextColor(...teal); pdf.setFont(FONT, 'bold');
  pdf.text('GIA TRON GOI / KHACH · PACKAGE PRICE / PAX', pageW / 2, y + 8, { align: 'center' });
  pdf.setFontSize(22); pdf.setTextColor(...red);
  pdf.text(fmtVND(roundedPPax), pageW / 2, y + 18, { align: 'center' });
  y += 30;
  pdf.setFontSize(9); pdf.setTextColor(...dark); pdf.setFont(FONT, 'normal');
  pdf.text(`Tong doan ${pax} khach: ${fmtVND(roundedPPax * pax)}`, pageW / 2, y, { align: 'center' });
  y += 12;

  // Services section
  pdf.setFontSize(11); pdf.setTextColor(...teal); pdf.setFont(FONT, 'bold');
  pdf.text('DICH VU BAO GOM / INCLUDED SERVICES', mX, y);
  y += 3;
  pdf.setDrawColor(...teal); pdf.setLineWidth(0.5);
  pdf.line(mX, y, pageW - mX, y);
  y += 7;

  activeCATS.forEach(cat => {
    if (!catEnabled[cat.id as keyof typeof catEnabled]) return;
    const catItems = (items[cat.id as keyof typeof items] ?? [])
      .filter((i: Item) => i.name && (calcVND(i, rates, pax) > 0 || i.foc === true));
    if (catItems.length === 0) return;
    const sub = catItems.reduce((s: number, i: Item) => s + calcVND(i, rates, pax), 0);
    checkPage(10);
    pdf.setFontSize(10); pdf.setTextColor(...dark); pdf.setFont(FONT, 'bold');
    pdf.text(`${cat.label} / ${cat.labelEn}`, mX, y);
    if (!isPackage) {
      pdf.setTextColor(...teal);
      pdf.text(pax > 0 ? fmtVND(sub / pax) + '/khach' : '', pageW - mX, y, { align: 'right' });
    }
    y += 5;
    pdf.setFont(FONT, 'normal'); pdf.setFontSize(9);
    catItems.forEach((it: Item) => {
      checkPage(9);
      const itVnd = calcVND(it, rates, pax);
      pdf.setTextColor(...dark);
      const nameText = `• ${(it.name || '').slice(0, 55)}`;
      pdf.text(nameText, mX + 4, y);
      if (it.foc) {
        pdf.setTextColor(39, 174, 96); pdf.setFont(FONT, 'bold');
        pdf.text('FOC - Mien phi', pageW - mX, y, { align: 'right' });
        pdf.setFont(FONT, 'normal');
      } else if (!isPackage) {
        pdf.setTextColor(...teal);
        pdf.text(fmtVND(itVnd), pageW - mX, y, { align: 'right' });
      }
      y += 4;
      if (it.note) {
        checkPage(5);
        pdf.setTextColor(...gray); pdf.setFontSize(8);
        pdf.text(`   ${it.note.slice(0, 70)}`, mX + 6, y);
        y += 4; pdf.setFontSize(9);
      }
    });
    y += 2;
  });

  const col1 = mX + 5, col2 = pageW - mX - 5;
  if (isPackage) {
    // Package total box: giá bán/khách × số khách = tổng tiền
    checkPage(40);
    y += 4;
    pdf.setFillColor(...dark);
    pdf.roundedRect(mX, y, pageW - mX * 2, 36, 2, 2, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont(FONT, 'bold'); pdf.setFontSize(9);
    pdf.text('TRON GOI / PACKAGE', pageW / 2, y + 7, { align: 'center' });
    pdf.setFont(FONT, 'normal'); pdf.setFontSize(10);
    let ry = y + 16;
    pdf.text('Gia ban / khach:', col1, ry);
    pdf.text(fmtVND(roundedPPax), col2, ry, { align: 'right' });
    ry += 7;
    pdf.text('So luong khach:', col1, ry);
    pdf.text(`${pax} khach`, col2, ry, { align: 'right' });
    ry += 8;
    pdf.setDrawColor(255, 224, 130); pdf.setLineWidth(0.3);
    pdf.line(col1, ry - 4, col2, ry - 4);
    pdf.setFont(FONT, 'bold'); pdf.setFontSize(12); pdf.setTextColor(255, 224, 130);
    pdf.text('TONG TIEN / TOTAL:', col1, ry);
    pdf.text(fmtVND(roundedPPax * pax), col2, ry, { align: 'right' });
    y += 40;
  } else {
    // Pricing summary (internal — costs + margin)
    checkPage(50);
    y += 4;
    pdf.setFillColor(...dark);
    pdf.roundedRect(mX, y, pageW - mX * 2, 46, 2, 2, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont(FONT, 'bold'); pdf.setFontSize(9);
    pdf.text('TOM TAT LUI NHUAN / PROFIT SUMMARY', pageW / 2, y + 7, { align: 'center' });
    pdf.setFont(FONT, 'normal'); pdf.setFontSize(9);
    const rows: [string, string][] = [
      [`Tong chi phi goc (${pax} khach):`, fmtVND(totals.totalCost)],
      [`Phi dich vu (${margin}%):`, fmtVND(totals.totalProfit)],
      [`Thue VAT (${vat}%):`, fmtVND(totals.totalVAT)],
    ];
    let ry = y + 14;
    rows.forEach(([lab, val]) => {
      pdf.text(lab, col1, ry); pdf.text(val, col2, ry, { align: 'right' });
      ry += 6;
    });
    pdf.setFont(FONT, 'bold'); pdf.setFontSize(11);
    pdf.setTextColor(255, 224, 130);
    pdf.text('Gia ban / khach:', col1, ry);
    pdf.text(fmtVND(roundedPPax), col2, ry, { align: 'right' });
    y += 50;
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
  renderBullets('GIA BAO GOM / INCLUDED', inclusions ?? [], teal);
  renderBullets('KHONG BAO GOM / EXCLUDED', exclusions ?? [], red);

  const validPayments = (payments ?? []).filter((p) => p.label.trim() || p.amount || p.note.trim());
  if (validPayments.length) {
    checkPage(16);
    y += 4;
    pdf.setFontSize(11); pdf.setTextColor(...teal); pdf.setFont(FONT, 'bold');
    pdf.text('THONG TIN THANH TOAN / PAYMENT TERMS', mX, y);
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
    `Bao gia co hieu luc 07 ngay · Phu trach: ${savedBy.name} (${savedBy.role})${contactBits ? ' · ' + contactBits : ''} · ${new Date().toLocaleDateString('vi-VN')}`,
    pageW / 2, y, { align: 'center' },
  );

  const safeName = (info.name || 'Tour').replace(/[^a-zA-Z0-9_]/g, '_');
  const dateStr = new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');
  pdf.save(`BaoGia${isPackage ? 'TronGoi' : ''}_${safeName}_${dateStr}.pdf`);
}
