import { describe, it, expect } from 'vitest';
import { computeHomeStats, computeMonthProgress, pctOf } from './homeStats';
import type { CloudQuoteEntry } from '@/types';

const q = (status: string | undefined, profit?: number): CloudQuoteEntry => ({
  status, settlementSummary: profit == null ? undefined : { actualProfit: profit },
} as unknown as CloudQuoteEntry);

const wonAt = (ym: string, total: number): CloudQuoteEntry =>
  ({ status: 'won', updatedAt: `${ym}-15T10:00:00Z`, totalCost: total } as unknown as CloudQuoteEntry);

describe('computeHomeStats', () => {
  it('đếm mở/thắng/thua + tỷ lệ thắng + biên lợi thực', () => {
    const list = [
      q('in_progress'), q('sent'), q('negotiating'), q(undefined),  // 4 mở
      q('won', 1000), q('won', 500),                                 // 2 thắng, profit 1500
      q('not_selected'), q('cancelled'),                             // 2 thua
    ];
    const s = computeHomeStats(list);
    expect(s.open).toBe(4);
    expect(s.won).toBe(2);
    expect(s.lost).toBe(2);
    expect(s.winRatePct).toBe(50);
    expect(s.settledProfit).toBe(1500);
  });

  it('chưa có deal chốt → tỷ lệ thắng 0', () => {
    expect(computeHomeStats([q('in_progress')]).winRatePct).toBe(0);
  });

  it('làm tròn tỷ lệ thắng', () => {
    // 2 thắng / 3 chốt = 66.67% → 67
    expect(computeHomeStats([q('won'), q('won'), q('not_selected')]).winRatePct).toBe(67);
  });

  it('danh sách rỗng', () => {
    expect(computeHomeStats([])).toEqual({ open: 0, won: 0, lost: 0, winRatePct: 0, settledProfit: 0 });
  });
});

describe('computeMonthProgress', () => {
  it('đếm won + cộng doanh thu đúng tháng', () => {
    const list = [wonAt('2026-06', 1000), wonAt('2026-06', 2000), wonAt('2026-05', 9999), q('won') /* no updatedAt */];
    expect(computeMonthProgress(list, '2026-06')).toEqual({ wonCount: 2, revenue: 3000 });
  });
  it('không có gì trong tháng → 0', () => {
    expect(computeMonthProgress([wonAt('2026-05', 100)], '2026-06')).toEqual({ wonCount: 0, revenue: 0 });
  });
});

describe('pctOf', () => {
  it('tính % đạt, kẹp 100, target ≤ 0 → 0', () => {
    expect(pctOf(3, 6)).toBe(50);
    expect(pctOf(8, 6)).toBe(100);
    expect(pctOf(5, 0)).toBe(0);
  });
});
