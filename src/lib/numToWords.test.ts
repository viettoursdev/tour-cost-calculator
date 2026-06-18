import { describe, it, expect } from 'vitest';
import { docSoVN, docTienVN } from './numToWords';

describe('docSoVN', () => {
  it('số nhỏ & đặc biệt', () => {
    expect(docSoVN(0)).toBe('không');
    expect(docSoVN(5)).toBe('năm');
    expect(docSoVN(15)).toBe('mười lăm');
    expect(docSoVN(21)).toBe('hai mươi mốt');
    expect(docSoVN(105)).toBe('một trăm lẻ năm');
  });
  it('hàng nghìn / triệu', () => {
    expect(docSoVN(1500000)).toBe('một triệu năm trăm nghìn');
    expect(docSoVN(105000000)).toBe('một trăm lẻ năm triệu');
    expect(docSoVN(2000000)).toBe('hai triệu');
  });
  it('có nhóm 0 ở giữa (kiểu kế toán)', () => {
    expect(docSoVN(1000005)).toBe('một triệu không trăm lẻ năm');
  });
  it('hàng tỷ', () => {
    expect(docSoVN(1200000000)).toBe('một tỷ hai trăm triệu');
  });
  it('âm', () => {
    expect(docSoVN(-21)).toBe('âm hai mươi mốt');
  });
});

describe('docTienVN', () => {
  it('viết hoa đầu + đồng', () => {
    expect(docTienVN(1500000)).toBe('Một triệu năm trăm nghìn đồng');
    expect(docTienVN(0)).toBe('Không đồng');
  });
});
