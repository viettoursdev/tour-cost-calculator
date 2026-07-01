import { describe, it, expect } from 'vitest';
import {
  sameGuest, matchesGuestQuery, normPassport, mergeApplicant, dedupeApplicants, mergeIncoming,
} from './applicantMatch';
import type { VisaApplicant } from '@/types';

const mk = (p: Partial<VisaApplicant>): VisaApplicant => ({
  id: Math.random().toString(36).slice(2), name: '', docStatus: 'missing', result: 'pending', ...p,
});

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

  it('matches name + dob across date formats (dd/mm/yyyy vs ISO)', () => {
    expect(sameGuest(
      { name: 'Nguyễn Văn A', dob: '01/01/1990' },
      { name: 'Nguyen Van A', dob: '1990-01-01' },
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

describe('mergeApplicant', () => {
  it('fills only empty fields of base from extra', () => {
    const base = mk({ name: 'Nguyễn Văn A', passport: 'C1', dob: '' });
    const extra = mk({ name: 'KHÁC', passport: 'C2', dob: '1990-01-01', gender: 'Nam' });
    const out = mergeApplicant(base, extra);
    expect(out.name).toBe('Nguyễn Văn A'); // base giữ nguyên
    expect(out.passport).toBe('C1');
    expect(out.dob).toBe('1990-01-01');    // base trống → lấy từ extra
    expect(out.gender).toBe('Nam');
  });
});

describe('dedupeApplicants', () => {
  it('merges duplicates by passport, keeps first', () => {
    const r = dedupeApplicants([
      mk({ name: 'A', passport: 'C1' }),
      mk({ name: 'A2', passport: 'C1', dob: '1990-01-01' }),
      mk({ name: 'B', passport: 'C2' }),
    ]);
    expect(r.list).toHaveLength(2);
    expect(r.removed).toBe(1);
    expect(r.list[0].name).toBe('A');
    expect(r.list[0].dob).toBe('1990-01-01'); // gộp ngày sinh từ bản trùng
  });

  it('merges by name + dob when no passport', () => {
    const r = dedupeApplicants([
      mk({ name: 'Trần Thị B', dob: '1988-05-05' }),
      mk({ name: 'tran thi b', dob: '1988-05-05', note: 'VIP' }),
    ]);
    expect(r.list).toHaveLength(1);
    expect(r.list[0].note).toBe('VIP');
  });
});

describe('mergeIncoming', () => {
  it('adds new and merges duplicates, reporting counts', () => {
    const cur = [mk({ name: 'A', passport: 'C1' })];
    const inc = [mk({ name: 'A', passport: 'C1', gender: 'Nam' }), mk({ name: 'B', passport: 'C2' })];
    const r = mergeIncoming(cur, inc);
    expect(r.added).toBe(1);
    expect(r.merged).toBe(1);
    expect(r.list).toHaveLength(2);
    expect(r.list[0].gender).toBe('Nam');
  });
});
