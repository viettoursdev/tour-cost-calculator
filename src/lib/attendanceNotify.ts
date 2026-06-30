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
