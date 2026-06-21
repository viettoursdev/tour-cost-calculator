import { describe, it, expect } from 'vitest';
import { toISODate, parseDocJson } from './passportScan';

describe('toISODate', () => {
  it('giữ nguyên yyyy-mm-dd, đổi dd/mm/yyyy và dd MMM yyyy', () => {
    expect(toISODate('2026-11-15')).toBe('2026-11-15');
    expect(toISODate('15/11/2026')).toBe('2026-11-15');
    expect(toISODate('5-3-2026')).toBe('2026-03-05');
    expect(toISODate('15 NOV 2026')).toBe('2026-11-15');
    expect(toISODate('khong ro')).toBe('');
    expect(toISODate('')).toBe('');
  });
});

describe('parseDocJson', () => {
  it('lấy JSON, chuẩn hoá gender + ngày + IN HOA số HC', () => {
    const reply = 'Đây là kết quả:\n{ "fullName": "NGUYEN VAN A", "gender": "m", "dob": "01/02/1990", '
      + '"nationality": "Vietnam", "passportNo": "c1234567", "passportExpiry": "20 OCT 2030", '
      + '"visaCountry": "Japan", "visaExpiry": "2027-01-15", "visaEntries": "nhiều lần" }';
    const d = parseDocJson(reply);
    expect(d).toMatchObject({
      fullName: 'NGUYEN VAN A', gender: 'M', dob: '1990-02-01', nationality: 'Vietnam',
      passportNo: 'C1234567', passportExpiry: '2030-10-20', visaCountry: 'Japan',
      visaExpiry: '2027-01-15', visaEntries: 'nhiều lần',
    });
  });

  it('không có JSON → object rỗng; gender lạ → ""', () => {
    expect(parseDocJson('không có gì')).toEqual({});
    expect(parseDocJson('{"gender":"X"}').gender).toBe('');
  });
});
