/**
 * Export the translated English text as a Word document.
 * Source: public/legacy.html:8223-8240.
 */
import {
  BorderStyle, Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
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

// ── Markdown-aware export (giữ bảng cho bản dịch từ ảnh/PDF scan) ──

/** Bỏ ký hiệu nhấn mạnh Markdown (**, *, `) trong 1 dòng chữ. */
function stripInline(s: string): string {
  return s.replace(/\*\*/g, '').replace(/`/g, '').trim();
}

/** Một dòng có phải dòng phân cách của bảng Markdown (|---|:--:|) không. */
function isTableSep(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-');
}
const isTableRow = (line: string): boolean => line.trim().startsWith('|');

function splitCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => stripInline(c.trim()));
}

function mdTable(rows: string[][]): Table {
  const cols = Math.max(...rows.map((r) => r.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((cells, ri) => new TableRow({
      children: Array.from({ length: cols }, (_, ci) => new TableCell({
        width: { size: Math.round(100 / cols), type: WidthType.PERCENTAGE },
        children: [new Paragraph({
          children: [new TextRun({ text: cells[ci] ?? '', font: FONT, size: 19, bold: ri === 0, color: ri === 0 ? NAVY : INK })],
        })],
      })),
    })),
  });
}

/**
 * Xuất bản dịch (có thể là Markdown) ra .docx — bảng Markdown thành bảng Word
 * thật, giữ tiêu đề & bố cục khối. Dùng cho bản dịch ảnh/PDF scan (giữ bố cục).
 */
export async function exportTranslationDocxMd(text: string, name: string | null): Promise<void> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: 'ENGLISH TRANSLATION', font: FONT, size: 28, bold: true, color: NAVY })],
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Viettours · Certified document translation', font: FONT, size: 16, color: MUTE })],
      spacing: { after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: TEAL, space: 2 } },
    }),
  ];

  const lines = (text || '').split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    // Khối bảng Markdown.
    if (isTableRow(line)) {
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        if (!isTableSep(lines[i])) rows.push(splitCells(lines[i]));
        i += 1;
      }
      if (rows.length) children.push(mdTable(rows));
      children.push(new Paragraph({ children: [new TextRun({ text: '', font: FONT })], spacing: { after: 60 } }));
      continue;
    }

    i += 1;
    if (!t) {
      children.push(new Paragraph({ children: [new TextRun({ text: '', font: FONT })], spacing: { after: 60 } }));
      continue;
    }
    if (/^#{1,6}\s/.test(t) || /^[-*]{3,}$/.test(t)) {
      const head = stripInline(t.replace(/^#{1,6}\s/, ''));
      if (/^[-*]{3,}$/.test(t)) {
        children.push(new Paragraph({ children: [new TextRun({ text: '', font: FONT })], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: MUTE, space: 1 } }, spacing: { after: 60 } }));
      } else {
        children.push(new Paragraph({ children: [new TextRun({ text: head, font: FONT, size: 24, bold: true, color: NAVY })], spacing: { before: 80, after: 60 } }));
      }
      continue;
    }
    const isHead = isHeadingLine(t);
    children.push(new Paragraph({
      children: [new TextRun({ text: stripInline(t), font: FONT, size: isHead ? 24 : 21, bold: isHead, color: isHead ? NAVY : INK })],
      spacing: { after: isHead ? 80 : 60, before: isHead ? 80 : 0 },
    }));
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
      children,
    }],
  });
  const blob = await Packer.toBlob(doc);
  const slug = (name ?? 'doc').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 30);
  saveAs(blob, `Translation_${slug}.docx`);
}
