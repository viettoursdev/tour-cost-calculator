import type { CloudQuoteEntry, Template } from '@/types';

/**
 * #5 — Gợi ý giá: từ các báo giá tương đương trong lịch sử, tính dải biên% của
 * báo giá THẮNG ("dải dễ thắng") và đối chiếu biên hiện tại. Thuần (pure) để
 * test; lớp AI (tùy chọn) chỉ diễn giải.
 */

export type PricingVerdict = 'chưa đủ mẫu' | 'thấp biên' | 'trong dải dễ thắng' | 'cao rủi ro thua';

export type PricingSuggestion = {
  sampleWon: number;
  sampleLost: number;
  wonBand?: [number, number]; // p25..p75 biên% của báo giá thắng
  wonMedian?: number;
  lostMedian?: number;
  currentMarginPct?: number;
  verdict: PricingVerdict;
};

/** Số mẫu thắng tối thiểu để dải biên được coi là đáng tin. */
export const MIN_WON_SAMPLE = 3;

/** Biên% của một báo giá index = lợi nhuận / doanh thu × 100 (cần cột profit, migration 0069). */
export function marginPctOf(e: CloudQuoteEntry): number | undefined {
  if (typeof e.profit !== 'number' || typeof e.totalCost !== 'number' || e.totalCost <= 0) return undefined;
  return (e.profit / e.totalCost) * 100;
}

const normDest = (d?: string) => (d ?? '').trim().toLowerCase();

/** Phân vị (linear interpolation) trên mảng ĐÃ sắp tăng dần. */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

const isWon = (e: CloudQuoteEntry) => e.status === 'won';
const isLost = (e: CloudQuoteEntry) => e.status === 'not_selected' || e.status === 'cancelled';

/** Báo giá tương đương: cùng template, cùng điểm đến (nếu có), pax trong dung sai. */
export function isComparable(
  e: CloudQuoteEntry,
  input: { template: Template; dest?: string; pax: number },
  paxTolerance: number,
): boolean {
  if (e.template !== input.template) return false;
  if (normDest(input.dest) && normDest(e.dest) !== normDest(input.dest)) return false;
  if (Math.abs((e.pax ?? 0) - input.pax) > paxTolerance) return false;
  return true;
}

export function suggestPricing(
  input: { template: Template; dest?: string; pax: number; currentMarginPct?: number },
  history: CloudQuoteEntry[],
  opts: { paxTolerance?: number } = {},
): PricingSuggestion {
  const tol = opts.paxTolerance ?? Math.max(5, Math.round(input.pax * 0.25));
  const comps = history.filter((e) => isComparable(e, input, tol));

  const wonM = comps.filter(isWon).map(marginPctOf).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b);
  const lostM = comps.filter(isLost).map(marginPctOf).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b);

  const wonBand: [number, number] | undefined = wonM.length ? [percentile(wonM, 0.25), percentile(wonM, 0.75)] : undefined;
  const wonMedian = wonM.length ? percentile(wonM, 0.5) : undefined;
  const lostMedian = lostM.length ? percentile(lostM, 0.5) : undefined;

  let verdict: PricingVerdict = 'chưa đủ mẫu';
  const cm = input.currentMarginPct;
  if (wonBand && wonM.length >= MIN_WON_SAMPLE && typeof cm === 'number') {
    if (cm < wonBand[0]) verdict = 'thấp biên';
    else if (cm > wonBand[1]) verdict = 'cao rủi ro thua';
    else verdict = 'trong dải dễ thắng';
  }

  return {
    sampleWon: wonM.length,
    sampleLost: lostM.length,
    wonBand,
    wonMedian,
    lostMedian,
    currentMarginPct: cm,
    verdict,
  };
}
