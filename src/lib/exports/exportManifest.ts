/**
 * Xuất danh sách khách đoàn (manifest + rooming) ra PDF & Excel — gửi khách / khách sạn.
 */
import { jsPDF } from 'jspdf';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { loadVNFont } from './vnFont';
import { BRAND_TEAL, BRAND_TEAL_ARGB, drawLogo, LOGO_W_MM } from './brand';
import { fmtDate } from '@/lib/dateUtils';
import type { Passenger, QuoteInfo } from '@/types';

const ROOM_LABEL: Record<string, string> = { single: 'Đơn', double: 'Đôi', twin: 'Twin', triple: 'Triple', '': '' };
const GENDER_LABEL: Record<string, string> = { M: 'Nam', F: 'Nữ', '': '' };
const idLabel = (p: Passenger) => (p.idType === 'cccd' ? 'CCCD ' : '') + (p.idNo ?? '');

const slug = (s: string) => (s || 'Tour').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 28);

type RGB = [number, number, number];
const NAVY: RGB = [15, 58, 74];
const TEAL: RGB = BRAND_TEAL;
const INK: RGB = [43, 54, 64];
const MUTE: RGB = [138, 144, 153];
const WHITE: RGB = [255, 255, 255];
const ZEBRA: RGB = [247, 249, 250];
const LINE: RGB = [215, 222, 226];

export function exportManifestPDF(info: QuoteInfo, pax: Passenger[]): void {
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
  pdf.text(`${pax.length} khách`, PW - M, y + 5, { align: 'right' });
  y = logoBottom + 6;

  setF('bold'); pdf.setFontSize(15); pdf.setTextColor(...NAVY);
  pdf.text(`DANH SÁCH KHÁCH ĐOÀN — ${(info.name || 'Tour').toUpperCase()}`, M, y);
  y += 6;
  setF('normal'); pdf.setFontSize(9); pdf.setTextColor(...INK);
  pdf.text(`Điểm đến: ${info.dest || '—'}   ·   Khởi hành: ${fmtDate(info.startDate) || '—'}   ·   ${info.days || '?'} ngày`, M, y);
  y += 6;

  const cols = ['#', 'Họ và tên', 'GT', 'Ngày sinh', 'Hộ chiếu/CCCD', 'Quốc tịch', 'Phòng', 'Ghép', 'Ăn kiêng/Dị ứng', 'Điện thoại', 'Liên hệ khẩn'];
  const w = [8, CW * 0.16, 12, CW * 0.09, CW * 0.13, CW * 0.08, CW * 0.06, CW * 0.06, CW * 0.14, CW * 0.09];
  w.push(CW - w.reduce((a, b) => a + b, 0));

  const row = (cells: string[], opt: { head?: boolean; fill?: RGB }) => {
    pdf.setFontSize(8);
    let mh = 6;
    cells.forEach((c, i) => { mh = Math.max(mh, pdf.splitTextToSize(String(c ?? ''), w[i] - 2).length * 3.6 + 2.5); });
    ensure(mh);
    let x = M;
    cells.forEach((c, i) => {
      pdf.setFillColor(...(opt.fill ?? WHITE)); pdf.rect(x, y, w[i], mh, 'F');
      pdf.setDrawColor(...LINE); pdf.setLineWidth(0.2); pdf.rect(x, y, w[i], mh, 'S');
      setF(opt.head ? 'bold' : 'normal'); pdf.setTextColor(...(opt.head ? WHITE : INK));
      pdf.splitTextToSize(String(c ?? ''), w[i] - 2).forEach((l: string, li: number) => pdf.text(l, x + 1.2, y + 4 + li * 3.6));
      x += w[i];
    });
    y += mh;
  };

  row(cols, { head: true, fill: TEAL });
  pax.forEach((p, i) => row([
    String(i + 1), p.name || '', GENDER_LABEL[p.gender ?? ''] || '', p.dob || '', idLabel(p), p.nationality || '',
    ROOM_LABEL[p.roomType ?? ''] || '', p.roomNo || '', p.dietary || '', p.phone || '', p.emergency || '',
  ], { fill: i % 2 ? ZEBRA : WHITE }));

  pdf.save(`DanhSachKhach_${slug(info.name)}.pdf`);
}

export async function exportManifestExcel(info: QuoteInfo, pax: Passenger[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Danh sách khách');
  ws.columns = [
    { header: '#', width: 5 }, { header: 'Họ và tên', width: 26 }, { header: 'Giới tính', width: 9 },
    { header: 'Ngày sinh', width: 13 }, { header: 'Loại giấy tờ', width: 12 }, { header: 'Số hộ chiếu/CCCD', width: 20 },
    { header: 'Quốc tịch', width: 14 }, { header: 'Loại phòng', width: 11 }, { header: 'Ghép phòng', width: 11 },
    { header: 'Ăn kiêng/Dị ứng', width: 22 }, { header: 'Điện thoại', width: 15 }, { header: 'Liên hệ khẩn cấp', width: 24 },
    { header: 'Ghi chú', width: 22 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_TEAL_ARGB } };
  ws.spliceRows(1, 0, [`DANH SÁCH KHÁCH — ${info.name || 'Tour'}  ·  ${info.dest || ''}  ·  Khởi hành ${fmtDate(info.startDate) || ''}`]);
  ws.getRow(1).font = { bold: true, size: 13 };
  pax.forEach((p, i) => ws.addRow([
    i + 1, p.name || '', GENDER_LABEL[p.gender ?? ''] || '', p.dob || '',
    p.idType === 'cccd' ? 'CCCD' : p.idType === 'passport' ? 'Hộ chiếu' : '', p.idNo || '',
    p.nationality || '', ROOM_LABEL[p.roomType ?? ''] || '', p.roomNo || '', p.dietary || '', p.phone || '', p.emergency || '', p.note || '',
  ]));
  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `DanhSachKhach_${slug(info.name)}.xlsx`);
}
