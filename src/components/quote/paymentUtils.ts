import type {
  CategoryId, CustomCostItem, Installment, PaymentItem, PaymentRecord, QuoteDraft,
} from '@/types';
import { calcVND } from './calc';
import type { CategoryDef } from './constants';

export function slugifyTourKey(name: string): string {
  return (name || 'tour').replace(/[^a-zA-Z0-9]/g, '_');
}

export function buildSourceItems(
  draft: QuoteDraft,
  activeCats: readonly CategoryDef[],
): PaymentItem[] {
  const list: PaymentItem[] = [];
  activeCats.forEach((cat) => {
    if (!draft.catEnabled[cat.id]) return;
    const items = draft.items[cat.id] ?? [];
    items.forEach((it) => {
      if (it.enabled === false || it.foc === true) return;
      const vnd = calcVND(it, draft.rates, draft.pax);
      if (vnd <= 0) return;
      list.push({
        key: `${cat.id}_${it.id}`,
        catId: cat.id,
        catLabel: cat.label,
        catIcon: cat.icon,
        catColor: cat.color,
        name: it.name,
        sourceAmount: vnd,
        amount: vnd,
        tracked: true,
        custom: false,
        isOverridden: false,
      });
    });
  });
  return list;
}

export function buildAllItems(
  source: PaymentItem[],
  payments: Record<string, PaymentRecord>,
  customItems: CustomCostItem[],
): PaymentItem[] {
  const out: PaymentItem[] = source.map((row) => {
    const rec = payments[row.key];
    const tracked = rec?.tracked !== false;
    const overridden = rec?.customAmount != null && +rec.customAmount !== row.sourceAmount;
    const amount = rec?.customAmount != null ? +rec.customAmount : row.sourceAmount;
    return { ...row, tracked, amount, isOverridden: overridden };
  });
  customItems.forEach((ct) => {
    const rec = payments[ct.key];
    const amount = +ct.amount || 0;
    out.push({
      key: ct.key,
      catId: ct.catId as CategoryId,
      catLabel: ct.catLabel,
      catIcon: ct.catIcon,
      catColor: ct.catColor,
      name: ct.name,
      sourceAmount: amount,
      amount,
      tracked: rec?.tracked !== false,
      custom: true,
      isOverridden: false,
    });
  });
  return out;
}

export interface PaymentTotals {
  totalCost: number;
  totalPaid: number;
  totalScheduled: number;
  totalRemaining: number;
}

export function computePaymentTotals(
  items: PaymentItem[],
  payments: Record<string, PaymentRecord>,
): PaymentTotals {
  const tracked = items.filter((i) => i.tracked);
  const totalCost = tracked.reduce((s, i) => s + i.amount, 0);
  let totalPaid = 0;
  let totalScheduled = 0;
  tracked.forEach((ci) => {
    const insts: Installment[] = payments[ci.key]?.installments ?? [];
    insts.forEach((inst) => {
      const amt = +inst.amount || 0;
      totalScheduled += amt;
      if (inst.status === 'paid') totalPaid += amt;
    });
  });
  return { totalCost, totalPaid, totalScheduled, totalRemaining: totalCost - totalPaid };
}

/** Tóm tắt công nợ phải trả NCC của 1 tour (để index cho Bảng công nợ tổng). */
export interface PaymentSummaryIndex { payable: number; paid: number; remaining: number }
export function computePaymentSummary(
  draft: QuoteDraft,
  activeCats: readonly CategoryDef[],
  payments: Record<string, PaymentRecord>,
  customItems: CustomCostItem[],
): PaymentSummaryIndex {
  const all = buildAllItems(buildSourceItems(draft, activeCats), payments, customItems);
  const t = computePaymentTotals(all, payments);
  return { payable: t.totalCost, paid: t.totalPaid, remaining: t.totalRemaining };
}
