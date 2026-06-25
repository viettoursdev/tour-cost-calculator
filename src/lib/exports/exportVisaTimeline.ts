/**
 * Xuất tình trạng + timeline xin visa của cả đoàn ra Excel & PDF — cho điều hành
 * theo dõi/in. Mỗi khách một dòng: trạng thái + 5 mốc chuẩn + mốc tuỳ biến + cờ quá hạn.
 */
import { jsPDF } from 'jspdf';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { loadVNFont } from './vnFont';
import { BRAND_TEAL, BRAND_TEAL_ARGB, drawLogo, LOGO_W_MM } from './brand';
import { fmtDate } from '@/lib/dateUtils';
import {
  DEFAULT_APPLICANT_TIMELINE, VISA_APPLICANT_STATUS_META, deriveVisaStatus, isApplicantOverdue,
} from '@/components/visa/constants';
import type { Passenger, VisaProjectDoc } from '@/types';

const slug = (s: string) => (s || 'Visa').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 28);

const stdDate = (p: Passenger, key: string): string => {
  const m = (p.visaTimeline ?? []).find((x) => x.key === key);
  return m?.date ? fmtDate(m.date) : '';
};
const customMs = (p: Passenger): string =>
  (p.visaTimeline ?? [])
    .filter((m) => !m.key && (m.label || m.date))
    .map((m) => `${m.label || 'Mốc'}: ${m.date ? fmtDate(m.date) : '—'}`)
    .join('; ');
const statusLabel = (p: Passenger) => VISA_APPLICANT_STATUS_META[deriveVisaStatus(p)].label;

type RGB = [number, number, number];
const NAVY: RGB = [15, 58, 74];
const TEAL: RGB = BRAND_TEAL;
const INK: RGB = [43, 54, 64];
const MUTE: RGB = [138, 144, 153];
const WHITE: RGB = [255, 255, 255];
const ZEBRA: RGB = [247, 249, 250];
const LINE: RGB = [215, 222, 226];
const RED: RGB = [220, 50, 80];

const COLS = ['#', 'Họ và tên', 'Tình trạng visa', ...DEFAULT_APPLICANT_TIMELINE.map((m) => m.label), 'Mốc khác', 'Quá hạn'];

export async function exportVisaTimelineExcel(project: VisaProjectDoc, applicants: Passenger[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Timeline visa');
  ws.columns = [
    { header: '#', width: 5 }, { header: 'Họ và tên', width: 26 }, { header: 'Tình trạng visa', width: 18 },
    ...DEFAULT_APPLICANT_TIMELINE.map((m) => ({ header: m.label, width: 18 })),
    { header: 'Mốc khác', width: 28 }, { header: 'Quá hạn', width: 9 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_TEAL_ARGB } };
  ws.spliceRows(1, 0, [`TIMELINE & TÌNH TRẠNG VISA — ${project.name || project.code}${project.country ? `  ·  ${project.country}` : ''}${project.departureDate ? `  ·  Khởi hành ${fmtDate(project.departureDate)}` : ''}`]);
  ws.getRow(1).font = { bold: true, size: 13 };

  applicants.forEach((p, i) => {
    const row = ws.addRow([
      i + 1, p.name || '', statusLabel(p),
      ...DEFAULT_APPLICANT_TIMELINE.map((m) => stdDate(p, m.key)),
      customMs(p), isApplicantOverdue(p) ? 'QUÁ HẠN' : '',
    ]);
    if (isApplicantOverdue(p)) row.getCell(COLS.length).font = { bold: true, color: { argb: 'FFDC3250' } };
  });

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `Timeline_Visa_${slug(project.name || project.code)}.xlsx`);
}

export function exportVisaTimelinePDF(project: VisaProjectDoc, applicants: Passenger[]): void {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const hasFont = loadVNFont(pdf);
  const FONT = hasFont ? 'DejaVu' : 'helvetica';
  const setF = (style = 'normal') => pdf.setFont(FONT, style);
  const PW = 297, PH = 210, M = 10;
  const CW = PW - 2 * M;
  let y = M;
  const ensure = (h: number) => { if (y + h > PH - M) { pdf.addPage(); y = M; } };

  const logoBottom = drawLogo(pdf, M, y);
  setF('bold'); pdf.setFontSize(13); pdf.setTextColor(...TEAL);
  pdf.text('VIETTOURS INCENTIVES & EVENTS', M + LOGO_W_MM + 5, y + 7);
  setF('bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTE);
  pdf.text(`${applicants.length} khách`, PW - M, y + 5, { align: 'right' });
  y = logoBottom + 6;

  setF('bold'); pdf.setFontSize(15); pdf.setTextColor(...NAVY);
  pdf.text(`TIMELINE & TÌNH TRẠNG VISA — ${(project.name || project.code).toUpperCase()}`, M, y);
  y += 6;
  setF('normal'); pdf.setFontSize(9); pdf.setTextColor(...INK);
  pdf.text(`Nước: ${project.country || '—'}   ·   Khởi hành: ${fmtDate(project.departureDate) || '—'}   ·   Mã: ${project.code}`, M, y);
  y += 6;

  // # | Tên | Trạng thái | 5 mốc | Mốc khác | Quá hạn
  const w = [7, CW * 0.16, CW * 0.12];
  const msW = (CW - w[0] - w[1] - w[2] - CW * 0.14 - CW * 0.06) / DEFAULT_APPLICANT_TIMELINE.length;
  DEFAULT_APPLICANT_TIMELINE.forEach(() => w.push(msW));
  w.push(CW * 0.14); // mốc khác
  w.push(CW - w.reduce((a, b) => a + b, 0)); // quá hạn

  const row = (cells: string[], opt: { head?: boolean; fill?: RGB; overdue?: boolean }) => {
    pdf.setFontSize(7.5);
    let mh = 6;
    cells.forEach((c, i) => { mh = Math.max(mh, pdf.splitTextToSize(String(c ?? ''), w[i] - 2).length * 3.4 + 2.5); });
    ensure(mh);
    let x = M;
    cells.forEach((c, i) => {
      pdf.setFillColor(...(opt.fill ?? WHITE)); pdf.rect(x, y, w[i], mh, 'F');
      pdf.setDrawColor(...LINE); pdf.setLineWidth(0.2); pdf.rect(x, y, w[i], mh, 'S');
      const isOverCol = i === cells.length - 1 && opt.overdue;
      setF(opt.head || isOverCol ? 'bold' : 'normal');
      pdf.setTextColor(...(opt.head ? WHITE : isOverCol ? RED : INK));
      pdf.splitTextToSize(String(c ?? ''), w[i] - 2).forEach((l: string, li: number) => pdf.text(l, x + 1.2, y + 4 + li * 3.4));
      x += w[i];
    });
    y += mh;
  };

  row(COLS, { head: true, fill: TEAL });
  applicants.forEach((p, i) => {
    const over = isApplicantOverdue(p);
    row([
      String(i + 1), p.name || '', statusLabel(p),
      ...DEFAULT_APPLICANT_TIMELINE.map((m) => stdDate(p, m.key)),
      customMs(p), over ? '⚠ Quá hạn' : '',
    ], { fill: i % 2 ? ZEBRA : WHITE, overdue: over });
  });

  pdf.save(`Timeline_Visa_${slug(project.name || project.code)}.pdf`);
}
