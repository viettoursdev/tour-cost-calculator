import { describe, it, expect } from 'vitest';
import { sameGuest, matchesGuestQuery, normPassport } from './applicantMatch';

describe('normPassport', () => {
  it('uppercases and strips whitespace', () => {
    expect(normPassport(' c12 34 567 ')).toBe('C1234567');
    expect(normPassport(null)).toBe('');
  });
});

describe('sameGuest', () => {
  it('matches by passport regardless of name/dob', () => {
    expect(sameGuest({ passport: 'C1234567' }, { passport: 'c1234567', name: 'Khác' })).toBe(true);
  });

  it('does not match on different passports even with same name', () => {
    expect(sameGuest(
      { passport: 'C1', name: 'Nguyễn Văn A', dob: '1990-01-01' },
      { passport: 'C2', name: 'Nguyễn Văn A', dob: '1990-01-01' },
    )).toBe(false);
  });

  it('matches by accent-insensitive name + dob when passport missing on a side', () => {
    expect(sameGuest(
      { name: 'Nguyễn Văn A', dob: '1990-01-01' },
      { name: 'nguyen van a', dob: '1990-01-01' },
    )).toBe(true);
  });

  it('requires dob to match when relying on name', () => {
    expect(sameGuest(
      { name: 'Nguyễn Văn A', dob: '1990-01-01' },
      { name: 'Nguyễn Văn A', dob: '1991-01-01' },
    )).toBe(false);
  });

  it('does not match on name alone without dob', () => {
    expect(sameGuest({ name: 'Nguyễn Văn A' }, { name: 'Nguyễn Văn A' })).toBe(false);
  });
});

describe('matchesGuestQuery', () => {
  const a = { name: 'Trần Thị Bích', passport: 'B7654321', dob: '1988-05-05' };
  it('matches by accent-insensitive name fragment', () => {
    expect(matchesGuestQuery(a, 'tran thi')).toBe(true);
    expect(matchesGuestQuery(a, 'Bích')).toBe(true);
  });
  it('matches by passport fragment', () => {
    expect(matchesGuestQuery(a, 'b765')).toBe(true);
  });
  it('returns false for empty or non-matching query', () => {
    expect(matchesGuestQuery(a, '')).toBe(false);
    expect(matchesGuestQuery(a, 'xyz')).toBe(false);
  });
});
