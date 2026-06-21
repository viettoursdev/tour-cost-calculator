/**
 * Logic THUẦN cho Lịch đi tour HDV: parse ngày bay "DDMMM" + neo năm, dựng mốc
 * thời gian đầy đủ từ một chặng bay, bắt trùng lịch (overlap + đệm tối thiểu) và
 * sinh màu nhận diện cố định. Không phụ thuộc React/Firestore để dễ unit-test.
 */
import type { FlightSegment, QuoteFlight } from '@/types/quote';
import type { GuideFlightLeg, GuideConflict } from '@/types/guide';

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

/** Thời gian đệm tối thiểu mặc định giữa 2 chặng bay của cùng HDV (phút). */
export const DEFAULT_BUFFER_MINS = 120;

/** Bảng màu nhận diện (tone đậm, tương phản tốt trên nền sáng). */
export const SCHEDULE_PALETTE = [
  '#dc3250', '#2563eb', '#0d9488', '#d97706', '#7c3aed',
  '#db2777', '#0891b2', '#65a30d', '#ea580c', '#4f46e5',
  '#0f766e', '#b91c1c', '#9333ea', '#c026d3', '#1d4ed8',
] as const;

/** Hash chuỗi → chỉ số bảng màu (ổn định: cùng id luôn cùng màu). */
export function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return SCHEDULE_PALETTE[h % SCHEDULE_PALETTE.length];
}

/**
 * Parse ngày bay dạng "DDMMM" (vd "20NOV") → {day, month(0-11)}. Trả null nếu sai.
 * Chấp nhận có/không khoảng trắng & viết thường ("20 nov", "5dec").
 */
