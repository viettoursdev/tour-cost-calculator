import type { CloudQuoteEntry } from '@/types';

/**
 * #1 — Cầu nối biên 3 mốc giá trị của một hồ sơ tour: hiện tại → hợp đồng →
 * nghiệm thu. Thuần (pure) để test được; UI chỉ vẽ kết quả.
 *
 * Mỗi mốc gồm doanh thu (giá bán, từ `CloudQuoteEntry.totalCost`) và lợi nhuận
 * (`CloudQuoteEntry.profit`, bổ sung ở migration 0068). Mốc nghiệm thu ưu tiên
 * số THỰC từ `settlementSummary` (actualCost/actualProfit/actualMarginPct).
 */

export type MilestoneInput = { revenue?: number; profit?: number; marginPct?: number };
export type Milestone = { revenue?: number; profit?: number; marginPct?: number };

export type ValueBridge = {
  current: Milestone;
  contract: Milestone;
  settlement: Milestone;
  /** Chênh lệch doanh thu hợp đồng so với báo giá hiện tại. */
  dRevContract?: number;
  /** Chênh lệch doanh thu nghiệm thu so với mốc trước đó (hợp đồng, fallback hiện tại). */
  dRevSettlement?: number;
  /** Xói mòn biên = biên nghiệm thu − biên mốc trước (âm = xói mòn). */
  marginErosionPct?: number;
  /** true khi biên nghiệm thu thấp hơn mốc trước quá ngưỡng. */
  eroded: boolean;
};

/** Ngưỡng coi là "xói mòn" (điểm %). Dưới mức này coi như sai số làm tròn. */
export const EROSION_EPS = 0.5;

/** Biên % của một mốc — dùng marginPct sẵn có, nếu không thì suy từ profit/revenue. */
export function milestoneMargin(m: MilestoneInput): number | undefined {
  if (typeof m.marginPct === 'number') return m.marginPct;
  if (typeof m.revenue === 'number' && m.revenue > 0 && typeof m.profit === 'number') {
    return (m.profit / m.revenue) * 100;
  }
  return undefined;
}

function toMilestone(m: MilestoneInput): Milestone {
  return { revenue: m.revenue, profit: m.profit, marginPct: milestoneMargin(m) };
}

export function computeValueBridge(ms: {
  current: MilestoneInput; contract: MilestoneInput; settlement: MilestoneInput;
}): ValueBridge {
  const current = toMilestone(ms.current);
  const contract = toMilestone(ms.contract);
  const settlement = toMilestone(ms.settlement);

  const dRevContract =
    typeof contract.revenue === 'number' && typeof current.revenue === 'number'
      ? contract.revenue - current.revenue : undefined;

  // Mốc liền trước nghiệm thu: ưu tiên hợp đồng, fallback hiện tại.
  const prevRev = contract.revenue ?? current.revenue;
  const dRevSettlement =
    typeof settlement.revenue === 'number' && typeof prevRev === 'number'
      ? settlement.revenue - prevRev : undefined;

  const prevMargin = contract.marginPct ?? current.marginPct;
  const marginErosionPct =
    typeof settlement.marginPct === 'number' && typeof prevMargin === 'number'
      ? settlement.marginPct - prevMargin : undefined;

  const eroded = typeof marginErosionPct === 'number' && marginErosionPct < -EROSION_EPS;

  return { current, contract, settlement, dRevContract, dRevSettlement, marginErosionPct, eroded };
}

/** true nếu hồ sơ có đủ dữ liệu để vẽ cầu nối (ít nhất 2 mốc có doanh thu). */
export function hasBridgeData(b: ValueBridge): boolean {
  const n = [b.current.revenue, b.contract.revenue, b.settlement.revenue]
    .filter((x) => typeof x === 'number').length;
  return n >= 2;
}

/**
 * Suy 3 mốc từ danh sách báo giá của hồ sơ. Ưu tiên báo giá người dùng GẮN vai
 * trò (`valueRole`); fallback báo giá hiện đang mở (currentId) cho mốc hiện tại
 * và `contractFallbackRevenue` (vd giá ký từ hợp đồng) cho mốc hợp đồng.
 */
export function resolveMilestones(
  quotes: CloudQuoteEntry[],
  opts: {
    currentId?: string;
    settlementSummary?: CloudQuoteEntry['settlementSummary'];
    contractFallbackRevenue?: number;
  } = {},
): { current: MilestoneInput; contract: MilestoneInput; settlement: MilestoneInput } {
  const byRole = (role: NonNullable<CloudQuoteEntry['valueRole']>) =>
    quotes.find((q) => q.valueRole === role);

  const cur = byRole('current') ?? quotes.find((q) => q.cloudId === opts.currentId);
  const ctr = byRole('contract');
  const stl = byRole('settlement');
  const ss = opts.settlementSummary;

  return {
    current: { revenue: cur?.totalCost, profit: cur?.profit },
    contract: ctr
      ? { revenue: ctr.totalCost, profit: ctr.profit }
      : { revenue: opts.contractFallbackRevenue },
    settlement: ss
      ? { revenue: ss.actualCost + ss.actualProfit, profit: ss.actualProfit, marginPct: ss.actualMarginPct }
      : { revenue: stl?.totalCost, profit: stl?.profit },
  };
}
