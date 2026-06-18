import { describe, it, expect } from 'vitest';
import { parseAmountVN } from './numParse';

describe('parseAmountVN', () => {
  it('bỏ dấu phân tách nghìn', () => {
    expect(parseAmountVN('1.500.000')).toBe(1500000);
    expect(parseAmountVN('1,500,000')).toBe(1500000);
    expect(parseAmountVN('1 500 000')).toBe(1500000);
    expect(parseAmountVN('250000')).toBe(250000);
  });
  it('hậu tố k/nghìn', () => {
    expect(parseAmountVN('1500k')).toBe(1500000);
    expect(parseAmountVN('250 nghìn')).toBe(250000);
  });
  it('hậu tố tr/triệu/m + thập phân đuôi', () => {
    expect(parseAmountVN('1tr')).toBe(1000000);
    expect(parseAmountVN('1tr5')).toBe(1500000);
    expect(parseAmountVN('1.5tr')).toBe(1500000);
    expect(parseAmountVN('2m')).toBe(2000000);
    expect(parseAmountVN('1tr25')).toBe(1250000);
  });
  it('hậu tố tỷ', () => {
    expect(parseAmountVN('1tỷ')).toBe(1000000000);
    expect(parseAmountVN('1tỷ2')).toBe(1200000000);
  });
  it('thập phân không hậu tố & rỗng', () => {
    expect(parseAmountVN('12.5')).toBe(12.5);
    expect(parseAmountVN('')).toBe(0);
    expect(parseAmountVN(2500000)).toBe(2500000);
  });
});
