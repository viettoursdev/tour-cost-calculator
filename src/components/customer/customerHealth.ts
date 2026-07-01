/**
 * Điểm sức khoẻ & phân hạng khách hàng (RFM rút gọn) — thuần, dễ test.
 * Bốn yếu tố: Giá trị (Monetary) · Tần suất (Frequency) · Gần đây (Recency) · Gắn kết
 * (số lần chăm sóc). Điểm 0–100 + hạng để Sales ưu tiên chăm sóc.
 */
import type { Customer } from '@/types';

/** Bản ghi báo giá tối thiểu cần cho tính điểm (khớp CloudQuoteEntry). */
export interface HealthQuote {
  customerId?: string;
  customerName?: string;
  totalCost?: number;
  status?: string;
  departDate?: string | null;
  updatedAt?: string;
  paymentSummary?: { remaining?: number } | null;
}

export interface CustomerStats {
  totalValueVND: number;
  tourCount: number;
  wonCount: number;
  openOwingVND: number;
  interactionCount: number;
  lastActivityISO?: string;
}

export type HealthTier = 'vip' | 'loyal' | 'potential' | 'new' | 'dormant';

export interface HealthResult {
  score: number;
  tier: HealthTier;
  label: string;
  color: string;
  factors: { label: string; detail: string }[];
}

export const TIER_META: Record<HealthTier, { label: string; color: string }> = {
  vip:       { label: 'VIP',       color: '#b8860b' },
  loyal:     { label: 'Thân thiết', color: '#0d7a6a' },
  potential: { label: 'Tiềm năng',  color: '#2563eb' },
  new:       { label: 'Mới',        color: '#64748b' },
  dormant:   { label: 'Ngủ đông',   color: '#94a3b8' },
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Tổng hợp số liệu 1 khách từ danh sách báo giá (thường + DMC) + timeline chăm sóc. */
export function statsForCustomer(customer: Customer, quotes: HealthQuote[]): CustomerStats {
  const mine = quotes.filter((q) => (q.customerId ? q.customerId === customer.id : q.customerName === customer.name));
  const dates: string[] = [];
  for (const i of customer.interactions ?? []) if (i.at) dates.push(i.at);
  for (const q of mine) { const d = q.departDate || q.updatedAt; if (d) dates.push(d); }
  return {
    totalValueVND: mine.reduce((s, q) => s + (q.totalCost ?? 0), 0),
    tourCount: mine.length,
    wonCount: mine.filter((q) => q.status === 'won').length,
    openOwingVND: mine.reduce((s, q) => s + (q.paymentSummary?.remaining ?? 0), 0),
    interactionCount: (customer.interactions ?? []).length,
    lastActivityISO: dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : undefined,
  };
}

const monthsBetween = (fromISO: string, nowISO: string): number => {
  const a = new Date(fromISO).getTime();
  const b = new Date(nowISO).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return Infinity;
  return (b - a) / (1000 * 60 * 60 * 24 * 30.44);
};

/** Tính điểm sức khoẻ + hạng. `nowISO` truyền vào để test tất định. */
export function computeCustomerHealth(stats: CustomerStats, nowISO: string): HealthResult {
  const valuePts = clamp((stats.totalValueVND / 500_000_000) * 35, 0, 35);
  const freqPts = clamp(stats.wonCount * 8 + (stats.tourCount - stats.wonCount) * 3, 0, 25);
  const months = stats.lastActivityISO ? monthsBetween(stats.lastActivityISO, nowISO) : Infinity;
  const recencyPts = !stats.lastActivityISO ? 0 : months <= 3 ? 25 : months <= 6 ? 18 : months <= 12 ? 10 : 3;
  const engagePts = clamp(stats.interactionCount * 3, 0, 15);
  const score = Math.round(valuePts + freqPts + recencyPts + engagePts);

  let tier: HealthTier;
  if (stats.lastActivityISO && months > 12) tier = 'dormant';
  else if (score >= 75) tier = 'vip';
  else if (score >= 50) tier = 'loyal';
  else if (score >= 25) tier = 'potential';
  else tier = 'new';

  const meta = TIER_META[tier];
  const monthTxt = stats.lastActivityISO ? (months < 1 ? 'trong tháng' : `${Math.round(months)} tháng trước`) : 'chưa có';
  return {
    score, tier, label: meta.label, color: meta.color,
    factors: [
      { label: 'Giá trị', detail: `${Math.round(stats.totalValueVND / 1_000_000).toLocaleString('vi-VN')} tr · ${Math.round(valuePts)}đ` },
      { label: 'Tần suất', detail: `${stats.tourCount} tour (${stats.wonCount} chốt) · ${Math.round(freqPts)}đ` },
      { label: 'Gần đây', detail: `${monthTxt} · ${recencyPts}đ` },
      { label: 'Chăm sóc', detail: `${stats.interactionCount} lần · ${Math.round(engagePts)}đ` },
    ],
  };
}
