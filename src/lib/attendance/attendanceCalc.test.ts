import { describe, it, expect } from 'vitest';
import type { AttendanceDays } from '@/types';
import {
  summarizeAttendance,
  isValidPeriod,
  daysInMonth,
  periodDays,
  isoWeekday,
  isWeekend,
  weekdayLabelVN,
  periodLabelVN,
} from './attendanceCalc';
import { lookupCode, normalizeCode } from './attendanceCodes';

const cells = (...codes: string[]): AttendanceDays =>
  Object.fromEntries(codes.map((code, i) => [`2026-06-${String(i + 1).padStart(2, '0')}`, { code }]));

describe('summarizeAttendance', () => {
  it('cộng đủ công cho ngày đi làm', () => {
    const s = summarizeAttendance(cells('X', 'X', 'X'));
    expect(s.totalHC).toBe(3);
    expect(s.present).toBe(3);
    expect(s.byCode.X).toBe(3);
  });

  it('phân loại nghỉ phép / không lương / ốm / lễ', () => {
    const s = summarizeAttendance(cells('X', 'P', 'CP', 'O', 'Lễ', 'KP'));
    expect(s.paidLeave).toBe(1); // P
    expect(s.unpaidLeave).toBe(2); // CP + KP
    expect(s.sick).toBe(1); // O
    expect(s.holiday).toBe(1); // Lễ
    // totalHC: X(1)+P(1)+CP(0)+O(0)+Lễ(1)+KP(0) = 3
    expect(s.totalHC).toBe(3);
  });

  it('cộng đúng nửa công (XB, KC/2) không sai số dấu phẩy', () => {
    const s = summarizeAttendance(cells('XB', 'XB', 'KC/2'));
    // XB(0.5)+XB(0.5)+KC/2(0.5) = 1.5
    expect(s.totalHC).toBe(1.5);
  });

  it('bỏ qua ô trống và gom mã lạ vào unknownCodes', () => {
    const days: AttendanceDays = {
      '2026-06-01': { code: 'X' },
      '2026-06-02': { code: '' },
      '2026-06-03': { code: 'ZZZ' },
      '2026-06-04': { code: '00:00:00' },
    };
    const s = summarizeAttendance(days);
    expect(s.totalHC).toBe(1);
    expect(s.unknownCodes).toContain('ZZZ');
    expect(s.unknownCodes).toContain('00:00:00');
    expect(s.unknownCodes).not.toContain('X');
  });

  it('không tính công cho mã lạ', () => {
    const s = summarizeAttendance(cells('WTF'));
    expect(s.totalHC).toBe(0);
    expect(s.present).toBe(0);
  });

  it('khớp ví dụ thực tế: 19.5 công khi có 1 ngày phép nửa', () => {
    // 19 ngày X + 1 ngày P/2 (0.5) = 19.5
    const codes = Array.from({ length: 19 }, () => 'X');
    codes.push('P/2');
    const s = summarizeAttendance(cells(...codes));
    expect(s.totalHC).toBe(19.5);
  });
});

describe('lookupCode / normalizeCode', () => {
  it('chuẩn hoá hoa thường và khoảng trắng', () => {
    expect(normalizeCode(' x ')).toBe('X');
    expect(lookupCode('x')?.code).toBe('X');
    expect(lookupCode(' online ')?.code).toBe('ONLINE');
  });
  it('trả undefined cho mã không có', () => {
    expect(lookupCode('???')).toBeUndefined();
    expect(lookupCode(null)).toBeUndefined();
  });
});

describe('period helpers', () => {
  it('isValidPeriod', () => {
    expect(isValidPeriod('2026-06')).toBe(true);
    expect(isValidPeriod('2026-13')).toBe(false);
    expect(isValidPeriod('2026-6')).toBe(false);
    expect(isValidPeriod('xxxx')).toBe(false);
  });

  it('daysInMonth xử lý tháng 30/31 và năm nhuận', () => {
    expect(daysInMonth('2026-06')).toBe(30);
    expect(daysInMonth('2026-07')).toBe(31);
    expect(daysInMonth('2024-02')).toBe(29); // nhuận
    expect(daysInMonth('2026-02')).toBe(28);
  });

  it('periodDays liệt kê đủ ngày', () => {
    const d = periodDays('2026-06');
    expect(d).toHaveLength(30);
    expect(d[0]).toBe('2026-06-01');
    expect(d[29]).toBe('2026-06-30');
    expect(periodDays('bad')).toEqual([]);
  });

  it('isoWeekday / isWeekend / weekdayLabelVN', () => {
    // 2026-06-01 là Thứ Hai
    expect(isoWeekday('2026-06-01')).toBe(1);
    expect(weekdayLabelVN('2026-06-01')).toBe('T2');
    expect(isWeekend('2026-06-01')).toBe(false);
    // 2026-06-07 là Chủ Nhật
    expect(weekdayLabelVN('2026-06-07')).toBe('CN');
    expect(isWeekend('2026-06-07')).toBe(true);
    // 2026-06-06 là Thứ Bảy
    expect(isWeekend('2026-06-06')).toBe(true);
  });

  it('periodLabelVN', () => {
    expect(periodLabelVN('2026-06')).toBe('Tháng 6/2026');
    expect(periodLabelVN('bad')).toBe('bad');
  });
});
