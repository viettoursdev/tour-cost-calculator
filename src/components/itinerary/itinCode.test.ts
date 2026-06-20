import { describe, it, expect } from 'vitest';
import { generateItinCode, nextItinSeqToday, dayLabel, vnDateToISO, isoToVNDate, weekdayVN } from './itinCode';

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

describe('dayLabel', () => {
  it('bắt đầu từ 1 (mặc định) hoặc 0', () => {
    expect(dayLabel(1, 1)).toBe(1);
    expect(dayLabel(3, undefined)).toBe(3);
    expect(dayLabel(1, 0)).toBe(0);
    expect(dayLabel(3, 0)).toBe(2);
  });
});

describe('date helpers', () => {
  it('vnDateToISO / isoToVNDate', () => {
    expect(vnDateToISO('20/06/2026')).toBe('2026-06-20');
    expect(vnDateToISO('5/6/2026')).toBe('2026-06-05');
    expect(vnDateToISO('bậy')).toBe('');
    expect(isoToVNDate('2026-06-20')).toBe('20/06/2026');
  });
  it('weekdayVN', () => {
    expect(weekdayVN('20/06/2026')).toBe('Thứ Bảy');
    expect(weekdayVN('')).toBe('');
  });
});
