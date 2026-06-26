/**
 * Xuất Giấy chứng nhận hoàn thành đào tạo (Training Certificate) — A4 ngang,
 * brand Viettours (teal #0d7a6a + logo chuẩn). Dùng cho học viên đã được cấp
 * chứng nhận ở tab Đào tạo.
 */
import { jsPDF } from 'jspdf';
import { loadVNFont } from './vnFont';
import { drawLogo, BRAND_TEAL } from './brand';

export type TrainingCertInput = {
  learnerName: string;
  programName: string;
  certTitle?: string;
  certCode?: string;
  certifiedAt?: string;   // ISO
  reviewerName?: string;
};

export function exportTrainingCertPDF(c: TrainingCertInput): void {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const hasFont = loadVNFont(pdf);
  const FONT = hasFont ? 'DejaVu' : 'helvetica';
  const W = 297, H = 210, cx = W / 2;
  const [r, g, b] = BRAND_TEAL;
  pdf.setFont(FONT);

  // ── Viền khung kép ──
  pdf.setDrawColor(r, g, b);
  pdf.setLineWidth(1.2); pdf.rect(10, 10, W - 20, H - 20);
  pdf.setLineWidth(0.3); pdf.rect(13, 13, W - 26, H - 26);

  // ── Logo căn giữa ──
  drawLogo(pdf, cx - 23.25, 22);

  // ── Tiêu đề ──
  pdf.setTextColor(r, g, b);
  pdf.setFont(FONT, 'bold'); pdf.setFontSize(30);
  pdf.text('GIẤY CHỨNG NHẬN', cx, 58, { align: 'center' });
  pdf.setFontSize(13); pdf.setFont(FONT, 'normal');
  pdf.setTextColor(90, 90, 90);
  pdf.text('HOÀN THÀNH CHƯƠNG TRÌNH ĐÀO TẠO', cx, 68, { align: 'center' });

  // ── Thân ──
  pdf.setTextColor(40, 40, 40);
  pdf.setFontSize(12); pdf.setFont(FONT, 'italic');
  pdf.text('Chứng nhận', cx, 86, { align: 'center' });

  pdf.setTextColor(r, g, b);
  pdf.setFont(FONT, 'bold'); pdf.setFontSize(26);
  pdf.text((c.learnerName || '—').toUpperCase(), cx, 100, { align: 'center' });

  pdf.setTextColor(40, 40, 40);
  pdf.setFont(FONT, 'normal'); pdf.setFontSize(12);
  pdf.text('đã hoàn thành xuất sắc chương trình đào tạo nghiệp vụ:', cx, 112, { align: 'center' });

  pdf.setFont(FONT, 'bold'); pdf.setFontSize(15);
  const title = c.certTitle || c.programName || '';
  pdf.splitTextToSize(title, W - 80).slice(0, 2).forEach((l: string, i: number) => {
    pdf.text(l, cx, 123 + i * 8, { align: 'center' });
  });

  // ── Mã chứng nhận + ngày ──
  pdf.setFont(FONT, 'normal'); pdf.setFontSize(10.5);
  pdf.setTextColor(90, 90, 90);
  const dateStr = c.certifiedAt ? new Date(c.certifiedAt).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN');
  pdf.text(`Mã chứng nhận: ${c.certCode || '—'}`, cx, 145, { align: 'center' });
  pdf.text(`Cấp ngày ${dateStr} tại TP. Hồ Chí Minh`, cx, 152, { align: 'center' });

  // ── Chữ ký ──
  const sigX = W - 60;
  pdf.setTextColor(40, 40, 40);
  pdf.setFont(FONT, 'bold'); pdf.setFontSize(11);
  pdf.text('NGƯỜI CẤP CHỨNG NHẬN', sigX, 168, { align: 'center' });
  pdf.setFont(FONT, 'italic'); pdf.setFontSize(9);
  pdf.setTextColor(120, 120, 120);
  pdf.text('(Ký, ghi rõ họ tên)', sigX, 174, { align: 'center' });
  pdf.setFont(FONT, 'bold'); pdf.setFontSize(11);
  pdf.setTextColor(40, 40, 40);
  pdf.text((c.reviewerName || '').toUpperCase(), sigX, 190, { align: 'center' });

  pdf.setFont(FONT, 'normal'); pdf.setFontSize(9);
  pdf.setTextColor(120, 120, 120);
  pdf.text('Công ty Cổ phần Viettours Incentives & Events', 30, 190);

  const safe = (c.learnerName || 'hocvien').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 24);
  pdf.save(`ChungNhan_${safe}_${c.certCode || ''}.pdf`);
}
