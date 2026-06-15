import type { Flight } from '@/types';

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

/**
 * Parse a chunk of GDS/PNR-style flight text into Flight[].
 * Tolerates several common formats (e.g. "1  BR 396 10JUN SGN TPE  1545 2010").
 * Source: public/legacy.html:6623-6657.
 */
export function parseFlights(text: string): Flight[] {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const out: Flight[] = [];
  lines.forEach((line) => {
    let s = line.replace(/^\s*\d{1,2}\s+/, ' ');
    const fm = s.match(/\b([A-Z]{2})\s*(\d{2,4})\b/);
    const flightNo = fm ? `${fm[1]}${fm[2]}` : '';
    if (fm) s = s.replace(fm[0], ' ');

    let dateStr = '';
    const dm = s.match(/\b(\d{1,2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i);
    if (dm) {
      const mo = MONTHS[dm[2].toUpperCase()];
      dateStr = `${dm[1].padStart(2, '0')}/${String(mo).padStart(2, '0')}`;
      s = s.replace(dm[0], ' ');
    } else {
      const d2 = s.match(/\b(\d{1,2})[/\-.](\d{1,2})(?:[/\-.]\d{2,4})?\b/);
      if (d2) {
        dateStr = `${d2[1].padStart(2, '0')}/${d2[2].padStart(2, '0')}`;
        s = s.replace(d2[0], ' ');
      }
    }
    const dayM = line.match(/ng[aà]y\s*(\d+)/i);

    let times = [...s.matchAll(/\b(\d{1,2}):(\d{2})\b/g)].map(
      (m) => `${m[1].padStart(2, '0')}:${m[2]}`,
    );
    if (times.length < 2) {
      times = [...s.matchAll(/\b([01]?\d|2[0-3])([0-5]\d)\b/g)].map(
        (m) => `${m[1].padStart(2, '0')}:${m[2]}`,
      );
    }

    const airports = [...s.matchAll(/\b([A-Z]{3})\b/g)]
      .map((m) => m[1])
      .filter((a) => !['AND', 'THE'].includes(a));

    if (flightNo || times.length) {
      const leg = dayM
        ? `Ngày ${dayM[1]}` + (dateStr ? ` · ${dateStr}` : '')
        : dateStr || '';
      out.push({
        id: 'f' + Date.now() + Math.random().toString(36).slice(2, 6),
        group: 'Nhóm 1',
        leg,
        flightNo,
        depAirport: airports[0] ?? '', depTime: times[0] ?? '',
        arrAirport: airports[1] ?? '', arrTime: times[1] ?? '',
        dep: [airports[0], times[0]].filter(Boolean).join(' '),
        arr: [airports[1], times[1]].filter(Boolean).join(' '),
      });
    }
  });
  return out;
}
