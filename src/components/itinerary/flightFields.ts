/**
 * Tách/gộp Sân bay + Giờ cho chuyến bay trong Lịch trình. Trước đây `dep`/`arr`
 * gộp chung "TSN 05:40"; nay tách thành 4 trường riêng (depAirport/depTime/
 * arrAirport/arrTime). Các helper bên dưới đọc trường mới, tự suy từ dữ liệu cũ
 * (chuỗi gộp) để KHÔNG vỡ itinerary đã lưu.
 */
import type { Flight } from '@/types';

/** "TSN 05:40" / "TSN 1545" / "TSN" / "05:40" → { airport, time(HH:MM) }. */
export function splitAirportTime(s: string): { airport: string; time: string } {
  const str = (s || '').trim();
  const m = /^(.*?)[\s,]*(\d{1,2}:\d{2}|\d{3,4})\s*$/.exec(str);
  if (m) {
    let t = m[2];
    if (!t.includes(':')) { t = t.padStart(4, '0'); t = `${t.slice(0, 2)}:${t.slice(2)}`; }
    return { airport: m[1].trim(), time: t };
  }
  return { airport: str, time: '' };
}

export function flightDep(f: Flight): { airport: string; time: string } {
  if (f.depAirport != null || f.depTime != null) return { airport: f.depAirport ?? '', time: f.depTime ?? '' };
  return splitAirportTime(f.dep ?? '');
}
export function flightArr(f: Flight): { airport: string; time: string } {
  if (f.arrAirport != null || f.arrTime != null) return { airport: f.arrAirport ?? '', time: f.arrTime ?? '' };
  return splitAirportTime(f.arr ?? '');
}

const joinAT = (airport: string, time: string) => [airport, time].filter(Boolean).join(' ');
/** Chuỗi gộp "TSN 05:40" cho hiển thị/xuất file (ưu tiên trường mới). */
export const flightDepStr = (f: Flight): string => { const d = flightDep(f); return joinAT(d.airport, d.time); };
export const flightArrStr = (f: Flight): string => { const a = flightArr(f); return joinAT(a.airport, a.time); };

/** Đảm bảo 4 trường mới được điền (suy từ dữ liệu cũ nếu cần) + giữ dep/arr đồng bộ. */
export function normalizeFlight(f: Flight): Flight {
  const d = flightDep(f); const a = flightArr(f);
  return {
    ...f,
    depAirport: d.airport, depTime: d.time, arrAirport: a.airport, arrTime: a.time,
    dep: joinAT(d.airport, d.time), arr: joinAT(a.airport, a.time),
  };
}
