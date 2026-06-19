import { describe, it, expect } from 'vitest';
import { itinerarySummary, itineraryIssues } from './itinerarySummary';
import type { Itinerary, Day } from '@/types';

const day = (n: number, over: Partial<Day> = {}): Day => ({
  id: 'd' + n, dayNum: n, date: '', title: '', meals: { B: false, L: false, D: false }, mealNote: '',
  segments: [{ id: 's' + n, groupLabel: '', transport: '', activities: [{ id: 'a', time: '', text: '' }] }],
  ...over,
});

const base: Itinerary = {
  id: 'i1', type: 'NN', continent: '', country: '', seq: 1, title: 'Tour A', destination: 'Đà Nẵng',
  days: 2, nights: 1, intro: '', flights: [], schedule: [], includes: ['Xe'], excludes: [],
  linkedQuoteId: null, linkedQuoteName: '',
};

describe('itinerarySummary', () => {
  it('đếm hoạt động, bữa ăn, ngày trống', () => {
    const it: Itinerary = { ...base, schedule: [
      day(1, { date: '01/07/2026', title: 'HN→ĐN', meals: { B: true, L: true, D: false },
        segments: [{ id: 's1', groupLabel: '', transport: '', activities: [{ id: 'a1', time: '08:00', text: 'Bay' }, { id: 'a2', time: '', text: 'Ăn trưa' }] }] }),
      day(2),
    ] };
    const s = itinerarySummary(it);
    expect(s.scheduleDays).toBe(2);
    expect(s.activities).toBe(2);
    expect(s.daysEmpty).toBe(1);
    expect(s.daysWithDate).toBe(1);
    expect(s.meals).toEqual({ B: 1, L: 1, D: 0 });
  });
});

describe('itineraryIssues', () => {
  it('bắt ngày trống/thiếu ngày/lệch số ngày', () => {
    const it: Itinerary = { ...base, days: 3, schedule: [day(1), day(2)] };
    const w = itineraryIssues(it);
    expect(w).toContain('Ngày 1: chưa có hoạt động');
    expect(w).toContain('Ngày 1: chưa có ngày tháng');
    expect(w.some((x) => x.includes('Số ngày khai báo'))).toBe(true);
  });
  it('chương trình đủ → không lỗi cấp lịch trình', () => {
    const it: Itinerary = { ...base, days: 1, schedule: [
      day(1, { date: '01/07/2026', title: 'X', segments: [{ id: 's', groupLabel: '', transport: '', activities: [{ id: 'a', time: '', text: 'Tham quan' }] }] }),
    ] };
    expect(itineraryIssues(it)).toEqual([]);
  });
});
