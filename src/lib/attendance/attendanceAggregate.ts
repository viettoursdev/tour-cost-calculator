/**
 * #8 Tổng hợp chấm công nhiều tháng cho dashboard. Gộp từ `summary` đã tính sẵn.
 * Thuần (pure).
 */
import type { HrAttendance, HrEmployee } from '@/types';

export type MonthlyStat = {
  period: string;
  totalHC: number;
  present: number;
  paidLeave: number;
  unpaidLeave: number;
  sick: number;
  sheets: number;
};

/** Thống kê theo tháng (chỉ các NV trong phạm vi), sắp theo kỳ tăng dần. */
export function monthlyStats(attendances: HrAttendance[], empIds: Set<string>): MonthlyStat[] {
  const map = new Map<string, MonthlyStat>();
  for (const a of attendances) {
    if (!empIds.has(a.employeeLegacyId)) continue;
    const m = map.get(a.period) ?? { period: a.period, totalHC: 0, present: 0, paidLeave: 0, unpaidLeave: 0, sick: 0, sheets: 0 };
    m.totalHC += a.summary.totalHC ?? 0;
    m.present += a.summary.present ?? 0;
    m.paidLeave += a.summary.paidLeave ?? 0;
    m.unpaidLeave += a.summary.unpaidLeave ?? 0;
    m.sick += a.summary.sick ?? 0;
    m.sheets += 1;
    map.set(a.period, m);
  }
  return [...map.values()].sort((a, b) => a.period.localeCompare(b.period));
}

export type DeptStat = { department: string; totalHC: number; sheets: number; present: number };

/** Thống kê theo phòng ban cho một kỳ. */
export function deptStats(attendances: HrAttendance[], employees: HrEmployee[], period: string): DeptStat[] {
  const deptOf = new Map(employees.map((e) => [e.id, e.department || '(chưa rõ)']));
  const map = new Map<string, DeptStat>();
  for (const a of attendances) {
    if (a.period !== period || !deptOf.has(a.employeeLegacyId)) continue;
    const dept = deptOf.get(a.employeeLegacyId)!;
    const d = map.get(dept) ?? { department: dept, totalHC: 0, sheets: 0, present: 0 };
    d.totalHC += a.summary.totalHC ?? 0;
    d.present += a.summary.present ?? 0;
    d.sheets += 1;
    map.set(dept, d);
  }
  return [...map.values()].sort((a, b) => b.totalHC - a.totalHC);
}

export type AbsenceRow = { empId: string; name: string; paidLeave: number; unpaidLeave: number; sick: number; total: number };

/** Top nhân viên nghỉ nhiều nhất trong một kỳ (phép + không lương + ốm). */
export function topAbsentees(attendances: HrAttendance[], employees: HrEmployee[], period: string, n = 5): AbsenceRow[] {
  const nameOf = new Map(employees.map((e) => [e.id, e.fullName]));
  const rows: AbsenceRow[] = [];
  for (const a of attendances) {
    if (a.period !== period || !nameOf.has(a.employeeLegacyId)) continue;
    const paidLeave = a.summary.paidLeave ?? 0;
    const unpaidLeave = a.summary.unpaidLeave ?? 0;
    const sick = a.summary.sick ?? 0;
    const total = paidLeave + unpaidLeave + sick;
    if (total > 0) rows.push({ empId: a.employeeLegacyId, name: nameOf.get(a.employeeLegacyId)!, paidLeave, unpaidLeave, sick, total });
  }
  return rows.sort((a, b) => b.total - a.total).slice(0, n);
}
