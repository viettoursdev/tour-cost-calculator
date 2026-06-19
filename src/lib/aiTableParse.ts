/**
 * AI quét danh sách lộn xộn (không header chuẩn, nhiều dòng/mục, dán từ chat…)
 * → mảng bản ghi theo đúng các cột yêu cầu. Dùng /chat (Sonnet).
 */
import { callAIWorker } from '@/lib/aiWorker';

export type TableCol = { key: string; label: string; aliases?: string[] };

/** Bóc MẢNG JSON đầu tiên từ output AI (gỡ rào ```), null nếu không có. */
export function extractArray(raw: string): unknown[] | null {
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const a = JSON.parse(m[0]);
    return Array.isArray(a) ? a : null;
  } catch { return null; }
}

/** Ép mỗi phần tử về đúng các khoá cột (string), bỏ dòng rỗng hoàn toàn. */
export function coerceRows(arr: unknown[], cols: TableCol[]): Record<string, string>[] {
  return arr
    .map((row) => {
      const o = (row ?? {}) as Record<string, unknown>;
      const out: Record<string, string> = {};
      cols.forEach((c) => { const v = o[c.key]; out[c.key] = v == null ? '' : String(v).trim(); });
      return out;
    })
    .filter((o) => Object.values(o).some((v) => v !== ''));
}

export function buildTablePrompt(cols: TableCol[]): string {
  const colDesc = cols
    .map((c) => `- "${c.key}": ${c.label}${c.aliases?.length ? ` (vd: ${c.aliases.join(', ')})` : ''}`)
    .join('\n');
  return [
    'Bạn trích xuất DANH SÁCH bản ghi từ văn bản người dùng dán. Văn bản có thể lộn xộn:',
    'không có dòng tiêu đề, tên cột khác chuẩn, mỗi mục 1 dòng hoặc trải nhiều dòng, danh thiếp, bảng copy từ Excel…',
    'Các CỘT cần lấy (DÙNG ĐÚNG các khoá này làm key trong JSON):',
    colDesc,
    'Trả về DUY NHẤT một MẢNG JSON, mỗi phần tử là 1 object với các khoá trên. Bỏ trống "" nếu không suy được.',
    'KHÔNG bịa dữ liệu. KHÔNG kèm chữ nào ngoài JSON.',
  ].join('\n');
}

export async function parseTableAI(text: string, cols: TableCol[]): Promise<Record<string, string>[]> {
  const res = await callAIWorker('/chat', { system: buildTablePrompt(cols), messages: [{ role: 'user', content: text }] });
  if (res.error) throw new Error(res.error);
  const raw = (res.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  const arr = extractArray(raw);
  if (!arr) throw new Error('AI trả về dữ liệu không đọc được. Hãy thử lại hoặc nhập tay.');
  return coerceRows(arr, cols);
}
