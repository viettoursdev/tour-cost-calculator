/**
 * Dữ liệu cho "dải lịch tuần" + sparkline báo giá trên trang Hôm nay.
 * Thuần & ổn định múi giờ (tính theo UTC) để test.
 */

const WEEKDAY_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MS_DAY = 86400000;

/** Cộng `n` ngày vào chuỗi 'yyyy-mm-dd' (UTC) → 'yyyy-mm-dd'. */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * MS_DAY).toISOString().slice(0, 10);
}

export interface DayBucket {
  date: string;       // yyyy-mm-dd
  weekday: string;    // CN/T2…
  day: number;        // số ngày trong tháng
  isToday: boolean;
  departing: number;
  deadlines: number;
  followups: number;
  total: number;
}

export interface AgendaInput {
  departing: string[];  // ngày khởi hành tour (yyyy-mm-dd)
  deadlines: string[];  // ngày deadline (yyyy-mm-dd)
  followups: string[];  // ngày hẹn khách (yyyy-mm-dd)
}

/** `days` ô lịch bắt đầu từ `todayStr`, kèm số việc mỗi ngày. */
export function weekAgenda(input: AgendaInput, todayStr: string, days = 7): DayBucket[] {
  const count = (arr: string[], date: string) => arr.reduce((s, x) => s + (x === date ? 1 : 0), 0);
  const out: DayBucket[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(todayStr, i);
    const [y, m, d] = date.split('-').map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const departing = count(input.departing, date);
    const deadlines = count(input.deadlines, date);
    const followups = count(input.followups, date);
    out.push({ date, weekday: WEEKDAY_VI[wd], day: d, isToday: i === 0, departing, deadlines, followups, total: departing + deadlines + followups });
  }
  return out;
}

/** Số báo giá theo tuần (cũ → mới), độ dài `weeks`, dựa trên `createdAt` (ISO). */
export function weeklyQuoteCounts(createdAts: string[], weeks: number, nowMs: number): number[] {
  const buckets = new Array(weeks).fill(0);
  for (const c of createdAts) {
    const t = new Date(c).getTime();
    if (isNaN(t)) continue;
    const ageWeeks = Math.floor((nowMs - t) / (7 * MS_DAY));
    if (ageWeeks < 0 || ageWeeks >= weeks) continue;
    buckets[weeks - 1 - ageWeeks]++;
  }
  return buckets;
}
