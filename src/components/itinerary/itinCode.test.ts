import { describe, it, expect } from 'vitest';
import { generateItinCode, nextItinSeqToday } from './itinCode';

const D = new Date(2026, 5, 20); // 20/06/2026 (tháng 0-based)

describe('generateItinCode', () => {
  it('định dạng NN.MY.STT.DD.MM.YY', () => {
    expect(generateItinCode('NN', 'MY', 1, D)).toBe('NN.MY.01.20.06.26');
    expect(generateItinCode('ND', 'VN', 12, D)).toBe('ND.VN.12.20.06.26');
  });
  it('STT đệm 2 chữ số, fallback type/continent', () => {
    expect(generateItinCode('', '', 0, D)).toBe('NN.CA.01.20.06.26');
  });
});

describe('nextItinSeqToday', () => {
  it('đếm mã cùng loại+châu lục tạo trong ngày rồi +1', () => {
    const codes = ['NN.MY.01.20.06.26', 'NN.MY.02.20.06.26', 'ND.VN.01.20.06.26'];
    expect(nextItinSeqToday(codes, 'NN', 'MY', D)).toBe(3);
    expect(nextItinSeqToday(codes, 'ND', 'VN', D)).toBe(2);
  });
  it('không tính mã ngày khác', () => {
    const codes = ['NN.MY.01.19.06.26', 'NN.MY.05.21.06.26'];
    expect(nextItinSeqToday(codes, 'NN', 'MY', D)).toBe(1);
  });
});
