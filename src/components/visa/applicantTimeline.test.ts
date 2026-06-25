import { describe, it, expect } from 'vitest';
import {
  APPLICANT_TIMELINE_OFFSET, applyTimelineFromDeparture, defaultApplicantTimeline, deriveVisaStatus,
  isApplicantOverdue,
} from './constants';

describe('applyTimelineFromDeparture', () => {
  it('điền các mốc chuẩn còn trống tính ngược từ ngày khởi hành', () => {
    const out = applyTimelineFromDeparture(defaultApplicantTimeline('2026-09-30'), '2026-09-30', false);
    const byKey = Object.fromEntries(out.filter((m) => m.key).map((m) => [m.key, m.date]));
    expect(byKey.departure).toBe('2026-09-30');
    expect(byKey.expected).toBe('2026-09-23');     // -7
    expect(byKey.doc_deadline).toBe('2026-08-31'); // -30
    expect(byKey.deploy).toBe('2026-08-01');       // -60
  });

  it('overwrite=false giữ ngày đã nhập tay', () => {
    const tl = defaultApplicantTimeline('2026-09-30');
    tl.find((m) => m.key === 'doc_deadline')!.date = '2026-09-10';
    const out = applyTimelineFromDeparture(tl, '2026-09-30', false);
    expect(out.find((m) => m.key === 'doc_deadline')!.date).toBe('2026-09-10');
  });

  it('overwrite=true ghi đè tất cả mốc chuẩn', () => {
    const tl = defaultApplicantTimeline('2026-09-30');
    tl.find((m) => m.key === 'doc_deadline')!.date = '2026-09-10';
    const out = applyTimelineFromDeparture(tl, '2026-09-30', true);
    expect(out.find((m) => m.key === 'doc_deadline')!.date).toBe('2026-08-31');
  });

  it('giữ nguyên mốc tuỳ biến; không có ngày khởi hành → trả nguyên', () => {
    const tl = [...defaultApplicantTimeline('2026-09-30'), { id: 'x', label: 'Bổ sung', date: '2026-07-01' }];
    const out = applyTimelineFromDeparture(tl, '2026-09-30', true);
    expect(out.find((m) => m.id === 'x')!.date).toBe('2026-07-01');
    expect(applyTimelineFromDeparture(tl, null, true)).toBe(tl);
  });

  it('offset mặc định hợp lệ + derive/overdue vẫn nhất quán', () => {
    expect(APPLICANT_TIMELINE_OFFSET.deploy).toBeGreaterThan(APPLICANT_TIMELINE_OFFSET.doc_deadline);
    expect(deriveVisaStatus({ visaStatus: 'biometrics' })).toBe('biometrics');
    expect(isApplicantOverdue({ visaStatus: 'passed', timeline: [{ id: 'a', label: 'x', date: '2000-01-01' }] })).toBe(false);
    expect(isApplicantOverdue({ visaStatus: 'collecting', timeline: [{ id: 'a', label: 'x', date: '2000-01-01' }] })).toBe(true);
  });
});
