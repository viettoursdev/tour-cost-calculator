import { describe, it, expect } from 'vitest';
import { buildExecModel, mealsLabel } from './execModel';
import type { Itinerary, Menu, Restaurant } from '@/types';

const baseItin = (over: Partial<Itinerary> = {}): Itinerary => ({
  id: 'it1', type: 'NN', continent: '', country: '', seq: 1, title: 'Tour HQ',
  destination: 'Seoul', days: 1, nights: 0, intro: '', flights: [],
  schedule: [{
    id: 'd1', dayNum: 1, date: '2026-07-01', title: 'Arrival',
    meals: { B: false, L: true, D: true }, mealNote: '', segments: [
      { id: 's1', groupLabel: 'Sáng', transport: 'Xe 45', activities: [{ id: 'a1', time: '08:00', text: 'Đón sân bay' }] },
    ],
  }],
  includes: ['Xe'], excludes: ['Tip'], linkedQuoteId: null, linkedQuoteName: '',
  ...over,
});

describe('mealsLabel', () => {
  it('joins enabled meals', () => {
    expect(mealsLabel({ B: true, L: false, D: true })).toBe('Sáng · Tối');
  });
  it('returns dash when none', () => {
    expect(mealsLabel({ B: false, L: false, D: false })).toBe('—');
  });
});

describe('buildExecModel', () => {
  it('merges menu meals + restaurant contact by day, and exec ops', () => {
    const rest: Restaurant = {
      id: 'r1', name: 'Nhà hàng A', continent: '', country: '', city: 'Seoul',
      contact: '010-1234', website: 'nhahang-a.kr', menuLink: '', note: 'Đặt trước', rating: 0, review: '', menus: [],
    };
    const menu: Menu = {
      id: 'mn1', type: 'NN', continent: '', country: '', seq: 1, title: 'Menu', destination: '',
      days: 1, linkedItineraryId: 'it1', linkedItineraryName: '', linkedQuoteId: null, linkedQuoteName: '',
      schedule: [{ id: 'md1', dayNum: 1, date: '', city: 'Seoul', meals: [
        { id: 'mm1', mealType: 'Trưa', restaurantId: 'r1', restaurantName: 'Nhà hàng A', city: 'Seoul',
          suggestedDishes: 'Kimchi', suggestedPrice: 0, suggestedCur: 'KRW',
          adjustedDishes: 'Set BBQ', adjustedPrice: 0, adjustedCur: 'KRW', cur: 'KRW', note: '' },
      ] }],
    };
    const itin = baseItin({
      exec: {
        sosHotline: '1900', guides: [{ id: 'g1', role: 'HDV', name: 'An', phone: '090' }],
        dayOps: [{ dayNum: 1, hotelName: 'Lotte', notes: 'Check-in 14h', checklist: [{ id: 'c1', text: 'Vé' }] }],
      },
    });

    const m = buildExecModel(itin, menu, [rest]);
    expect(m.title).toBe('Tour HQ');
    expect(m.sos.hotline).toBe('1900');
    expect(m.guides).toHaveLength(1);
    const d = m.dayVMs[0];
    expect(d.menuMeals[0].dishes).toBe('Set BBQ');       // adjusted wins over suggested
    expect(d.menuMeals[0].address).toContain('010-1234'); // restaurant phone merged into địa chỉ line
    expect(d.menuMeals[0].contact).toContain('nhahang-a.kr'); // contact field now holds website
    expect(d.hotelName).toBe('Lotte');
    expect(d.notes).toBe('Check-in 14h');
    expect(d.checklist).toHaveLength(1);
    expect(m.departure).toBe('2026-07-01');
  });

  it('works with no menu / no exec', () => {
    const m = buildExecModel(baseItin(), null, []);
    expect(m.dayVMs[0].menuMeals).toEqual([]);
    expect(m.guides).toEqual([]);
  });
});
