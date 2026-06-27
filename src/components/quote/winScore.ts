import type { CloudQuoteEntry } from '@/types';

/**
 * #3 — Chấm điểm khả năng CHỐT của một báo giá đang mở (0–100), minh bạch theo
 * yếu tố. Thuần (pure) để test; lớp AI (tùy chọn) chỉ DIỄN GIẢI các factor này.
 */

export type WinBand = 'cao' | 'vừa' | 'thấp';
export type WinFactor = { label: string; impact: number };
export type WinScore = { score: number; band: WinBand; factors: WinFactor[] };

/** Màu/nhãn theo dải điểm — dùng cho badge & danh sách ưu tiên. */
export const WIN_BAND_META: Record<WinBand, { color: string; label: string }> = {
  cao: { color: '#27ae60', label: 'Cao' },
  vừa: { color: '#d97706', label: 'Vừa' },
  thấp: { color: '#9aa0a6', label: 'Thấp' },
};

export type ScoreContext = {
  customerWinRate?: number; // 0..1 — tỷ lệ thắng lịch sử của khách
  sourceWinRate?: number;   // 0..1 — tỷ lệ thắng theo nguồn khách
  hasContract?: boolean;    // đã có hợp đồng nháp liên kết
  now?: number;             // epoch ms (tiêm cho test)
};

const OPEN_STATUSES = ['in_progress', 'sent', 'negotiating'];
/** Báo giá còn "đang mở" (chưa thắng/thua) — chỉ chấm điểm các deal này. */
export function isOpenDeal(e: CloudQuoteEntry): boolean {
  return OPEN_STATUSES.includes(e.status ?? 'in_progress');
}

function daysSince(iso: string | undefined, now: number): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? undefined : (now - t) / 86_400_000;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function scoreDeal(e: CloudQuoteEntry, ctx: ScoreContext = {}): WinScore {
  const now = ctx.now ?? Date.now();
  const factors: WinFactor[] = [];
  let score = 40; // nền
  const add = (label: string, impact: number) => {
    if (impact === 0) return;
    factors.push({ label, impact });
    score += impact;
  };

  const st = e.status ?? 'in_progress';
  if (st === 'negotiating') add('Đang đàm phán', 22);
  else if (st === 'sent') add('Đã gửi khách', 12);

  if (ctx.hasContract) add('Đã có hợp đồng nháp', 25);

  if (typeof ctx.customerWinRate === 'number') {
    add(`Tỷ lệ thắng theo khách ${Math.round(ctx.customerWinRate * 100)}%`, Math.round((ctx.customerWinRate - 0.5) * 30));
  }
  if (typeof ctx.sourceWinRate === 'number') {
    add(`Tỷ lệ thắng theo nguồn ${Math.round(ctx.sourceWinRate * 100)}%`, Math.round((ctx.sourceWinRate - 0.5) * 20));
  }

  const age = daysSince(e.updatedAt, now);
  if (typeof age === 'number') {
    if (age > 45) add('Tồn đọng > 45 ngày', -15);
    else if (age > 21) add('Chậm cập nhật > 21 ngày', -8);
    else if (age < 7) add('Vừa cập nhật', 5);
  }

  const sinceDep = daysSince(e.departDate, now); // >0 = đã qua khởi hành
  if (typeof sinceDep === 'number') {
    const until = -sinceDep; // số ngày tới khởi hành
    if (until >= 0 && until < 30) add('Cận khởi hành < 30 ngày', 10);
    else if (until >= 30 && until < 60) add('Khởi hành trong 60 ngày', 5);
    else if (until < 0) add('Đã qua ngày khởi hành', -10);
  }

  score = clamp(Math.round(score), 0, 100);
  const band: WinBand = score >= 66 ? 'cao' : score >= 40 ? 'vừa' : 'thấp';
  return { score, band, factors };
}

/** Tỷ lệ thắng = won / (won + thua) trong một nhóm, undefined nếu chưa có deal chốt. */
export function winRate(items: CloudQuoteEntry[]): number | undefined {
  let won = 0, lost = 0;
  for (const q of items) {
    if (q.status === 'won') won++;
    else if (q.status === 'not_selected' || q.status === 'cancelled') lost++;
  }
  const decided = won + lost;
  return decided ? won / decided : undefined;
}

/** Gom tỷ lệ thắng theo khoá (vd customerId, nguồn) từ toàn bộ lịch sử. */
export function groupWinRate(history: CloudQuoteEntry[], keyOf: (e: CloudQuoteEntry) => string | undefined): Map<string, number> {
  const groups = new Map<string, CloudQuoteEntry[]>();
  for (const q of history) {
    const k = keyOf(q);
    if (!k) continue;
    const arr = groups.get(k) ?? [];
    arr.push(q); groups.set(k, arr);
  }
  const out = new Map<string, number>();
  for (const [k, items] of groups) {
    const r = winRate(items);
    if (r !== undefined) out.set(k, r);
  }
  return out;
}

/** Khoá khách hàng (id ưu tiên, fallback tên) — để gom tỷ lệ thắng theo khách. */
export const custKeyOf = (e: CloudQuoteEntry): string | undefined =>
  e.customerId || (e.customerName ? `name:${e.customerName}` : undefined);

/**
 * Chấm điểm hàng loạt các báo giá ĐANG MỞ trong `rows`, dùng tỷ lệ thắng tính từ
 * `history` (khách + nguồn). Thuần: caller cung cấp `sourceOf`/`hasContract` để
 * không phụ thuộc store. Trả Map theo cloudId.
 */
export function scoreDeals(
  rows: CloudQuoteEntry[],
  history: CloudQuoteEntry[],
  opts: { sourceOf: (e: CloudQuoteEntry) => string | undefined; hasContract: (e: CloudQuoteEntry) => boolean; now?: number },
): Map<string, WinScore> {
  const custRate = groupWinRate(history, custKeyOf);
  const srcRate = groupWinRate(history, opts.sourceOf);
  const out = new Map<string, WinScore>();
  for (const q of rows) {
    if (!isOpenDeal(q)) continue;
    const ck = custKeyOf(q);
    const sk = opts.sourceOf(q);
    out.set(q.cloudId, scoreDeal(q, {
      customerWinRate: ck ? custRate.get(ck) : undefined,
      sourceWinRate: sk ? srcRate.get(sk) : undefined,
      hasContract: opts.hasContract(q),
      now: opts.now,
    }));
  }
  return out;
}
