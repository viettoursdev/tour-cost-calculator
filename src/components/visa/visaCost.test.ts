import { describe, it, expect } from 'vitest';
import { actualMargin, estimateVisaCost } from './visaCost';
import type { VisaProduct } from '@/types';

const rates = { VND: 1, USD: 25000 };
const prod = (over: Partial<VisaProduct> = {}): VisaProduct => ({
  id: 'v', country: 'Hàn Quốc', visaType: 'Du lịch', validity: '1 lần', location: 'HCM',
  fees: [
    { id: 'f1', name: 'Lãnh sự', amount: 50, cur: 'USD', perPax: true },
    { id: 'f2', name: 'Dịch thuật', amount: 200000, cur: 'VND', perPax: true },
    { id: 'f3', name: 'Chuyển phát', amount: 300000, cur: 'VND', perPax: false },
  ],
  markupType: 'fixed', markupValue: 20, markupCur: 'USD', note: '', active: true, ...over,
});

describe('estimateVisaCost', () => {
  it('markup cố định: vốn/khách + bán/khách + tổng đoàn', () => {
    const e = estimateVisaCost(prod(), 10, rates);
    expect(e.basePerPax).toBe(50 * 25000 + 200000);          // 1,450,000
    expect(e.perGroup).toBe(300000);
    expect(e.sellPerPax).toBe(1450000 + 20 * 25000);         // +500,000 = 1,950,000
    expect(e.totalCost).toBe(1450000 * 10 + 300000);         // 14,800,000
    expect(e.totalSell).toBe(1950000 * 10 + 300000);         // 19,800,000
    expect(e.expectedProfit).toBe(e.totalSell - e.totalCost); // 5,000,000
  });

  it('markup phần trăm áp trên đơn giá perPax', () => {
    const e = estimateVisaCost(prod({ markupType: 'percent', markupValue: 10 }), 5, rates);
    expect(e.sellPerPax).toBeCloseTo(1450000 * 1.1, 0);
  });

  it('actualMargin = bán − thực chi', () => {
    expect(actualMargin(19800000, 16000000)).toBe(3800000);
    expect(actualMargin(10000000, 12000000)).toBe(-2000000);
  });
});
