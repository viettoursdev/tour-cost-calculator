import type { Ncc } from '@/types';
import { normalizeVN } from '@/lib/search';

/**
 * #B — Chấm điểm tổng hợp nhà cung cấp (0–100) từ dữ liệu sẵn có: đánh giá sao thủ
 * công + tần suất phục vụ + thâm niên + trạng thái hợp tác + độ mới của đánh giá.
 * Thuần (pure) để test. `suggestNcc` xếp hạng NCC phù hợp một nhu cầu dịch vụ.
 */

export type NccBand = 'tốt' | 'khá' | 'trung bình' | 'yếu';
export type NccScoreFactor = { label: string; impact: number };
export type NccScore = {
  score: number;
  band: NccBand;
  factors: NccScoreFactor[];
  avgStars?: number;
  ratingCount: number;
};

export const NCC_BAND_META: Record<NccBand, { color: string; label: string }> = {
  'tốt': { color: '#27ae60', label: 'Tốt' },
  'khá': { color: '#2563eb', label: 'Khá' },
  'trung bình': { color: '#d97706', label: 'Trung bình' },
  'yếu': { color: '#dc3250', label: 'Yếu' },
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const MONTH_MS = 30 * 86_400_000;

export function nccScore(ncc: Ncc, opts: { now?: number } = {}): NccScore {
  const now = opts.now ?? Date.now();
  const ratings = ncc.ratings ?? [];
  const ratingCount = ratings.length;
  const avgStars = ratingCount ? ratings.reduce((s, r) => s + r.stars, 0) / ratingCount : undefined;

  const factors: NccScoreFactor[] = [];
  let score = 50; // nền
  const add = (label: string, impact: number) => {
    if (impact === 0) return;
    factors.push({ label, impact });
    score += impact;
  };

  // Đánh giá sao (trọng số chính) — nhân độ tin theo số lượt đánh giá (tối đa khi ≥4 lượt).
  if (avgStars !== undefined) {
    const confidence = Math.min(ratingCount, 4) / 4;
    add(`Trung bình ${avgStars.toFixed(1)}★ (${ratingCount} lượt)`, Math.round((avgStars - 3) * 12 * confidence));
  }

  // Tần suất phục vụ — số tour đã phục vụ.
  const tours = ncc.tours?.length ?? 0;
  if (tours > 0) add(`Đã phục vụ ${tours} tour`, Math.round(Math.min(tours, 10) * 1.5));

  // Thâm niên hợp tác.
  const ageMonths = ncc.createdAt ? (now - Date.parse(ncc.createdAt)) / MONTH_MS : 0;
  if (ageMonths >= 6) add('Hợp tác lâu năm', Math.round(Math.min(ageMonths, 24) / 24 * 8));

  // Trạng thái hợp tác.
  if (ncc.status === 'paused') add('Đang tạm dừng', -15);
  else if (ncc.status === 'restricted') add('Hạn chế hợp tác', -30);

  // Độ mới của đánh giá gần nhất.
  if (ratingCount) {
    const last = Math.max(...ratings.map((r) => Date.parse(r.at)).filter((t) => !Number.isNaN(t)));
    if (Number.isFinite(last)) {
      const monthsAgo = (now - last) / MONTH_MS;
      if (monthsAgo <= 6) add('Đánh giá gần đây', 4);
      else if (monthsAgo > 18) add('Lâu chưa được đánh giá', -4);
    }
  }

  score = clamp(Math.round(score), 0, 100);
  const band: NccBand = score >= 70 ? 'tốt' : score >= 55 ? 'khá' : score >= 40 ? 'trung bình' : 'yếu';
  return { score, band, factors, avgStars, ratingCount };
}

export type NccSuggestion = { ncc: Ncc; score: NccScore };

/**
 * Gợi ý NCC cho một nhu cầu: lọc theo lĩnh vực (sector) + địa điểm/quốc gia (tùy chọn),
 * loại NCC hạn chế hợp tác, xếp theo điểm giảm dần. Khớp không dấu, không phân biệt hoa thường.
 */
export function suggestNcc(
  suppliers: Ncc[],
  need: { sector?: string; location?: string; country?: string },
  opts: { now?: number; limit?: number } = {},
): NccSuggestion[] {
  const sector = normalizeVN(need.sector);
  const loc = normalizeVN(need.location);
  const country = normalizeVN(need.country);
  const out = suppliers
    .filter((s) => s.status !== 'restricted')
    .filter((s) => !sector || (s.sectors ?? []).some((x) => normalizeVN(x).includes(sector) || sector.includes(normalizeVN(x))))
    .filter((s) => {
      if (!loc && !country) return true;
      const sLoc = normalizeVN(s.location);
      const sCountry = normalizeVN(s.country);
      const locOk = !loc || sLoc.includes(loc) || loc.includes(sLoc);
      const countryOk = !country || sCountry.includes(country) || country.includes(sCountry);
      return locOk && countryOk;
    })
    .map((ncc) => ({ ncc, score: nccScore(ncc, opts) }))
    .sort((a, b) => b.score.score - a.score.score);
  return opts.limit ? out.slice(0, opts.limit) : out;
}
