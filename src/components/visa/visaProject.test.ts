import { describe, it, expect } from 'vitest';
import { countsFromApplicants, deadlineMeta } from './constants';
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
