import { describe, it, expect } from 'vitest';
import type { CloudQuoteEntry } from '@/types';
import { scoreDeal, isOpenDeal, winRate, groupWinRate } from './winScore';

const NOW = Date.parse('2026-06-01T00:00:00Z');
const q = (over: Partial<CloudQuoteEntry>): CloudQuoteEntry => ({
  id: 1, cloudId: 'c1', name: 'q', template: 'intl', pax: 10, totalCost: 0,
  createdAt: '2026-01-01', updatedAt: '2026-05-28', createdByName: 'x', ...over,
} as CloudQuoteEntry);

describe('isOpenDeal', () => {
  it('chỉ deal chưa chốt là mở', () => {
    expect(isOpenDeal(q({ status: 'negotiating' }))).toBe(true);
    expect(isOpenDeal(q({ status: undefined }))).toBe(true);
    expect(isOpenDeal(q({ status: 'won' }))).toBe(false);
    expect(isOpenDeal(q({ status: 'not_selected' }))).toBe(false);
  });
});

describe('scoreDeal', () => {
  it('đàm phán + hợp đồng + khách thắng cao → điểm cao', () => {
    const r = scoreDeal(q({ status: 'negotiating', updatedAt: '2026-05-28' }), { hasContract: true, customerWinRate: 1, now: NOW });
    // 40 +22 +25 +15 +5(vừa cập nhật) = 107 → clamp 100
    expect(r.score).toBe(100);
    expect(r.band).toBe('cao');
    expect(r.factors.some((f) => f.label.includes('hợp đồng'))).toBe(true);
  });

  it('tồn đọng lâu + khách hay thua → điểm thấp', () => {
    const r = scoreDeal(q({ status: 'in_progress', updatedAt: '2026-03-01' }), { customerWinRate: 0, now: NOW });
    // 40 +0 -15(>45 ngày) -15(khách 0%) = 10
    expect(r.score).toBe(10);
    expect(r.band).toBe('thấp');
  });

  it('điểm luôn trong [0,100]', () => {
    const r = scoreDeal(q({ status: 'in_progress' }), { customerWinRate: 0, sourceWinRate: 0, now: NOW, updatedAt: '2026-01-01' } as never);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('cận khởi hành cộng điểm', () => {
    const near = scoreDeal(q({ status: 'sent', departDate: '2026-06-20', updatedAt: '2026-05-28' }), { now: NOW });
    expect(near.factors.some((f) => f.label.includes('Cận khởi hành'))).toBe(true);
  });
});

describe('winRate / groupWinRate', () => {
  it('winRate = won/(won+thua)', () => {
    expect(winRate([q({ status: 'won' }), q({ status: 'won' }), q({ status: 'not_selected' })])).toBeCloseTo(2 / 3);
    expect(winRate([q({ status: 'in_progress' })])).toBeUndefined();
  });
  it('groupWinRate gom theo khoá', () => {
    const hist = [
      q({ customerId: 'A', status: 'won' }),
      q({ customerId: 'A', status: 'not_selected' }),
      q({ customerId: 'B', status: 'won' }),
    ];
    const m = groupWinRate(hist, (e) => e.customerId);
    expect(m.get('A')).toBeCloseTo(0.5);
    expect(m.get('B')).toBe(1);
  });
});
