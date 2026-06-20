/**
 * Tách/gộp Sân bay + Giờ cho chuyến bay trong Lịch trình. Trước đây `dep`/`arr`
 * gộp chung "TSN 05:40"; nay tách thành 4 trường riêng (depAirport/depTime/
 * arrAirport/arrTime). Các helper bên dưới đọc trường mới, tự suy từ dữ liệu cũ
 * (chuỗi gộp) để KHÔNG vỡ itinerary đã lưu.
 */
import type { Flight } from '@/types';

export interface AirportTime { airport: string; time: string; offset: number }

/** "TSN 05:40" / "TSN 1545" / "PVG 22:15+1" / "TSN" / "05:40" → { airport, time, offset }. */
export function splitAirportTime(s: string): AirportTime {
  const str = (s || '').trim();
  const m = /^(.*?)[\s,]*(\d{1,2}:\d{2}|\d{3,4})\s*(?:\+(\d))?\s*$/.exec(str);
  if (m) {
    let t = m[2];
    if (!t.includes(':')) { t = t.padStart(4, '0'); t = `${t.slice(0, 2)}:${t.slice(2)}`; }
    return { airport: m[1].trim(), time: t, offset: m[3] ? Number(m[3]) : 0 };
  }
  return { airport: str, time: '', offset: 0 };
}

/**
 * Tách ô sân bay gộp kiểu "HAN 23:20 (26.06)" / "NRT 06:30+1 (27.06)" thành
 * { airport, time, offset, date } để chuẩn hoá khi AI/người dùng dán cả cụm.
 */
export function parseAirportCell(s: string): AirportTime & { date: string } {
  let str = (s || '').trim();
  let date = '';
  const dm = str.match(/\(?\b(\d{1,2})[./-](\d{1,2})\b\)?/);
  // Chỉ lấy ngày nếu nằm trong ngoặc (tránh nhầm với giờ).
  const paren = str.match(/\((\d{1,2})[./-](\d{1,2})\)/);
  if (paren) { date = `${paren[1].padStart(2, '0')}.${paren[2].padStart(2, '0')}`; str = str.replace(paren[0], '').trim(); }
  else if (dm && /\(/.test(str)) { date = `${dm[1].padStart(2, '0')}.${dm[2].padStart(2, '0')}`; str = str.replace(dm[0], '').trim(); }
  const at = splitAirportTime(str);
  return { ...at, date };
}

export function flightDep(f: Flight): AirportTime {
  if (f.depAirport != null || f.depTime != null) return { airport: f.depAirport ?? '', time: f.depTime ?? '', offset: f.depDayOffset ?? 0 };
  return splitAirportTime(f.dep ?? '');
}
export function flightArr(f: Flight): AirportTime {
  if (f.arrAirport != null || f.arrTime != null) return { airport: f.arrAirport ?? '', time: f.arrTime ?? '', offset: f.arrDayOffset ?? 0 };
  return splitAirportTime(f.arr ?? '');
}

const joinAT = ({ airport, time, offset }: AirportTime) =>
  [airport, time && offset > 0 ? `${time}+${offset}` : time].filter(Boolean).join(' ');
/** Chuỗi gộp "TSN 05:40" / "PVG 22:15+1" cho hiển thị/xuất file (ưu tiên trường mới). */
export const flightDepStr = (f: Flight): string => joinAT(flightDep(f));
export const flightArrStr = (f: Flight): string => joinAT(flightArr(f));

/** Đảm bảo 4 trường mới + offset được điền (suy từ dữ liệu cũ nếu cần) + giữ dep/arr đồng bộ. */
export function normalizeFlight(f: Flight): Flight {
  const d = flightDep(f); const a = flightArr(f);
  // Giờ đáp < giờ đi ⇒ qua đêm ⇒ +1 nếu chưa có offset.
  const arr: AirportTime = { ...a, offset: a.offset || (d.time && a.time && a.time < d.time ? 1 : 0) };
  return {
    ...f,
    depAirport: d.airport, depTime: d.time, depDayOffset: d.offset || undefined,
    arrAirport: arr.airport, arrTime: arr.time, arrDayOffset: arr.offset || undefined,
    dep: joinAT(d), arr: joinAT(arr),
  };
}
