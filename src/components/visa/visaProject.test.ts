import { describe, it, expect } from 'vitest';
import { countsFromApplicants, deadlineMeta, visaPresetKeyForCountry, VISA_PROC_PRESETS } from './constants';
import type { VisaApplicant } from '@/types';

const a = (result: VisaApplicant['result']): VisaApplicant => ({
  id: Math.random().toString(36).slice(2), name: 'X', docStatus: 'submitted', result,
});

describe('countsFromApplicants', () => {
  it('aggregates the 5 counts by result', () => {
    const list = [a('passed'), a('passed'), a('failed'), a('have_visa'), a('pending')];
    expect(countsFromApplicants(list)).toEqual({
      applyCount: 5, passedCount: 2, failedCount: 1, haveVisaCount: 1, pendingCount: 1,
    });
  });
  it('returns zeros for an empty list', () => {
    expect(countsFromApplicants([])).toEqual({
      applyCount: 0, passedCount: 0, failedCount: 0, haveVisaCount: 0, pendingCount: 0,
    });
  });
  it('does not count a cancelled applicant (visaStatus) as pending', () => {
    const list: VisaApplicant[] = [
      { id: '1', name: 'A', docStatus: 'missing', result: 'pending', visaStatus: 'cancelled' },
      { id: '2', name: 'B', docStatus: 'submitted', result: 'pending', visaStatus: 'collecting' },
    ];
    expect(countsFromApplicants(list)).toEqual({
      applyCount: 2, passedCount: 0, failedCount: 0, haveVisaCount: 0, pendingCount: 1,
    });
  });
});

describe('visaPresetKeyForCountry', () => {
  it('maps các nước về đúng mẫu (không phụ thuộc dấu/hoa thường)', () => {
    expect(visaPresetKeyForCountry('Hàn Quốc')).toBe('korea');
    expect(visaPresetKeyForCountry('han quoc')).toBe('korea');
    expect(visaPresetKeyForCountry('Nhật Bản')).toBe('japan');
    expect(visaPresetKeyForCountry('Pháp')).toBe('schengen');
    expect(visaPresetKeyForCountry('Đức')).toBe('schengen');
    expect(visaPresetKeyForCountry('Mỹ')).toBe('usa');
    expect(visaPresetKeyForCountry('Đài Loan')).toBe('taiwan');
    expect(visaPresetKeyForCountry('Trung Quốc')).toBe('china');
    expect(visaPresetKeyForCountry('Úc')).toBe('anz');
  });
  it('rỗng / không nhận diện → default', () => {
    expect(visaPresetKeyForCountry('')).toBe('default');
    expect(visaPresetKeyForCountry(null)).toBe('default');
    expect(visaPresetKeyForCountry('Sao Hỏa')).toBe('default');
  });
  it('mọi khoá mẫu đều tồn tại trong VISA_PROC_PRESETS', () => {
    const keys = new Set(VISA_PROC_PRESETS.map((p) => p.key));
    for (const c of ['Hàn Quốc', 'Pháp', 'Mỹ', 'Đài Loan', 'Trung Quốc', 'Úc', 'Anh']) {
      expect(keys.has(visaPresetKeyForCountry(c))).toBe(true);
    }
    expect(VISA_PROC_PRESETS.every((p) => p.steps.length > 0)).toBe(true);
  });
});

describe('deadlineMeta', () => {
  it('marks done milestones complete', () => {
    expect(deadlineMeta('2026-01-01', true).text).toBe('✓ Hoàn tất');
  });
  it('flags a missing date', () => {
    expect(deadlineMeta(null, false).text).toBe('Chưa đặt ngày');
  });
  it('reports overdue for a past date', () => {
    expect(deadlineMeta('2000-01-01', false).text).toMatch(/^Quá hạn/);
  });
});
