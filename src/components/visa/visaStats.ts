/**
 * Thống kê visa nâng cao (hàm THUẦN): tỷ lệ đậu theo NHÂN VIÊN phụ trách + thời
 * gian xử lý trung bình (ngày triển khai → dự kiến có visa). Bổ sung cho
 * VisaResultsDashboard (vốn đã có theo nước/kỳ).
 */
import type { VisaApplicant, VisaProjectDoc } from '@/types';
import { deriveVisaStatus } from './constants';

export interface StatTally { total: number; passed: number; failed: number; haveVisa: number; pending: number; }
const empty = (): StatTally => ({ total: 0, passed: 0, failed: 0, haveVisa: 0, pending: 0 });

function add(t: StatTally, a: VisaApplicant): void {
  const s = deriveVisaStatus(a);
  if (s === 'cancelled') return;            // huỷ → không tính
  t.total += 1;
  if (s === 'passed') t.passed += 1;
  else if (s === 'failed') t.failed += 1;
  else if (s === 'have_visa') t.haveVisa += 1;
  else t.pending += 1;
}

/** Tỷ lệ đậu = đậu / (đậu + rớt). null nếu chưa có kết quả. */
export const passRate = (t: StatTally): number | null =>
  t.passed + t.failed > 0 ? Math.round((t.passed / (t.passed + t.failed)) * 100) : null;

/** Gộp theo username nhân viên phụ trách chính; mỗi mainStaff nhận applicants của dự án đó. */
export function tallyByStaff(projects: VisaProjectDoc[]): { username: string; t: StatTally }[] {
  const m = new Map<string, StatTally>();
  for (const p of projects) {
    const staff = p.mainStaff?.length ? p.mainStaff : ['(chưa gán)'];
    for (const u of staff) {
      const t = m.get(u) ?? empty();
      for (const a of p.applicants ?? []) add(t, a);
      m.set(u, t);
    }
  }
  return [...m.entries()]
    .map(([username, t]) => ({ username, t }))
    .filter((x) => x.t.total > 0)
    .sort((a, b) => (passRate(b.t) ?? -1) - (passRate(a.t) ?? -1));
}

const msDate = (a: VisaApplicant, key: string): string | null =>
  (a.timeline ?? []).find((m) => m.key === key)?.date ?? null;

/** Thời gian xử lý TB (ngày): từ mốc "triển khai" → "dự kiến có visa" của từng khách. */
export function avgProcessingDays(projects: VisaProjectDoc[]): { avg: number | null; n: number } {
  const spans: number[] = [];
  for (const p of projects) {
    for (const a of p.applicants ?? []) {
      const start = msDate(a, 'deploy');
      const end = msDate(a, 'expected');
      if (!start || !end) continue;
      const d = (Date.parse(end) - Date.parse(start)) / 86400000;
      if (!Number.isNaN(d) && d >= 0) spans.push(d);
    }
  }
  if (!spans.length) return { avg: null, n: 0 };
  return { avg: Math.round(spans.reduce((s, x) => s + x, 0) / spans.length), n: spans.length };
}
