import { describe, it, expect } from 'vitest';
import {
  daysFromApprovedLeaves, annualLeavePortion, annualLeaveUsedInYear, leaveBalance,
} from './leaveIntegration';
import type { HrAttendance, HrLeave } from '@/types';

const leave = (p: Partial<HrLeave>): HrLeave => ({
  id: 'l', employeeId: 'e1', type: 'annual', days: 1, reason: '', status: 'approved',
  approverName: '', decisionNote: '', createdAt: '', createdBy: '', ...p,
});

const att = (employeeLegacyId: string, period: string, days: Record<string, string>): HrAttendance => ({
  id: `att-${employeeLegacyId}-${period}`, employeeLegacyId, employeeCode: '', fullName: '', department: '',
  period, days: Object.fromEntries(Object.entries(days).map(([k, v]) => [k, { code: v }])),
  summary: { totalHC: 0, present: 0, paidLeave: 0, unpaidLeave: 0, sick: 0, holiday: 0, byCode: {}, unknownCodes: [] },
  status: 'published', confirmation: { status: 'pending' }, feedback: [], source: 'excel', createdAt: '', createdBy: '',
});

describe('daysFromApprovedLeaves', () => {
  it('bung đơn phép nhiều ngày thành mã P trong kỳ', () => {
    const d = daysFromApprovedLeaves([leave({ startDate: '2026-06-03', endDate: '2026-06-05' })], 'e1', '2026-06');
    expect(Object.keys(d).sort()).toEqual(['2026-06-03', '2026-06-04', '2026-06-05']);
    expect(d['2026-06-04'].code).toBe('P');
  });

  it('đơn không lương → CP, ốm → O', () => {
    const d = daysFromApprovedLeaves([
      leave({ id: 'a', type: 'unpaid', startDate: '2026-06-10', endDate: '2026-06-10' }),
      leave({ id: 'b', type: 'sick', startDate: '2026-06-11', endDate: '2026-06-11' }),
    ], 'e1', '2026-06');
    expect(d['2026-06-10'].code).toBe('CP');
    expect(d['2026-06-11'].code).toBe('O');
  });

  it('đơn phép nửa ngày → P/2', () => {
    const d = daysFromApprovedLeaves([leave({ startDate: '2026-06-12', endDate: '2026-06-12', days: 0.5 })], 'e1', '2026-06');
    expect(d['2026-06-12'].code).toBe('P/2');
  });

  it('bỏ đơn chưa duyệt, đơn của người khác, ngày ngoài kỳ', () => {
    const d = daysFromApprovedLeaves([
      leave({ id: 'p', status: 'pending', startDate: '2026-06-01', endDate: '2026-06-02' }),
      leave({ id: 'x', employeeId: 'e2', startDate: '2026-06-01', endDate: '2026-06-02' }),
      leave({ id: 'o', startDate: '2026-05-30', endDate: '2026-06-01' }), // chỉ 06-01 lọt kỳ
    ], 'e1', '2026-06');
    expect(Object.keys(d)).toEqual(['2026-06-01']); // chỉ ngày trong kỳ của đơn approved đúng người
  });
});

describe('quỹ phép năm', () => {
  it('annualLeavePortion: P=1, P/2 & XP = 0.5, còn lại 0', () => {
    expect(annualLeavePortion('P')).toBe(1);
    expect(annualLeavePortion(' p/2 ')).toBe(0.5);
    expect(annualLeavePortion('XP')).toBe(0.5);
    expect(annualLeavePortion('X')).toBe(0);
    expect(annualLeavePortion('NB')).toBe(0); // nghỉ bù KHÔNG trừ phép năm
  });

  it('cộng phép năm đã dùng qua nhiều tháng, đúng người & đúng năm', () => {
    const atts = [
      att('e1', '2026-06', { '2026-06-03': 'P', '2026-06-04': 'P/2', '2026-06-05': 'X' }),
      att('e1', '2026-07', { '2026-07-01': 'P', '2026-07-02': 'XP' }),
      att('e2', '2026-06', { '2026-06-03': 'P' }),          // người khác
      att('e1', '2025-06', { '2025-06-03': 'P' }),          // năm khác
    ];
    expect(annualLeaveUsedInYear(atts, 'e1', '2026')).toBe(3); // 1 + 0.5 + 1 + 0.5
  });

  it('leaveBalance = hạn mức − đã dùng', () => {
    expect(leaveBalance(3.5)).toEqual({ quota: 12, used: 3.5, remaining: 8.5 });
    expect(leaveBalance(2, 10)).toEqual({ quota: 10, used: 2, remaining: 8 });
  });
});
