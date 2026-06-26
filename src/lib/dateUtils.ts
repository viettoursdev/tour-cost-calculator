/**
 * Shared date helpers used by quote, contract, itinerary, and export modules.
 * Source: public/legacy.html:1695-1701.
 */

export function calcEndDate(startDate: string | null | undefined, days: number): Date | null {
  if (!startDate) return null;
  const d = new Date(startDate);
  d.setDate(d.getDate() + Math.max(0, days - 1));
  return d;
}

export function fmtDate(d: Date | string | null | undefined, en = false): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString(en ? 'en-GB' : 'vi-VN');
}

/**
 * Định dạng ngày đã ở dạng hiển thị `dd/MM/yyyy` (lịch trình lưu chuỗi VN) HOẶC
 * ISO `yyyy-MM-dd`. Tránh lỗi "Invalid Date" khi truyền chuỗi VN qua `fmtDate`
 * (vì `new Date('25/06/2026')` không parse được). Trả lại chuỗi gốc nếu đã là VN.
 */
export function fmtDayDate(d: string | null | undefined): string {
  const s = (d ?? '').trim();
  if (!s) return '';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;           // đã là dd/MM/yyyy
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;             // ISO → dd/MM/yyyy
  const date = new Date(s);
  return Number.isNaN(date.getTime()) ? s : date.toLocaleDateString('vi-VN');
}

/**
 * Whole days from today (local midnight) to `date`. Negative = in the past.
 * `null` when the date is missing/invalid. Used for visa deadline countdowns.
 */
export function daysUntil(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
