/**
 * AI phân tích FILE báo giá (Excel/CSV/ảnh/text) → các dòng chi phí đã phân loại
 * vào hạng mục của bảng giá. Dùng /chat (Sonnet, hỗ trợ ảnh).
 */
import { callAIWorker, type ContentBlock } from '@/lib/aiWorker';
import { parseAmountVN } from '@/lib/numParse';
import type { CategoryId } from '@/types';

export type QuoteCat = { id: CategoryId; label: string };
export type ParsedQuoteLine = {
  category: CategoryId; name: string; price: number; cur: string; unit: string; times: number; note: string;
};

const str = (v: unknown): string => (v == null ? '' : String(v)).trim();

function mediaTypeFromB64(b64: string): string {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (b64.startsWith('R0lGOD')) return 'image/gif';
  if (b64.startsWith('UklGR')) return 'image/webp';
  return 'image/png';
}

function fileToB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Không đọc được ảnh'));
    r.readAsDataURL(file);
  });
}

async function xlsxToText(buf: ArrayBuffer): Promise<string> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const out: string[] = [];
  wb.worksheets.forEach((ws) => {
    if (ws.name) out.push(`# ${ws.name}`);
    ws.eachRow((row) => {
      const vals = (row.values as unknown[]).slice(1).map((v) => {
        if (v == null) return '';
        if (typeof v === 'object' && v !== null && 'text' in (v as Record<string, unknown>)) return String((v as { text: unknown }).text ?? '');
        if (typeof v === 'object' && v !== null && 'result' in (v as Record<string, unknown>)) return String((v as { result: unknown }).result ?? '');
        return String(v);
      });
      if (vals.some((c) => c.trim())) out.push(vals.join('\t'));
    });
  });
  return out.join('\n');
}

/** Đọc nội dung file thành text hoặc ảnh base64 để gửi cho AI. */
export async function extractFileContent(file: File): Promise<{ text?: string; imageB64?: string; name: string }> {
  const name = file.name;
  const lower = name.toLowerCase();
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/.test(lower)) {
    return { imageB64: await fileToB64(file), name };
  }
  if (lower.endsWith('.xlsx')) return { text: await xlsxToText(await file.arrayBuffer()), name };
  if (/\.(csv|tsv|txt|md)$/.test(lower) || file.type.startsWith('text/')) return { text: await file.text(), name };
  throw new Error('Định dạng chưa hỗ trợ. Hãy dùng Excel (.xlsx), CSV, hoặc ẢNH chụp báo giá (PDF → chụp/lưu thành ảnh).');
}

/** Bóc mảng JSON từ output AI. */
export function extractArray(raw: string): unknown[] | null {
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try { const a = JSON.parse(m[0]); return Array.isArray(a) ? a : null; } catch { return null; }
}

/** Chuẩn hoá từng dòng AI trả về; category không hợp lệ → hạng mục mặc định đầu tiên. */
export function coerceQuoteLines(arr: unknown[], validCatIds: CategoryId[]): ParsedQuoteLine[] {
  const fallback = validCatIds[0];
  return arr.map((row) => {
    const o = (row ?? {}) as Record<string, unknown>;
    const name = str(o.name ?? o.item ?? o.description ?? o.service);
    if (!name) return null;
    const cat = str(o.category ?? o.cat ?? o.categoryId) as CategoryId;
    const category = validCatIds.includes(cat) ? cat : fallback;
    const price = parseAmountVN(str(o.price ?? o.amount ?? o.unitPrice ?? o.gia));
    const cur = (str(o.cur ?? o.currency) || 'VND').toUpperCase();
    const unit = str(o.unit ?? o.donvi);
    const times = Math.max(1, Math.round(parseAmountVN(str(o.times ?? o.qty ?? o.solan ?? '1'))) || 1);
    const note = str(o.note ?? o.notes ?? o.ghichu);
    return { category, name, price, cur, unit, times, note };
  }).filter((x): x is ParsedQuoteLine => x !== null);
}

function buildPrompt(cats: QuoteCat[]): string {
  const list = cats.map((c) => `- "${c.id}": ${c.label}`).join('\n');
  return [
    'Bạn phân tích BẢNG/FILE BÁO GIÁ chi phí tour. Trích từng DÒNG chi phí và phân loại vào MỘT hạng mục phù hợp nhất (dùng đúng "id" hạng mục):',
    list,
    'Mỗi dòng trả về object: {"category":"id hạng mục","name":"tên dịch vụ","price":đơn giá(số),"cur":"VND|USD|…","unit":"đơn vị","times":số lần(mặc định 1),"note":"ghi chú"}.',
    'CHỈ trả về MẢNG JSON, tiếng Việt, KHÔNG kèm chữ nào khác.',
    'Bỏ qua dòng tiêu đề, dòng tổng cộng/thành tiền, thuế/lợi nhuận tổng, và dòng không phải chi phí dịch vụ. KHÔNG bịa số.',
  ].join('\n');
}

export async function parseQuoteAI(input: { text?: string; imageB64?: string }, cats: QuoteCat[]): Promise<ParsedQuoteLine[]> {
  const content: ContentBlock[] = [];
  if (input.imageB64) content.push({ type: 'image', source: { type: 'base64', media_type: mediaTypeFromB64(input.imageB64), data: input.imageB64 } } as unknown as ContentBlock);
  content.push({ type: 'text', text: input.text?.trim() || 'Phân tích báo giá trong ảnh.' });
  const res = await callAIWorker('/chat', { system: buildPrompt(cats), messages: [{ role: 'user', content }] });
  if (res.error) throw new Error(res.error);
  const raw = (res.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  const arr = extractArray(raw);
  if (!arr) throw new Error('AI trả về dữ liệu không đọc được. Hãy thử lại hoặc dùng file rõ hơn.');
  return coerceQuoteLines(arr, cats.map((c) => c.id));
}
