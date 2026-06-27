/**
 * Document text extraction helpers for the Doc Translate feature.
 * Source: public/legacy.html:8186-8221.
 */
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
// Vite handles the worker URL via the `?url` suffix.
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { callAIWorker } from './aiWorker';
import { fileKind } from './fileKind';

// Configure the pdf.js worker once at module load.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/** Read a File into a base64 string (raw — no data URL prefix). */
async function fileToB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? '').split(',')[1] ?? '');
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** Extract raw text from a .docx via mammoth. */
export async function extractDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const res = await mammoth.extractRawText({ arrayBuffer });
  return res?.value ?? '';
}

/**
 * Extract text from a PDF, page by page. Falls back to OCR via the worker for
 * pages that look like scans (less than 15 chars of extracted text).
 * Source: legacy 8188-8210.
 */
export async function extractPdf(
  file: File,
  onProgress: (msg: string) => void,
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    onProgress(`Đọc trang ${i}/${pdf.numPages}`);
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    let txt = tc.items.map((t) => ('str' in t ? t.str : '')).join(' ').trim();
    if (txt.replace(/\s/g, '').length < 15) {
      onProgress(`OCR trang ${i}/${pdf.numPages} (scan)`);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Không tạo được canvas để OCR');
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      const b64 = canvas.toDataURL('image/png').split(',')[1] ?? '';
      const r = await callAIWorker('/ocr', { image: b64 });
      txt = r.text ?? '';
    }
    out.push(txt);
  }
  return out.join('\n\n');
}

/** OCR a single image via the worker. */
export async function extractImage(
  file: File,
  onProgress: (msg: string) => void,
): Promise<string> {
  onProgress('OCR ảnh...');
  const b64 = await fileToB64(file);
  const r = await callAIWorker('/ocr', { image: b64 });
  return r.text ?? '';
}

/**
 * Split text into chunks of at most `max` chars, preferring paragraph boundaries.
 * Source: legacy 8212-8221.
 */
export function chunkText(text: string, max: number): string[] {
  const paras = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let cur = '';
  for (const p of paras) {
    if ((cur + '\n\n' + p).length > max && cur) {
      chunks.push(cur);
      cur = p;
    } else {
      cur = cur ? cur + '\n\n' + p : p;
    }
    while (cur.length > max) {
      chunks.push(cur.slice(0, max));
      cur = cur.slice(max);
    }
  }
  if (cur.trim()) chunks.push(cur);
  return chunks.length ? chunks : [text];
}

/** Trích text từ .xlsx/.xls qua ExcelJS (mỗi sheet → tiêu đề + các dòng `a | b | c`). */
export async function extractXlsx(file: File): Promise<string> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const out: string[] = [];
  wb.eachSheet((ws) => {
    out.push(`# ${ws.name}`);
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = String(cell.text ?? '').trim();
        if (v) cells.push(v);
      });
      if (cells.length) out.push(cells.join(' | '));
    });
  });
  return out.join('\n');
}

/**
 * Trích text từ một File bất kỳ, tự chọn cách theo loại: ảnh→OCR, PDF→pdfjs(+OCR scan),
 * Word(.docx)→mammoth, Excel(.xlsx)→ExcelJS, text→đọc trực tiếp. Báo tiến trình qua onProgress.
 */
export async function extractFile(
  file: File,
  onProgress: (msg: string) => void = () => {},
): Promise<string> {
  const kind = fileKind(file.name, file.type);
  const e = (file.name.split('.').pop() ?? '').toLowerCase();
  if (kind === 'image') return extractImage(file, onProgress);
  if (kind === 'pdf') return extractPdf(file, onProgress);
  if (kind === 'text') {
    onProgress('Đọc văn bản...');
    return file.text();
  }
  if (kind === 'office') {
    if (e === 'docx' || e === 'doc') {
      onProgress('Đọc Word...');
      return extractDocx(file);
    }
    if (e === 'xlsx' || e === 'xls') {
      onProgress('Đọc Excel...');
      return extractXlsx(file);
    }
  }
  throw new Error('Loại file chưa hỗ trợ (chỉ: ảnh, PDF, Word .docx, Excel .xlsx, văn bản).');
}
