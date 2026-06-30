/**
 * Export a customer-facing Invoice as a PDF.
 * Source: public/legacy.html:3433-3636.
 * Uses bundled DejaVu Sans for Vietnamese diacritics + the embedded VTE_LOGO.
 */
import { jsPDF } from 'jspdf';
import { numberToVietWords } from './vietWords';
import { calcVND, type Totals } from '@/components/quote/calc';
import { getCATS } from '@/components/quote/constants';
import { calcEndDate, fmtDate } from '@/lib/dateUtils';
import { loadVNFont } from './vnFont';
import { BRAND_TEAL, drawLogo, LOGO_W_MM } from './brand';
import type { Item, QuoteDraft } from '@/types';

export interface InvoiceCustomer {
  name: string;
  company: string;
  phone: string;
  email: string;
}

export interface InvoiceArgs {
  draft: QuoteDraft;
  totals: Totals;
  customer: InvoiceCustomer;
  lang: 'vi' | 'en';
  paymentTerms: string;
  savedBy: { name: string };
}

type RGB = [number, number, number];

const TEAL: RGB = BRAND_TEAL;
const DARK: RGB = [15, 58, 74];
const GRAY: RGB = [120, 130, 140];
const RED: RGB = [220, 50, 80];
const LIGHTGRAY: RGB = [235, 240, 242];

const BRAND = 'VIETTOURS INCENTIVES & EVENTS';
const COMPANY_VN = 'CÔNG TY TNHH DU LỊCH VÀ SỰ KIỆN VIỆT';
const COMPANY_EN = 'Vietnam Tourism & Events Co., Ltd.';
const MST = '0302650371';
const ADDRESS = '19B Mai Thị Lựu, P. Tân Định, TP. Hồ Chí Minh';

