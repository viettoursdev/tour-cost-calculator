// scripts/etl/util.mjs — pure helpers, no I/O.

/** "Tony Nguyen (CEO)" -> "Tony Nguyen"; passes plain strings through. */
export function nameFromActor(s) {
  if (!s) return '';
  return String(s).replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** Alias kept for readability where a value is already a bare name. */
export const firstName = nameFromActor;

/** ISO timestamp string or null (timestamptz columns accept the ISO string). */
export function iso(v) {
  return v ? String(v) : null;
}

/** First 10 chars (yyyy-mm-dd) of an ISO date, or null. For `date` columns. */
export function dateOnly(v) {
  return v ? String(v).slice(0, 10) : null;
}

/** Chunk an array into sub-arrays of size n. */
export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
