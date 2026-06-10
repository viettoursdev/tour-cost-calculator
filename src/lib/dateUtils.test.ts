import { describe, it, expect } from 'vitest';
import { calcEndDate, fmtDate } from './dateUtils';

describe('calcEndDate', () => {
  it('returns null when startDate is null', () => {
    expect(calcEndDate(null, 5)).toBeNull();
  });

  it('returns null when startDate is undefined', () => {
    expect(calcEndDate(undefined, 5)).toBeNull();
  });

  it('returns the same day when days = 1', () => {
    const end = calcEndDate('2026-06-10', 1);
    expect(end?.toISOString().slice(0, 10)).toBe('2026-06-10');
  });

  it('adds days - 1 to the start date', () => {
    const end = calcEndDate('2026-06-10', 5);
    expect(end?.toISOString().slice(0, 10)).toBe('2026-06-14');
  });

  it('clamps negative days to 0 (same day)', () => {
    const end = calcEndDate('2026-06-10', -3);
    expect(end?.toISOString().slice(0, 10)).toBe('2026-06-10');
  });
});

describe('fmtDate', () => {
  it('returns empty string for null', () => {
    expect(fmtDate(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(fmtDate(undefined)).toBe('');
  });

  it('formats vi-VN by default', () => {
    expect(fmtDate('2026-06-10')).toMatch(/^10\/0?6\/2026$/);
  });

  it('formats en-GB when en=true', () => {
    expect(fmtDate('2026-06-10', true)).toMatch(/^10\/0?6\/2026$/);
  });

  it('accepts a Date instance', () => {
    expect(fmtDate(new Date('2026-06-10'))).toMatch(/^10\/0?6\/2026$/);
  });
});
