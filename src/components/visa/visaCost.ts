/**
 * Dự toán chi phí visa của đoàn từ bảng giá (hàm THUẦN). Mirror cách tính ở
 * VisaCatalog: phí perPax × số khách + phí theo đoàn; markup (%/cố định) trên đơn
 * giá perPax. Thực chi đối chiếu → biên lợi.
 */
import type { VisaProduct } from '@/types';

const toVND = (amt: number, cur: string, rates: Record<string, number>) => (+amt || 0) * (rates[cur] || 1);

export interface VisaCostEstimate {
  count: number;
  basePerPax: number;   // tổng phí perPax (giá vốn / khách)
  perGroup: number;     // phí theo đoàn (pass-through)
  sellPerPax: number;   // đơn giá bán / khách (đã markup)
  totalCost: number;    // giá vốn đoàn
  totalSell: number;    // giá bán đoàn
  expectedProfit: number; // lãi dự kiến = bán − vốn
}

export function estimateVisaCost(p: VisaProduct, count: number, rates: Record<string, number>): VisaCostEstimate {
  const n = Math.max(0, Math.floor(count) || 0);
  const basePerPax = (p.fees ?? []).filter((f) => f.perPax !== false).reduce((s, f) => s + toVND(f.amount, f.cur, rates), 0);
  const perGroup = (p.fees ?? []).filter((f) => f.perPax === false).reduce((s, f) => s + toVND(f.amount, f.cur, rates), 0);
  const sellPerPax = p.markupType === 'fixed'
    ? basePerPax + toVND(p.markupValue, p.markupCur || 'VND', rates)
    : basePerPax * (1 + (+p.markupValue || 0) / 100);
  const totalCost = basePerPax * n + perGroup;
  const totalSell = sellPerPax * n + perGroup;
  return { count: n, basePerPax, perGroup, sellPerPax, totalCost, totalSell, expectedProfit: totalSell - totalCost };
}

/** Biên lợi THỰC = giá bán đoàn − thực chi (âm = lỗ). */
export const actualMargin = (totalSell: number, actualSpend: number): number => totalSell - (+actualSpend || 0);
