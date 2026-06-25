import { describe, it, expect } from 'vitest';
import { buildReminder, relevantGuests } from './visaReminders';
import type { Passenger, VisaProjectDoc } from '@/types';

const guest = (over: Partial<Passenger> = {}): Passenger => ({ id: Math.random().toString(36).slice(2), name: 'A', ...over });
const proj = (over: Partial<VisaProjectDoc> = {}): VisaProjectDoc => ({
  id: 'p', code: 'DAV-1', name: 'Đoàn Nhật', country: 'Nhật Bản', status: 'in_progress',
  mainStaff: [], supportStaff: [], documentsSummary: '', linkedQuoteId: null, linkedQuoteName: '',
  linkedProcIds: [], attachments: [], applyCount: 0, passedCount: 0, failedCount: 0, haveVisaCount: 0,
  pendingCount: 0, startDate: null, departureDate: '2026-09-30', endDate: null, milestones: [],
  applicants: [], collaborators: [], createdByUsername: '', createdByName: '', ...over,
});

describe('visaReminders', () => {
  const guests = [
    guest({ name: 'Thu', visaStatus: 'deployed', visaTimeline: [{ id: '1', label: 'Deadline', date: '2026-08-31', key: 'doc_deadline' }] }),
    guest({ name: 'Hà', visaStatus: 'collected', visaTimeline: [{ id: '2', label: 'SLTH', date: '2026-09-05', key: 'biometrics' }] }),
    guest({ name: 'Long', visaStatus: 'passed' }),
    guest({ name: 'Mai', visaStatus: 'failed', failReason: 'thiếu tài chính' }),
  ];

  it('docs: chỉ khách chưa đủ hồ sơ (deployed/collecting)', () => {
    expect(relevantGuests('docs', guests).map((g) => g.name)).toEqual(['Thu']);
    const r = buildReminder('docs', proj(), guests);
    expect(r.count).toBe(1);
    expect(r.text).toMatch(/NHẮC HỒ SƠ VISA — Đoàn Nhật đi Nhật Bản/);
    expect(r.text).toMatch(/Thu — hạn nộp: 31\/08\/2026/);
  });

  it('biometrics: khách có lịch SLTH hoặc trạng thái collected/biometrics', () => {
    expect(relevantGuests('biometrics', guests).map((g) => g.name)).toEqual(['Hà']);
    expect(buildReminder('biometrics', proj(), guests).text).toMatch(/05\/09\/2026/);
  });

  it('result: nêu đậu/rớt + lý do', () => {
    const r = buildReminder('result', proj(), guests);
    expect(r.count).toBe(2);
    expect(r.text).toMatch(/Long: ✅ ĐẬU visa/);
    expect(r.text).toMatch(/Mai: ❌ RỚT visa \(thiếu tài chính\)/);
  });
});
