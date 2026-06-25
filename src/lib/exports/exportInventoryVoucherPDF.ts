/**
 * Phiếu Nhập kho / Phiếu Xuất kho (PDF A4) — chứng từ có số phiếu, bảng chi tiết
 * theo size, chữ ký người lập / người giao–nhận / thủ kho. jsPDF + font tiếng Việt.
 */
import { jsPDF } from 'jspdf';
import { numberToVietWords } from './vietWords';
import { loadVNFont } from './vnFont';
import { BRAND_TEAL, drawLogo, LOGO_W_MM } from './brand';

type RGB = [number, number, number];
const TEAL: RGB = BRAND_TEAL;
const DARK: RGB = [15, 58, 74];
const GRAY: RGB = [120, 130, 140];

export interface InventoryVoucher {
  kind: 'in' | 'out';
  code: string;                 // mã lô (nhập) / mã phiếu (xuất)
  itemCode: string;
  itemName: string;
  unit: string;
  color?: string;
  supplier?: string;            // nhập
  reason?: string;              // xuất
  receiver?: string;            // xuất: người nhận
  tourCode?: string;
  date: string;                 // ISO ngày chứng từ
  by: string;                   // người lập
  rows: { size: string; qty: number; unitCost: number }[];
}

export function exportInventoryVoucherPDF(v: InventoryVoucher): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const hasFont = loadVNFont(pdf);
  const FONT = hasFont ? 'DejaVu' : 'helvetica';
  const setFont = (s = 'normal') => pdf.setFont(FONT, s);
  const pageW = 210, pageH = 297, mX = 18;
  let y = 18;
  const fmtV = (n: number) => Math.round(n).toLocaleString('vi-VN');
  const isIn = v.kind === 'in';
  const showCost = v.rows.some((r) => r.unitCost > 0);

  pdf.setFillColor(...TEAL); pdf.rect(0, 0, pageW, 4, 'F');
  const logoBottom = drawLogo(pdf, mX, y);
  const brandX = mX + LOGO_W_MM + 5;
  pdf.setFontSize(13); pdf.setTextColor(...TEAL); setFont('bold');
  pdf.text('VIETTOURS INCENTIVES & EVENTS', brandX, y + 6);
  pdf.setFontSize(8); pdf.setTextColor(...GRAY); setFont('normal');
  pdf.text('Công ty TNHH Du lịch và Sự kiện Việt · MST: 0302650371', brandX, y + 11);
  y = logoBottom + 8;

  pdf.setFontSize(18); pdf.setTextColor(...DARK); setFont('bold');
  pdf.text(isIn ? 'PHIẾU NHẬP KHO' : 'PHIẾU XUẤT KHO', pageW / 2, y, { align: 'center' }); y += 6;
  pdf.setFontSize(10); pdf.setTextColor(...GRAY); setFont('normal');
  pdf.text(isIn ? 'GOODS RECEIPT NOTE' : 'GOODS ISSUE NOTE', pageW / 2, y, { align: 'center' }); y += 6;
  pdf.setFontSize(9); pdf.setTextColor(...DARK);
  pdf.text(`Số / No: ${v.code}`, pageW / 2, y, { align: 'center' });
  pdf.text(`Ngày / Date: ${new Date(v.date).toLocaleDateString('vi-VN')}`, pageW / 2, y + 5, { align: 'center' });
  y += 14;
  pdf.setDrawColor(...TEAL); pdf.setLineWidth(0.5); pdf.line(mX, y, pageW - mX, y); y += 9;

  const field = (label: string, val: string) => {
    pdf.setFontSize(9); pdf.setTextColor(...TEAL); setFont('bold');
    pdf.text(label, mX, y);
    pdf.setFontSize(10); pdf.setTextColor(...DARK); setFont('normal');
    const lines: string[] = pdf.splitTextToSize(val || '-', pageW - mX * 2 - 50);
    pdf.text(lines, mX + 50, y);
    y += Math.max(lines.length * 5, 6);
  };
  field('Sản phẩm:', `${v.itemName} (${v.itemCode})`);
  if (v.color) field('Màu:', v.color);
  if (isIn && v.supplier) field('Nhà cung cấp:', v.supplier);
  if (!isIn && v.receiver) field('Người nhận:', v.receiver);
  if (!isIn && v.reason) field('Lý do xuất:', v.reason);
  if (v.tourCode) field('Tour:', v.tourCode);
  y += 4;

  // Bảng chi tiết theo size.
  const cols = showCost
    ? [{ t: 'Size', w: 50 }, { t: 'Số lượng', w: 35 }, { t: 'Đơn giá', w: 45 }, { t: 'Thành tiền', w: 52 }]
    : [{ t: 'Size', w: 90 }, { t: `Số lượng (${v.unit})`, w: 92 }];
  let x = mX;
  pdf.setFillColor(...TEAL); pdf.rect(mX, y, pageW - mX * 2, 8, 'F');
  pdf.setFontSize(9); pdf.setTextColor(255, 255, 255); setFont('bold');
  for (const c of cols) { pdf.text(c.t, x + 2, y + 5.5); x += c.w; }
  y += 8;
  pdf.setTextColor(...DARK); setFont('normal');
  let totalQty = 0, totalVal = 0;
  for (const r of v.rows) {
    x = mX;
    const cells = showCost
      ? [r.size || '—', String(r.qty), fmtV(r.unitCost), fmtV(r.qty * r.unitCost)]
      : [r.size || '—', String(r.qty)];
    cells.forEach((cell, i) => { pdf.text(cell, x + 2, y + 5); x += cols[i].w; });
    pdf.setDrawColor(230, 230, 230); pdf.setLineWidth(0.2); pdf.line(mX, y + 7.5, pageW - mX, y + 7.5);
    y += 8;
    totalQty += r.qty; totalVal += r.qty * r.unitCost;
  }
  pdf.setFontSize(10); setFont('bold'); pdf.setTextColor(...DARK);
  pdf.text(`Tổng số lượng: ${totalQty} ${v.unit}`, mX, y + 7);
  if (showCost) pdf.text(`Tổng giá trị: ${fmtV(totalVal)} ₫`, pageW - mX, y + 7, { align: 'right' });
  y += 10;
  if (showCost) {
    pdf.setFontSize(9); pdf.setTextColor(...GRAY); setFont('italic');
    pdf.text(`Bằng chữ: ${numberToVietWords(totalVal)} đồng.`, mX, y); y += 8;
  }
  y += 6;

  // Chữ ký.
  const sigW = (pageW - mX * 2) / 3;
  const labels = isIn
    ? ['NGƯỜI LẬP PHIẾU', 'NGƯỜI GIAO HÀNG', 'THỦ KHO']
    : ['NGƯỜI LẬP PHIẾU', 'NGƯỜI NHẬN', 'THỦ KHO'];
  pdf.setFontSize(9); pdf.setTextColor(...DARK); setFont('bold');
  labels.forEach((l, i) => pdf.text(l, mX + sigW * i + sigW / 2, y, { align: 'center' }));
  y += 4;
  pdf.setFontSize(7.5); pdf.setTextColor(...GRAY); setFont('italic');
  ['(Ký, ghi rõ họ tên)', '(Ký, ghi rõ họ tên)', '(Ký, ghi rõ họ tên)']
    .forEach((l, i) => pdf.text(l, mX + sigW * i + sigW / 2, y, { align: 'center' }));
  y += 22;
  pdf.setFontSize(9); pdf.setTextColor(...DARK); setFont('bold');
  pdf.text(v.by, mX + sigW / 2, y, { align: 'center' });

  pdf.setFillColor(...TEAL); pdf.rect(0, pageH - 4, pageW, 4, 'F');
  pdf.setFontSize(7.5); pdf.setTextColor(...TEAL); setFont('bold');
  pdf.text('Viettours Incentives & Events', mX, pageH - 8);
  pdf.setTextColor(...GRAY); setFont('normal');
  pdf.text(v.code, pageW - mX, pageH - 8, { align: 'right' });

  pdf.save(`${isIn ? 'PhieuNhap' : 'PhieuXuat'}_${v.code}.pdf`);
}
