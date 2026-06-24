import { callAIWorker, markExtract } from '@/lib/aiWorker';
import { newActivity, newDay, newSegment } from './constants';
import type { Day } from '@/types';

export type GenActivity = { time?: string; text: string };
export type GenDay = { title: string; activities: GenActivity[] };

const SYSTEM = [
  'Bạn là chuyên gia thiết kế chương trình tour du lịch cho khách đoàn.',
  'Hãy dựng KHUNG lịch trình ngày-by-ngày (để con người chỉnh lại sau), súc tích, thực tế, hợp lý về tuyến đường.',
  'CHỈ trả về JSON hợp lệ, tiếng Việt, KHÔNG kèm chữ nào khác, theo schema:',
  '{"days":[{"title":"tiêu đề/tuyến ngày","activities":[{"time":"08:00","text":"hoạt động"}]}]}',
  'Mỗi ngày 3-5 hoạt động trải đều sáng/chiều/tối. Tạo ĐÚNG số ngày được yêu cầu.',
].join('\n');

function extractJSON(text: string): unknown {
  const m = text.match(/[[{][\s\S]*[\]}]/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/** Tách & chuẩn hoá khung lịch trình từ phản hồi AI. */
export function parseSchedule(text: string): GenDay[] | null {
  const obj = extractJSON(text) as { days?: unknown[] } | unknown[] | null;
  const arr = Array.isArray(obj) ? obj : Array.isArray(obj?.days) ? obj!.days : null;
  if (!arr) return null;
  const days = arr.map((raw) => {
    const d = raw as Record<string, unknown>;
    const acts = (Array.isArray(d.activities) ? d.activities : []).map((a): GenActivity => {
      if (typeof a === 'string') return { text: a.trim() };
      const o = a as Record<string, unknown>;
      return { time: o.time ? String(o.time) : undefined, text: String(o.text ?? o.activity ?? '').trim() };
    }).filter((a) => a.text);
    return { title: String(d.title ?? d.name ?? '').trim(), activities: acts };
  }).filter((d) => d.title || d.activities.length);
  return days.length ? days : null;
}

/** Chuyển khung AI → các Day (id mới, đánh số từ startNum). */
export function genToDays(gen: GenDay[], startNum: number): Day[] {
  return gen.map((g, i) => {
    const base = newDay(startNum + i);
    const seg = newSegment('');
    seg.activities = g.activities.length
      ? g.activities.map((a) => ({ ...newActivity(), time: a.time ?? '', text: a.text }))
      : [newActivity()];
    return { ...base, title: g.title, segments: [seg] };
  });
}

export async function generateSchedule(input: { destination: string; days: number; style?: string }): Promise<GenDay[]> {
  const content = `Điểm đến: ${input.destination || '(chưa rõ)'}\nSố ngày: ${input.days}\nPhong cách: ${input.style?.trim() || 'tiêu chuẩn'}\nTạo đúng ${input.days} ngày.`;
  const res = await callAIWorker('/chat', { system: markExtract(SYSTEM), messages: [{ role: 'user', content }] });
  if (res.error) throw new Error(res.error);
  const text = (res.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim() || res.text || '';
  const gen = parseSchedule(text);
  if (!gen) throw new Error('AI trả về không đúng định dạng. Vui lòng thử lại.');
  return gen;
}
