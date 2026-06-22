import { describe, it, expect } from 'vitest';
import { computeVisaAlerts, projectAlerts, alertCounts } from './visaAlerts';
import type { VisaApplicant, VisaMilestone, VisaProjectDoc } from '@/types';

const TODAY = '2026-06-23';

const appl = (over: Partial<VisaApplicant> = {}): VisaApplicant => ({
  id: Math.random().toString(36).slice(2), name: 'X', docStatus: 'submitted', result: 'pending', ...over,
});
const ms = (label: string, date: string | null, done = false): VisaMilestone => ({
  id: Math.random().toString(36).slice(2), label, date, done,
});
const proj = (over: Partial<VisaProjectDoc> = {}): VisaProjectDoc => ({
  id: 'p1', code: 'DAV-1', name: 'Đoàn HQ', country: 'Hàn Quốc', status: 'in_progress',
  mainStaff: [], supportStaff: [], documentsSummary: '',
  linkedQuoteId: null, linkedQuoteName: '', linkedProcIds: [], attachments: [],
  applyCount: 0, passedCount: 0, failedCount: 0, haveVisaCount: 0, pendingCount: 0,
  startDate: null, departureDate: null, endDate: null, milestones: [], applicants: [],
  collaborators: [], createdByUsername: '', createdByName: '',
  ...over,
});

describe('projectAlerts — hộ chiếu', () => {
  it('cảnh báo khi hộ chiếu hiệu lực < 6 tháng sau ngày khởi hành', () => {
    const p = proj({ departureDate: '2026-09-01', applicants: [appl({ passportExpiry: '2026-10-01' })] });
    const a = projectAlerts(p, TODAY).find((x) => x.kind === 'passport');
    expect(a).toBeTruthy();
  });
  it('hộ chiếu còn dư 6 tháng → không cảnh báo', () => {
    const p = proj({ departureDate: '2026-09-01', applicants: [appl({ passportExpiry: '2027-06-01' })] });
    expect(projectAlerts(p, TODAY).some((x) => x.kind === 'passport')).toBe(false);
  });
  it('hộ chiếu hết hạn TRƯỚC chuyến đi → mức cao', () => {
    const p = proj({ departureDate: '2026-09-01', applicants: [appl({ passportExpiry: '2026-08-01' })] });
    const a = projectAlerts(p, TODAY).find((x) => x.kind === 'passport');
    expect(a?.severity).toBe('high');
  });
});

describe('projectAlerts — mốc trễ hạn', () => {
  it('mốc chưa xong có ngày đã qua → cảnh báo', () => {
    const p = proj({ milestones: [ms('Nộp hồ sơ', '2026-06-01'), ms('Khởi hành', '2026-12-01')] });
    const a = projectAlerts(p, TODAY).find((x) => x.kind === 'milestone');
    expect(a?.message).toMatch(/1 mốc trễ hạn/);
  });
  it('mốc trễ đã đánh dấu xong → bỏ qua', () => {
    const p = proj({ milestones: [ms('Nộp hồ sơ', '2026-06-01', true)] });
    expect(projectAlerts(p, TODAY).some((x) => x.kind === 'milestone')).toBe(false);
  });
});

describe('projectAlerts — hồ sơ thiếu & dự án kẹt', () => {
  it('thiếu hồ sơ + khởi hành trong 30 ngày → cao', () => {
    const p = proj({ departureDate: '2026-07-10', applicants: [appl({ docStatus: 'missing' })] });
    const a = projectAlerts(p, TODAY).find((x) => x.kind === 'docs');
    expect(a?.severity).toBe('high');
  });
  it('thiếu hồ sơ nhưng còn xa ngày đi → không cảnh báo docs', () => {
    const p = proj({ departureDate: '2026-12-01', applicants: [appl({ docStatus: 'missing' })] });
    expect(projectAlerts(p, TODAY).some((x) => x.kind === 'docs')).toBe(false);
  });
  it('sắp đi mà vẫn "planning" → kẹt mức cao', () => {
    const p = proj({ status: 'planning', departureDate: '2026-07-10' });
    expect(projectAlerts(p, TODAY).find((x) => x.kind === 'stuck')?.severity).toBe('high');
  });
  it('planning còn 45 ngày → kẹt mức trung bình', () => {
    const p = proj({ status: 'planning', departureDate: '2026-08-05' });
    expect(projectAlerts(p, TODAY).find((x) => x.kind === 'stuck')?.severity).toBe('medium');
  });
});

describe('projectAlerts — trạng thái kết thúc', () => {
  it('completed / cancelled → không cảnh báo gì', () => {
    const base = { departureDate: '2026-07-01', applicants: [appl({ docStatus: 'missing', passportExpiry: '2026-07-02' })], milestones: [ms('Nộp', '2026-06-01')] };
    expect(projectAlerts(proj({ ...base, status: 'completed' }), TODAY)).toEqual([]);
    expect(projectAlerts(proj({ ...base, status: 'cancelled' }), TODAY)).toEqual([]);
  });
});

describe('computeVisaAlerts + alertCounts', () => {
  it('gộp nhiều dự án, xếp high trước medium', () => {
    const high = proj({ id: 'h', status: 'planning', departureDate: '2026-07-10' });
    const medium = proj({ id: 'm', status: 'planning', departureDate: '2026-08-05' });
    const list = computeVisaAlerts([medium, high], TODAY);
    expect(list[0].severity).toBe('high');
    const c = alertCounts(list);
    expect(c.total).toBe(2);
    expect(c.high).toBe(1);
    expect(c.medium).toBe(1);
  });
});
