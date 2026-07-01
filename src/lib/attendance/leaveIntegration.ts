/**
 * Liên thông Nghỉ phép (hr_leaves) ↔ Chấm công + Quỹ phép năm.
 *  #1 daysFromApprovedLeaves: bung đơn nghỉ phép ĐÃ DUYỆT thành mã công theo ngày
 *     để tự điền vào bảng công (tránh nhập tay 2 nơi, chống lệch số liệu).
 *  #2 quỹ phép năm: đếm phần trừ phép năm từ bảng công → số ngày phép còn lại.
 * Thuần (pure), không phụ thuộc thời gian hệ thống.
 */
import type { AttendanceDays, HrAttendance, HrLeave, LeaveType } from '@/types';

/** Loại nghỉ → mã công cả ngày. */
export const LEAVE_TYPE_TO_CODE: Record<LeaveType, string> = {
  annual: 'P',   // phép năm hưởng lương
  unpaid: 'CP',  // không lương (có xin phép)
  sick: 'O',     // ốm đau
  other: 'P',    // khác — mặc định coi như phép (HR chỉnh lại nếu cần)
};

/** Loại nghỉ → mã NỬA ngày (khi đơn chỉ 0.5 ngày). */
export const LEAVE_TYPE_HALF_CODE: Partial<Record<LeaveType, string>> = {
  annual: 'P/2',
};

/** Liệt kê các ngày ISO (inclusive) giữa start..end. Trả rỗng nếu không hợp lệ. */
function isoRange(start: string, end: string): string[] {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return [];
  const out: string[] = [];
  const cur = new Date(s);
  let guard = 0;
  while (cur <= e && guard < 400) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard++;
  }
  return out;
}

/**
 * Bung các đơn nghỉ phép ĐÃ DUYỆT của một nhân viên thành bản đồ ngày→ô, giới hạn
 * trong `period` ("YYYY-MM"). Đơn đúng 1 ngày và ≤0.5 ngày → dùng mã nửa (nếu có).
 */
export function daysFromApprovedLeaves(
  leaves: HrLeave[],
  employeeLegacyId: string,
  period: string,
): AttendanceDays {
  const out: AttendanceDays = {};
  for (const lv of leaves) {
    if (lv.employeeId !== employeeLegacyId || lv.status !== 'approved') continue;
    const start = lv.startDate;
    if (!start) continue;
    const end = lv.endDate || start;
    const range = isoRange(start, end);
    if (!range.length) continue;
    const fullCode = LEAVE_TYPE_TO_CODE[lv.type] ?? 'P';
    const halfCode = LEAVE_TYPE_HALF_CODE[lv.type];
    const isHalf = range.length === 1 && (lv.days ?? 1) <= 0.5;
    const code = isHalf && halfCode ? halfCode : fullCode;
    for (const iso of range) {
      if (iso.slice(0, 7) !== period) continue;
      out[iso] = { code, note: 'Từ đơn nghỉ phép' };
    }
  }
  return out;
}

// ── #2 Quỹ phép năm ───────────────────────────────────────────────────────────

/** Phép năm mặc định (ngày/năm) — Bộ luật Lao động VN tối thiểu 12. HR chỉnh sau. */
export const DEFAULT_ANNUAL_LEAVE_DAYS = 12;

/** Phần một mã trừ vào QUỸ PHÉP NĂM: P=1, P/2=0.5, XP=0.5 (nửa ngày nghỉ phép). */
export function annualLeavePortion(code: string | null | undefined): number {
  const k = String(code ?? '').replace(/\s+/g, '').toUpperCase();
  if (k === 'P') return 1;
  if (k === 'P/2' || k === 'XP') return 0.5;
  return 0;
}

/** Tổng phép năm ĐÃ DÙNG trong 1 năm ("YYYY") của một nhân viên, tính từ bảng công. */
export function annualLeaveUsedInYear(
  attendances: HrAttendance[],
  employeeLegacyId: string,
  year: string,
): number {
  let used = 0;
  for (const a of attendances) {
    if (a.employeeLegacyId !== employeeLegacyId || a.period.slice(0, 4) !== year) continue;
    for (const cell of Object.values(a.days)) used += annualLeavePortion(cell?.code);
  }
  return Math.round(used * 2) / 2;
}

export type LeaveBalance = { quota: number; used: number; remaining: number };

/** Quỹ phép còn lại = hạn mức − đã dùng. */
export function leaveBalance(used: number, quota = DEFAULT_ANNUAL_LEAVE_DAYS): LeaveBalance {
  return { quota, used, remaining: Math.round((quota - used) * 2) / 2 };
}
