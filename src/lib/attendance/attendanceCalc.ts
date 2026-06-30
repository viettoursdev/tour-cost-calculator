import type { AttendanceCodeDef, AttendanceDays, AttendanceSummary } from '@/types';
import { ATTENDANCE_CODES, lookupCode, normalizeCode } from './attendanceCodes';

/** Làm tròn về bội số 0.5 để tránh sai số dấu phẩy động khi cộng nhiều ½ công. */
function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

/**
 * Tổng hợp một tháng công từ bản đồ ngày → ô. Thuần (pure), không phụ thuộc thời gian
 * hệ thống. Cộng `work` của từng mã vào `totalHC` và phân loại theo `category`.
 */
export function summarizeAttendance(
  days: AttendanceDays,
  codes: AttendanceCodeDef[] = ATTENDANCE_CODES,
): AttendanceSummary {
  let totalHC = 0;
  let present = 0;
  let paidLeave = 0;
  let unpaidLeave = 0;
  let sick = 0;
  let holiday = 0;
  const byCode: Record<string, number> = {};
  const unknown = new Set<string>();

  for (const cell of Object.values(days)) {
    const raw = cell?.code;
    if (raw == null || normalizeCode(String(raw)) === '') continue;
    const key = normalizeCode(String(raw));
    byCode[key] = (byCode[key] ?? 0) + 1;

    const def = lookupCode(raw, codes);
    if (!def) {
      unknown.add(key);
      continue;
    }
    totalHC += def.work;
    switch (def.category) {
      case 'work':
        present += def.work;
        break;
      case 'half':
        // Nửa làm nửa nghỉ: phần "làm" tính vào present (xấp xỉ qua work, tối đa 1).
        present += Math.min(def.work, 1);
        break;
      case 'leave_paid':
        paidLeave += 1;
        break;
      case 'leave_unpaid':
        unpaidLeave += 1;
        break;
      case 'sick':
        sick += 1;
        break;
      case 'holiday':
        holiday += 1;
        break;
      default:
        break;
    }
  }

  return {
    totalHC: roundHalf(totalHC),
    present: roundHalf(present),
    paidLeave,
    unpaidLeave,
    sick,
    holiday,
    byCode,
    unknownCodes: [...unknown].sort(),
  };
}

// ── Tiện ích kỳ công (period "YYYY-MM") ───────────────────────────────────────

/** Kiểm tra chuỗi period hợp lệ "YYYY-MM". */
export function isValidPeriod(period: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
}

/** Số ngày trong tháng của một period. */
export function daysInMonth(period: string): number {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Liệt kê toàn bộ ngày ISO "YYYY-MM-DD" của một period (theo thứ tự). */
export function periodDays(period: string): string[] {
  if (!isValidPeriod(period)) return [];
  const n = daysInMonth(period);
  const out: string[] = [];
  for (let d = 1; d <= n; d++) {
    out.push(`${period}-${String(d).padStart(2, '0')}`);
  }
  return out;
}

/** Thứ trong tuần (0=CN…6=T7) của một ngày ISO, dùng UTC để ổn định. */
export function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Có phải cuối tuần (T7/CN) không. */
export function isWeekend(iso: string): boolean {
  const w = isoWeekday(iso);
  return w === 0 || w === 6;
}

const WEEKDAY_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Nhãn thứ tiếng Việt (CN, T2…T7) cho một ngày ISO. */
export function weekdayLabelVN(iso: string): string {
  return WEEKDAY_VN[isoWeekday(iso)] ?? '';
}

/** Nhãn period thân thiện, vd "2026-06" → "Tháng 6/2026". */
export function periodLabelVN(period: string): string {
  if (!isValidPeriod(period)) return period;
  const [y, m] = period.split('-');
  return `Tháng ${Number(m)}/${y}`;
}
