/**
 * Tra cứu chuyến bay kiểu Google Flights — tổng hợp từ nhiều nguồn web bằng AI
 * (worker `/flights/search`, Claude Sonnet + web_search). GIÁ MANG TÍNH THAM KHẢO,
 * KHÔNG phải giá đặt vé real-time — luôn xác nhận lại với hãng/đại lý.
 *
 * Hàm thuần (normalize/sort/tag/adapter) tách riêng để test không cần mạng.
 */
import { callAIWorker, type Citation } from '@/lib/aiWorker';
import { newFlight, newSegment, newFare, enrichSegment } from '@/components/quote/flightConstants';
import type { QuoteFlight } from '@/types';

export type Cabin = 'economy' | 'premium' | 'business' | 'first';

export interface FlightSearchParams {
  origin: string;        // IATA hoặc tên TP
  destination: string;
  departDate: string;    // YYYY-MM-DD
  returnDate?: string;   // YYYY-MM-DD (khứ hồi)
  pax: { adults: number; children: number; infants: number };
  cabin: Cabin;
  maxStops?: number;
  airlines?: string[];
  currency?: string;     // hiển thị, mặc định VND
}

export interface FlightLeg {
  flightNo: string;
  airline: string;
  airlineCode?: string;
  depAirport: string;
  depCity?: string;
  depTime: string;       // HH:MM
  depDate?: string;      // DDMMM
  arrAirport: string;
  arrCity?: string;
  arrTime: string;
  arrDate?: string;
  durationMin?: number;
  cabin?: string;
  aircraft?: string;
}

export interface Layover {
  airport: string;
  city?: string;
  durationMin: number;
  overnight?: boolean;
  changeAirport?: boolean;
  note?: string;
}

export interface BookingSource {
  name: string;
  url?: string;
}

export interface FlightOption {
  id: string;
  airlines: string[];
  stops: number;
  totalDurationMin?: number;
  legs: FlightLeg[];
  layovers: Layover[];
  priceVnd?: number;
  priceOrig?: number;
  priceCur?: string;
  priceNote?: string;
  bookingSources: BookingSource[];
  tags: string[];
  note?: string;
}

export interface FlightSearchResult {
  options: FlightOption[];
  citations: Citation[];
  generatedAt: string;
  warning?: string;
  raw?: string;
}

export type SortBy = 'best' | 'cheapest' | 'fastest';

