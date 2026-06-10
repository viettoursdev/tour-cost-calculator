/**
 * Export a DOM element as a full-colour, image-based PDF (html2canvas → JPEG).
 * Ported from legacy exportPDFImage at public/legacy.html:3218.
 * Produces a multi-page A4 PDF with white margins + footer per page.
 */
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export async function exportPDFImage(el: HTMLElement, fileName: string): Promise<void> {
  const canvas = await html2canvas(el, {
    scale: 2.5, useCORS: true, backgroundColor: '#ffffff', logging: false,
  });
  const imgData = canvas.toDataURL('image/jpeg', 0.95);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297;
  const mX = 12, mTop = 12, mBot = 14;
  const cW = pageW - mX * 2, cH = pageH - mTop - mBot;
  const imgW = cW;
  const imgH = (canvas.height * imgW) / canvas.width;

  let rendered = 0, pageIdx = 0;
  while (rendered < imgH) {
    if (pageIdx > 0) pdf.addPage();
    pdf.addImage(imgData, 'JPEG', mX, mTop - rendered, imgW, imgH, undefined, 'FAST');
    // Mask the overflow with white margins so each page only shows its slice.
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageW, mTop, 'F');
    pdf.rect(0, pageH - mBot, pageW, mBot, 'F');
    pdf.rect(0, 0, mX, pageH, 'F');
    pdf.rect(pageW - mX, 0, mX, pageH, 'F');
    pdf.setFontSize(8); pdf.setTextColor(20, 160, 140);
    pdf.text('Viettours Incentives & Events', mX, pageH - 7);
    pdf.text(`Trang ${pageIdx + 1}`, pageW - mX, pageH - 7, { align: 'right' });
    pdf.setDrawColor(20, 160, 140); pdf.setLineWidth(0.4);
    pdf.line(mX, mTop - 2, pageW - mX, mTop - 2);
    rendered += cH; pageIdx++;
    if (pageIdx > 25) break;
  }
  pdf.save(fileName);
}
