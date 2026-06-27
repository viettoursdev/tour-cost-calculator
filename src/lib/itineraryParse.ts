/**
 * Phân tích file lịch trình (text đã trích từ .docx/.pdf) thành cấu trúc Itinerary
 * bằng AI Worker (/ai → Claude). Trả về JSON theo schema rồi map sang Itinerary.
 */
import { callAIWorker } from './aiWorker';
import {
  ITIN_DEFAULT_EXC, ITIN_DEFAULT_INC, newActivity, newDay, newSegment,
} from '@/components/itinerary/constants';
import type { Itinerary } from '@/types';

export interface ParsedActivity { time?: string; activity?: string; place?: string; commentary?: string }
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
  `Bạn là trợ lý điều hành tour người Việt. Đọc nội dung CHƯƠNG TRÌNH TOUR dưới đây và trích xuất thành JSON theo ĐÚNG schema. CHỈ trả về JSON hợp lệ, KHÔNG giải thích, KHÔNG markdown.

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
      "activities": [ { "time": string, "activity": string, "place": string, "commentary": string } ]
    }
  ],
  "includes": [string],       // giá bao gồm
  "excludes": [string]        // không bao gồm
}

Quy tắc CHUNG:
- Giữ nguyên tiếng Việt. "time" để trống nếu không rõ giờ.
- Mảng rỗng nếu không có chuyến bay / giá gồm / không gồm.

Quy tắc QUAN TRỌNG về cách viết "activity" (văn phong chương trình tour Việt Nam):
- "activity" = CÂU HOẠT ĐỘNG viết hoàn chỉnh, BẮT ĐẦU bằng ĐỘNG TỪ/HÀNH ĐỘNG, RỒI MỚI tới ĐỊA ĐIỂM. TUYỆT ĐỐI không viết địa điểm trước hành động sau.
  ✅ ĐÚNG (hành động → địa điểm): "Tham quan Vịnh Hạ Long", "Khởi hành đi Bà Nà Hills", "Ăn trưa tại nhà hàng địa phương", "Tự do dạo chơi phố cổ Hội An", "Làm thủ tục nhận phòng khách sạn", "Tiễn đoàn ra sân bay".
  ❌ SAI (ngược, địa điểm trước): "Vịnh Hạ Long – tham quan", "Bà Nà Hills, khởi hành đi", "Phố cổ Hội An tự do dạo chơi".
- Động từ thường dùng: Đón đoàn, Khởi hành, Di chuyển, Tham quan, Ăn sáng/trưa/tối, Thưởng thức, Tự do, Mua sắm, Nhận/Trả phòng, Nghỉ ngơi, Tiễn đoàn, Đáp/Lên chuyến bay.
- Nếu văn bản gốc chỉ nêu tên địa điểm mà không có động từ, hãy TỰ thêm động từ phù hợp (thường là "Tham quan ...") để câu đọc tự nhiên, action-first.
- Nếu văn bản gốc đã viết ngược (địa điểm trước), hãy ĐẢO LẠI cho đúng văn phong action-first.
- "place" = CHỈ tên riêng của địa điểm chính trong hoạt động đó (vd "Vịnh Hạ Long", "Chùa Linh Ứng") để lưu thư viện; rỗng nếu hoạt động không gắn địa điểm cụ thể (vd ăn uống, nghỉ ngơi).
- "commentary" = thông tin thuyết minh/mô tả thêm về địa điểm (rỗng nếu không có); ĐỪNG nhét lại tên động từ/hành động vào đây.

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
      const activity = (a.activity ?? '').trim();
      const place = (a.place ?? '').trim();
      const commentary = (a.commentary ?? '').trim();
      if (place && commentary) pois.push({ place, commentary });
      // Dòng hoạt động ưu tiên câu "activity" (đã viết action-first); fallback tên địa điểm.
      const head = activity || place;
      const text = head && commentary ? `${head} – ${commentary}` : (head || commentary);
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
