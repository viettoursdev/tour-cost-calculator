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
