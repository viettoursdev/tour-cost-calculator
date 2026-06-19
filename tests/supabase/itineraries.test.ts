import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import {
  sbSaveItinerary, sbGetItinerary, sbDeleteItinerary, sbSubscribeItineraries,
} from '../../src/lib/supabase';
import type { Itinerary, ItineraryIndexEntry } from '../../src/types/itinerary';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

const ITIN: Itinerary = {
  id: 'itin-t14',
  code: 'T14',
  type: 'ND',
  continent: 'Asia',
  country: 'Vietnam',
  seq: 1,
  title: 'Hà Nội 3N2Đ',
  destination: 'Hà Nội',
  days: 3,
  nights: 2,
  intro: 'Giới thiệu',
  includes: ['Bữa sáng', 'Xe đưa đón'],
  excludes: ['Vé máy bay'],
  linkedQuoteId: null,
  linkedQuoteName: '',
  flights: [
    {
      id: 'f1', group: 'A', leg: '1', flightNo: 'VN123',
      dep: 'SGN 06:00', arr: 'HAN 08:00',
      depAirport: 'SGN', depTime: '06:00', arrAirport: 'HAN', arrTime: '08:00',
      depDayOffset: 0, arrDayOffset: 0,
    },
  ],
  schedule: [
    {
      id: 'd1', dayNum: 1, date: '2026-07-01', title: 'Ngày 1',
      meals: { B: true, L: true, D: false }, mealNote: '',
      segments: [{ id: 's1', groupLabel: 'Sáng', transport: 'Xe', activities: [{ id: 'a1', time: '08:00', text: 'Khởi hành' }] }],
    },
    {
      id: 'd2', dayNum: 2, date: '2026-07-02', title: 'Ngày 2',
      meals: { B: true, L: false, D: true }, mealNote: 'Tối nhà hàng',
      segments: [{ id: 's2', groupLabel: 'Chiều', transport: 'Tàu', activities: [{ id: 'a2', time: '14:00', text: 'Tham quan' }] }],
    },
  ],
  createdAt: '2026-07-01T00:00:00.000Z',
  createdBy: 'tester',
};

describe('itineraries gateway', () => {
  beforeEach(async () => {
    await truncate(['itinerary_flights', 'itinerary_days', 'itineraries']);
  });

  it('round-trips startDate through save/get', async () => {
    const c = await getViettoursClient();
    const withDate: Itinerary = { ...ITIN, id: 'itin-start-date', startDate: '2026-07-01' };
    await sbSaveItinerary(withDate, 'tester', c);
    const got = await sbGetItinerary('itin-start-date', c);
    expect(got).not.toBeNull();
    expect(got!.startDate).toBe('2026-07-01');
  });

  it('startDate is undefined when not set', async () => {
    const c = await getViettoursClient();
    const noDate: Itinerary = { ...ITIN, id: 'itin-no-date' };
    await sbSaveItinerary(noDate, 'tester', c);
    const got = await sbGetItinerary('itin-no-date', c);
    expect(got).not.toBeNull();
    expect(got!.startDate).toBeUndefined();
  });

  it('saves, gets, lists, and deletes an itinerary', async () => {
    const c = await getViettoursClient();

    // save
    await sbSaveItinerary(ITIN, 'tester', c);

    // get reassembles schedule + flights
    const got = await sbGetItinerary('itin-t14', c);
    expect(got).not.toBeNull();
    expect(got!.title).toBe('Hà Nội 3N2Đ');
    expect(got!.includes).toEqual(['Bữa sáng', 'Xe đưa đón']);
    expect(got!.excludes).toEqual(['Vé máy bay']);
    expect(got!.schedule).toHaveLength(2);
    expect(got!.schedule[0].dayNum).toBe(1);
    expect(got!.schedule[0].meals).toEqual({ B: true, L: true, D: false });
    expect(got!.schedule[0].segments).toHaveLength(1);
    expect(got!.schedule[1].dayNum).toBe(2);
    expect(got!.schedule[1].mealNote).toBe('Tối nhà hàng');
    expect(got!.flights).toHaveLength(1);
    expect(got!.flights[0].flightNo).toBe('VN123');
    expect(got!.flights[0].depAirport).toBe('SGN');

    // list returns index entry
    const list = await once<ItineraryIndexEntry[]>((cb) => sbSubscribeItineraries(cb, c));
    const entry = list.find((x) => x.id === 'itin-t14');
    expect(entry).toBeDefined();
    expect(entry!.title).toBe('Hà Nội 3N2Đ');
    expect(entry!.days).toBe(3);
    expect(entry!.nights).toBe(2);
    expect(entry!.destination).toBe('Hà Nội');

    // delete removes parent (children cascade)
    await sbDeleteItinerary('itin-t14', c);
    const after = await sbGetItinerary('itin-t14', c);
    expect(after).toBeNull();
    const listAfter = await once<ItineraryIndexEntry[]>((cb) => sbSubscribeItineraries(cb, c));
    expect(listAfter.find((x) => x.id === 'itin-t14')).toBeUndefined();
  });
});
