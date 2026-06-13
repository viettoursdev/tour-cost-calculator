import { describe, it, expect } from 'vitest';
import { normalizeVN, searchScore, matchesQuery, filterRank } from './search';

describe('normalizeVN', () => {
  it('strips Vietnamese diacritics and lowercases', () => {
    expect(normalizeVN('Đà Nẵng')).toBe('da nang');
    expect(normalizeVN('Hồ Chí Minh')).toBe('ho chi minh');
    expect(normalizeVN('  CÔNG ty ABC ')).toBe('cong ty abc');
  });
  it('handles null/undefined', () => {
    expect(normalizeVN(null)).toBe('');
    expect(normalizeVN(undefined)).toBe('');
  });
});

describe('searchScore', () => {
  it('matches accent-insensitively', () => {
    expect(searchScore('Đà Nẵng 3N2Đ', 'da nang')).toBeGreaterThan(0);
    expect(searchScore('Đà Nẵng', 'hue')).toBe(0);
  });
  it('requires all tokens (AND)', () => {
    expect(searchScore('Báo giá Amway Hà Nội', 'amway noi')).toBeGreaterThan(0);
    expect(searchScore('Báo giá Amway Hà Nội', 'amway saigon')).toBe(0);
  });
  it('ranks start-of-string above mid-string', () => {
    const start = searchScore('Amway company', 'amway');
    const mid = searchScore('Công ty Amway', 'amway');
    expect(start).toBeGreaterThan(mid);
  });
  it('does light fuzzy via subsequence', () => {
    // "nang" is a subsequence of "n a n g" inside the haystack even with a gap
    expect(searchScore('Nha Trang', 'nhtr')).toBeGreaterThan(0);
  });
  it('empty query matches everything', () => {
    expect(searchScore('anything', '')).toBeGreaterThan(0);
  });
});

describe('matchesQuery', () => {
  it('returns boolean', () => {
    expect(matchesQuery('Đà Nẵng', 'da')).toBe(true);
    expect(matchesQuery('Đà Nẵng', 'xyz')).toBe(false);
  });
});

describe('filterRank', () => {
  const items = [
    { name: 'Đà Nẵng – Hội An' },
    { name: 'Hà Nội – Sapa' },
    { name: 'Amway Đà Nẵng' },
  ];
  it('keeps original order on empty query', () => {
    expect(filterRank(items, '', (x) => x.name)).toEqual(items);
  });
  it('filters + ranks by relevance', () => {
    const r = filterRank(items, 'da nang', (x) => x.name);
    expect(r).toHaveLength(2);
    expect(r[0].name).toBe('Đà Nẵng – Hội An'); // start-of-string ranks first
  });
});
