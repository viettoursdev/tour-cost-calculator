import { describe, it, expect } from 'vitest';
import { scaffoldMonth, vietnamSolarHolidays } from './attendanceScaffold';
import { detectAnomalies } from './attendanceAnomalies';
import { monthlyStats, deptStats, topAbsentees } from './attendanceAggregate';
import type { HrAttendance, HrEmployee, AttendanceSummary } from '@/types';

const emp = (id: string, fullName: string, department = 'dh_noidia'): HrEmployee => ({
  id, employeeCode: id, fullName, email: '', phone: '', department: department as HrEmployee['department'],
  title: '', level: '', status: 'official', notes: '', documents: [], createdAt: '', createdBy: '',
});

const sum = (p: Partial<AttendanceSummary> = {}): AttendanceSummary =>
  ({ totalHC: 0, present: 0, paidLeave: 0, unpaidLeave: 0, sick: 0, holiday: 0, byCode: {}, unknownCodes: [], ...p });

const att = (employeeLegacyId: string, period: string, days: Record<string, string>, summary = sum(), extra: Partial<HrAttendance> = {}): HrAttendance => ({
  id: `att-${employeeLegacyId}-${period}`, employeeLegacyId, employeeCode: '', fullName: '', department: 'dh_noidia',
  period, days: Object.fromEntries(Object.entries(days).map(([k, v]) => [k, { code: v }])),
  summary, status: 'published', confirmation: { status: 'pending' }, feedback: [], source: 'excel', createdAt: '', createdBy: '', ...extra,
});

describe('scaffoldMonth (#5)', () => {
  it('điền X ngày thường, bỏ trống cuối tuần', () => {
    const d = scaffoldMonth('2026-06');
    expect(d['2026-06-01'].code).toBe('X');  // T2
    expect(d['2026-06-06']).toBeUndefined();  // T7
    expect(d['2026-06-07']).toBeUndefined();  // CN
  });
  it('đánh dấu lễ dương lịch VN', () => {
    const d = scaffoldMonth('2026-05');
    expect(d['2026-05-01'].code).toBe('Lễ'); // Quốc tế Lao động
    expect(vietnamSolarHolidays('2026')).toContain('2026-09-02');
  });
  it('includeWeekend điền cả cuối tuần', () => {
    const d = scaffoldMonth('2026-06', { includeWeekend: true, workCode: 'T' });
    expect(d['2026-06-06'].code).toBe('T');
  });
});

describe('detectAnomalies (#6)', () => {
  it('báo NV chưa có bảng công', () => {
    const a = detectAnomalies([], [emp('e1', 'A')], '2026-06');
    expect(a.some((x) => x.type === 'no_sheet')).toBe(true);
  });
  it('báo nghỉ không phép liên tiếp + mã lạ + báo sai sót', () => {
    const row = att('e1', '2026-06',
      { '2026-06-01': 'KP', '2026-06-02': 'KP', '2026-06-03': 'KP', '2026-06-04': 'ZZ' },
      sum({ totalHC: 0 }), { confirmation: { status: 'disputed', note: 'sai' } });
    const a = detectAnomalies([row], [emp('e1', 'A')], '2026-06');
    expect(a.some((x) => x.type === 'consecutive_unpaid')).toBe(true);
    expect(a.some((x) => x.type === 'unknown_code')).toBe(true);
    expect(a.some((x) => x.type === 'disputed')).toBe(true);
    expect(a[0].severity).toBe('high'); // đã sắp theo mức độ
  });
  it('báo thiếu chấm công ngày thường đã qua', () => {
    const row = att('e1', '2026-06', { '2026-06-01': 'X' }); // các ngày thường khác trống
    const a = detectAnomalies([row], [emp('e1', 'A')], '2026-06', { today: '2026-06-05' });
    expect(a.some((x) => x.type === 'missing_days')).toBe(true);
  });
});

describe('aggregate (#8)', () => {
  const atts = [
    att('e1', '2026-05', {}, sum({ totalHC: 20, paidLeave: 1 })),
    att('e1', '2026-06', {}, sum({ totalHC: 22, unpaidLeave: 2 })),
    att('e2', '2026-06', {}, sum({ totalHC: 18, sick: 3 }), { department: 'dh_nuocngoai' }),
  ];
  const employees = [emp('e1', 'A', 'dh_noidia'), emp('e2', 'B', 'dh_nuocngoai')];
  const ids = new Set(['e1', 'e2']);

  it('monthlyStats gộp theo tháng, sắp tăng dần', () => {
    const m = monthlyStats(atts, ids);
    expect(m.map((x) => x.period)).toEqual(['2026-05', '2026-06']);
    expect(m[1].totalHC).toBe(40); // 22 + 18
  });
  it('deptStats theo phòng cho một kỳ', () => {
    const d = deptStats(atts, employees, '2026-06');
    expect(d).toHaveLength(2);
    expect(d.find((x) => x.department === 'dh_noidia')!.totalHC).toBe(22);
  });
  it('topAbsentees xếp theo tổng nghỉ', () => {
    const t = topAbsentees(atts, employees, '2026-06');
    expect(t[0].empId).toBe('e2'); // nghỉ 3 (ốm) > e1 nghỉ 2
    expect(t[0].total).toBe(3);
  });
});
