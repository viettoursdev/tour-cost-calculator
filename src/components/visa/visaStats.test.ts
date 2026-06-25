import { describe, it, expect } from 'vitest';
import { avgProcessingDays, passRate, tallyByStaff } from './visaStats';
import type { VisaApplicant, VisaProjectDoc } from '@/types';

const ap = (o: Partial<VisaApplicant>): VisaApplicant => ({ id: Math.random().toString(36).slice(2), name: 'x', docStatus: 'submitted', result: 'pending', ...o });

const proj = (over: Partial<VisaProjectDoc>): VisaProjectDoc => ({
  id: Math.random().toString(36).slice(2), code: 'D', name: 'X', country: 'Hàn Quốc', status: 'in_progress',
  mainStaff: [], supportStaff: [], documentsSummary: '', linkedQuoteId: null, linkedQuoteName: '',
  linkedProcIds: [], attachments: [], applyCount: 0, passedCount: 0, failedCount: 0, haveVisaCount: 0,
  pendingCount: 0, startDate: null, departureDate: null, endDate: null, milestones: [], applicants: [],
  collaborators: [], createdByUsername: '', createdByName: '', ...over,
});

describe('visaStats', () => {
  it('tallyByStaff: gộp theo nhân viên + xếp theo tỷ lệ đậu', () => {
    const ps = [
      proj({ mainStaff: ['an'], applicants: [ap({ visaStatus: 'passed' }), ap({ visaStatus: 'failed' })] }),
      proj({ mainStaff: ['binh'], applicants: [ap({ visaStatus: 'passed' }), ap({ visaStatus: 'passed' })] }),
    ];
    const r = tallyByStaff(ps);
    expect(r[0].username).toBe('binh');        // 100% trước
    expect(passRate(r[0].t)).toBe(100);
    expect(passRate(r.find((x) => x.username === 'an')!.t)).toBe(50);
  });

  it('huỷ không tính vào tổng', () => {
    const r = tallyByStaff([proj({ mainStaff: ['an'], applicants: [ap({ visaStatus: 'passed' }), ap({ visaStatus: 'cancelled' })] })]);
    expect(r[0].t.total).toBe(1);
  });

  it('avgProcessingDays: trung bình deploy→expected', () => {
    const ps = [proj({ applicants: [
      ap({ timeline: [{ id: 'x', label: 'TK', date: '2026-08-01', key: 'deploy' }, { id: 'y', label: 'DK', date: '2026-08-21', key: 'expected' }] }),
      ap({ timeline: [{ id: 'x', label: 'TK', date: '2026-08-01', key: 'deploy' }, { id: 'y', label: 'DK', date: '2026-08-11', key: 'expected' }] }),
    ] })];
    const r = avgProcessingDays(ps);
    expect(r.n).toBe(2);
    expect(r.avg).toBe(15); // (20 + 10)/2
  });
});
