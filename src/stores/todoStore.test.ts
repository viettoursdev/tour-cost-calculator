import { describe, it, expect } from 'vitest';
import { shiftRecurring } from './todoStore';

describe('shiftRecurring', () => {
  const base = '2026-06-21T09:00:00.000Z';
  it('dời theo ngày/tuần/tháng, giữ giờ', () => {
    expect(shiftRecurring(base, 'daily')).toBe(new Date('2026-06-22T09:00:00.000Z').toISOString());
    expect(shiftRecurring(base, 'weekly')).toBe(new Date('2026-06-28T09:00:00.000Z').toISOString());
    expect(shiftRecurring(base, 'monthly')).toBe(new Date('2026-07-21T09:00:00.000Z').toISOString());
  });
  it('none / ngày lỗi → giữ nguyên', () => {
    expect(shiftRecurring(base, 'none')).toBe(base);
    expect(shiftRecurring('xxx', 'daily')).toBe('xxx');
  });
});
