import { describe, it, expect } from 'vitest';
import { itineraryToSummary } from './publicQuote';
import type { Itinerary } from '@/types';

const baseItin = (schedule: Itinerary['schedule']): Itinerary => ({
  id: 'i1', type: 'domestic' as Itinerary['type'], continent: '', country: '', seq: 1,
  title: 'Tour Đà Nẵng', destination: 'Đà Nẵng', days: schedule.length, nights: 1,
  intro: '', flights: [], schedule, includes: [], excludes: [],
  linkedQuoteId: null, linkedQuoteName: '',
});

describe('itineraryToSummary', () => {
  it('rút schedule[] → tóm tắt theo ngày, ghép giờ + nội dung', () => {
    const itin = baseItin([
      { id: 'd1', dayNum: 1, date: '', title: 'Khởi hành', meals: { B: false, L: true, D: true }, mealNote: '', segments: [
        { id: 's1', groupLabel: '', transport: '', activities: [
          { id: 'a1', time: '08:00', text: 'Đón sân bay' },
          { id: 'a2', time: '', text: 'Nhận phòng' },
        ] },
      ] },
      { id: 'd2', dayNum: 2, date: '', title: '', meals: { B: true, L: false, D: false }, mealNote: '', segments: [] },
    ]);
    const sum = itineraryToSummary(itin);
    expect(sum).toHaveLength(2);
    expect(sum[0]).toEqual({ day: 1, title: 'Khởi hành', lines: ['08:00 Đón sân bay', 'Nhận phòng'] });
    expect(sum[1]).toEqual({ day: 2, title: undefined, lines: [] });
  });
});
