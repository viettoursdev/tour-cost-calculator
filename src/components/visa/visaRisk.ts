import type { VisaApplicant, VisaProjectDoc } from '@/types';

/**
 * #E — Radar rủi ro visa. Chấm điểm RỦI RO trượt của một khách (0–100, cao = rủi
 * ro cao) từ dữ liệu lịch sử, minh bạch theo yếu tố — thuần (pure) để test. Lớp AI
 * (tùy chọn) chỉ DIỄN GIẢI các factor này. Cũng gom "radar deadline" các mốc sắp/quá hạn.
 */

export type RiskBand = 'an toàn' | 'cần chú ý' | 'rủi ro cao';
export type RiskFactor = { label: string; impact: number };
export type VisaRisk = { score: number; band: RiskBand; factors: RiskFactor[] };

export const RISK_BAND_META: Record<RiskBand, { color: string; label: string }> = {
  'an toàn': { color: '#27ae60', label: 'An toàn' },
  'cần chú ý': { color: '#d97706', label: 'Cần chú ý' },
  'rủi ro cao': { color: '#dc3250', label: 'Rủi ro cao' },
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const daysUntil = (iso: string | null | undefined, now: number): number | undefined => {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? undefined : (t - now) / 86_400_000;
};

/** Khách đã có kết quả chắc chắn (đậu/có visa/rớt) — không cần chấm rủi ro nữa. */
const isResolved = (a: VisaApplicant): boolean =>
  a.result === 'passed' || a.result === 'have_visa' || a.result === 'failed' || a.visaStatus === 'cancelled';

export type CountryRate = { rate: number; n: number };

/**
 * Tỷ lệ ĐẬU lịch sử theo quốc gia, gom từ kết quả khách (passed/have_visa vs failed).
 * Fallback dùng số liệu tổng của dự án khi không có danh sách khách.
 */
export function countryApprovalRates(projects: VisaProjectDoc[]): Map<string, CountryRate> {
  const agg = new Map<string, { pass: number; fail: number }>();
  for (const p of projects) {
    const c = (p.country || '').trim();
    if (!c) continue;
    const g = agg.get(c) ?? { pass: 0, fail: 0 };
    const apps = p.applicants ?? [];
    if (apps.length) {
      for (const a of apps) {
        if (a.result === 'passed' || a.result === 'have_visa') g.pass++;
        else if (a.result === 'failed') g.fail++;
      }
    } else {
      g.pass += (p.passedCount || 0) + (p.haveVisaCount || 0);
      g.fail += p.failedCount || 0;
    }
    agg.set(c, g);
  }
  const out = new Map<string, CountryRate>();
  for (const [c, g] of agg) {
    const n = g.pass + g.fail;
    if (n) out.set(c, { rate: g.pass / n, n });
  }
  return out;
}

/** Chấm điểm rủi ro một khách trong một dự án visa. */
export function applicantRisk(
  a: VisaApplicant,
  project: Pick<VisaProjectDoc, 'country' | 'startDate' | 'departureDate'>,
  rates: Map<string, CountryRate>,
  opts: { now?: number } = {},
): VisaRisk {
  const now = opts.now ?? Date.now();
  if (a.result === 'failed') return { score: 100, band: 'rủi ro cao', factors: [{ label: 'Đã rớt visa', impact: 0 }] };
  if (a.result === 'passed' || a.result === 'have_visa')
    return { score: 0, band: 'an toàn', factors: [{ label: a.result === 'have_visa' ? 'Đã có visa' : 'Đã đậu', impact: 0 }] };

  const factors: RiskFactor[] = [];
  let risk = 30; // nền
  const add = (label: string, impact: number) => {
    if (impact === 0) return;
    factors.push({ label, impact });
    risk += impact;
  };

  // Tỷ lệ đậu theo nước (mốc tham chiếu 70%): nước tỷ lệ thấp → rủi ro tăng.
  const cr = rates.get((project.country || '').trim());
  if (cr) add(`Tỷ lệ đậu nước ${Math.round(cr.rate * 100)}% (n=${cr.n})`, Math.round((0.7 - cr.rate) * 60));

  // Tình trạng hồ sơ.
  if (a.docStatus === 'missing') add('Hồ sơ thiếu', 25);
  else if (a.docStatus === 'submitted') add('Hồ sơ chưa đủ', 8);
  else if (a.docStatus === 'complete') add('Hồ sơ đầy đủ', -10);

  // Tiền sử rớt (xin lại).
  if (a.failReason) add('Có tiền sử rớt', 15);

  // Cận ngày khởi hành nhưng hồ sơ chưa xong.
  const until = daysUntil(project.departureDate ?? project.startDate, now);
  if (typeof until === 'number') {
    const earlyStage = a.visaStatus ? ['deployed', 'collecting'].includes(a.visaStatus) : a.docStatus !== 'complete';
    if (until < 0) add('Đã qua ngày khởi hành', 12);
    else if (until < 21 && earlyStage) add('Cận khởi hành nhưng hồ sơ chưa xong', 25);
    else if (until < 14) add('Cận khởi hành < 14 ngày', 8);
  }

  risk = clamp(Math.round(risk), 0, 100);
  const band: RiskBand = risk >= 66 ? 'rủi ro cao' : risk >= 40 ? 'cần chú ý' : 'an toàn';
  return { score: risk, band, factors };
}

export type DeadlineItem = {
  projectId: string;
  projectName: string;
  country: string;
  label: string;
  date: string;
  daysUntil: number;  // <0 = quá hạn
  overdue: boolean;
};

/**
 * Radar deadline: các mốc dự án (chưa `done`) có ngày trong khoảng [quá hạn .. windowDays].
 * Trả về đã sắp xếp: quá hạn trước, rồi tới gần nhất.
 */
export function deadlineRadar(
  projects: VisaProjectDoc[],
  opts: { now?: number; windowDays?: number } = {},
): DeadlineItem[] {
  const now = opts.now ?? Date.now();
  const windowDays = opts.windowDays ?? 30;
  const out: DeadlineItem[] = [];
  for (const p of projects) {
    if (p.status === 'cancelled' || p.status === 'completed') continue;
    for (const m of p.milestones ?? []) {
      if (m.done || !m.date) continue;
      const d = daysUntil(m.date, now);
      if (d === undefined || d > windowDays) continue;
      out.push({
        projectId: p.id,
        projectName: p.name || p.code,
        country: p.country,
        label: m.label,
        date: m.date,
        daysUntil: Math.floor(d),
        overdue: d < 0,
      });
    }
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}

/** Tổng hợp rủi ro một dự án: đếm khách theo band + điểm rủi ro cao nhất. */
export function projectRiskSummary(
  project: VisaProjectDoc,
  rates: Map<string, CountryRate>,
  opts: { now?: number } = {},
): { atRisk: number; total: number; maxScore: number } {
  let atRisk = 0, total = 0, maxScore = 0;
  for (const a of project.applicants ?? []) {
    if (isResolved(a)) continue;
    total++;
    const r = applicantRisk(a, project, rates, opts);
    if (r.band !== 'an toàn') atRisk++;
    if (r.score > maxScore) maxScore = r.score;
  }
  return { atRisk, total, maxScore };
}
