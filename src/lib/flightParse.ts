/**
 * Phân tích thông tin chuyến bay từ dòng code (GDS/vé) hoặc ảnh bằng AI (/chat,
 * Sonnet vision) → mảng QuoteFlight để người dùng duyệt trong FlightEditor.
 */
import { callAIWorker, markExtract, type ContentBlock } from '@/lib/aiWorker';
import { newFlight, newFare, newSegment, enrichSegment } from '@/components/quote/flightConstants';
import type { FlightSegment, QuoteFlight } from '@/types';

const FLIGHT_PARSE_PROMPT = [
  'Bạn là trợ lý phân tích thông tin chuyến bay. Đọc dữ liệu (dòng code đặt chỗ/GDS, vé,',
  'lịch bay, hoặc ảnh chụp) và trả về CHỈ một MẢNG JSON các BOOKING — không kèm giải thích,',
  'không markdown. MỖI phần tử là 1 booking (hành trình trên CÙNG mã đặt chỗ) gồm danh sách',
  'CHẶNG bay, dạng:',
  '{"segments":[{"date":"DDMMM viết HOA vd 20NOV","flightNo":"vd QR977","depAirport":"IATA 3 ký tự",',
  '"arrAirport":"IATA 3 ký tự","depTime":"HH:MM 24 giờ","arrTime":"HH:MM",',
  '"depOffset":số ngày cộng thêm GIỜ ĐI (ký hiệu nhỏ +1/+2 cạnh giờ, mặc định 0),',
  '"arrOffset":số ngày cộng thêm GIỜ ĐÁP (ký hiệu +1/+2, mặc định 0)}, ...]}.',
  'Số chặng TUỲ input: 1 chặng (1 chiều), 2 chặng (khứ hồi), hay 4–5 chặng (đa chặng).',
  'GIỮ NGUYÊN THỨ TỰ chặng theo input. Thường TOÀN BỘ input là 1 booking — gộp tất cả chặng',
  'vào 1 phần tử; chỉ tách thành nhiều phần tử khi rõ ràng là nhiều mã đặt chỗ riêng biệt.',
  'Nếu thiếu trường nào để chuỗi rỗng hoặc 0. Giữ NGUYÊN giá trị đọc được, KHÔNG bịa.',
].join(' ');

/** Đoán media_type từ vài byte đầu của base64 (cho Claude vision). */
function mediaTypeFromB64(b64: string): string {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (b64.startsWith('R0lGOD')) return 'image/gif';
  if (b64.startsWith('UklGR')) return 'image/webp';
  return 'image/png';
}

/** Bóc khối JSON (mảng hoặc object) từ output AI, gỡ rào ```; trả chuỗi luôn là mảng. */
export function extractFlightJson(raw: string): string {
  const s = (raw || '').replace(/```json|```/gi, '').trim();
  const lb = s.indexOf('[');
  if (lb >= 0) { const rb = s.lastIndexOf(']'); if (rb > lb) return s.slice(lb, rb + 1); }
  const lo = s.indexOf('{');
  if (lo >= 0) { const ro = s.lastIndexOf('}'); if (ro > lo) return '[' + s.slice(lo, ro + 1) + ']'; }
  return '[]';
}

/** Số ngày offset hợp lệ (>0) hoặc 0. */
const offNum = (v: unknown): number => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

const asObj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : null;

/** Chuẩn hoá 1 chặng (object AI) → FlightSegment đã suy hãng/sân bay & qua đêm. */
export function parseSegment(o: Record<string, unknown>): FlightSegment {
  const depTime = String(o.depTime ?? '').trim();
  const arrTime = String(o.arrTime ?? '').trim();
  const depOff = offNum(o.depOffset);
  // Giờ đáp < giờ đi (cùng định dạng HH:MM) ⇒ qua đêm ⇒ +1 nếu nguồn không ghi.
  let arrOff = offNum(o.arrOffset);
  if (!arrOff && depTime && arrTime && arrTime < depTime) arrOff = 1;
  return enrichSegment(newSegment({
    date: String(o.date ?? '').toUpperCase().trim(),
    flightNo: String(o.flightNo ?? '').toUpperCase().trim(),
    depAirport: String(o.depAirport ?? '').toUpperCase().trim(),
    arrAirport: String(o.arrAirport ?? '').toUpperCase().trim(),
    depTime, arrTime, depDayOffset: depOff || undefined, arrDayOffset: arrOff || undefined,
  }));
}

/** Map 1 phần tử AI → QuoteFlight (1 booking gồm N chặng).
 *  Hỗ trợ: {segments:[…]} (mới), {outbound,return} & lượt phẳng (cũ). */
export function mapToFlight(o: Record<string, unknown>): QuoteFlight {
  let raw: Record<string, unknown>[] = [];
  if (Array.isArray(o.segments)) {
    raw = o.segments.filter((x): x is Record<string, unknown> => !!asObj(x));
  } else if (o.outbound || o.return) {
    const out = asObj(o.outbound); const ret = asObj(o.return);
    if (out) raw.push(out);
    if (ret) raw.push(ret);
  } else {
    raw = [o];
  }
  const segments = raw.map(parseSegment);
  return newFlight({ segments: segments.length ? segments : [newSegment()], fares: [newFare({ label: '' })] });
}

export async function parseFlights(input: { text?: string; imageB64?: string }): Promise<QuoteFlight[]> {
  const content: ContentBlock[] = [];
  if (input.imageB64) {
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaTypeFromB64(input.imageB64), data: input.imageB64 } });
  }
  content.push({ type: 'text', text: input.text?.trim() || 'Phân tích thông tin chuyến bay trong ảnh.' });

  const res = await callAIWorker('/chat', { system: markExtract(FLIGHT_PARSE_PROMPT), messages: [{ role: 'user', content }] });
  const raw = (res.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  let arr: unknown;
  try { arr = JSON.parse(extractFlightJson(raw)); } catch { throw new Error('AI trả về dữ liệu không đọc được. Hãy thử lại hoặc nhập tay.'); }
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object').map(mapToFlight);
}
