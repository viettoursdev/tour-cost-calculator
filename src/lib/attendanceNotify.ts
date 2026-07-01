/**
 * Thông báo liên quan tới chấm công (qua hàng đợi `notifications`).
 *  • notifyAttendancePublished: khi HR CÔNG BỐ kỳ → báo từng nhân viên (theo tài khoản
 *    liên kết qua profileEmail) vào xác nhận.
 *  • notifyAttendanceDisputed: khi nhân viên BÁO SAI SÓT → báo đội nhân sự (manageHR)
 *    cùng phòng + cấp Ban Giám Đốc.
 * Không chặn UI nếu gửi lỗi (catch nuốt — thông báo là phụ trợ).
 */
import { sbSendNotification } from '@/lib/supabase';
import { hasPerm } from '@/auth/PERMISSIONS';
import { isBoard } from '@/auth/ROLES';
import { myEmployee } from '@/auth/recordAccess';
import { useHrStore } from '@/stores/hrStore';
import { useAttendanceStore } from '@/stores/attendanceStore';
import { periodLabelVN } from '@/lib/attendance/attendanceCalc';
import type { HrAttendance, HrEmployee, User } from '@/types';

const ci = (s: string | undefined | null) => (s ?? '').trim().toLowerCase();

/** Tìm tài khoản đăng nhập ứng với một hồ sơ nhân sự (theo email liên kết). */
function loginUserFor(emp: HrEmployee | undefined, users: User[]): User | undefined {
  if (!emp) return undefined;
  const email = ci(emp.profileEmail) || ci(emp.email);
  if (!email) return undefined;
  return users.find((u) => ci(u.email) === email);
}

export function notifyAttendancePublished(
  rows: HrAttendance[],
  employees: HrEmployee[],
  users: User[],
  byName: string,
): void {
  const empById = new Map(employees.map((e) => [e.id, e]));
  for (const r of rows) {
    const target = loginUserFor(empById.get(r.employeeLegacyId), users);
    if (!target) continue;
    void sbSendNotification(target.u, {
      type: 'task',
      title: '🗓️ Bảng công đã công bố',
      message: `Bảng công ${periodLabelVN(r.period)} của bạn đã được công bố. Vui lòng kiểm tra và xác nhận.`,
      createdBy: byName,
      data: { attendanceId: r.id, period: r.period },
    }).catch(() => { /* không chặn UI */ });
  }
}

const CONFIRM_REMINDER_KEY = 'vte_att_confirm_reminded';

/**
 * #7 Nhắc nhân viên tự xác nhận: chạy trong phiên của chính nhân viên. Với các bảng
 * công ĐÃ CÔNG BỐ nhưng CHƯA xác nhận của hồ sơ ứng với tài khoản này → gửi 1 nhắc
 * (dedup qua localStorage để không lặp).
 */
export async function checkAttendanceConfirm(user: User): Promise<void> {
  try {
    const emp = myEmployee(user, useHrStore.getState().employees);
    if (!emp) return;
    const rows = useAttendanceStore.getState().attendances.filter(
      (a) => a.employeeLegacyId === emp.id && a.status === 'published' && a.confirmation.status === 'pending',
    );
    if (!rows.length) return;
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(CONFIRM_REMINDER_KEY) ?? '[]') as string[]; } catch { /* ignore */ }
    const set = new Set(seen);
    const fresh = rows.filter((r) => !set.has(r.id));
    for (const r of fresh) {
      await sbSendNotification(user.u, {
        type: 'task',
        title: '📋 Nhắc xác nhận bảng công',
        message: `Bảng công ${periodLabelVN(r.period)} của bạn chưa được xác nhận. Vui lòng kiểm tra & xác nhận.`,
        createdBy: 'Hệ thống',
        data: { attendanceId: r.id, period: r.period, attendanceConfirmReminder: true },
      });
      set.add(r.id);
    }
    if (fresh.length) localStorage.setItem(CONFIRM_REMINDER_KEY, JSON.stringify([...set].slice(-500)));
  } catch (e) {
    console.warn('checkAttendanceConfirm failed:', (e as Error).message);
  }
}

export function notifyAttendanceDisputed(
  row: HrAttendance,
  employee: HrEmployee | undefined,
  users: User[],
  byName: string,
  note: string,
): void {
  const dept = employee?.department;
  const recipients = users.filter((u) => hasPerm(u, 'manageHR') && (isBoard(u.role) || (!!dept && u.department === dept)));
  for (const u of recipients) {
    void sbSendNotification(u.u, {
      type: 'announcement',
      title: '⚠️ Phản hồi chấm công',
      message: `${byName} báo sai sót bảng công ${periodLabelVN(row.period)}${note ? `: “${note}”` : ''}`,
      createdBy: byName,
      data: { attendanceId: row.id, period: row.period },
    }).catch(() => { /* không chặn UI */ });
  }
}
