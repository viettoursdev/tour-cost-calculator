import { describe, it, expect } from 'vitest';
import type { CloudQuoteEntry } from '@/types';
import { marginPctOf, percentile, isComparable, suggestPricing } from './pricingAssist';

const q = (over: Partial<CloudQuoteEntry>): CloudQuoteEntry => ({
  id: 1, cloudId: 'c', name: 'q', template: 'intl', pax: 10, totalCost: 1000, profit: 200,
  createdAt: '2026-01-01', updatedAt: '2026-01-01', createdByName: 'x', ...over,
} as CloudQuoteEntry);

describe('marginPctOf', () => {
  it('profit/revenue×100', () => {
    expect(marginPctOf(q({ totalCost: 1000, profit: 150 }))).toBe(15);
  });
  it('undefined nếu thiếu profit hoặc revenue 0', () => {
    expect(marginPctOf(q({ profit: undefined }))).toBeUndefined();
    expect(marginPctOf(q({ totalCost: 0, profit: 100 }))).toBeUndefined();
  });
});

describe('percentile', () => {
  it('nội suy tuyến tính', () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(percentile([10, 20, 30, 40], 0.25)).toBeCloseTo(17.5);
  });
  it('1 phần tử', () => { expect(percentile([12], 0.9)).toBe(12); });
});

describe('isComparable', () => {
  const input = { template: 'intl' as const, dest: 'Nhật Bản', pax: 20 };
  it('khác template → không', () => {
    expect(isComparable(q({ template: 'domestic' }), input, 5)).toBe(false);
  });
  it('khác điểm đến → không', () => {
    expect(isComparable(q({ dest: 'Hàn Quốc', pax: 20 }), input, 5)).toBe(false);
  });
  it('pax ngoài dung sai → không', () => {
    expect(isComparable(q({ dest: 'nhật bản', pax: 40 }), input, 5)).toBe(false);
  });
  it('khớp (không phân biệt hoa thường, pax trong dung sai)', () => {
    expect(isComparable(q({ dest: 'NHẬT BẢN', pax: 22 }), input, 5)).toBe(true);
  });
});

describe('suggestPricing', () => {
  const history: CloudQuoteEntry[] = [
    q({ cloudId: 'w1', status: 'won', dest: 'Nhật', pax: 20, totalCost: 1000, profit: 100 }), // 10%
    q({ cloudId: 'w2', status: 'won', dest: 'Nhật', pax: 20, totalCost: 1000, profit: 120 }), // 12%
    q({ cloudId: 'w3', status: 'won', dest: 'Nhật', pax: 20, totalCost: 1000, profit: 140 }), // 14%
    q({ cloudId: 'l1', status: 'not_selected', dest: 'Nhật', pax: 20, totalCost: 1000, profit: 250 }), // 25%
  ];
  const base = { template: 'intl' as const, dest: 'Nhật', pax: 20 };

  it('biên hiện tại trong dải thắng', () => {
    const s = suggestPricing({ ...base, currentMarginPct: 12 }, history);
    expect(s.sampleWon).toBe(3);
    expect(s.verdict).toBe('trong dải dễ thắng');
    expect(s.wonBand![0]).toBeLessThanOrEqual(12);
    expect(s.wonBand![1]).toBeGreaterThanOrEqual(12);
  });

  it('biên cao hơn dải thắng → rủi ro thua', () => {
    const s = suggestPricing({ ...base, currentMarginPct: 24 }, history);
    expect(s.verdict).toBe('cao rủi ro thua');
    expect(s.lostMedian).toBeCloseTo(25);
  });

  it('biên thấp hơn dải thắng → thấp biên', () => {
    expect(suggestPricing({ ...base, currentMarginPct: 5 }, history).verdict).toBe('thấp biên');
  });

  it('không đủ mẫu thắng → chưa đủ mẫu', () => {
    const s = suggestPricing({ ...base, currentMarginPct: 12 }, [history[0]]);
    expect(s.verdict).toBe('chưa đủ mẫu');
  });
});
