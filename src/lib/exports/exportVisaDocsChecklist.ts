/**
 * Xuất checklist hồ sơ visa theo TỪNG khách (PDF) — gửi/in để khách chuẩn bị giấy tờ.
 * Mỗi khách một khối: tên/hộ chiếu/tình trạng + danh mục giấy tờ (☑/☐ theo docs).
 */
import { jsPDF } from 'jspdf';
import { loadVNFont } from './vnFont';
import { drawLogo, LOGO_W_MM, BRAND_TEAL } from './brand';
import { fmtDate } from '@/lib/dateUtils';
import { VISA_APPLICANT_STATUS_META, deriveVisaStatus } from '@/components/visa/constants';
import type { Passenger, VisaProjectDoc } from '@/types';

type RGB = [number, number, number];
const NAVY: RGB = [15, 58, 74];
const TEAL: RGB = BRAND_TEAL;
const INK: RGB = [43, 54, 64];
const MUTE: RGB = [138, 144, 153];
const LINE: RGB = [215, 222, 226];

const slug = (s: string) => (s || 'Visa').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 28);

export function exportVisaDocsChecklistPDF(project: VisaProjectDoc, applicants: Passenger[]): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const hasFont = loadVNFont(pdf);
  const FONT = hasFont ? 'DejaVu' : 'helvetica';
  const setF = (style = 'normal') => pdf.setFont(FONT, style);
  const PW = 210, PH = 297, M = 12;
  const CW = PW - 2 * M;
  let y = M;
  const ensure = (h: number) => { if (y + h > PH - M) { pdf.addPage(); y = M; } };

  const logoBottom = drawLogo(pdf, M, y);
  setF('bold'); pdf.setFontSize(12); pdf.setTextColor(...TEAL);
  pdf.text('VIETTOURS INCENTIVES & EVENTS', M + LOGO_W_MM + 4, y + 7);
  y = logoBottom + 5;

  setF('bold'); pdf.setFontSize(14); pdf.setTextColor(...NAVY);
  pdf.text(`CHECKLIST HỒ SƠ VISA — ${(project.name || project.code).toUpperCase()}`, M, y);
  y += 6;
  setF('normal'); pdf.setFontSize(9); pdf.setTextColor(...INK);
  pdf.text(`Nước: ${project.country || '—'}   ·   Khởi hành: ${fmtDate(project.departureDate) || '—'}   ·   ${applicants.length} khách`, M, y);
  y += 7;

  applicants.forEach((p, i) => {
    const docs = p.docs ?? [];
    const meta = VISA_APPLICANT_STATUS_META[deriveVisaStatus(p)];
    // Tính chiều cao khối: header + các dòng giấy tờ (2 cột).
    const rowsDocs = Math.max(1, Math.ceil(docs.length / 2));
    const blockH = 11 + rowsDocs * 5.2 + 4;
    ensure(blockH);

    // Header khách
    setF('bold'); pdf.setFontSize(10.5); pdf.setTextColor(...NAVY);
    pdf.text(`${i + 1}. ${p.name || '(chưa có tên)'}`, M, y + 4);
    setF('normal'); pdf.setFontSize(8.5); pdf.setTextColor(...MUTE);
    const meta2 = `HC: ${p.idNo || '—'}${p.passportExpiry ? ` (HH ${fmtDate(p.passportExpiry)})` : ''}   ·   ${meta.label}`;
    pdf.text(meta2, M, y + 9);
    y += 11;

    // Danh mục giấy tờ — 2 cột
    setF('normal'); pdf.setFontSize(9); pdf.setTextColor(...INK);
    const colW = CW / 2;
    if (docs.length === 0) {
      pdf.setTextColor(...MUTE); pdf.text('(chưa có danh mục giấy tờ)', M + 2, y + 3); y += 5.2;
    } else {
      docs.forEach((d, k) => {
        const col = k % 2;
        const x = M + col * colW;
        if (col === 0 && k > 0) y += 5.2;
        const box = d.checked ? '☑' : '☐';
        pdf.setTextColor(...(d.checked ? TEAL : INK));
        pdf.text(`${box} ${d.label}`, x + 2, y + 3);
        if (k === docs.length - 1) y += 5.2;
      });
    }
    y += 2;
    pdf.setDrawColor(...LINE); pdf.setLineWidth(0.2); pdf.line(M, y, PW - M, y);
    y += 3;
  });

  pdf.save(`Checklist_HoSo_Visa_${slug(project.name || project.code)}.pdf`);
}
