import type { AdvanceLine, TourAdvance } from '@/types';

/** Số tiền dự toán của 1 dòng = số lượng × đơn giá. */
export const lineAmount = (l: AdvanceLine): number => Math.max(0, (l.qty || 0) * (l.price || 0));

/** Số tiền quyết toán của 1 dòng = thực tế (nếu có) hoặc dự toán. */
export const lineActual = (l: AdvanceLine): number =>
  l.actual != null && l.actual >= 0 ? l.actual : lineAmount(l);

export const sumAmount = (lines: AdvanceLine[]): number => lines.reduce((s, l) => s + lineAmount(l), 0);
export const sumActual = (lines: AdvanceLine[]): number => lines.reduce((s, l) => s + lineActual(l), 0);

export interface AdvanceTotals {
  tourTotal: number;
  otherTotal: number;
  grandTotal: number;     // tổng dự toán
  actualTotal: number;    // tổng quyết toán thực tế
  /** advanceRequested − actualTotal. Dương = hoàn lại; âm = chi thêm. */
  balance: number;
}

export function advanceTotals(adv: TourAdvance | undefined): AdvanceTotals {
  const tourTotal = sumAmount(adv?.tourCosts ?? []);
  const otherTotal = sumAmount(adv?.otherCosts ?? []);
  const grandTotal = tourTotal + otherTotal;
  const actualTotal = sumActual(adv?.tourCosts ?? []) + sumActual(adv?.otherCosts ?? []);
  return { tourTotal, otherTotal, grandTotal, actualTotal, balance: (adv?.advanceRequested ?? 0) - actualTotal };
}

export function emptyAdvance(): TourAdvance {
  return { status: 'draft', tourCosts: [], otherCosts: [], advanceRequested: 0 };
}

export function newAdvanceLine(): AdvanceLine {
  return { id: 'al' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: '', qty: 1, price: 0 };
}
