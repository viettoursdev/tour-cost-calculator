import { describe, it, expect } from 'vitest';
import { parseReview, numericChecks } from './contractReview';
import type { Contract } from '@/types';

const base: Contract = {
  id: 'c1', contractNo: 'HD-1', contractDate: '', contractStatus: 'draft',
  tourName: 'T', tourDest: 'X', tourDays: 3, tourNights: 2, tourStartDate: '2026-07-01',
  departure: 'HN', contractPax: 10, pricePerPax: 1000000,
  partyB: { name: '', address: '', tel: '', rep: '', title: '', taxCode: '', email: '' },
  includes: [], excludes: [], payments: [], cancels: [], bondPercent: 0, hasAcceptance: false, createdAt: '', createdBy: '',
} as Contract;

describe('parseReview', () => {
  it('tách JSON kể cả khi có chữ/fence quanh', () => {
    const r = parseReview('Đây là kết quả:\n```json\n{"summary":"ok","findings":[]}\n```');
    expect(r).toEqual({ summary: 'ok', findings: [] });
  });
  it('trả null nếu không phải JSON hợp lệ', () => {
    expect(parseReview('không có gì')).toBeNull();
    expect(parseReview('{"summary":1}')).toBeNull();
  });
});

describe('numericChecks', () => {
  it('cảnh báo khi tổng các đợt lệch tổng HĐ', () => {
    const c = { ...base, payments: [{ id: 'p', label: 'Đợt 1', amount: 5000000, dueDate: '2026-06-01', note: '', status: 'pending' }] } as Contract;
    const checks = numericChecks(c);
    expect(checks[0].detail).toContain('10.000.000');           // tổng = 1tr × 10
    expect(checks[1].level).toBe('warn');                        // 5tr ≠ 10tr
    expect(checks[1].detail).toContain('LỆCH');
  });
  it('cảnh báo đợt thanh toán có hạn sau khởi hành', () => {
    const c = { ...base, payments: [{ id: 'p', label: 'x', amount: 10000000, dueDate: '2026-08-01', note: '', status: 'pending' }] } as Contract;
    const late = numericChecks(c).find((x) => x.label === 'Hạn thanh toán');
    expect(late?.level).toBe('warn');
  });
});
