import { describe, it, expect } from 'vitest';
import {
  addDaysISO, effectiveValidUntil, isoDate, validityStatus, fmtDateVN, DEFAULT_VALID_DAYS,
} from './quoteValidity';

describe('quoteValidity', () => {
  it('isoDate formats local Y-M-D zero-padded', () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(isoDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('addDaysISO adds days across month boundary', () => {
    expect(addDaysISO('2026-06-25', 7)).toBe('2026-07-02');
    expect(addDaysISO('2026-06-25T08:30:00.000Z', 0)).toMatch(/^2026-06-2[56]$/);
  });

  it('effectiveValidUntil uses explicit when present, else base + default', () => {
    expect(effectiveValidUntil('2026-08-01', '2026-06-25')).toBe('2026-08-01');
    expect(effectiveValidUntil(undefined, '2026-06-25')).toBe(addDaysISO('2026-06-25', DEFAULT_VALID_DAYS));
    expect(effectiveValidUntil('', '2026-06-25')).toBe(addDaysISO('2026-06-25', DEFAULT_VALID_DAYS));
  });

  it('validityStatus computes daysLeft and expiry by day', () => {
    const now = new Date(2026, 5, 25); // 25/06/2026
    expect(validityStatus('2026-06-30', now)).toEqual({ validUntil: '2026-06-30', expired: false, daysLeft: 5 });
    expect(validityStatus('2026-06-25', now)).toEqual({ validUntil: '2026-06-25', expired: false, daysLeft: 0 });
    expect(validityStatus('2026-06-24', now)).toEqual({ validUntil: '2026-06-24', expired: true, daysLeft: -1 });
  });

  it('fmtDateVN converts ISO date to DD/MM/YYYY, tolerates empty', () => {
    expect(fmtDateVN('2026-07-02')).toBe('02/07/2026');
    expect(fmtDateVN('2026-07-02T10:00:00')).toBe('02/07/2026');
    expect(fmtDateVN('')).toBe('');
    expect(fmtDateVN(undefined)).toBe('');
    expect(fmtDateVN('garbage')).toBe('');
  });
});