export function parseDDMMM(raw: string): { day: number; month: number } | null {
  if (!raw) return null;
  const m = raw.trim().toUpperCase().match(/^(\d{1,2})\s*([A-Z]{3})/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = MONTHS[m[2]];
  if (month === undefined || day < 1 || day > 31) return null;
  return { day, month };
}

/**
 * Neo năm cho ngày bay: dùng năm của ngày khởi hành tour; nếu tháng bay < tháng khởi
 * hành nhiều (vắt qua giao thừa, vd khởi hành 28DEC, chặng về 02JAN) thì +1 năm.
 */
export function resolveYear(flightMonth: number, departISO?: string): number {
  const base = departISO ? new Date(departISO + 'T00:00:00') : new Date();
  const baseYear = base.getFullYear();
  const baseMonth = base.getMonth();
  // Tháng bay lùi sâu so với tháng khởi hành → thuộc năm sau.
  if (baseMonth >= 10 && flightMonth <= 1) return baseYear + 1;
  return baseYear;
}

/** Ghép ngày (Y,M,D) + giờ "HH:MM" + offset ngày → epoch ms (giờ local). */
function toMs(year: number, month: number, day: number, time: string, dayOffset = 0): number | null {
  const tm = (time || '').match(/^(\d{1,2}):(\d{2})/);
  if (!tm) return null;
  const d = new Date(year, month, day + (dayOffset || 0), parseInt(tm[1], 10), parseInt(tm[2], 10));
  return isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * Dựng mốc thời gian đầy đủ cho 1 chặng bay. Trả {startISO, endISO} hoặc null nếu
 * thiếu ngày/giờ. Xử lý chuyến qua đêm: nếu giờ đến < giờ đi và không có offset thì
 * coi như +1 ngày; tôn trọng `depDayOffset`/`arrDayOffset` nếu có.
 */
export function resolveSegmentTimes(
  seg: FlightSegment,
  departISO?: string,
): { startISO: string; endISO: string } | null {
  const pd = parseDDMMM(seg.date);
  if (!pd) return null;
  const year = resolveYear(pd.month, departISO);
  const startMs = toMs(year, pd.month, pd.day, seg.depTime, seg.depDayOffset);
  if (startMs == null) return null;
  let arrOffset = seg.arrDayOffset;
  // Suy offset qua đêm khi không khai báo: giờ đến sớm hơn giờ đi → sang ngày hôm sau.
  if (arrOffset == null) {
    const dep = (seg.depTime || '').match(/^(\d{1,2}):(\d{2})/);
    const arr = (seg.arrTime || '').match(/^(\d{1,2}):(\d{2})/);
    if (dep && arr) {
      const depM = +dep[1] * 60 + +dep[2];
      const arrM = +arr[1] * 60 + +arr[2];
      arrOffset = (arrM < depM ? 1 : 0) + (seg.depDayOffset || 0);
    } else {
      arrOffset = seg.depDayOffset || 0;
    }
  }
  const endMs = toMs(year, pd.month, pd.day, seg.arrTime, arrOffset);
  if (endMs == null) return null;
  return { startISO: new Date(startMs).toISOString(), endISO: new Date(endMs).toISOString() };
}

/**
 * Seed các chặng bay của một báo giá thành leg cho 1 HDV. Bỏ qua chặng thiếu ngày/giờ.
 * `legId` cho phép sinh id ổn định (test) — mặc định theo tour+guide+index.
 */
export function buildLegsFromFlights(
  flights: QuoteFlight[] | undefined,
  guideId: string,
  tourCloudId: string,
  departISO?: string,
  legId: (i: number, seg: FlightSegment) => string = (i) => `${tourCloudId}:${guideId}:${i}`,
): GuideFlightLeg[] {
  const legs: GuideFlightLeg[] = [];
  let i = 0;
  for (const f of flights ?? []) {
    for (const seg of f.segments ?? []) {
      const t = resolveSegmentTimes(seg, departISO);
      if (!t) { i++; continue; }
      legs.push({
        id: legId(i, seg),
        guideId,
        tourCloudId,
        flightNo: seg.flightNo,
        depAirport: seg.depAirport,
        arrAirport: seg.arrAirport,
        startISO: t.startISO,
        endISO: t.endISO,
        source: 'quote',
      });
      i++;
    }
  }
  return legs;
}

/**
 * Bắt trùng lịch theo từng HDV: sắp xếp leg theo giờ bắt đầu, so chặng liền kề.
 * - `overlap`: khoảng thời gian giao nhau (gap < 0).
 * - `buffer`: không giao nhưng cách nhau < `bufferMins` (không đủ thời gian xoay tour).
 * Trả về mọi cặp vi phạm.
 */
export function detectConflicts(
  legs: GuideFlightLeg[],
  bufferMins: number = DEFAULT_BUFFER_MINS,
): GuideConflict[] {
  const byGuide = new Map<string, GuideFlightLeg[]>();
  for (const l of legs) {
    (byGuide.get(l.guideId) ?? byGuide.set(l.guideId, []).get(l.guideId)!).push(l);
  }
  const out: GuideConflict[] = [];
  for (const [guideId, arr] of byGuide) {
    const sorted = [...arr].sort((a, b) => a.startISO.localeCompare(b.startISO));
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      let maxEnd = new Date(a.endISO).getTime();
      // So với các chặng sau cho tới khi không còn khả năng chồng (tránh bỏ sót khi
      // một chặng dài bao trùm nhiều chặng ngắn).
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        const bStart = new Date(b.startISO).getTime();
        const gapMins = (bStart - maxEnd) / 60000;
        if (gapMins >= bufferMins) break; // các chặng sau còn xa hơn → dừng
        out.push({ guideId, legA: a, legB: b, kind: gapMins < 0 ? 'overlap' : 'buffer', gapMins: Math.round(gapMins) });
        maxEnd = Math.max(maxEnd, new Date(b.endISO).getTime());
      }
    }
  }
  return out;
}

/** Tập id leg đang vướng trùng (để tô đỏ nhanh trong UI). */
export function conflictedLegIds(conflicts: GuideConflict[]): Set<string> {
  const s = new Set<string>();
  for (const c of conflicts) { s.add(c.legA.id); s.add(c.legB.id); }
  return s;
}