/** Một lần tra cứu đã lưu (bảng `flight_searches`). */
export interface SavedFlightSearch {
  id: string;
  createdBy: string;
  createdAt: string;
  label: string;
  params: FlightSearchParams;
  result: FlightSearchResult;
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? parseFloat(v.replace(/[^\d.-]/g, '')) : Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const str = (v: unknown): string => (v == null ? '' : String(v)).trim();
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

let seq = 0;
const optId = () => 'fo' + Date.now().toString(36) + (seq++).toString(36);

function normalizeLeg(raw: Record<string, unknown>): FlightLeg {
  return {
    flightNo: str(raw.flightNo).toUpperCase(),
    airline: str(raw.airline),
    airlineCode: str(raw.airlineCode).toUpperCase() || undefined,
    depAirport: str(raw.depAirport).toUpperCase(),
    depCity: str(raw.depCity) || undefined,
    depTime: str(raw.depTime),
    depDate: str(raw.depDate).toUpperCase() || undefined,
    arrAirport: str(raw.arrAirport).toUpperCase(),
    arrCity: str(raw.arrCity) || undefined,
    arrTime: str(raw.arrTime),
    arrDate: str(raw.arrDate).toUpperCase() || undefined,
    durationMin: num(raw.durationMin),
    cabin: str(raw.cabin) || undefined,
    aircraft: str(raw.aircraft) || undefined,
  };
}

function normalizeLayover(raw: Record<string, unknown>): Layover {
  return {
    airport: str(raw.airport).toUpperCase(),
    city: str(raw.city) || undefined,
    durationMin: num(raw.durationMin) ?? 0,
    overnight: raw.overnight === true || undefined,
    changeAirport: raw.changeAirport === true || undefined,
    note: str(raw.note) || undefined,
  };
}

/** Chuẩn hoá 1 option thô từ AI: ép kiểu số, suy `stops` từ số chặng, gán id ổn định. */
export function normalizeOption(raw: Record<string, unknown>): FlightOption {
  const legs = arr<Record<string, unknown>>(raw.legs).map(normalizeLeg);
  const layovers = arr<Record<string, unknown>>(raw.layovers).map(normalizeLayover);
  const stops = num(raw.stops) ?? Math.max(0, legs.length - 1);
  const total = num(raw.totalDurationMin);
  const tags = arr<unknown>(raw.tags).map((t) => str(t)).filter(Boolean);
  return {
    id: str(raw.id) || optId(),
    airlines: arr<unknown>(raw.airlines).map((a) => str(a)).filter(Boolean),
    stops,
    totalDurationMin: total,
    legs,
    layovers,
    priceVnd: num(raw.priceVnd),
    priceOrig: num(raw.priceOrig),
    priceCur: str(raw.priceCur).toUpperCase() || undefined,
    priceNote: str(raw.priceNote) || undefined,
    bookingSources: arr<Record<string, unknown>>(raw.bookingSources)
      .map((s) => ({ name: str(s.name) || str(s.url), url: str(s.url) || undefined }))
      .filter((s) => s.name),
    tags,
    note: str(raw.note) || undefined,
  };
}

/** Đánh cờ "cheapest"/"fastest" dựa trên TOÀN danh sách (sau khi có hết option). */
export function tagBest(options: FlightOption[]): FlightOption[] {
  if (!options.length) return options;
  const priced = options.filter((o) => o.priceVnd != null);
  const timed = options.filter((o) => o.totalDurationMin != null);
  const cheapestId = priced.length
    ? priced.reduce((a, b) => (a.priceVnd! <= b.priceVnd! ? a : b)).id
    : null;
  const fastestId = timed.length
    ? timed.reduce((a, b) => (a.totalDurationMin! <= b.totalDurationMin! ? a : b)).id
    : null;
  return options.map((o) => {
    const extra: string[] = [];
    if (o.id === cheapestId && !o.tags.includes('cheapest')) extra.push('cheapest');
    if (o.id === fastestId && !o.tags.includes('fastest')) extra.push('fastest');
    if (o.stops === 0 && !o.tags.includes('nonstop')) extra.push('nonstop');
    return extra.length ? { ...o, tags: [...o.tags, ...extra] } : o;
  });
}

const INF = Number.POSITIVE_INFINITY;
/** "best" = điểm tổng hợp (giá + thời gian + số chặng, chuẩn hoá tương đối). */
function bestScore(o: FlightOption, maxP: number, maxD: number): number {
  const p = o.priceVnd != null && maxP ? o.priceVnd / maxP : 0.5;
  const d = o.totalDurationMin != null && maxD ? o.totalDurationMin / maxD : 0.5;
  return p * 0.5 + d * 0.4 + o.stops * 0.1;
}

/** Sắp xếp option theo tiêu chí (không đột biến mảng gốc). */
export function sortOptions(options: FlightOption[], by: SortBy): FlightOption[] {
  const list = [...options];
  if (by === 'cheapest') {
    return list.sort((a, b) => (a.priceVnd ?? INF) - (b.priceVnd ?? INF));
  }
  if (by === 'fastest') {
    return list.sort((a, b) => (a.totalDurationMin ?? INF) - (b.totalDurationMin ?? INF));
  }
  const maxP = Math.max(0, ...options.map((o) => o.priceVnd ?? 0));
  const maxD = Math.max(0, ...options.map((o) => o.totalDurationMin ?? 0));
  return list.sort((a, b) => bestScore(a, maxP, maxD) - bestScore(b, maxP, maxD));
}

/** Chuẩn hoá kết quả worker → FlightSearchResult (options đã normalize + tag). */
export function normalizeResult(d: {
  options?: unknown[]; citations?: Citation[]; generatedAt?: string; warning?: string; raw?: string;
}): FlightSearchResult {
  const options = tagBest(arr<Record<string, unknown>>(d.options).map(normalizeOption));
  return {
    options,
    citations: Array.isArray(d.citations) ? d.citations : [],
    generatedAt: d.generatedAt || new Date().toISOString(),
    warning: d.warning,
    raw: d.raw,
  };
}

/** Gọi worker tra cứu chuyến bay. Có thể mất 15–40s (web_search nhiều nguồn). */
export async function searchFlights(params: FlightSearchParams): Promise<FlightSearchResult> {
  const d = await callAIWorker('/flights/search', {
    origin: params.origin.trim(),
    destination: params.destination.trim(),
    departDate: params.departDate,
    returnDate: params.returnDate || undefined,
    pax: params.pax,
    cabin: params.cabin,
    maxStops: params.maxStops,
    airlines: params.airlines?.length ? params.airlines : undefined,
    currency: params.currency || 'VND',
  });
  return normalizeResult(d);
}

/** Đổi 1 leg → FlightSegment của báo giá (giữ IATA/ngày/giờ; suy hãng/thành phố). */
function legToSegment(leg: FlightLeg) {
  return enrichSegment(newSegment({
    date: leg.depDate || '',
    flightNo: leg.flightNo,
    depAirport: leg.depAirport,
    arrAirport: leg.arrAirport,
    depTime: leg.depTime,
    arrTime: leg.arrTime,
    airlineCode: leg.airlineCode,
    airlineName: leg.airline || undefined,
    depCity: leg.depCity,
    arrCity: leg.arrCity,
  }));
}

/**
 * Đẩy 1 option tra cứu → QuoteFlight (booking) để chèn vào báo giá.
 * Mỗi leg = 1 segment; giá VND (và giá gốc nếu có) → hạng giá "Phổ thông".
 */
export function flightSearchToQuoteFlight(opt: FlightOption): QuoteFlight {
  const segments = opt.legs.length ? opt.legs.map(legToSegment) : [newSegment()];
  const fare = opt.priceOrig != null && opt.priceCur && opt.priceCur !== 'VND'
    ? newFare({ label: 'Phổ thông', amount: opt.priceOrig, cur: opt.priceCur })
    : newFare({ label: 'Phổ thông', amount: opt.priceVnd ?? 0, cur: 'VND' });
  const noteParts = [
    opt.airlines.join(', '),
    opt.priceNote,
    opt.note,
    '(Giá tham khảo từ tra cứu web — cần xác nhận lại)',
  ].filter(Boolean);
  return newFlight({ segments, fares: [fare], note: noteParts.join(' · ') });
}

/** Định dạng phút → "Xh Ym" (vd 545 → "9h 5m"). */
export function fmtDuration(min?: number): string {
  if (min == null || !Number.isFinite(min) || min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

/** Cảnh báo transit đáng chú ý cho 1 layover (chờ lâu/qua đêm/đổi sân bay). */
export function layoverIsWarn(l: Layover): boolean {
  return l.durationMin > 180 || l.overnight === true || l.changeAirport === true;
}
