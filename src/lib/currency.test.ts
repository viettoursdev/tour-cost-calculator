import { describe, it, expect } from 'vitest';
import { toOutputCurrency, fmtCurrency, fmtOutput } from './currency';

describe('toOutputCurrency', () => {
  it('returns VND unchanged when target is VND', () => {
    expect(toOutputCurrency(1_000_000, 'VND', { USD: 25_000 })).toBe(1_000_000);
  });

  it('returns VND unchanged when target rate is missing', () => {
    expect(toOutputCurrency(1_000_000, 'USD', {})).toBe(1_000_000);
  });

  it('divides by rate when target rate is present', () => {
    expect(toOutputCurrency(1_000_000, 'USD', { USD: 25_000 })).toBe(40);
  });
});

describe('fmtCurrency', () => {
  it('formats VND with vi-VN grouping and ₫ suffix', () => {
    expect(fmtCurrency(1_234_567, 'VND')).toBe('1.234.567 ₫');
  });

  it('formats JPY with en-US grouping, no decimals, suffix', () => {
    expect(fmtCurrency(1_234_567, 'JPY')).toBe('1,234,567 JPY');
  });

  it('formats KRW with en-US grouping, no decimals, suffix', () => {
    expect(fmtCurrency(1_234_567, 'KRW')).toBe('1,234,567 KRW');
  });

  it('formats USD with 2 decimals + comma grouping + suffix', () => {
    expect(fmtCurrency(1234.5, 'USD')).toBe('1,234.50 USD');
  });
});

describe('fmtOutput', () => {
  it('returns em-dash when non-VND rate is missing', () => {
    expect(fmtOutput(1_000_000, 'USD', {})).toBe('—');
  });

  it('formats VND directly', () => {
    expect(fmtOutput(1_234_567, 'VND', {})).toBe('1.234.567 ₫');
  });

  it('converts then formats when rate is present', () => {
    expect(fmtOutput(1_000_000, 'USD', { USD: 25_000 })).toBe('40.00 USD');
  });
});
