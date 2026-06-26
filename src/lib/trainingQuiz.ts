import { callAIWorker, markExtract, type ContentBlock } from '@/lib/aiWorker';
import type { TrainingModule, QuizQuestion } from '@/types';

const aqId = () => 'aq' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Sinh câu hỏi luyện tập (trắc nghiệm) cho 1 module qua AI Worker. Dùng để HỌC
// VIÊN tự ôn thêm — KHÔNG sửa quiz chuẩn của chương trình (ephemeral).

const SYSTEM = `Bạn là chuyên gia đào tạo nghiệp vụ cho công ty lữ hành / du lịch Việt Nam.
Cho TÊN module, MỤC TIÊU và NỘI DUNG, hãy soạn câu hỏi trắc nghiệm ôn tập sát thực tế ngành.
Trả về DUY NHẤT một mảng JSON (không markdown, không giải thích ngoài), mỗi phần tử dạng:
{"q":"câu hỏi","options":["phương án A","phương án B","phương án C","phương án D"],"answer":0,"explain":"giải thích ngắn vì sao đúng"}
Yêu cầu: 4–6 câu, tiếng Việt, mỗi câu 3–4 phương án, "answer" là CHỈ SỐ (0-based) của phương án đúng, dùng đúng thuật ngữ nghiệp vụ.`;

function extractJsonArray(raw: string): string {
  const a = raw.indexOf('[');
  const b = raw.lastIndexOf(']');
  return a >= 0 && b > a ? raw.slice(a, b + 1) : raw;
}

/** Sinh quiz luyện tập cho 1 module. Ném lỗi nếu AI trả về không đọc được. */
export async function generatePracticeQuiz(m: TrainingModule): Promise<QuizQuestion[]> {
  const prompt = [
    `Module: "${m.title}"`,
    `Mục tiêu: ${m.objective}`,
    m.contentMd ? `Nội dung: ${m.contentMd}` : '',
    m.practice?.length ? `Thực hành: ${m.practice.join('; ')}` : '',
  ].filter(Boolean).join('\n');
  const content: ContentBlock[] = [{ type: 'text', text: prompt }];
  const res = await callAIWorker('/chat', { system: markExtract(SYSTEM), messages: [{ role: 'user', content }] });
  const raw = (res.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  let arr: unknown;
  try { arr = JSON.parse(extractJsonArray(raw)); } catch { throw new Error('AI trả về dữ liệu không đọc được. Thử lại nhé.'); }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x): QuizQuestion => {
      const options = Array.isArray(x.options) ? x.options.map((o) => String(o)).filter(Boolean) : [];
      const answer = Number(x.answer);
      return {
        id: aqId(),
        q: String(x.q ?? '').trim(),
        options,
        answer: Number.isInteger(answer) && answer >= 0 && answer < options.length ? answer : 0,
        explain: x.explain ? String(x.explain).trim() : undefined,
      };
    })
    .filter((q) => q.q && q.options.length >= 2);
}
