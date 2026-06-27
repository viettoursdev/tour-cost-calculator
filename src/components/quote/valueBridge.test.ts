import { describe, it, expect } from 'vitest';
import type { CloudQuoteEntry } from '@/types';
import {
  milestoneMargin, computeValueBridge, resolveMilestones, hasBridgeData,
} from './valueBridge';

const q = (over: Partial<CloudQuoteEntry>): CloudQuoteEntry => ({
  id: 1, cloudId: 'c1', name: 'q', template: 'intl', pax: 10, totalCost: 0,
  createdAt: '2026-01-01', updatedAt: '2026-01-01', createdByName: 'x', ...over,
} as CloudQuoteEntry);

describe('milestoneMargin', () => {
  it('dùng marginPct nếu có sẵn', () => {
    expect(milestoneMargin({ revenue: 100, profit: 5, marginPct: 12 })).toBe(12);
  });
  it('suy từ profit/revenue', () => {
    expect(milestoneMargin({ revenue: 200, profit: 40 })).toBe(20);
  });
  it('trả undefined khi thiếu/zero', () => {
    expect(milestoneMargin({ revenue: 0, profit: 40 })).toBeUndefined();
    expect(milestoneMargin({ profit: 40 })).toBeUndefined();
  });
});

describe('computeValueBridge', () => {
  it('tính chênh lệch doanh thu & xói mòn biên', () => {
    const b = computeValueBridge({
      current: { revenue: 1000, profit: 200 },   // 20%
      contract: { revenue: 1100, profit: 198 },  // 18%
      settlement: { revenue: 1100, profit: 110, marginPct: 10 }, // 10%
    });
    expect(b.dRevContract).toBe(100);
    expect(b.dRevSettlement).toBe(0);
    expect(b.marginErosionPct).toBeCloseTo(-8); // 10 − 18
    expect(b.eroded).toBe(true);
  });

  it('không xói mòn khi biên giữ/tăng', () => {
    const b = computeValueBridge({
      current: { revenue: 1000, profit: 200 },
      contract: { revenue: 1000, profit: 200 },
      settlement: { revenue: 1000, profit: 210, marginPct: 21 },
    });
    expect(b.eroded).toBe(false);
  });

  it('fallback mốc trước = hiện tại khi chưa có hợp đồng', () => {
    const b = computeValueBridge({
      current: { revenue: 1000, profit: 200 }, // 20%
      contract: {},
      settlement: { revenue: 900, profit: 90, marginPct: 10 },
    });
    expect(b.dRevSettlement).toBe(-100); // so với current
    expect(b.marginErosionPct).toBeCloseTo(-10);
    expect(b.eroded).toBe(true);
  });
});

describe('resolveMilestones', () => {
  it('ưu tiên valueRole đã gắn', () => {
    const quotes = [
      q({ cloudId: 'a', valueRole: 'current', totalCost: 1000, profit: 200 }),
      q({ cloudId: 'b', valueRole: 'contract', totalCost: 1100, profit: 198 }),
    ];
    const ms = resolveMilestones(quotes);
    expect(ms.current.revenue).toBe(1000);
    expect(ms.contract.revenue).toBe(1100);
    expect(ms.settlement.revenue).toBeUndefined();
  });

  it('nghiệm thu lấy số thực từ settlementSummary', () => {
    const ss = { budgetCost: 800, actualCost: 850, actualProfit: 150, actualMarginPct: 15, plannedMarginPct: 20 };
    const ms = resolveMilestones([], { settlementSummary: ss });
    expect(ms.settlement.revenue).toBe(1000); // 850 + 150
    expect(ms.settlement.profit).toBe(150);
    expect(ms.settlement.marginPct).toBe(15);
  });

  it('fallback current theo currentId & contract theo contractFallbackRevenue', () => {
    const quotes = [q({ cloudId: 'open', totalCost: 900, profit: 100 })];
    const ms = resolveMilestones(quotes, { currentId: 'open', contractFallbackRevenue: 950 });
    expect(ms.current.revenue).toBe(900);
    expect(ms.contract.revenue).toBe(950);
  });
});

describe('hasBridgeData', () => {
  it('cần ≥2 mốc có doanh thu', () => {
    expect(hasBridgeData(computeValueBridge({ current: { revenue: 1 }, contract: {}, settlement: {} }))).toBe(false);
    expect(hasBridgeData(computeValueBridge({ current: { revenue: 1 }, contract: { revenue: 2 }, settlement: {} }))).toBe(true);
  });
});
