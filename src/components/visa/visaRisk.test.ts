import { describe, it, expect } from 'vitest';
import { countryApprovalRates, applicantRisk, deadlineRadar, projectRiskSummary } from './visaRisk';
import type { VisaApplicant, VisaProjectDoc } from '@/types';

const app = (p: Partial<VisaApplicant>): VisaApplicant =>
  ({ id: 'a', name: 'A', docStatus: 'submitted', result: 'pending', ...p }) as VisaApplicant;

const proj = (p: Partial<VisaProjectDoc>): VisaProjectDoc =>
  ({
    id: 'p', code: 'V1', name: 'Dự án', country: 'Mỹ', status: 'planning',
    passedCount: 0, failedCount: 0, haveVisaCount: 0, applyCount: 0, pendingCount: 0,
    startDate: null, endDate: null, milestones: [], applicants: [],
    mainStaff: [], supportStaff: [], documentsSummary: '', linkedQuoteId: null,
    linkedQuoteName: '', linkedProcIds: [], attachments: [], collaborators: [],
    createdByUsername: '', createdByName: '',
    ...p,
  }) as VisaProjectDoc;

const NOW = Date.parse('2026-06-01');
const inDays = (d: number) => new Date(NOW + d * 86_400_000).toISOString().slice(0, 10);

describe('countryApprovalRates', () => {
  it('gom tỷ lệ đậu từ kết quả khách', () => {
    const ps = [proj({
      country: 'Mỹ',
      applicants: [app({ result: 'passed' }), app({ result: 'have_visa' }), app({ result: 'failed' }), app({ result: 'pending' })],
    })];
    const r = countryApprovalRates(ps);
    expect(r.get('Mỹ')).toEqual({ rate: 2 / 3, n: 3 }); // pending không tính
  });

  it('fallback dùng số liệu tổng dự án khi không có danh sách khách', () => {
    const ps = [proj({ country: 'Nhật', applicants: [], passedCount: 7, haveVisaCount: 1, failedCount: 2 })];
    expect(r2(ps).rate).toBeCloseTo(8 / 10);
  });
  const r2 = (ps: VisaProjectDoc[]) => countryApprovalRates(ps).get('Nhật')!;
});

describe('applicantRisk', () => {
  const rates = new Map([['Mỹ', { rate: 0.4, n: 50 }], ['Nhật', { rate: 0.95, n: 50 }]]);

  it('đã đậu / có visa → rủi ro 0', () => {
    expect(applicantRisk(app({ result: 'passed' }), proj({}), rates, { now: NOW }).score).toBe(0);
    expect(applicantRisk(app({ result: 'have_visa' }), proj({}), rates, { now: NOW }).band).toBe('an toàn');
  });

  it('đã rớt → rủi ro 100', () => {
    expect(applicantRisk(app({ result: 'failed' }), proj({}), rates, { now: NOW }).score).toBe(100);
  });

  it('nước tỷ lệ thấp + hồ sơ thiếu + cận khởi hành → rủi ro cao', () => {
    const r = applicantRisk(
      app({ docStatus: 'missing', visaStatus: 'collecting' }),
      proj({ country: 'Mỹ', departureDate: inDays(10) }),
      rates, { now: NOW },
    );
    expect(r.band).toBe('rủi ro cao');
    expect(r.score).toBeGreaterThan(66);
  });

  it('nước tỷ lệ cao + hồ sơ đủ → an toàn hơn nước rủi ro', () => {
    const safe = applicantRisk(app({ docStatus: 'complete' }), proj({ country: 'Nhật', departureDate: inDays(90) }), rates, { now: NOW });
    const risky = applicantRisk(app({ docStatus: 'complete' }), proj({ country: 'Mỹ', departureDate: inDays(90) }), rates, { now: NOW });
    expect(safe.score).toBeLessThan(risky.score);
  });
});

describe('deadlineRadar', () => {
  it('lấy mốc chưa done trong cửa sổ, quá hạn xếp trước', () => {
    const ps = [proj({
      name: 'Dự án Mỹ',
      milestones: [
        { id: '1', label: 'Nộp hồ sơ', date: inDays(-3), done: false },   // quá hạn
        { id: '2', label: 'Phỏng vấn', date: inDays(10), done: false },   // sắp tới
        { id: '3', label: 'Đã nộp', date: inDays(5), done: true },        // done → bỏ
        { id: '4', label: 'Xa', date: inDays(90), done: false },          // ngoài cửa sổ
      ],
    })];
    const r = deadlineRadar(ps, { now: NOW, windowDays: 30 });
    expect(r.map((x) => x.label)).toEqual(['Nộp hồ sơ', 'Phỏng vấn']);
    expect(r[0].overdue).toBe(true);
  });

  it('bỏ qua dự án đã huỷ/hoàn tất', () => {
    const ps = [proj({ status: 'cancelled', milestones: [{ id: '1', label: 'X', date: inDays(2), done: false }] })];
    expect(deadlineRadar(ps, { now: NOW })).toHaveLength(0);
  });
});

describe('projectRiskSummary', () => {
  it('đếm khách rủi ro (bỏ khách đã có kết quả)', () => {
    const rates = new Map([['Mỹ', { rate: 0.3, n: 40 }]]);
    const p = proj({
      country: 'Mỹ', departureDate: inDays(10),
      applicants: [
        app({ result: 'passed' }),                                  // resolved → bỏ
        app({ docStatus: 'missing', visaStatus: 'collecting' }),    // rủi ro
        app({ docStatus: 'complete' }),                             // an toàn hơn
      ],
    });
    const s = projectRiskSummary(p, rates, { now: NOW });
    expect(s.total).toBe(2);
    expect(s.atRisk).toBeGreaterThanOrEqual(1);
    expect(s.maxScore).toBeGreaterThan(0);
  });
});
