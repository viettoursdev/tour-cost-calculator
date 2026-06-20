import type { AdvanceLine, TourAdvance } from '@/types';

type Rates = Record<string, number>;
const rateOf = (cur: string | undefined, rates: Rates): number =>
  !cur || cur === 'VND' ? 1 : (rates[cur] ?? 1);

/** Số tiền dự toán của 1 dòng (VND) = số lượng × đơn giá × tỷ giá. */
export const lineAmount = (l: AdvanceLine, rates: Rates = {}): number =>
  Math.max(0, (l.qty || 0) * (l.price || 0) * rateOf(l.cur, rates));

/** Số tiền quyết toán (VND) = thực tế (nếu có) hoặc dự toán đã quy đổi. */
export const lineActual = (l: AdvanceLine, rates: Rates = {}): number =>
  l.actual != null && l.actual >= 0 ? l.actual : lineAmount(l, rates);

export const sumAmount = (lines: AdvanceLine[], rates: Rates = {}): number =>
  lines.reduce((s, l) => s + lineAmount(l, rates), 0);
export const sumActual = (lines: AdvanceLine[], rates: Rates = {}): number =>
  lines.reduce((s, l) => s + lineActual(l, rates), 0);

export interface AdvanceTotals {
  tourTotal: number;
  otherTotal: number;
  grandTotal: number;     // tổng dự toán
  actualTotal: number;    // tổng quyết toán thực tế
  /** advanceRequested − actualTotal. Dương = hoàn lại; âm = chi thêm. */
  balance: number;
}

export function advanceTotals(adv: TourAdvance | undefined, rates: Rates = {}): AdvanceTotals {
  const tourTotal = sumAmount(adv?.tourCosts ?? [], rates);
  const otherTotal = sumAmount(adv?.otherCosts ?? [], rates);
  const grandTotal = tourTotal + otherTotal;
  const actualTotal = sumActual(adv?.tourCosts ?? [], rates) + sumActual(adv?.otherCosts ?? [], rates);
  return { tourTotal, otherTotal, grandTotal, actualTotal, balance: (adv?.advanceRequested ?? 0) - actualTotal };
}

export function emptyAdvance(): TourAdvance {
  return { status: 'draft', tourCosts: [], otherCosts: [], advanceRequested: 0 };
}

export function newAdvanceLine(): AdvanceLine {
  return { id: 'al' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: '', qty: 1, price: 0 };
}
