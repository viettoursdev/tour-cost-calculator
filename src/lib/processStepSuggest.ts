import { callAIWorker, type ContentBlock } from '@/lib/aiWorker';
import { DEPT_LABEL } from '@/auth/departments';
import type { Department } from '@/types';

/** Một bước SOP do AI gợi ý (chưa có id/status — editor tự gán). */
export type SuggestedStep = {
  label: string;
  output?: string;
  risk?: string;
  dueRule?: string;
};

const SYSTEM = `Bạn là chuyên gia xây dựng quy trình vận hành (SOP) cho công ty lữ hành / du lịch Việt Nam.
Cho TÊN quy trình và PHÒNG BAN, hãy đề xuất các BƯỚC thực hiện sát thực tế ngành.
Trả về DUY NHẤT một mảng JSON (không kèm markdown, không giải thích), mỗi phần tử có dạng:
{"label":"tên bước, bắt đầu bằng động từ","output":"đầu ra/bằng chứng của bước","risk":"rủi ro hay gặp cần tránh","dueRule":"hạn ngắn gọn, vd: T-7, trong 24h, T+3 sau tour"}
Yêu cầu: 5–9 bước, tiếng Việt, dùng đúng thuật ngữ nghiệp vụ (booking, land, file tour, công nợ, visa đoàn...).`;

/** Lấy mảng JSON đầu tiên trong chuỗi (bỏ rào code, chữ thừa). */
function extractJsonArray(raw: string): string {
  const a = raw.indexOf('[');
  const b = raw.lastIndexOf(']');
  return a >= 0 && b > a ? raw.slice(a, b + 1) : raw;
}

/** Gợi ý các bước cho 1 quy trình qua AI Worker (/chat). Ném lỗi nếu không đọc được. */
export async function suggestProcessSteps(name: string, department: Department): Promise<SuggestedStep[]> {
  const content: ContentBlock[] = [
    { type: 'text', text: `Quy trình: "${name.trim()}"\nPhòng ban: ${DEPT_LABEL[department] ?? department}` },
  ];
  const res = await callAIWorker('/chat', { system: SYSTEM, messages: [{ role: 'user', content }] });
  const raw = (res.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  let arr: unknown;
  try { arr = JSON.parse(extractJsonArray(raw)); } catch { throw new Error('AI trả về dữ liệu không đọc được. Hãy thử lại hoặc nhập tay.'); }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x): SuggestedStep => ({
      label: String(x.label ?? '').trim(),
      output: x.output ? String(x.output).trim() : undefined,
      risk: x.risk ? String(x.risk).trim() : undefined,
      dueRule: x.dueRule ? String(x.dueRule).trim() : undefined,
    }))
    .filter((s) => s.label);
}
