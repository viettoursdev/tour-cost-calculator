/**
 * #6 Phát hiện bất thường chấm công bằng LUẬT THUẦN (tất định, có test) — bổ trợ cho
 * "Nhận xét AI". Không phụ thuộc thời gian hệ thống (nhận `today` qua tham số).
 */
import type { AttendanceCodeDef, HrAttendance, HrEmployee } from '@/types';
import { periodDays, isWeekend } from './attendanceCalc';
import { lookupCode, normalizeCode, ATTENDANCE_CODES } from './attendanceCodes';

export type AnomalySeverity = 'high' | 'medium' | 'low';

export type Anomaly = {
  empId: string;
  empName: string;
  severity: AnomalySeverity;
  type: string;
  message: string;
};

export type AnomalyOptions = {
  codes?: AttendanceCodeDef[];
  today?: string;         // ISO "YYYY-MM-DD" — mốc "quá khứ" để soi ô trống ngày thường
  minWorkDays?: number;   // ngưỡng công tối thiểu (nếu đặt) → cảnh báo công thấp
  maxConsecutiveUnpaid?: number; // số ngày nghỉ-không-phép liên tiếp báo động (mặc định 3)
};

/** Số chuỗi liên tiếp dài nhất mà mã thuộc `codeSet` xuất hiện trong các ngày ISO. */
function longestRun(days: HrAttendance['days'], isoList: string[], codeSet: Set<string>): number {
  let best = 0, cur = 0;
  for (const iso of isoList) {
    const code = days[iso]?.code;
    if (code && codeSet.has(normalizeCode(code))) { cur++; best = Math.max(best, cur); }
    else cur = 0;
  }
  return best;
}

/**
 * Rà bất thường cho một kỳ. `employees` = phạm vi cần soi; `rows` = bảng công của kỳ.
 * Trả về danh sách cảnh báo (đã sắp theo mức độ giảm dần).
 */
export function detectAnomalies(
  rows: HrAttendance[],
  employees: HrEmployee[],
  period: string,
  opts: AnomalyOptions = {},
): Anomaly[] {
  const codes = opts.codes ?? ATTENDANCE_CODES;
  const maxUnpaid = opts.maxConsecutiveUnpaid ?? 3;
  const rowByEmp = new Map(rows.map((r) => [r.employeeLegacyId, r]));
  const allDays = periodDays(period);
  const out: Anomaly[] = [];

  for (const e of employees) {
    const r = rowByEmp.get(e.id);
    if (!r) {
      out.push({ empId: e.id, empName: e.fullName, severity: 'medium', type: 'no_sheet', message: 'Chưa có bảng công trong kỳ.' });
      continue;
    }

    // Ô trống ngày thường ĐÃ QUA (theo today).
    if (opts.today) {
      const missing = allDays.filter((iso) => iso <= opts.today! && !isWeekend(iso) && !r.days[iso]?.code?.trim());
      if (missing.length) {
        out.push({ empId: e.id, empName: e.fullName, severity: missing.length >= 3 ? 'medium' : 'low', type: 'missing_days', message: `Thiếu chấm công ${missing.length} ngày thường (vd ${missing.slice(0, 3).map((d) => d.slice(8)).join(', ')}).` });
      }
    }

    // Nghỉ không phép (KP) liên tiếp.
    const run = longestRun(r.days, allDays, new Set(['KP']));
    if (run >= maxUnpaid) {
      out.push({ empId: e.id, empName: e.fullName, severity: 'high', type: 'consecutive_unpaid', message: `Nghỉ không phép ${run} ngày liên tiếp.` });
    }

    // Mã lạ (không có trong từ điển hiệu lực).
    const unknown = [...new Set(Object.values(r.days).map((c) => c?.code).filter((c): c is string => !!c && !lookupCode(c, codes)))];
    if (unknown.length) {
      out.push({ empId: e.id, empName: e.fullName, severity: 'medium', type: 'unknown_code', message: `Mã chưa nhận diện: ${unknown.join(', ')}.` });
    }

    // Công thấp hơn ngưỡng.
    if (opts.minWorkDays != null && (r.summary.totalHC ?? 0) < opts.minWorkDays) {
      out.push({ empId: e.id, empName: e.fullName, severity: 'medium', type: 'low_work', message: `Số công ${r.summary.totalHC} thấp hơn ngưỡng ${opts.minWorkDays}.` });
    }

    // Nhân viên báo sai sót.
    if (r.confirmation.status === 'disputed') {
      out.push({ empId: e.id, empName: e.fullName, severity: 'high', type: 'disputed', message: `Nhân viên báo sai sót${r.confirmation.note ? `: “${r.confirmation.note}”` : ''}.` });
    }
  }

  const rank: Record<AnomalySeverity, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
