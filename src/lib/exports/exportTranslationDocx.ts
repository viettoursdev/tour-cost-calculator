/**
 * Export the translated English text as a Word document.
 * Source: public/legacy.html:8223-8240.
 */
import {
  AlignmentType, BorderStyle, Document, Packer, Paragraph, TextRun,
} from 'docx';
import { saveAs } from 'file-saver';

const FONT = 'Aptos';
const NAVY = '0F3A4A';
const INK = '2B3640';
const MUTE = '8A9099';
const TEAL = '14A08C';

function isHeadingLine(t: string): boolean {
  return t.length < 70 && /^[0-9IVX]*[.)]?\s*[A-Z]/.test(t) && t === t.toUpperCase();
}

export async function exportTranslationDocx(text: string, name: string | null): Promise<void> {
  const C: Paragraph[] = [];
  C.push(new Paragraph({
    children: [new TextRun({ text: 'ENGLISH TRANSLATION', font: FONT, size: 28, bold: true, color: NAVY })],
    spacing: { after: 40 },
  }));
  C.push(new Paragraph({
    children: [new TextRun({ text: 'Viettours Incentives & Events · Document translation', font: FONT, size: 16, color: MUTE })],
    spacing: { after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: TEAL, space: 2 } },
  }));

  (text || '').split(/\n/).forEach((line) => {
    const t = line.trim();
    if (!t) {
      C.push(new Paragraph({ children: [new TextRun({ text: '', font: FONT })], spacing: { after: 60 } }));
      return;
    }
    const isHead = isHeadingLine(t);
    C.push(new Paragraph({
      children: [new TextRun({
        text: t, font: FONT,
        size: isHead ? 24 : 21,
        bold: isHead,
        color: isHead ? NAVY : INK,
      })],
      spacing: { after: isHead ? 80 : 60, before: isHead ? 80 : 0 },
    }));
  });

  const docDoc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
        },
      },
      children: C,
    }],
  });
  const blob = await Packer.toBlob(docDoc);
  const slug = (name ?? 'doc').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 30);
  saveAs(blob, `Translation_${slug}.docx`);
}

// Re-export to enable centered alignment if used (avoids unused-import warning).
export const _AlignmentType = AlignmentType;
