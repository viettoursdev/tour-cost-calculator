import { describe, it, expect } from 'vitest';
import {
  parseHM, fmtHM, computeHours, isLate, sumPeriodHours, countLateDays, withDefaults, DEFAULT_ATTENDANCE_SETTINGS,
} from './attendanceHours';
import type { AttendanceDays } from '@/types';

describe('parseHM / fmtHM', () => {
  it('phân tích giờ hợp lệ', () => {
    expect(parseHM('08:30')).toBe(510);
    expect(parseHM('8:05')).toBe(485);
    expect(parseHM('24:00')).toBeNull();
    expect(parseHM('bad')).toBeNull();
    expect(parseHM('')).toBeNull();
  });
  it('định dạng lại', () => {
    expect(fmtHM(510)).toBe('08:30');
    expect(fmtHM(485)).toBe('08:05');
  });
});

describe('computeHours', () => {
  it('trừ nghỉ trưa, làm tròn 0.25h', () => {
    expect(computeHours('08:00', '17:00', 60)).toBe(8);   // 9h − 1h
    expect(computeHours('08:00', '12:00', 0)).toBe(4);
    expect(computeHours('08:00', '11:45', 0)).toBe(3.75);
  });
  it('0 nếu thiếu hoặc ra ≤ vào', () => {
    expect(computeHours(undefined, '17:00')).toBe(0);
    expect(computeHours('17:00', '08:00')).toBe(0);
  });
});

describe('isLate', () => {
  it('muộn khi vượt chuẩn + dung sai', () => {
    expect(isLate('08:15', '08:00', 10)).toBe(true);
    expect(isLate('08:10', '08:00', 10)).toBe(false); // đúng ngưỡng
    expect(isLate('07:55', '08:00', 10)).toBe(false);
    expect(isLate(undefined, '08:00', 10)).toBe(false);
  });
});

describe('sumPeriodHours / countLateDays', () => {
  const days: AttendanceDays = {
    '2026-06-01': { code: 'X', in: '08:20', out: '17:00', hours: 7.75 },
    '2026-06-02': { code: 'X', in: '07:50', out: '17:00', hours: 8.25 },
    '2026-06-03': { code: 'P' },
  };
  it('tổng giờ', () => { expect(sumPeriodHours(days)).toBe(16); });
  it('đếm ngày muộn', () => { expect(countLateDays(days, DEFAULT_ATTENDANCE_SETTINGS)).toBe(1); });
});

describe('withDefaults', () => {
  it('gộp thiếu trường', () => {
    expect(withDefaults({ hourTracking: true }).standardStart).toBe('08:00');
    expect(withDefaults(null).hourTracking).toBe(false);
  });
});
