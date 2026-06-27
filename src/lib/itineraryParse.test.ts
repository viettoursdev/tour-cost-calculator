import { describe, it, expect } from 'vitest';
import { buildItineraryFromParsed, type ParsedItinerary } from './itineraryParse';

describe('buildItineraryFromParsed', () => {
  const parsed: ParsedItinerary = {
    title: 'TOUR ĐÀ NẴNG',
    destination: 'Đà Nẵng',
    intro: 'Thành phố đáng sống.',
    flights: [{ group: 'Nhóm 1', leg: 'Đi', flightNo: 'VN123', dep: 'SGN 08:00', arr: 'DAD 09:15' }],
    days: [
      {
        title: 'ĐÀ NẴNG – BÀ NÀ',
        meals: { B: false, L: true, D: true },
        mealNote: 'Buffet',
        activities: [
          { time: '08:00', place: 'Bà Nà Hills', commentary: 'Khu du lịch nổi tiếng với Cầu Vàng.' },
          { time: '12:00', place: 'Ăn trưa', commentary: '' },
        ],
      },
      { title: 'TỰ DO', activities: [] },
    ],
    includes: ['Vé máy bay'],
    excludes: ['Chi phí cá nhân'],
  };

  it('maps top-level fields', () => {
    const { itinerary } = buildItineraryFromParsed(parsed);
    expect(itinerary.title).toBe('TOUR ĐÀ NẴNG');
    expect(itinerary.destination).toBe('Đà Nẵng');
    expect(itinerary.intro).toBe('Thành phố đáng sống.');
    expect(itinerary.days).toBe(2);
    expect(itinerary.nights).toBe(1);
    expect(itinerary.includes).toEqual(['Vé máy bay']);
    expect(itinerary.excludes).toEqual(['Chi phí cá nhân']);
    expect(itinerary.flights[0].flightNo).toBe('VN123');
  });

  it('builds days, segments and activities with combined commentary', () => {
    const { itinerary } = buildItineraryFromParsed(parsed);
    expect(itinerary.schedule).toHaveLength(2);
    const d1 = itinerary.schedule[0];
    expect(d1.dayNum).toBe(1);
    expect(d1.title).toBe('ĐÀ NẴNG – BÀ NÀ');
    expect(d1.meals).toEqual({ B: false, L: true, D: true });
    const a0 = d1.segments[0].activities[0];
    expect(a0.time).toBe('08:00');
    expect(a0.text).toBe('Bà Nà Hills – Khu du lịch nổi tiếng với Cầu Vàng.');
    // empty activity list day still gets a placeholder activity
    expect(itinerary.schedule[1].segments[0].activities.length).toBeGreaterThanOrEqual(1);
  });

  it('prefers the action-first "activity" phrase for the line text', () => {
    const { itinerary, pois } = buildItineraryFromParsed({
      days: [{
        activities: [
          { time: '08:00', activity: 'Tham quan Bà Nà Hills', place: 'Bà Nà Hills', commentary: 'Có Cầu Vàng.' },
          { activity: 'Khởi hành đi Hội An', place: '', commentary: '' },
        ],
      }],
    });
    const acts = itinerary.schedule[0].segments[0].activities;
    // câu hoạt động dẫn trước, thuyết minh ghép sau
    expect(acts[0].text).toBe('Tham quan Bà Nà Hills – Có Cầu Vàng.');
    expect(acts[1].text).toBe('Khởi hành đi Hội An');
    // thư viện POI vẫn dùng tên địa điểm sạch làm khoá
    expect(pois).toEqual([{ place: 'Bà Nà Hills', commentary: 'Có Cầu Vàng.' }]);
  });

  it('collects POIs (place + commentary) for the library', () => {
    const { pois } = buildItineraryFromParsed(parsed);
    expect(pois).toEqual([{ place: 'Bà Nà Hills', commentary: 'Khu du lịch nổi tiếng với Cầu Vàng.' }]);
  });

  it('falls back to defaults when fields are missing', () => {
    const { itinerary } = buildItineraryFromParsed({});
    expect(itinerary.title).toContain('CHƯƠNG TRÌNH');
    expect(itinerary.schedule.length).toBe(1);
    expect(itinerary.includes.length).toBeGreaterThan(0);
    expect(itinerary.flights.length).toBe(1);
  });
});
