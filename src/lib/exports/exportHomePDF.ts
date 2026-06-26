/**
 * Xuất "ảnh chụp" trang Hôm nay ra PDF (cho họp giao ban): bản tin sáng + chỉ số
 * nhanh + danh sách ưu tiên. jsPDF + DejaVu (tiếng Việt), theo mẫu exportAdvancePDF.
 */
import { jsPDF } from 'jspdf';
import { loadVNFont } from './vnFont';
import { BRAND_TEAL, drawLogo } from './brand';

export interface HomePdfData {
  name: string;
  dateLabel: string;
  digest: string;
  kpis: { label: string; value: string }[];
  priority: { primary: string; secondary?: string; due?: string }[];
}

type RGB = [number, number, number];

export function exportHomePDF(d: HomePdfData): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const FONT = loadVNFont(pdf) ? 'DejaVu' : 'helvetica';
  const setF = (s = 'normal') => pdf.setFont(FONT, s);
  const M = 14;
  let y = 12;
  const TEAL = BRAND_TEAL;
  const NAVY: RGB = [15, 58, 74];
  const MUTE: RGB = [120, 130, 140];
  const INK: RGB = [40, 48, 55];

  y = drawLogo(pdf, M, y) + 6;
  setF('bold'); pdf.setFontSize(16); pdf.setTextColor(...NAVY); pdf.text('Bản tin Hôm nay', M, y); y += 7;
  setF('normal'); pdf.setFontSize(10); pdf.setTextColor(...MUTE); pdf.text(`${d.name} · ${d.dateLabel}`, M, y); y += 8;

  setF('normal'); pdf.setFontSize(11); pdf.setTextColor(...TEAL);
  for (const line of pdf.splitTextToSize(d.digest, 182) as string[]) { pdf.text(line, M, y); y += 6; }
  y += 2;

  setF('bold'); pdf.setFontSize(12); pdf.setTextColor(...NAVY); pdf.text('Chỉ số nhanh', M, y); y += 6;
  setF('normal'); pdf.setFontSize(10);
  for (const k of d.kpis) {
    pdf.setTextColor(...INK); pdf.text(`• ${k.label}:`, M, y);
    setF('bold'); pdf.setTextColor(...TEAL); pdf.text(k.value, M + 72, y);
    setF('normal'); y += 6;
  }
  y += 2;

  setF('bold'); pdf.setFontSize(12); pdf.setTextColor(...NAVY); pdf.text('Ưu tiên hôm nay', M, y); y += 6;
  pdf.setFontSize(9.5);
  if (d.priority.length === 0) { setF('normal'); pdf.setTextColor(...MUTE); pdf.text('Không có mục nào. 🎉', M, y); y += 6; }
  for (const p of d.priority) {
    if (y > 280) { pdf.addPage(); y = 16; }
    setF('normal'); pdf.setTextColor(...INK); pdf.setFontSize(9.5);
    const head = `• ${p.primary}${p.due ? `  (${p.due})` : ''}`;
    for (const line of pdf.splitTextToSize(head, 182) as string[]) { pdf.text(line, M, y); y += 5; }
    if (p.secondary) { pdf.setTextColor(...MUTE); pdf.setFontSize(8.5); pdf.text(p.secondary, M + 3, y); y += 5; }
  }

  pdf.save(`Ban-tin-hom-nay-${new Date().toISOString().slice(0, 10)}.pdf`);
}
