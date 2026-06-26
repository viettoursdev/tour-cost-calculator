/**
 * Xuất TỔNG QUAN một Hồ sơ tour ra PDF 1 trang (gửi/in nội bộ): danh tính, khách,
 * 3 mốc giá trị, liên kết, cảnh báo "cần chú ý", mốc thời gian. Dùng DejaVu
 * (loadVNFont) cho tiếng Việt. Nạp động khi bấm (giữ jsPDF ngoài bundle chính).
 */
import { jsPDF } from 'jspdf';
import { loadVNFont } from './vnFont';
import { BRAND_TEAL, drawLogo, LOGO_W_MM } from './brand';

type RGB = [number, number, number];
const NAVY: RGB = [15, 58, 74];
const TEAL: RGB = BRAND_TEAL;
const INK: RGB = [43, 54, 64];
const MUTE: RGB = [138, 144, 153];
const WHITE: RGB = [255, 255, 255];
const ZEBRA: RGB = [247, 249, 250];
const LINE: RGB = [215, 222, 226];
const RED: RGB = [220, 38, 38];

export type TourProfilePdfData = {
  code: string;
  name: string;
  category: string;          // nhãn loại hồ sơ
  customer: string;
  departDate: string;        // đã định dạng dd/mm/yyyy hoặc ''
  pax: number;
  stage: string;             // nhãn giai đoạn
  owner: string;
  collaborators: string[];
  followers: string[];
  eventStaff: string[];
  documents: number;
  showPrice: boolean;
  values: { current?: number; contract?: number; settlement?: number };
  links: { quotes: number; contract: number; visa: number; menu: number; itinerary: number; guide: number };
  risks: string[];
  milestones: { label: string; date: string; status: string }[];
};

const vnd = (n?: number) => (typeof n === 'number' ? Math.round(n).toLocaleString('vi-VN') + ' đ' : '—');

export function exportTourProfilePDF(d: TourProfilePdfData): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const hasFont = loadVNFont(pdf);
  const FONT = hasFont ? 'DejaVu' : 'helvetica';
  const setF = (style = 'normal') => pdf.setFont(FONT, style);
  const PW = 210, PH = 297, M = 12;
  const CW = PW - 2 * M;
  let y = M;
  const ensure = (h: number) => { if (y + h > PH - M) { pdf.addPage(); y = M; } };

  // ── Header ──
  const logoBottom = drawLogo(pdf, M, y);
  setF('bold'); pdf.setFontSize(13); pdf.setTextColor(...TEAL);
  pdf.text('VIETTOURS INCENTIVES & EVENTS', M + LOGO_W_MM + 5, y + 7);
  setF('bold'); pdf.setFontSize(9); pdf.setTextColor(...MUTE);
  pdf.text('MÃ HỒ SƠ', PW - M, y + 5, { align: 'right' });
  pdf.setFontSize(13); pdf.setTextColor(...NAVY);
  pdf.text(d.code || '', PW - M, y + 11, { align: 'right' });
  y = logoBottom + 6;

  setF('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...MUTE);
  pdf.text(`HỒ SƠ TOUR · ${d.category}`, PW / 2, y, { align: 'center' });
  y += 7;
  setF('bold'); pdf.setFontSize(18); pdf.setTextColor(...NAVY);
  pdf.text(pdf.splitTextToSize((d.name || 'Hồ sơ tour').toUpperCase(), CW), PW / 2, y, { align: 'center' });
  y += 8;
  pdf.setDrawColor(...TEAL); pdf.setLineWidth(0.5); pdf.line(M, y, PW - M, y);
  y += 6;

  // ── Info rows ──
  const info: [string, string][] = [
    ['Khách hàng', d.customer || '—'],
    ['Giai đoạn', d.stage || '—'],
    ['Khởi hành', d.departDate || '—'],
    ['Số khách', d.pax ? String(d.pax) : '—'],
    ['Người tạo', d.owner || '—'],
    ['Cộng tác', d.collaborators.join(', ') || '—'],
    ['Theo dõi', d.followers.join(', ') || '—'],
    ['Nhân sự event', d.eventStaff.join(', ') || '—'],
    ['Tài liệu đính kèm', String(d.documents)],
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

  // ── 3 mốc giá trị (chỉ khi được xem giá) ──
  if (d.showPrice) {
    ensure(18);
    const band: [string, string][] = [
      ['Báo giá hiện tại', vnd(d.values.current)],
      ['Báo giá hợp đồng', vnd(d.values.contract)],
      ['Báo giá nghiệm thu', vnd(d.values.settlement)],
    ];
    const cw = CW / band.length;
    band.forEach(([label, val], i) => {
      const x = M + i * cw;
      pdf.setFillColor(...ZEBRA); pdf.rect(x, y, cw - 1.5, 14, 'F');
      setF('bold'); pdf.setFontSize(11); pdf.setTextColor(...NAVY);
      pdf.text(val, x + cw / 2 - 0.75, y + 6.5, { align: 'center' });
      setF('normal'); pdf.setFontSize(7.5); pdf.setTextColor(...MUTE);
      pdf.text(label, x + cw / 2 - 0.75, y + 11, { align: 'center' });
    });
    y += 18;
  }

  // ── Liên kết (đếm) ──
  ensure(16);
  const counts: [string, number][] = [
    ['Báo giá', d.links.quotes], ['Hợp đồng', d.links.contract], ['Visa', d.links.visa],
    ['Thực đơn', d.links.menu], ['Chương trình', d.links.itinerary], ['Lịch HDV', d.links.guide],
  ];
  const ccw = CW / counts.length;
  counts.forEach(([label, val], i) => {
    const x = M + i * ccw;
    pdf.setFillColor(...ZEBRA); pdf.rect(x, y, ccw - 1.5, 13, 'F');
    setF('bold'); pdf.setFontSize(14); pdf.setTextColor(...TEAL);
    pdf.text(String(val), x + ccw / 2 - 0.75, y + 6.5, { align: 'center' });
    setF('normal'); pdf.setFontSize(7); pdf.setTextColor(...MUTE);
    pdf.text(label, x + ccw / 2 - 0.75, y + 11, { align: 'center' });
  });
  y += 18;

  const sectionHead = (t: string, fill: RGB = NAVY) => {
    ensure(12);
    pdf.setFillColor(...fill); pdf.rect(M, y, CW, 8, 'F');
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

  // ── Cần chú ý ──
  if (d.risks.length) {
    sectionHead('Cần chú ý', RED);
    d.risks.forEach((r, i) => drawRow([`•  ${r}`], [CW], { fill: i % 2 ? ZEBRA : WHITE }));
    y += 4;
  }

  // ── Mốc thời gian ──
  if (d.milestones.length) {
    sectionHead('Mốc thời gian');
    const w = [CW * 0.5, CW * 0.25, CW * 0.25];
    drawRow(['Mốc', 'Ngày', 'Trạng thái'], w, { head: true, fill: TEAL });
    d.milestones.forEach((m, i) => drawRow([m.label, m.date || '—', m.status], w, { fill: i % 2 ? ZEBRA : WHITE }));
    y += 4;
  }

  // ── Footer ──
  ensure(10);
  setF('normal'); pdf.setFontSize(8); pdf.setTextColor(...MUTE);
  pdf.text(`Xuất ${new Date().toLocaleString('vi-VN')}  ·  VIETTOURS INCENTIVES & EVENTS  ·  www.viettours.com.vn`, PW / 2, y + 4, { align: 'center' });

  const slug = (d.name ?? '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 28);
  pdf.save(`HoSoTour_${d.code || 'HS'}_${slug}.pdf`);
}
