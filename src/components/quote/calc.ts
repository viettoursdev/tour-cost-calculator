import type { Item, QuoteDraft, CategoryId } from '@/types';
import { CATS } from './constants';

/**
 * One-line value of an item, expressed in VND.
 * Disabled items and FOC items contribute zero.
 * Source: public/legacy.html:1686-1692.
 */
/**
 * Effective quantity of an item at a given pax.
 * Room modes are derived from pax so they scale with group size:
 *   single_room = 1 room / guest = pax;  double_room = ⌈pax/2⌉ (½ pax, .5 → up).
 * per_pax = pax, per_group = 1, package/custom = the entered customQty.
 */
export function qtyOf(item: Item, pax: number): number {
  switch (item.qtyMode) {
    case 'per_pax': return pax;
    case 'per_group': return 1;
    case 'single_room': return pax;
    case 'double_room': return Math.round(pax / 2);
    default: return item.customQty; // 'package' | 'custom'
  }
}

export function calcVND(item: Item, rates: Record<string, number>, pax: number): number {
  // Byte-for-byte parity with legacy.html:1687-1688: `enabled === false`, not `!enabled`.
  // Matters for JSON imports where `enabled` may be undefined — legacy treats missing as
  // enabled, so we match that semantics rather than the stricter TS-types interpretation.
  if (item.enabled === false || item.foc === true) return 0;
  const r = rates[item.cur] ?? 1;
  return item.price * r * item.times * qtyOf(item, pax);
}

/**
 * Sum of a category's enabled+non-FOC items, in VND.
 * Optional items are add-ons and do NOT count toward the total.
 */
export function catTotal(items: Item[], rates: Record<string, number>, pax: number): number {
  return items.reduce((s, it) => s + (it.optional ? 0 : calcVND(it, rates, pax)), 0);
}

/**
 * Sum across all enabled categories, in VND. Equivalent to legacy `totalCost`.
 * Source: public/legacy.html:8448-8450.
 */
export function subtotal(draft: QuoteDraft): number {
  return CATS.reduce((s, cat) => {
    const cid = cat.id as CategoryId;
    if (!draft.catEnabled[cid]) return s;
    const items = draft.items[cid] ?? [];
    return s + catTotal(items, draft.rates, draft.pax);
  }, 0);
}

export type Totals = {
  totalCost: number;
  totalProfit: number;
  totalVAT: number;
  sellingPPax: number;
  roundedPPax: number;
  grandTotal: number;
};

/**
 * Full totals chain for a quote draft.
 * Source: public/legacy.html:8494-8498. Preserves legacy's behavior of:
 *   - applying svcBasis BEFORE margin
 *   - Math.round on margin and VAT amounts (integer VND)
 *   - Math.ceil rounding on the PER-PAX selling price (NOT the grand total)
 *   - grandTotal derived as roundedPPax × pax for display
 */
export function computeTotals(draft: QuoteDraft): Totals {
  const totalCost = subtotal(draft);
  const totalProfit = Math.round((totalCost + draft.svcBasis) * draft.margin / 100);
  const totalVAT = Math.round((totalCost + draft.svcBasis + totalProfit) * draft.vat / 100);
  const sellingPPax = draft.pax > 0
    ? (totalCost + draft.svcBasis + totalProfit + totalVAT) / draft.pax
    : 0;
  const step = draft.rounding || 1;
  const roundedPPax = Math.ceil(sellingPPax / step) * step;
  const grandTotal = roundedPPax * draft.pax;
  return { totalCost, totalProfit, totalVAT, sellingPPax, roundedPPax, grandTotal };
}

/**
 * VND formatter. Source: public/legacy.html:1693.
 */
export const fmtVND = (n: number): string =>
  Math.round(n).toLocaleString('vi-VN') + ' ₫';

/**
 * Non-VND currency formatter using Intl. Falls back to fmtVND for 'VND'.
 * Source: public/legacy.html:3698 (legacy uses a different implementation but same intent).
 */
export const fmtCurrency = (n: number, code: string): string => {
  if (code === 'VND') return fmtVND(n);
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 2,
  });
};
