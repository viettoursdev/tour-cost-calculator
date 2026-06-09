/**
 * Export the translated English text as a PDF.
 * Source: public/legacy.html:8242-8261.
 */
import { jsPDF } from 'jspdf';

export function exportTranslationPDF(text: string, name: string | null): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 16;
  const CW = PW - 2 * M;
  let y = M;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.setTextColor(15, 58, 74);
  pdf.text('ENGLISH TRANSLATION', M, y + 4);
  y += 7;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(138, 144, 153);
  pdf.text('Viettours Incentives & Events · Document translation', M, y + 3);
  y += 4;
  pdf.setDrawColor(20, 160, 140);
  pdf.setLineWidth(0.5);
  pdf.line(M, y, PW - M, y);
  y += 6;

  pdf.setFontSize(10.5);
  pdf.setTextColor(43, 54, 64);

  (text || '').split(/\n/).forEach((line) => {
    const t = line.trim();
    if (!t) { y += 3; return; }
    const isHead = t.length < 70 && t === t.toUpperCase() && /[A-Z]/.test(t);
    pdf.setFont('helvetica', isHead ? 'bold' : 'normal');
    pdf.setFontSize(isHead ? 11.5 : 10.5);
    pdf.setTextColor(...(isHead ? [15, 58, 74] : [43, 54, 64]) as [number, number, number]);
    const ls: string[] = pdf.splitTextToSize(t, CW);
    ls.forEach((l) => {
      if (y > PH - M) { pdf.addPage(); y = M; }
      pdf.text(l, M, y + 4);
      y += 5;
    });
    y += isHead ? 2 : 1.5;
  });

  const slug = (name ?? 'doc').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 30);
  pdf.save(`Translation_${slug}.pdf`);
}
