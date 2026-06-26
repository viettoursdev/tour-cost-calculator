import { describe, it, expect } from 'vitest';
import { computeHomeStats } from './homeStats';
import type { CloudQuoteEntry } from '@/types';

const q = (status: string | undefined, profit?: number): CloudQuoteEntry => ({
  status, settlementSummary: profit == null ? undefined : { actualProfit: profit },
} as unknown as CloudQuoteEntry);

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
