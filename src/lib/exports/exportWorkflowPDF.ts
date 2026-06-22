/**
 * Xuất checklist Quy trình điều hành của một báo giá ra PDF (để bàn giao điều hành /
 * in ký). Dùng DejaVu (loadVNFont) cho tiếng Việt. Bố cục theo exportVisaProjectPDF.
 */
import { jsPDF } from 'jspdf';
import { loadVNFont } from './vnFont';
import { BRAND_TEAL, drawLogo, LOGO_W_MM } from './brand';
import { fmtDate } from '@/lib/dateUtils';
import { workflowProgress, WORKFLOW_STATUS_META } from '@/components/quote/workflowConstants';
import type { QuoteInfo, WorkflowStep } from '@/types';

type RGB = [number, number, number];
const NAVY: RGB = [15, 58, 74];
const TEAL: RGB = BRAND_TEAL;
const INK: RGB = [43, 54, 64];
const MUTE: RGB = [138, 144, 153];
const WHITE: RGB = [255, 255, 255];
const ZEBRA: RGB = [247, 249, 250];
const LINE: RGB = [215, 222, 226];

const STATUS_RGB: Record<string, RGB> = {
  todo: [100, 116, 139], doing: [37, 99, 235], done: [39, 174, 96], blocked: [220, 50, 80],
};

export function exportWorkflowPDF(info: QuoteInfo, steps: WorkflowStep[], nameOf: (u?: string) => string): void {
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
  const prog = workflowProgress(steps);
  setF('bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTE);
  pdf.text('TIẾN ĐỘ', PW - M, y + 5, { align: 'right' });
  pdf.setFontSize(13); pdf.setTextColor(...NAVY);
  pdf.text(`${prog.pct}%  ·  ${prog.done}/${prog.total}`, PW - M, y + 11, { align: 'right' });
  y = logoBottom + 6;

  setF('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...MUTE);
  pdf.text('QUY TRÌNH ĐIỀU HÀNH', PW / 2, y, { align: 'center' });
  y += 7;
  setF('bold'); pdf.setFontSize(18); pdf.setTextColor(...NAVY);
  pdf.text(pdf.splitTextToSize((info.name || 'Báo giá').toUpperCase(), CW), PW / 2, y, { align: 'center' });
  y += 8;
  pdf.setDrawColor(...TEAL); pdf.setLineWidth(0.5); pdf.line(M, y, PW - M, y);
  y += 6;

  const meta: [string, string][] = [
    ['Điểm đến', info.dest || '—'],
    ['Thời lượng', info.days ? `${info.days} ngày ${info.nights} đêm` : '—'],
    ['Ngày khởi hành', fmtDate(info.startDate) || '—'],
    ['Ngày in', fmtDate(new Date().toISOString()) || ''],
  ];
  const labW = CW * 0.32;
  meta.forEach(([k, v]) => {
    ensure(6);
    setF('bold'); pdf.setFontSize(9); pdf.setTextColor(...NAVY); pdf.text(k, M, y + 4);
    setF('normal'); pdf.setTextColor(...INK); pdf.text(v, M + labW, y + 4);
    y += 6;
  });
  y += 3;

  // Bảng checklist
  const drawRow = (cells: string[], widths: number[], opt: { head?: boolean; fill?: RGB; statusKey?: string }) => {
    pdf.setFontSize(8.5);
    let mh = 6.5;
    cells.forEach((c, i) => { mh = Math.max(mh, pdf.splitTextToSize(String(c ?? ''), widths[i] - 3).length * 4 + 3); });
    ensure(mh + 1);
    let x = M;
    cells.forEach((c, i) => {
      pdf.setFillColor(...(opt.fill ?? WHITE)); pdf.rect(x, y, widths[i], mh, 'F');
      pdf.setDrawColor(...LINE); pdf.setLineWidth(0.2); pdf.rect(x, y, widths[i], mh, 'S');
      const isStatusCol = opt.statusKey && i === 2;
      setF(opt.head || isStatusCol ? 'bold' : 'normal');
      pdf.setTextColor(...(opt.head ? WHITE : isStatusCol ? (STATUS_RGB[opt.statusKey!] ?? INK) : INK));
      pdf.splitTextToSize(String(c ?? ''), widths[i] - 3).forEach((l: string, li: number) => pdf.text(l, x + 1.6, y + 4.6 + li * 4));
      x += widths[i];
    });
    y += mh;
  };

  const w = [9, CW * 0.40, CW * 0.16, CW * 0.18, CW * 0.16];
  w.push(CW - w.reduce((a, b) => a + b, 0)); // cột "✔ Hạn/HT" còn lại
  drawRow(['#', 'Bước', 'Trạng thái', 'Phụ trách', 'Hạn', 'Hoàn tất'], w, { head: true, fill: TEAL });
  steps.forEach((s, i) => {
    const label = s.note?.trim() ? `${s.label}\n— ${s.note.trim()}` : s.label;
    drawRow(
      [String(i + 1), label, WORKFLOW_STATUS_META[s.status].label, nameOf(s.assignee) || '—',
        fmtDate(s.dueDate ?? null) || '—', fmtDate(s.doneDate ?? null) || (s.status === 'done' ? '✔' : '')],
      w, { fill: i % 2 ? ZEBRA : WHITE, statusKey: s.status });
  });
  y += 6;

  ensure(10);
  setF('normal'); pdf.setFontSize(8); pdf.setTextColor(...MUTE);
  pdf.text('VIETTOURS INCENTIVES & EVENTS  ·  Hotline 1900 1839  ·  www.viettours.com.vn', PW / 2, y + 4, { align: 'center' });

  const slug = (info.name ?? '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 28);
  pdf.save(`QuyTrinh_${slug || 'BaoGia'}.pdf`);
}
