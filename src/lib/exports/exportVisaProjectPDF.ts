/**
 * Xuất tổng quan một Dự án visa ra PDF: thông tin, số liệu khách, timeline,
 * và danh sách khách (nếu có). Dùng DejaVu (loadVNFont) cho tiếng Việt.
 */
import { jsPDF } from 'jspdf';
import { loadVNFont } from './vnFont';
import { BRAND_TEAL, drawLogo, LOGO_W_MM } from './brand';
import { fmtDate } from '@/lib/dateUtils';
import { APPLICANT_DOC_META, APPLICANT_RESULT_META, VISA_STATUS_META } from '@/components/visa/constants';
import type { VisaProjectDoc } from '@/types';

type RGB = [number, number, number];
const NAVY: RGB = [15, 58, 74];
const TEAL: RGB = BRAND_TEAL;
const INK: RGB = [43, 54, 64];
const MUTE: RGB = [138, 144, 153];
const WHITE: RGB = [255, 255, 255];
const ZEBRA: RGB = [247, 249, 250];
const LINE: RGB = [215, 222, 226];

export function exportVisaProjectPDF(p: VisaProjectDoc, nameOf: (u: string) => string): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const hasFont = loadVNFont(pdf);
  const FONT = hasFont ? 'DejaVu' : 'helvetica';
  const setF = (style = 'normal') => pdf.setFont(FONT, style);
  const PW = 210, PH = 297, M = 12;
  const CW = PW - 2 * M;
  let y = M;
  const ensure = (h: number) => { if (y + h > PH - M) { pdf.addPage(); y = M; } };

  // Header
  const logoBottom = drawLogo(pdf, M, y);
  setF('bold'); pdf.setFontSize(13); pdf.setTextColor(...TEAL);
  pdf.text('VIETTOURS INCENTIVES & EVENTS', M + LOGO_W_MM + 5, y + 7);
  setF('bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTE);
  pdf.text('MÃ DỰ ÁN', PW - M, y + 5, { align: 'right' });
  pdf.setFontSize(13); pdf.setTextColor(...NAVY);
  pdf.text(p.code ?? '', PW - M, y + 11, { align: 'right' });
  y = logoBottom + 6;

  setF('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...MUTE);
  pdf.text('TỔNG QUAN DỰ ÁN VISA', PW / 2, y, { align: 'center' });
  y += 7;
  setF('bold'); pdf.setFontSize(18); pdf.setTextColor(...NAVY);
  pdf.text(pdf.splitTextToSize((p.name || 'Dự án visa').toUpperCase(), CW), PW / 2, y, { align: 'center' });
  y += 8;
  pdf.setDrawColor(...TEAL); pdf.setLineWidth(0.5); pdf.line(M, y, PW - M, y);
  y += 6;

  // Info rows (label/value)
  const info: [string, string][] = [
    ['Quốc gia', p.country || '—'],
    ['Trạng thái', VISA_STATUS_META[p.status]?.label ?? p.status],
    ['Nhân sự phụ trách', (p.mainStaff ?? []).map(nameOf).join(', ') || '—'],
    ['Nhân sự hỗ trợ', (p.supportStaff ?? []).map(nameOf).join(', ') || '—'],
    ['Báo giá liên kết', p.linkedQuoteName || '—'],
    ['Triển khai → Deadline', `${fmtDate(p.startDate) || '—'}  →  ${fmtDate(p.endDate) || '—'}`],
    ['Hồ sơ bao gồm', p.documentsSummary || '—'],
  ];
  const labW = CW * 0.32;
  info.forEach(([k, v]) => {
    const ls: string[] = pdf.splitTextToSize(v, CW - labW - 3);
    const h = Math.max(6, ls.length * 4 + 2);
    ensure(h);
    setF('bold'); pdf.setFontSize(9); pdf.setTextColor(...NAVY);
    pdf.text(k, M, y + 4);
    setF('normal'); pdf.setTextColor(...INK);
    ls.forEach((l, i) => pdf.text(l, M + labW, y + 4 + i * 4));
    y += h;
  });
  y += 3;

  // Counts band
  ensure(16);
  const counts: [string, number, RGB][] = [
    ['Apply', p.applyCount, NAVY], ['Đậu', p.passedCount, [39, 174, 96]],
    ['Rớt', p.failedCount, [220, 50, 80]], ['Đã có visa', p.haveVisaCount, [37, 99, 235]],
    ['Pending', p.pendingCount, [168, 85, 247]],
  ];
  const cw = CW / counts.length;
  counts.forEach(([label, val, color], i) => {
    const x = M + i * cw;
    pdf.setFillColor(...ZEBRA); pdf.rect(x, y, cw - 1.5, 13, 'F');
    setF('bold'); pdf.setFontSize(15); pdf.setTextColor(...color);
    pdf.text(String(val), x + cw / 2 - 0.75, y + 6.5, { align: 'center' });
    setF('normal'); pdf.setFontSize(7.5); pdf.setTextColor(...MUTE);
    pdf.text(label, x + cw / 2 - 0.75, y + 11, { align: 'center' });
  });
  y += 18;

  // Helper: section header + simple table
  const sectionHead = (t: string) => {
    ensure(12);
    pdf.setFillColor(...NAVY); pdf.rect(M, y, CW, 8, 'F');
    setF('bold'); pdf.setFontSize(10.5); pdf.setTextColor(...WHITE);
    pdf.text(t.toUpperCase(), M + 3, y + 5.6); y += 10;
  };
  const drawRow = (cells: string[], widths: number[], opt: { head?: boolean; fill?: RGB }) => {
    pdf.setFontSize(8.5);
    let mh = 6;
    cells.forEach((c, i) => { mh = Math.max(mh, pdf.splitTextToSize(String(c ?? ''), widths[i] - 3).length * 4 + 2.5); });
    ensure(mh + 1);
    let x = M;
    cells.forEach((c, i) => {
      pdf.setFillColor(...(opt.fill ?? WHITE)); pdf.rect(x, y, widths[i], mh, 'F');
      pdf.setDrawColor(...LINE); pdf.setLineWidth(0.2); pdf.rect(x, y, widths[i], mh, 'S');
      setF(opt.head ? 'bold' : 'normal'); pdf.setTextColor(...(opt.head ? WHITE : INK));
      pdf.splitTextToSize(String(c ?? ''), widths[i] - 3).forEach((l: string, li: number) => pdf.text(l, x + 1.6, y + 4.5 + li * 4));
      x += widths[i];
    });
    y += mh;
  };

  // Timeline
  if ((p.milestones ?? []).length) {
    sectionHead('Timeline & mốc thời gian');
    const w = [CW * 0.5, CW * 0.22, CW * 0.28];
    drawRow(['Mốc', 'Ngày', 'Trạng thái'], w, { head: true, fill: TEAL });
    p.milestones.forEach((m, i) => {
      drawRow([m.label, fmtDate(m.date) || '—', m.done ? 'Hoàn tất' : 'Chưa xong'], w, { fill: i % 2 ? ZEBRA : WHITE });
    });
    y += 4;
  }

  // Applicants
  if ((p.applicants ?? []).length) {
    sectionHead('Danh sách khách');
    const w = [10, CW * 0.34, CW * 0.2, CW * 0.2, CW * 0.18];
    drawRow(['#', 'Họ tên', 'Hộ chiếu', 'Hồ sơ', 'Kết quả'], w, { head: true, fill: TEAL });
    p.applicants!.forEach((a, i) => {
      drawRow([
        String(i + 1), a.name || '—', a.passport || '—',
        APPLICANT_DOC_META[a.docStatus]?.label ?? a.docStatus,
        APPLICANT_RESULT_META[a.result]?.label ?? a.result,
      ], w, { fill: i % 2 ? ZEBRA : WHITE });
    });
    y += 4;
  }

  ensure(10);
  setF('normal'); pdf.setFontSize(8); pdf.setTextColor(...MUTE);
  pdf.text('VIETTOURS INCENTIVES & EVENTS  ·  Hotline 091 951 7777  ·  www.viettours.com.vn', PW / 2, y + 4, { align: 'center' });

  const slug = (p.name ?? '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 28);
  pdf.save(`DuAnVisa_${p.code ?? 'DA'}_${slug}.pdf`);
}
