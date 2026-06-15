/**
 * Phân tích thông tin chuyến bay từ dòng code (GDS/vé) hoặc ảnh bằng AI (/chat,
 * Sonnet vision) → mảng QuoteFlight để người dùng duyệt trong FlightEditor.
 */
import { callAIWorker, type ContentBlock } from '@/lib/aiWorker';
import { newFlight, newFare, deriveAirline, deriveAirport } from '@/components/quote/flightConstants';
import type { QuoteFlight } from '@/types';

const FLIGHT_PARSE_PROMPT = [
  'Bạn là trợ lý phân tích thông tin chuyến bay. Đọc dữ liệu (dòng code đặt chỗ/GDS, vé,',
  'lịch bay, hoặc ảnh chụp) và trả về CHỈ một MẢNG JSON các chuyến bay — không kèm giải',
  'thích, không markdown. Mỗi phần tử có dạng:',
  '{"date":"DDMMM viết HOA, vd 01JAN","flightNo":"vd VN310","depAirport":"IATA 3 ký tự",',
  '"arrAirport":"IATA 3 ký tự","depTime":"HH:MM 24 giờ","arrTime":"HH:MM",',
  '"depOffset":số ngày cộng thêm trên GIỜ ĐI (ký hiệu nhỏ +1/+2 cạnh giờ, mặc định 0),',
  '"arrOffset":số ngày cộng thêm trên GIỜ ĐÁP (ký hiệu +1/+2, mặc định 0)}.',
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

/** Map 1 object AI → QuoteFlight (suy hãng/sân bay, chuẩn hoá HOA). */
/** Số ngày offset hợp lệ (>0) hoặc 0. */
const offNum = (v: unknown): number => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

export function mapToFlight(o: Record<string, unknown>): QuoteFlight {
  const flightNo = String(o.flightNo ?? '').toUpperCase().trim();
  const dep = String(o.depAirport ?? '').toUpperCase().trim();
  const arr = String(o.arrAirport ?? '').toUpperCase().trim();
  const air = deriveAirline(flightNo);
  const depTime = String(o.depTime ?? '').trim();
  const arrTime = String(o.arrTime ?? '').trim();
  const depOff = offNum(o.depOffset);
  // Giờ đáp < giờ đi (cùng định dạng HH:MM) ⇒ qua đêm ⇒ +1 nếu nguồn không ghi.
  let arrOff = offNum(o.arrOffset);
  if (!arrOff && depTime && arrTime && arrTime < depTime) arrOff = 1;
  return newFlight({
    date: String(o.date ?? '').toUpperCase().trim(),
    flightNo, depAirport: dep, arrAirport: arr, depTime, arrTime,
    depDayOffset: depOff || undefined,
    arrDayOffset: arrOff || undefined,
    airlineCode: air.code || undefined,
    airlineName: air.name || undefined,
    depCity: deriveAirport(dep) || undefined,
    arrCity: deriveAirport(arr) || undefined,
    fares: [newFare({ label: '' })],
  });
}

export async function parseFlights(input: { text?: string; imageB64?: string }): Promise<QuoteFlight[]> {
  const content: ContentBlock[] = [];
  if (input.imageB64) {
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaTypeFromB64(input.imageB64), data: input.imageB64 } });
  }
  content.push({ type: 'text', text: input.text?.trim() || 'Phân tích thông tin chuyến bay trong ảnh.' });

  const res = await callAIWorker('/chat', { system: FLIGHT_PARSE_PROMPT, messages: [{ role: 'user', content }] });
  const raw = (res.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  let arr: unknown;
  try { arr = JSON.parse(extractFlightJson(raw)); } catch { throw new Error('AI trả về dữ liệu không đọc được. Hãy thử lại hoặc nhập tay.'); }
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object').map(mapToFlight);
}
