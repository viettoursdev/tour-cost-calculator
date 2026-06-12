import { describe, it, expect } from 'vitest';
import { calcEndDate, fmtDate, daysUntil } from './dateUtils';

describe('daysUntil', () => {
  it('returns null for missing/invalid input', () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil(undefined)).toBeNull();
    expect(daysUntil('not-a-date')).toBeNull();
  });
  it('returns 0 for today', () => {
    expect(daysUntil(new Date())).toBe(0);
  });
  it('is positive in the future, negative in the past', () => {
    const plus3 = new Date(); plus3.setDate(plus3.getDate() + 3);
    const minus2 = new Date(); minus2.setDate(minus2.getDate() - 2);
    expect(daysUntil(plus3)).toBe(3);
    expect(daysUntil(minus2)).toBe(-2);
  });
});

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
