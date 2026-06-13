/**
 * Phân tích file lịch trình (text đã trích từ .docx/.pdf) thành cấu trúc Itinerary
 * bằng AI Worker (/ai → Claude). Trả về JSON theo schema rồi map sang Itinerary.
 */
import { callAIWorker } from './aiWorker';
import {
  ITIN_DEFAULT_EXC, ITIN_DEFAULT_INC, newActivity, newDay, newSegment,
} from '@/components/itinerary/constants';
import type { Itinerary } from '@/types';

export interface ParsedActivity { time?: string; place?: string; commentary?: string }
export interface ParsedDay {
  title?: string;
  meals?: { B?: boolean; L?: boolean; D?: boolean };
  mealNote?: string;
  activities?: ParsedActivity[];
}
export interface ParsedFlight { group?: string; leg?: string; flightNo?: string; dep?: string; arr?: string }
export interface ParsedItinerary {
  title?: string;
  destination?: string;
  intro?: string;
  flights?: ParsedFlight[];
  days?: ParsedDay[];
  includes?: string[];
  excludes?: string[];
}

const buildPrompt = (text: string): string =>
  `Bạn là trợ lý điều hành tour. Đọc nội dung CHƯƠNG TRÌNH TOUR dưới đây và trích xuất thành JSON theo ĐÚNG schema. CHỈ trả về JSON hợp lệ, KHÔNG giải thích, KHÔNG markdown.

Schema:
{
  "title": string,            // tên chương trình
  "destination": string,      // điểm đến chính (vd "ĐÀ NẴNG", "HÀN QUỐC")
  "intro": string,            // đoạn giới thiệu điểm đến (nếu có)
  "flights": [ { "group": string, "leg": string, "flightNo": string, "dep": string, "arr": string } ],
  "days": [
    {
      "title": string,        // tiêu đề ngày
      "meals": { "B": boolean, "L": boolean, "D": boolean },  // bữa sáng/trưa/tối có bao gồm
      "mealNote": string,
      "activities": [ { "time": string, "place": string, "commentary": string } ]
    }
  ],
  "includes": [string],       // giá bao gồm
  "excludes": [string]        // không bao gồm
}

Quy tắc:
- Giữ nguyên tiếng Việt. "time" để trống nếu không rõ giờ.
- "place" = tên địa điểm/hoạt động tham quan; "commentary" = thông tin thuyết minh/mô tả của điểm đó (rỗng nếu không có).
- Mảng rỗng nếu không có chuyến bay / giá gồm / không gồm.

Nội dung:
"""
${text}
"""`;

/** Bóc JSON ra khỏi code-fence/giải thích thừa. */
function extractJson(s: string): string {
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : s;
  const a = body.indexOf('{');
  const b = body.lastIndexOf('}');
  return a >= 0 && b > a ? body.slice(a, b + 1) : body.trim();
}

export async function parseItineraryText(text: string): Promise<ParsedItinerary> {
  if (!text.trim()) throw new Error('Không đọc được nội dung từ file.');
  const d = await callAIWorker('/ai', { prompt: buildPrompt(text.slice(0, 24000)) });
  const raw = (d.text ?? '').trim();
  try {
    return JSON.parse(extractJson(raw)) as ParsedItinerary;
  } catch {
    throw new Error('AI trả về không đúng định dạng. Hãy thử lại hoặc dùng file rõ ràng hơn.');
  }
}

/** Map kết quả AI sang Itinerary + danh sách POI {địa điểm, thuyết minh} để lưu thư viện. */
export function buildItineraryFromParsed(p: ParsedItinerary): {
  itinerary: Itinerary;
  pois: { place: string; commentary: string }[];
} {
  const pois: { place: string; commentary: string }[] = [];
  const days = p.days && p.days.length ? p.days : [{}];
  const schedule = days.map((d, i) => {
    const day = newDay(i + 1);
    day.title = (d.title ?? '').trim();
    day.meals = { B: !!d.meals?.B, L: !!d.meals?.L, D: !!d.meals?.D };
    day.mealNote = (d.mealNote ?? '').trim();
    const acts = (d.activities ?? []).map((a) => {
      const place = (a.place ?? '').trim();
      const commentary = (a.commentary ?? '').trim();
      if (place && commentary) pois.push({ place, commentary });
      const text = place && commentary ? `${place} – ${commentary}` : (place || commentary);
      return { ...newActivity(), time: (a.time ?? '').trim(), text };
    });
    const seg = newSegment('');
    seg.activities = acts.length ? acts : [newActivity()];
    day.segments = [seg];
    return day;
  });

  const flights = (p.flights ?? [])
    .filter((f) => f.flightNo || f.dep || f.arr || f.leg)
    .map((f, i) => ({
      id: 'f' + Date.now() + i,
      group: (f.group ?? 'Nhóm 1').trim() || 'Nhóm 1',
      leg: (f.leg ?? '').trim(),
      flightNo: (f.flightNo ?? '').trim(),
      dep: (f.dep ?? '').trim(),
      arr: (f.arr ?? '').trim(),
    }));

  const itinerary: Itinerary = {
    id: 'it' + Date.now(),
    type: 'NN',
    continent: '',
    country: '',
    seq: 1,
    title: p.title?.trim() || 'CHƯƠNG TRÌNH THAM QUAN DU LỊCH',
    destination: (p.destination ?? '').trim(),
    days: schedule.length,
    nights: Math.max(0, schedule.length - 1),
    intro: (p.intro ?? '').trim(),
    flights: flights.length ? flights : [{ id: 'f1', group: 'Nhóm 1', leg: '', flightNo: '', dep: '', arr: '' }],
    schedule,
    includes: p.includes && p.includes.length ? p.includes.filter(Boolean) : [...ITIN_DEFAULT_INC],
    excludes: p.excludes && p.excludes.length ? p.excludes.filter(Boolean) : [...ITIN_DEFAULT_EXC],
    linkedQuoteId: null,
    linkedQuoteName: '',
  };
  return { itinerary, pois };
}
