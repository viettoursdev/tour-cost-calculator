import type { AdvanceLine, AdvancePayMethod, AdvanceSettlePay, TourAdvance } from '@/types';

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

// ── Quyết toán CP tạm ứng (đa ngoại tệ / đa phương thức thanh toán) ──

export const PAY_METHODS: { key: AdvancePayMethod; label: string; icon: string }[] = [
  { key: 'cash', label: 'Tiền mặt', icon: '💵' },
  { key: 'company_card', label: 'Thẻ công ty', icon: '🏢' },
  { key: 'personal_card', label: 'Thẻ cá nhân', icon: '💳' },
  { key: 'other_card', label: 'Thẻ khác', icon: '🪪' },
  { key: 'transfer', label: 'Chuyển khoản', icon: '🏦' },
  { key: 'other', label: 'Khác', icon: '➕' },
];

export const payMethodMeta = (m: AdvancePayMethod): { label: string; icon: string } =>
  PAY_METHODS.find((p) => p.key === m) ?? { label: m, icon: '➕' };

/** Số tiền quy đổi VND của 1 khoản chi quyết toán. */
export const settlePayVND = (e: AdvanceSettlePay, rates: Rates = {}): number =>
  Math.max(0, (e.amount || 0) * rateOf(e.cur, rates));

export interface SettleSummary {
  /** Tổng đã chi (quyết toán) quy VND. */
  totalSettled: number;
  /** Số tiền tạm ứng (advanceRequested) — nợ công ty đã nhận. */
  advanced: number;
  /** advanced − totalSettled. Dương = dư, hoàn lại công ty; âm = thiếu, trả công nợ. */
  balance: number;
  /** Tổng quy VND theo từng phương thức thanh toán. */
  byMethod: { method: AdvancePayMethod; vnd: number }[];
  /** Tổng theo từng loại ngoại tệ (số gốc + quy VND). */
  byCurrency: { cur: string; raw: number; vnd: number }[];
}

export function settleSummary(adv: TourAdvance | undefined, rates: Rates = {}): SettleSummary {
  const entries = adv?.settlements ?? [];
  const advanced = adv?.advanceRequested ?? 0;
  const totalSettled = entries.reduce((s, e) => s + settlePayVND(e, rates), 0);

  const methodMap = new Map<AdvancePayMethod, number>();
  const curMap = new Map<string, { raw: number; vnd: number }>();
  for (const e of entries) {
    const vnd = settlePayVND(e, rates);
    methodMap.set(e.method, (methodMap.get(e.method) ?? 0) + vnd);
    const cur = e.cur && e.cur !== 'VND' ? e.cur : 'VND';
    const prev = curMap.get(cur) ?? { raw: 0, vnd: 0 };
    curMap.set(cur, { raw: prev.raw + Math.max(0, e.amount || 0), vnd: prev.vnd + vnd });
  }

  return {
    totalSettled,
    advanced,
    balance: advanced - totalSettled,
    byMethod: PAY_METHODS.filter((p) => methodMap.has(p.key)).map((p) => ({ method: p.key, vnd: methodMap.get(p.key)! })),
    byCurrency: [...curMap.entries()].map(([cur, v]) => ({ cur, ...v })),
  };
}

export function newSettlePay(over: Partial<AdvanceSettlePay> = {}): AdvanceSettlePay {
  return { id: 'sp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: '', method: 'cash', amount: 0, ...over };
}
