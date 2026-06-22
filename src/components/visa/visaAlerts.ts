// ════════════════════════════════════════════════════════════════════════
//  Visa Đợt 4 — Bộ máy cảnh báo thông minh cho quy trình visa.
//
//  Hàm THUẦN: nhận danh sách dự án visa + "hôm nay", trả về các cảnh báo cần chú
//  ý — hộ chiếu sắp/đã hết hạn, mốc trễ hạn, hồ sơ thiếu gần ngày nộp, dự án kẹt
//  sát ngày khởi hành. Không IO → dễ test, tái dùng cho panel & badge.
// ════════════════════════════════════════════════════════════════════════
import type { VisaProjectDoc } from '@/types';

export type VisaAlertKind = 'passport' | 'milestone' | 'docs' | 'stuck';
export type VisaAlertSeverity = 'high' | 'medium';

export interface VisaAlert {
  projectId: string;
  projectName: string;
  kind: VisaAlertKind;
  severity: VisaAlertSeverity;
  message: string;
}

/** Hộ chiếu phải còn hiệu lực tối thiểu 6 tháng sau chuyến đi. */
const PASSPORT_BUFFER_DAYS = 180;
/** Ngưỡng "sát ngày khởi hành" cho cảnh báo hồ sơ thiếu / dự án kẹt. */
const SOON_DAYS = 30;
const STUCK_MEDIUM_DAYS = 60;

/** Số ngày từ a → b (b - a). Trả null nếu thiếu/không hợp lệ. */
function dayDiff(aISO?: string | null, bISO?: string | null): number | null {
  if (!aISO || !bISO) return null;
  const a = Date.parse(aISO);
  const b = Date.parse(bISO);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Cảnh báo của MỘT dự án (bỏ qua dự án đã hoàn tất / huỷ). */
export function projectAlerts(p: VisaProjectDoc, todayISO: string): VisaAlert[] {
  if (p.status === 'completed' || p.status === 'cancelled') return [];
  const out: VisaAlert[] = [];
  const name = p.name || p.code;
  const mk = (kind: VisaAlertKind, severity: VisaAlertSeverity, message: string): VisaAlert =>
    ({ projectId: p.id, projectName: name, kind, severity, message });

  const depDays = dayDiff(todayISO, p.departureDate); // ngày tới lúc khởi hành
  const refISO = p.departureDate ?? todayISO;          // mốc tính hiệu lực hộ chiếu

  // ── Hộ chiếu sắp/đã hết hạn ──
  const applicants = p.applicants ?? [];
  let passportSoon = 0;
  let passportExpired = 0;
  for (const a of applicants) {
    if (!a.passportExpiry) continue;
    const slack = dayDiff(refISO, a.passportExpiry); // hiệu lực còn lại so với mốc
    if (slack == null) continue;
    if (slack < PASSPORT_BUFFER_DAYS) {
      passportSoon++;
      if (slack < 0) passportExpired++;
    }
  }
  if (passportSoon > 0) {
    const sev: VisaAlertSeverity = passportExpired > 0 || (depDays != null && depDays <= SOON_DAYS) ? 'high' : 'medium';
    out.push(mk('passport', sev, `${passportSoon} khách hộ chiếu sắp/đã hết hạn (cần hiệu lực ≥6 tháng sau chuyến đi)`));
  }

  // ── Mốc trễ hạn ──
  const overdue = p.milestones.filter((m) => !m.done && m.date && (dayDiff(todayISO, m.date) ?? 1) < 0);
  if (overdue.length > 0) {
    const earliest = overdue.slice().sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0];
    const sev: VisaAlertSeverity = depDays != null && depDays <= 14 ? 'high' : 'medium';
    out.push(mk('milestone', sev, `${overdue.length} mốc trễ hạn (gần nhất: ${earliest.label} · ${earliest.date})`));
  }

  // ── Hồ sơ thiếu sát ngày khởi hành ──
  if (depDays != null && depDays <= SOON_DAYS && depDays >= -1) {
    const missing = applicants.filter((a) => a.docStatus === 'missing').length;
    if (missing > 0) {
      out.push(mk('docs', 'high', `Còn ${missing} khách THIẾU hồ sơ — khởi hành trong ${Math.max(0, depDays)} ngày`));
    }
  }

  // ── Dự án kẹt: sắp đi nhưng vẫn "Lên kế hoạch" ──
  if (depDays != null && p.status === 'planning') {
    if (depDays <= SOON_DAYS) {
      out.push(mk('stuck', 'high', `Khởi hành trong ${Math.max(0, depDays)} ngày nhưng dự án vẫn "Lên kế hoạch"`));
    } else if (depDays <= STUCK_MEDIUM_DAYS) {
      out.push(mk('stuck', 'medium', `Còn ${depDays} ngày tới khởi hành, dự án chưa rời "Lên kế hoạch"`));
    }
  }

  return out;
}

const SEV_RANK: Record<VisaAlertSeverity, number> = { high: 0, medium: 1 };

/** Toàn bộ cảnh báo của danh sách dự án, xếp high trước. */
export function computeVisaAlerts(projects: VisaProjectDoc[], todayISO: string): VisaAlert[] {
  return projects
    .flatMap((p) => projectAlerts(p, todayISO))
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
}

/** Đếm theo mức độ — cho badge. */
export function alertCounts(alerts: VisaAlert[]): { high: number; medium: number; total: number } {
  const high = alerts.filter((a) => a.severity === 'high').length;
  return { high, medium: alerts.length - high, total: alerts.length };
}
