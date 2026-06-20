import { describe, it, expect } from 'vitest';
import { lineAmount, lineActual, advanceTotals } from './advanceCalc';
import type { AdvanceLine, TourAdvance } from '@/types';

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
});
