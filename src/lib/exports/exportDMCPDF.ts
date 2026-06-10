/**
 * Export the DMC breakdown to a PDF (internal cost sheet).
 * Mirrors exportPDF.ts styling but DMC-specific: navy theme, breakdown items,
 * DMC service charge (no VAT) + per-group-size price comparison.
 */
import { jsPDF } from 'jspdf';
import { getCATS } from '@/components/quote/constants';
import { calcVND, computeTotals, qtyOf } from '@/components/quote/calc';
import { fmtCurrency, toOutputCurrency } from '@/lib/currency';
import { loadVNFont } from './vnFont';
import { VTE_LOGO } from './vteLogo';
import type { Item, QuoteDraft } from '@/types';

type Params = {
  draft: QuoteDraft;
  savedBy: { name: string; role: string; email?: string; phone?: string };
};

const GROUP_SIZES = [20, 25, 30, 35, 40];

export function exportDMCPDF({ draft, savedBy }: Params): void {
  const { info, items, rates, pax, catEnabled, template } = draft;
  if (template !== 'dmc') return;
  const cur = draft.outputCurrency ?? 'USD';
  const dmcMargin = draft.dmcMargin ?? { type: 'percent' as const, value: 0 };
  const dmcPrices = draft.dmcPrices ?? {};

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const FONT = loadVNFont(pdf) ? 'DejaVu' : 'helvetica';
  const pageW = 210, mX = 15;
  let y = 18;

  const navy: [number, number, number] = [15, 58, 74];
  const navyLt: [number, number, number] = [28, 90, 122];
  const gray: [number, number, number] = [120, 130, 140];
  const checkPage = (need: number) => { if (y + need > 279) { pdf.addPage(); y = 18; } };

  const marginVND = dmcMargin.type === 'percent'
    ? Math.round(computeTotals(draft).totalCost * (dmcMargin.value || 0) / 100)
    : Math.round((dmcMargin.value || 0) * (cur !== 'VND' && rates[cur] ? rates[cur] : 1));
  const subtotalVND = computeTotals(draft).totalCost;
  const totalVND = subtotalVND + marginVND;

  // Header band + logo + salesperson
  pdf.setFillColor(...navy); pdf.rect(0, 0, pageW, 8, 'F');
  try { pdf.addImage(VTE_LOGO, 'PNG', mX, y, 34, 20, undefined, 'FAST'); } catch { /* ignore */ }
  pdf.setFontSize(12); pdf.setTextColor(...navy); pdf.setFont(FONT, 'bold');
  pdf.text('VIETTOURS INCENTIVES & EVENTS', mX + 37, y + 8, { maxWidth: 95 });
  pdf.setFontSize(7.5); pdf.setTextColor(...gray); pdf.setFont(FONT, 'normal');
  pdf.text('Hotline 1900 1839  ·  www.viettours.com.vn', mX + 37, y + 14, { maxWidth: 95 });
  pdf.setFontSize(7); pdf.setTextColor(...gray);
  pdf.text('NHÂN VIÊN PHỤ TRÁCH', pageW - mX, y + 2, { align: 'right' });
  pdf.setFontSize(9.5); pdf.setTextColor(...navy); pdf.setFont(FONT, 'bold');
  pdf.text(savedBy.name, pageW - mX, y + 7, { align: 'right' });
  pdf.setFont(FONT, 'normal'); pdf.setFontSize(8); pdf.setTextColor(...gray);
  let cy = y + 11.5;
  if (savedBy.phone) { pdf.text(`ĐT: ${savedBy.phone}`, pageW - mX, cy, { align: 'right' }); cy += 4; }
  if (savedBy.email) { pdf.text(savedBy.email, pageW - mX, cy, { align: 'right' }); }
  y += 24;

  // Title band
  pdf.setFillColor(...navy);
  pdf.roundedRect(mX, y, pageW - mX * 2, 24, 3, 3, 'F');
  pdf.setTextColor(255, 255, 255); pdf.setFont(FONT, 'bold'); pdf.setFontSize(9);
  pdf.text('BREAKDOWN CHI PHÍ DMC / DMC COST BREAKDOWN', pageW / 2, y + 7, { align: 'center' });
  pdf.setFontSize(15);
  pdf.text((info.name || 'Tour').slice(0, 50), pageW / 2, y + 15, { align: 'center' });
  pdf.setFontSize(9.5); pdf.setTextColor(255, 224, 130); pdf.setFont(FONT, 'normal');
  pdf.text(`${info.dest || ''} · ${info.days}N${info.nights}Đ · ${pax} khách · ${cur}`, pageW / 2, y + 21, { align: 'center' });
  y += 32;

  const money = (vnd: number) => fmtCurrency(toOutputCurrency(vnd, cur, rates), cur);

  // Breakdown items by category
  pdf.setFontSize(11); pdf.setTextColor(...navy); pdf.setFont(FONT, 'bold');
  pdf.text('CHI TIẾT BREAKDOWN', mX, y);
  y += 3; pdf.setDrawColor(...navy); pdf.setLineWidth(0.5); pdf.line(mX, y, pageW - mX, y); y += 6;

  getCATS('dmc').forEach((cat) => {
    if (!catEnabled[cat.id as keyof typeof catEnabled]) return;
    const catItems = (items[cat.id as keyof typeof items] ?? [])
      .filter((i: Item) => i.name && calcVND(i, rates, pax) > 0);
    if (catItems.length === 0) return;
    const sub = catItems.reduce((s: number, i: Item) => s + calcVND(i, rates, pax), 0);
    checkPage(10);
    pdf.setFontSize(10); pdf.setTextColor(...navy); pdf.setFont(FONT, 'bold');
    pdf.text(`${cat.label} / ${cat.labelEn}`, mX, y);
    pdf.setTextColor(...navyLt);
    pdf.text(money(sub), pageW - mX, y, { align: 'right' });
    y += 5;
    pdf.setFont(FONT, 'normal'); pdf.setFontSize(9);
    catItems.forEach((it: Item) => {
      checkPage(6);
      pdf.setTextColor(...navy);
      pdf.text(`• ${(it.name || '').slice(0, 50)} (x${qtyOf(it, pax)})`, mX + 4, y);
      pdf.setTextColor(...navyLt);
      pdf.text(money(calcVND(it, rates, pax)), pageW - mX, y, { align: 'right' });
      y += 4.5;
    });
    y += 2;
  });

  // Totals
  checkPage(34);
  y += 2;
  pdf.setFillColor(...navy);
  pdf.roundedRect(mX, y, pageW - mX * 2, 30, 2, 2, 'F');
  const col1 = mX + 5, col2 = pageW - mX - 5;
  pdf.setTextColor(255, 255, 255); pdf.setFont(FONT, 'normal'); pdf.setFontSize(10);
  let ry = y + 9;
  pdf.text('Tổng chi phí breakdown:', col1, ry); pdf.text(money(subtotalVND), col2, ry, { align: 'right' }); ry += 7;
  pdf.text(`Phí dịch vụ DMC${dmcMargin.type === 'percent' ? ` (${dmcMargin.value || 0}%)` : ''}:`, col1, ry);
  pdf.text(money(marginVND), col2, ry, { align: 'right' }); ry += 8;
  pdf.setDrawColor(255, 224, 130); pdf.setLineWidth(0.3); pdf.line(col1, ry - 4, col2, ry - 4);
  pdf.setFont(FONT, 'bold'); pdf.setFontSize(12); pdf.setTextColor(255, 224, 130);
  pdf.text('TỔNG / khách:', col1, ry);
  pdf.text(pax > 0 ? money(totalVND / pax) : '—', col2, ry, { align: 'right' });
  y += 36;

  // Group-size comparison
  const hasDmcPrices = GROUP_SIZES.some((gs) => +(dmcPrices[gs] || 0) > 0);
  if (hasDmcPrices) {
    checkPage(20 + GROUP_SIZES.length * 6);
    pdf.setFontSize(11); pdf.setTextColor(...navy); pdf.setFont(FONT, 'bold');
    pdf.text('SO SÁNH THEO MỨC KHÁCH / GROUP SIZE COMPARISON', mX, y);
    y += 3; pdf.setDrawColor(...navy); pdf.setLineWidth(0.5); pdf.line(mX, y, pageW - mX, y); y += 6;
    const cA = mX, cB = mX + 45, cC = mX + 95, cD = pageW - mX;
    pdf.setFontSize(8); pdf.setTextColor(...gray); pdf.setFont(FONT, 'normal');
    pdf.text('Mức khách', cA, y); pdf.text('Giá DMC/khách', cB, y, { align: 'right' });
    pdf.text('Breakdown/khách', cC, y, { align: 'right' }); pdf.text('Chênh lệch', cD, y, { align: 'right' });
    y += 5;
    GROUP_SIZES.forEach((gs) => {
      const dmcPpax = +(dmcPrices[gs] || 0);
      if (!dmcPpax) return;
      // Accurate: recompute the breakdown total at this group size.
      const t = computeTotals({ ...draft, pax: gs });
      const mVND = dmcMargin.type === 'percent'
        ? Math.round(t.totalCost * (dmcMargin.value || 0) / 100)
        : Math.round((dmcMargin.value || 0) * (cur !== 'VND' && rates[cur] ? rates[cur] : 1));
      const bdPpax = toOutputCurrency(t.totalCost + mVND, cur, rates) / gs;
      const diff = dmcPpax - bdPpax;
      checkPage(6);
      pdf.setFont(FONT, 'bold'); pdf.setFontSize(9); pdf.setTextColor(...navy);
      pdf.text(`${gs} khách`, cA, y);
      pdf.setFont(FONT, 'normal'); pdf.setTextColor(...navyLt);
      pdf.text(fmtCurrency(dmcPpax, cur), cB, y, { align: 'right' });
      pdf.text(fmtCurrency(bdPpax, cur), cC, y, { align: 'right' });
      pdf.setTextColor(diff >= 0 ? 39 : 220, diff >= 0 ? 174 : 50, diff >= 0 ? 96 : 80);
      pdf.setFont(FONT, 'bold');
      pdf.text(`${diff >= 0 ? '+' : ''}${fmtCurrency(diff, cur)}`, cD, y, { align: 'right' });
      y += 6;
    });
  }

  // Footer
  checkPage(12);
  y += 4;
  pdf.setFontSize(8); pdf.setTextColor(...gray); pdf.setFont(FONT, 'normal');
  pdf.text(
    `Breakdown nội bộ DMC · Phụ trách: ${savedBy.name} (${savedBy.role}) · ${new Date().toLocaleDateString('vi-VN')}`,
    pageW / 2, y, { align: 'center' },
  );

  const safe = (info.name || 'Tour').replace(/[^a-zA-Z0-9_]/g, '_');
  const dateStr = new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');
  pdf.save(`BreakdownDMC_${safe}_${dateStr}.pdf`);
}
