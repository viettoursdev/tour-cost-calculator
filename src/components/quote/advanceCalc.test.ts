import { describe, it, expect } from 'vitest';
import { lineAmount, lineActual, advanceTotals, settlePayVND, settleSummary } from './advanceCalc';
import type { AdvanceLine, AdvanceSettlePay, TourAdvance } from '@/types';

const L = (over: Partial<AdvanceLine>): AdvanceLine => ({ id: 'x', name: 'a', qty: 1, price: 0, ...over });

describe('lineAmount / lineActual', () => {
  it('dự toán = qty × price', () => {
    expect(lineAmount(L({ qty: 3, price: 200_000 }))).toBe(600_000);
    expect(lineAmount(L({ qty: -1, price: 100 }))).toBe(0);
  });
  it('quyết toán dùng actual nếu có, không thì dự toán', () => {
    expect(lineActual(L({ qty: 2, price: 100, actual: 150 }))).toBe(150);
    expect(lineActual(L({ qty: 2, price: 100 }))).toBe(200);
    expect(lineActual(L({ qty: 2, price: 100, actual: 0 }))).toBe(0);
  });
});

describe('rateOf (đa ngoại tệ) — qua lineAmount/settlePayVND', () => {
  it('ngoại tệ có tỷ giá > 0 → quy đổi đúng', () => {
    expect(lineAmount(L({ qty: 2, price: 100, cur: 'USD' }), { USD: 25_000 })).toBe(5_000_000);
  });
  it('tỷ giá = 0 hoặc thiếu → ×1 (KHÔNG biến dòng thành 0 → tránh thổi phồng lợi nhuận)', () => {
    expect(lineAmount(L({ qty: 2, price: 100, cur: 'USD' }), { USD: 0 })).toBe(200);   // không phải 0
    expect(lineAmount(L({ qty: 2, price: 100, cur: 'USD' }), {})).toBe(200);            // thiếu rate → ×1
  });
  it('settlePayVND theo cùng quy tắc rate-0', () => {
    expect(settlePayVND({ id: 'e', method: 'cash', amount: 100, cur: 'EUR' } as AdvanceSettlePay, { EUR: 28_000 })).toBe(2_800_000);
    expect(settlePayVND({ id: 'e', method: 'cash', amount: 100, cur: 'EUR' } as AdvanceSettlePay, { EUR: 0 })).toBe(100);
  });
});

describe('advanceTotals', () => {
  it('tổng dự toán, quyết toán, số dư', () => {
    const adv: TourAdvance = {
      status: 'tam_ung',
      tourCosts: [L({ qty: 2, price: 500_000 }), L({ qty: 1, price: 1_000_000, actual: 900_000 })],
      otherCosts: [L({ qty: 1, price: 300_000 })],
      advanceRequested: 2_500_000,
    };
    const t = advanceTotals(adv);
    expect(t.tourTotal).toBe(2_000_000);
    expect(t.otherTotal).toBe(300_000);
    expect(t.grandTotal).toBe(2_300_000);
    expect(t.actualTotal).toBe(1_000_000 + 900_000 + 300_000); // 2,200,000
    expect(t.balance).toBe(2_500_000 - 2_200_000); // hoàn lại 300,000
  });
  it('undefined → 0', () => {
    expect(advanceTotals(undefined).grandTotal).toBe(0);
  });
  it('quy đổi ngoại tệ theo rates', () => {
    expect(lineAmount(L({ qty: 2, price: 100, cur: 'USD' }), { USD: 25_000 })).toBe(5_000_000);
    expect(lineAmount(L({ qty: 1, price: 500_000, cur: 'VND' }), { USD: 25_000 })).toBe(500_000);
    const adv: TourAdvance = {
      status: 'draft', advanceRequested: 0,
      tourCosts: [L({ qty: 1, price: 100, cur: 'USD' })],
      otherCosts: [L({ qty: 1, price: 200_000 })],
    };
    expect(advanceTotals(adv, { USD: 25_000 }).grandTotal).toBe(2_500_000 + 200_000);
  });
});

const SP = (over: Partial<AdvanceSettlePay>): AdvanceSettlePay =>
  ({ id: 's', name: '', method: 'cash', amount: 0, ...over });

describe('settlePayVND', () => {
  it('quy đổi theo ngoại tệ, sàn 0', () => {
    expect(settlePayVND(SP({ amount: 100, cur: 'USD' }), { USD: 25_000 })).toBe(2_500_000);
    expect(settlePayVND(SP({ amount: 500_000 }))).toBe(500_000);
    expect(settlePayVND(SP({ amount: -5 }))).toBe(0);
  });
});

describe('settleSummary', () => {
  const rates = { USD: 25_000 };
  const adv: TourAdvance = {
    status: 'tam_ung', tourCosts: [], otherCosts: [], advanceRequested: 10_000_000,
    settlements: [
      SP({ amount: 3_000_000, method: 'cash' }),
      SP({ amount: 100, cur: 'USD', method: 'company_card' }),     // 2,500,000
      SP({ amount: 1_500_000, method: 'cash' }),
    ],
  };

  it('tổng đã chi + số dư (dư → hoàn lại)', () => {
    const s = settleSummary(adv, rates);
    expect(s.totalSettled).toBe(3_000_000 + 2_500_000 + 1_500_000); // 7,000,000
    expect(s.advanced).toBe(10_000_000);
    expect(s.balance).toBe(3_000_000); // dư, hoàn lại công ty
  });

  it('gộp theo phương thức (giữ thứ tự PAY_METHODS)', () => {
    const s = settleSummary(adv, rates);
    expect(s.byMethod).toEqual([
      { method: 'cash', vnd: 4_500_000 },
      { method: 'company_card', vnd: 2_500_000 },
    ]);
  });

  it('gộp theo ngoại tệ (số gốc + quy VND)', () => {
    const s = settleSummary(adv, rates);
    expect(s.byCurrency).toContainEqual({ cur: 'VND', raw: 4_500_000, vnd: 4_500_000 });
    expect(s.byCurrency).toContainEqual({ cur: 'USD', raw: 100, vnd: 2_500_000 });
  });

  it('chi vượt → balance âm (thiếu, trả công nợ)', () => {
    const over: TourAdvance = { ...adv, advanceRequested: 5_000_000 };
    expect(settleSummary(over, rates).balance).toBe(-2_000_000);
  });

  it('undefined / rỗng → 0', () => {
    expect(settleSummary(undefined).totalSettled).toBe(0);
    expect(settleSummary(undefined).balance).toBe(0);
  });
});