export function exportInvoicePDF(args: InvoiceArgs): void {
  const { draft, totals, customer, lang, paymentTerms, savedBy } = args;
  const EN = lang === 'en';
  const T = (vn: string, en: string) => (EN ? en : vn);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const hasFont = loadVNFont(pdf);
  const FONT = hasFont ? 'DejaVu' : 'helvetica';
  const setF = (style = 'normal') => pdf.setFont(FONT, style);
  const pageW = 210, pageH = 297, mX = 15;
  let y = 16;
  const fmtV = (n: number) => Math.round(n).toLocaleString('vi-VN');
  const checkPage = (need: number) => {
    if (y + need > pageH - 30) { pdf.addPage(); y = 18; }
  };

  const now = new Date();
  const invNo = `VTE-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

  // Top accent band
  pdf.setFillColor(...TEAL); pdf.rect(0, 0, pageW, 4, 'F');

  // Logo (chuẩn 46.5×12.5mm) + Company block (left). Khối chữ đặt sau mép phải logo.
  drawLogo(pdf, mX, y - 2);
  const cx = mX + LOGO_W_MM + 5;
  // Brand name: shrink-to-fit so it never overlaps the right-aligned "HÓA ĐƠN" title.
  setF('bold');
  pdf.setFontSize(22);
  const titleW = pdf.getTextWidth(T('HÓA ĐƠN', 'INVOICE'));
  const brandMaxW = pageW - mX - titleW - 6 - cx; // 6mm gap before the title
  let brandSize = 12;
  pdf.setFontSize(brandSize);
  const brandW = pdf.getTextWidth(BRAND);
  if (brandW > brandMaxW) brandSize = Math.max(7.5, (brandSize * brandMaxW) / brandW);
  pdf.setFontSize(brandSize); pdf.setTextColor(...TEAL);
  pdf.text(BRAND, cx, y + 2);
  pdf.setFontSize(7); pdf.setTextColor(...GRAY); setF('normal');
  y += 6;
  pdf.text(EN ? COMPANY_EN : COMPANY_VN, cx, y); y += 3.5;
  pdf.text(`${T('MST', 'Tax code')}: ${MST}`, cx, y); y += 3.5;
  const addrLines: string[] = pdf.splitTextToSize(`${T('Địa chỉ', 'Address')}: ${ADDRESS}`, pageW - cx - mX);
  pdf.text(addrLines, cx, y); y += addrLines.length * 3.3;

  // INVOICE title (right)
  pdf.setFontSize(22); pdf.setTextColor(...DARK); setF('bold');
  pdf.text(T('HÓA ĐƠN', 'INVOICE'), pageW - mX, 18, { align: 'right' });
  pdf.setFontSize(9); pdf.setTextColor(...GRAY); setF('normal');
  pdf.text(T('INVOICE / QUOTATION', 'QUOTATION'), pageW - mX, 24, { align: 'right' });
  pdf.setFontSize(8.5); pdf.setTextColor(...DARK);
  pdf.text(`${T('Số', 'No')}: ${invNo}`, pageW - mX, 31, { align: 'right' });
  pdf.text(`${T('Ngày', 'Date')}: ${now.toLocaleDateString(EN ? 'en-GB' : 'vi-VN')}`, pageW - mX, 36, { align: 'right' });

  y = Math.max(y, 40) + 4;
  pdf.setDrawColor(...TEAL); pdf.setLineWidth(0.5); pdf.line(mX, y, pageW - mX, y); y += 8;

  // Bill To + Tour info
  pdf.setFontSize(9); pdf.setTextColor(...TEAL); setF('bold');
  pdf.text(T('KÍNH GỬI / BILL TO:', 'BILL TO:'), mX, y);
  pdf.text(T('THÔNG TIN TOUR:', 'TOUR INFO:'), pageW / 2 + 5, y);
  y += 5;
  pdf.setFontSize(9); pdf.setTextColor(...DARK); setF('normal');
  pdf.text(`${T('Khách hàng', 'Customer')}: ${customer.name || ''}`, mX, y);
  pdf.text(`Tour: ${draft.info.name || ''}`, pageW / 2 + 5, y); y += 4.5;
  pdf.text(`${T('Công ty', 'Company')}: ${customer.company || '-'}`, mX, y);
  pdf.text(`${T('Điểm đến', 'Destination')}: ${draft.info.dest || ''}`, pageW / 2 + 5, y); y += 4.5;
  pdf.text(`${T('Điện thoại', 'Phone')}: ${customer.phone || '-'}`, mX, y);
  pdf.text(`${T('Thời gian', 'Duration')}: ${draft.info.days}${T('N', 'D')} ${draft.info.nights}${T('Đ', 'N')}`, pageW / 2 + 5, y);
  y += 4.5;
  if (draft.info.startDate) {
    const endD = calcEndDate(draft.info.startDate, draft.info.days);
    // "-" thay "→": font VN nhúng thiếu glyph mũi tên → tránh vỡ chữ trên hoá đơn gửi khách.
    pdf.text(`${T('Khởi hành', 'Departure')}: ${fmtDate(draft.info.startDate, EN)} - ${fmtDate(endD, EN)}`, pageW / 2 + 5, y);
    y += 4.5;
  }
  pdf.text(`Email: ${customer.email || '-'}`, mX, y);
  pdf.text(`${T('Số khách', 'Pax')}: ${draft.pax}`, pageW / 2 + 5, y); y += 8;

  // Items table header
  const colNo = mX + 2;
  const colDesc = mX + 10;
  const colUnit = mX + 82;
  const colQty = mX + 112;
  const colPrice = mX + 150;
  const colAmount = pageW - mX - 2;
  pdf.setFillColor(...TEAL); pdf.rect(mX, y, pageW - mX * 2, 8, 'F');
  pdf.setFontSize(8); pdf.setTextColor(255, 255, 255); setF('bold');
  pdf.text(T('STT', 'No'), colNo, y + 5.5);
  pdf.text(T('DIỄN GIẢI / DESCRIPTION', 'DESCRIPTION'), colDesc, y + 5.5);
  pdf.text(T('ĐVT', 'Unit'), colUnit, y + 5.5);
  pdf.text(T('SL', 'Qty'), colQty, y + 5.5, { align: 'right' });
  pdf.text(T('ĐƠN GIÁ', 'Unit Price'), colPrice, y + 5.5, { align: 'right' });
  pdf.text(T('THÀNH TIỀN', 'Amount'), colAmount, y + 5.5, { align: 'right' });
  y += 8;

  let stt = 0;
  let grandSubtotal = 0;
  setF('normal'); pdf.setFontSize(8);
  if (draft.template) {
    const activeCats = getCATS(draft.template);
    activeCats.forEach((cat) => {
      if (!draft.catEnabled[cat.id]) return;
      const catItems = (draft.items[cat.id] ?? [])
        .filter((i: Item) => i.name && (calcVND(i, draft.rates, draft.pax) > 0 || i.foc === true));
      if (catItems.length === 0) return;
      catItems.forEach((it: Item) => {
        checkPage(8); stt += 1;
        const vnd = calcVND(it, draft.rates, draft.pax);
        grandSubtotal += vnd;
        const qty =
          it.qtyMode === 'per_pax' ? draft.pax :
          it.qtyMode === 'per_group' ? 1 :
          it.customQty;
        const unitVND = (draft.rates[it.cur] || 1) * it.price * it.times;
        if (stt % 2 === 0) {
          pdf.setFillColor(...LIGHTGRAY);
          pdf.rect(mX, y, pageW - mX * 2, 7, 'F');
        }
        pdf.setTextColor(...DARK); setF('normal');
        pdf.text(String(stt), colNo, y + 4.8);
        const nm: string[] = pdf.splitTextToSize(it.name, colUnit - colDesc - 3);
        pdf.text(nm[0], colDesc, y + 4.8);
        pdf.text(it.unit || '', colUnit, y + 4.8);
        pdf.text(String(qty), colQty, y + 4.8, { align: 'right' });
        if (it.foc) {
          pdf.setTextColor(39, 174, 96); setF('bold');
          pdf.text('FOC', colAmount, y + 4.8, { align: 'right' });
          setF('normal');
        } else {
          pdf.text(fmtV(unitVND), colPrice, y + 4.8, { align: 'right' });
          pdf.text(fmtV(vnd), colAmount, y + 4.8, { align: 'right' });
        }
        y += 7;
      });
    });
  }
  pdf.setDrawColor(...TEAL); pdf.setLineWidth(0.5); pdf.line(mX, y, pageW - mX, y); y += 7;

  // Totals
  checkPage(50);
  const profit = totals.totalProfit;
  const vatAmt = totals.totalVAT;
  const grandTotal = totals.grandTotal;
  const tX = pageW - mX - 78;
  const totalRow = (label: string, val: number, bold: boolean, color: RGB = DARK) => {
    pdf.setFontSize(bold ? 10 : 9); setF(bold ? 'bold' : 'normal');
    pdf.setTextColor(...color);
    pdf.text(label, tX, y);
    pdf.text(fmtV(val) + ' ₫', pageW - mX - 2, y, { align: 'right' });
    y += bold ? 7 : 5.5;
  };
  totalRow(T('Tạm tính / Subtotal:', 'Subtotal:'), grandSubtotal + draft.svcBasis, false);
  totalRow(T(`Dịch vụ & lợi nhuận (${draft.margin}%):`, `Service & margin (${draft.margin}%):`), profit, false);
  if (draft.vat > 0) totalRow(`${T('Thuế VAT', 'VAT')} (${draft.vat}%):`, vatAmt, false);
  pdf.setDrawColor(...DARK); pdf.setLineWidth(0.3); pdf.line(tX, y - 1, pageW - mX, y - 1); y += 4;
  totalRow(T('TỔNG CỘNG / TOTAL:', 'TOTAL:'), grandTotal, true, RED);
  y += 2;
  pdf.setFontSize(7.5); pdf.setTextColor(...GRAY); setF('normal');
  pdf.text(
    T(`(Đã làm tròn · ${fmtV(totals.roundedPPax)} ₫/khách × ${draft.pax})`, `(Rounded · ${fmtV(totals.roundedPPax)} ₫/pax × ${draft.pax})`),
    pageW - mX - 2, y, { align: 'right' },
  );
  y += 9;

  // Amount in words
  checkPage(14);
  pdf.setFontSize(8.5); pdf.setTextColor(...DARK); setF('normal');
  if (EN) {
    const w: string[] = pdf.splitTextToSize(`Amount in words: ${grandTotal.toLocaleString('en-US')} VND.`, pageW - mX * 2);
    pdf.text(w, mX, y); y += w.length * 4.5;
  } else {
    const w: string[] = pdf.splitTextToSize(`Số tiền bằng chữ: ${numberToVietWords(grandTotal)} đồng.`, pageW - mX * 2);
    pdf.text(w, mX, y); y += w.length * 4.5;
  }
  y += 6;

  // Payment terms
  checkPage(36);
  pdf.setFontSize(9); pdf.setTextColor(...TEAL); setF('bold');
  pdf.text(T('ĐIỀU KHOẢN THANH TOÁN:', 'PAYMENT TERMS:'), mX, y); y += 5;
  pdf.setFontSize(8); pdf.setTextColor(...DARK); setF('normal');
  const trimmed = (paymentTerms || '').trim();
  const defaultsVI = [
    '1. Thanh toán 70% sau khi ký hợp đồng',
    '2. Thanh toán 30% còn lại trước ngày khởi hành',
    '3. Báo giá có hiệu lực 7 ngày · Đã bao gồm VAT',
    '4. Chuyển khoản: [Tên ngân hàng] · [Số tài khoản] · [Chủ tài khoản]',
  ];
  const defaultsEN = [
    '1. 70% payment after contract signing',
    '2. Remaining 30% before departure',
    '3. Quote valid for 7 days - Inclusive of VAT',
    '4. Bank transfer: [Bank name] - [Account no.] - [Account holder]',
  ];
  const terms = trimmed
    ? trimmed.split('\n').filter((t) => t.trim())
    : (EN ? defaultsEN : defaultsVI);
  terms.forEach((t) => {
    const ls: string[] = pdf.splitTextToSize(t, pageW - mX * 2);
    pdf.text(ls, mX, y); y += ls.length * 4 + 1;
  });
  y += 8;

  // Signatures
  checkPage(34);
  const sigW = (pageW - mX * 2) / 2;
  pdf.setFontSize(9); pdf.setTextColor(...DARK); setF('bold');
  pdf.text(T('KHÁCH HÀNG', 'CUSTOMER'), mX + sigW / 2, y, { align: 'center' });
  pdf.text(T('ĐẠI DIỆN CÔNG TY', 'COMPANY REPRESENTATIVE'), mX + sigW + sigW / 2, y, { align: 'center' });
  y += 4;
  pdf.setFontSize(7.5); pdf.setTextColor(...GRAY); setF('normal');
  pdf.text(T('(Ký, ghi rõ họ tên)', '(Signature & full name)'), mX + sigW / 2, y, { align: 'center' });
  pdf.text(T('(Ký, đóng dấu)', '(Signature & stamp)'), mX + sigW + sigW / 2, y, { align: 'center' });
  y += 20;
  pdf.setTextColor(...DARK); setF('bold'); pdf.setFontSize(9);
  pdf.text(customer.name || '', mX + sigW / 2, y, { align: 'center' });
  pdf.text(savedBy.name, mX + sigW + sigW / 2, y, { align: 'center' });

  // Footer on every page
  const totalPg = (pdf.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let i = 1; i <= totalPg; i += 1) {
    pdf.setPage(i);
    pdf.setFillColor(...TEAL); pdf.rect(0, pageH - 4, pageW, 4, 'F');
    pdf.setFontSize(7.5); pdf.setTextColor(...TEAL); setF('bold');
    pdf.text(BRAND, mX, pageH - 7);
    pdf.setTextColor(...GRAY); setF('normal');
    pdf.text(`${invNo} · ${T('Trang', 'Page')} ${i}/${totalPg}`, pageW - mX, pageH - 7, { align: 'right' });
  }

  const customerSlug = (customer.name || 'Customer').replace(/[^a-zA-Z0-9_]/g, '_');
  pdf.save(`Invoice_${invNo}_${customerSlug}.pdf`);
}
