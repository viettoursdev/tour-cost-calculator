import type { CloudQuoteEntry } from '@/types';

/**
 * Chỉ số nhanh (KPI) cho dải đầu trang "Hôm nay". Thuần (không phụ thuộc Date) để
 * test dễ — các số liên quan ngày (tour 7 ngày, công nợ) tính sẵn ở HomeView rồi
 * truyền vào dải KPI.
 */
export interface HomeStats {
  /** Báo giá đang mở (đang triển khai / đã gửi / đang deal). */
  open: number;
  won: number;
  /** Thua = không được chọn + huỷ. */
  lost: number;
  /** Tỷ lệ thắng = won / (won + lost), %, 0 nếu chưa có deal chốt. */
  winRatePct: number;
  /** Tổng biên lợi THỰC (từ quyết toán) các báo giá đã có settlement. */
  settledProfit: number;
}

const OPEN_STATUSES = new Set(['in_progress', 'sent', 'negotiating']);

export function computeHomeStats(list: CloudQuoteEntry[]): HomeStats {
  let open = 0, won = 0, lost = 0, settledProfit = 0;
  for (const q of list) {
    const s = q.status;
    if (s === 'won') won++;
    else if (s === 'not_selected' || s === 'cancelled') lost++;
    else if (s == null || OPEN_STATUSES.has(s)) open++;
    if (q.settlementSummary) settledProfit += q.settlementSummary.actualProfit ?? 0;
  }
  const decided = won + lost;
  const winRatePct = decided === 0 ? 0 : Math.round((won / decided) * 100);
  return { open, won, lost, winRatePct, settledProfit };
}

export interface MonthProgress {
  /** Số báo giá chốt (won) trong tháng. */
  wonCount: number;
  /** Doanh thu chốt trong tháng (tổng giá báo giá won). */
  revenue: number;
}

/** Tiến độ tháng `ym` ('yyyy-mm') theo `updatedAt` của báo giá đã chốt. */
export function computeMonthProgress(list: CloudQuoteEntry[], ym: string): MonthProgress {
  let wonCount = 0, revenue = 0;
  for (const q of list) {
    if (q.status === 'won' && (q.updatedAt ?? '').slice(0, 7) === ym) {
      wonCount++;
      revenue += q.totalCost ?? 0;
    }
  }
  return { wonCount, revenue };
}

/** % đạt mục tiêu (0–100, làm tròn); target ≤ 0 → 0. */
export function pctOf(value: number, target: number): number {
  return target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
}
