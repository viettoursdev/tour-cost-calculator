import type {
  CategoryId, CustomCostItem, Installment, NccDueItem, PaymentItem, PaymentRecord, QuoteDraft,
} from '@/types';
import { calcVND, catTotal, computeTotals } from './calc';
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

/** Các đợt thanh toán NCC CHƯA trả & có hạn (để index → nhắc đến hạn trả NCC). */
export function computeNccDue(
  items: PaymentItem[],
  payments: Record<string, PaymentRecord>,
): NccDueItem[] {
  const out: NccDueItem[] = [];
  for (const ci of items) {
    if (!ci.tracked) continue;
    const rec = payments[ci.key];
    for (const inst of rec?.installments ?? []) {
      if (inst.status === 'paid' || !inst.dueDate) continue;
      out.push({
        supplier: rec?.supplier || undefined,
        label: `${ci.name}${inst.label ? ` · ${inst.label}` : ''}`,
        amount: +inst.amount || 0,
        dueDate: inst.dueDate,
      });
    }
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Một dòng đối chiếu dự toán ↔ thực chi cho một hạng mục. */
export interface CategorySettlement {
  catId: CategoryId | string;
  label: string;
  icon: string;
  color: string;
  /** Giá vốn dự toán (theo báo giá). */
  budget: number;
  /** Chi thực tế đã chốt (số đã chỉnh giá nếu có; gồm chi phí phát sinh tự tạo). */
  actual: number;
  /** Đã thực chi tiền (các đợt đã đánh dấu "Đã TT"). */
  paid: number;
  /** actual − budget (>0 = bội chi, <0 = tiết kiệm). */
  delta: number;
}

/**
 * Quyết toán tour — nối "dự toán giá vốn" (báo giá) với "chi thực tế" (tour_payments)
 * để ra biên lợi nhuận thật của từng tour.
 *
 * - Doanh thu & VAT lấy từ `computeTotals` (cùng nguồn với Dashboard biên lợi).
 * - Dự toán giá vốn theo hạng mục dùng `catTotal` (đồng nhất với tổng `totalCost`).
 * - Chi thực tế lấy từ payment items: số đã chỉnh giá (override) nếu có, cộng các
 *   khoản tự tạo (phát sinh ngoài dự toán → budget 0). Mục chưa theo dõi/chưa chỉnh
 *   mặc định bằng đúng giá vốn dự toán nên không lệch.
 */
export interface SettlementResult {
  byCat: CategorySettlement[];
  /** Tổng giá vốn dự toán (= computeTotals.totalCost). */
  budgetCost: number;
  /** Tổng chi thực tế đã chốt. */
  actualCost: number;
  /** Tổng đã thực chi tiền. */
  paidCost: number;
  /** Doanh thu thuần (giá bán cả đoàn trừ VAT). */
  netRevenue: number;
  grandTotal: number;
  totalVAT: number;
  /** Lãi gộp dự kiến = netRevenue − budgetCost. */
  plannedProfit: number;
  /** Lãi gộp thật = netRevenue − actualCost. */
  actualProfit: number;
  /** Chênh lệch giá vốn = actualCost − budgetCost (>0 = bội chi). */
  costVariance: number;
  plannedMarginPct: number;
  actualMarginPct: number;
  pax: number;
}

export function computeSettlement(
  draft: QuoteDraft,
  activeCats: readonly CategoryDef[],
  payments: Record<string, PaymentRecord>,
  customItems: CustomCostItem[],
): SettlementResult {
  const totals = computeTotals(draft);
  const allItems = buildAllItems(buildSourceItems(draft, activeCats), payments, customItems);

  const paidOf = (key: string): number =>
    (payments[key]?.installments ?? [])
      .filter((i) => i.status === 'paid')
      .reduce((s, i) => s + (+i.amount || 0), 0);

  // Gom thực chi & đã trả theo hạng mục.
  const actualByCat = new Map<string, number>();
  const paidByCat = new Map<string, number>();
  for (const it of allItems) {
    actualByCat.set(it.catId, (actualByCat.get(it.catId) ?? 0) + it.amount);
    paidByCat.set(it.catId, (paidByCat.get(it.catId) ?? 0) + paidOf(it.key));
  }

  const byCat: CategorySettlement[] = [];
  const seen = new Set<string>();
  for (const cat of activeCats) {
    if (!draft.catEnabled[cat.id]) continue;
    const budget = catTotal(draft.items[cat.id] ?? [], draft.rates, draft.pax);
    const actual = actualByCat.get(cat.id) ?? 0;
    const paid = paidByCat.get(cat.id) ?? 0;
    seen.add(cat.id);
    if (budget === 0 && actual === 0 && paid === 0) continue;
    byCat.push({ catId: cat.id, label: cat.label, icon: cat.icon, color: cat.color, budget, actual, paid, delta: actual - budget });
  }
  // Hạng mục chỉ có ở payments (khoản tự tạo gắn catId lạ) — hiện như phát sinh.
  for (const it of allItems) {
    if (seen.has(it.catId)) continue;
    seen.add(it.catId);
    const actual = actualByCat.get(it.catId) ?? 0;
    const paid = paidByCat.get(it.catId) ?? 0;
    if (actual === 0 && paid === 0) continue;
    byCat.push({ catId: it.catId, label: it.catLabel, icon: it.catIcon, color: it.catColor, budget: 0, actual, paid, delta: actual });
  }

  const budgetCost = totals.totalCost;
  const actualCost = byCat.reduce((s, c) => s + c.actual, 0);
  const paidCost = byCat.reduce((s, c) => s + c.paid, 0);
  const netRevenue = totals.grandTotal - totals.totalVAT;
  const plannedProfit = netRevenue - budgetCost;
  const actualProfit = netRevenue - actualCost;

  return {
    byCat,
    budgetCost,
    actualCost,
    paidCost,
    netRevenue,
    grandTotal: totals.grandTotal,
    totalVAT: totals.totalVAT,
    plannedProfit,
    actualProfit,
    costVariance: actualCost - budgetCost,
    plannedMarginPct: netRevenue > 0 ? (plannedProfit / netRevenue) * 100 : 0,
    actualMarginPct: netRevenue > 0 ? (actualProfit / netRevenue) * 100 : 0,
    pax: draft.pax,
  };
}
