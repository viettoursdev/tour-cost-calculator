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
