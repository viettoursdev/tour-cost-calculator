import { describe, it, expect } from 'vitest';
import { deriveAirline, deriveAirport, newFlight, newFare, migrateFlight } from './flightConstants';
import type { LegacyQuoteFlight } from '@/types';

describe('deriveAirline', () => {
  it('maps known airline prefixes from flight number', () => {
    expect(deriveAirline('VN310')).toEqual({ code: 'VN', name: 'Vietnam Airlines' });
    expect(deriveAirline('cx765').name).toBe('Cathay Pacific'); // case-insensitive
    expect(deriveAirline('SQ176').name).toBe('Singapore Airlines');
    expect(deriveAirline('VJ').name).toBe('Vietjet Air');
    expect(deriveAirline('3K201').code).toBe('3K');
  });
  it('returns empty name for unknown code but keeps the code', () => {
    expect(deriveAirline('ZZ999')).toEqual({ code: 'ZZ', name: '' });
    expect(deriveAirline('')).toEqual({ code: '', name: '' });
  });
});

describe('deriveAirport', () => {
  it('maps IATA codes to cities (case-insensitive)', () => {
    expect(deriveAirport('HAN')).toBe('Hanoi');
    expect(deriveAirport('sgn')).toBe('Ho Chi Minh City');
    expect(deriveAirport('ICN')).toBe('Seoul (Incheon)');
  });
  it('returns empty for unknown', () => {
    expect(deriveAirport('XXX')).toBe('');
  });
});

describe('factories', () => {
  it('newFare defaults to VND and unique id', () => {
    const a = newFare(); const b = newFare();
    expect(a.cur).toBe('VND');
    expect(a.id).not.toBe(b.id);
  });
  it('newFlight seeds one segment + one fare and unique id', () => {
    const f = newFlight();
    expect(f.segments).toHaveLength(1);
    expect(f.fares).toHaveLength(1);
    expect(f.id.length).toBeGreaterThan(2);
  });
});

describe('migrateFlight', () => {
  it('keeps a booking that already has segments', () => {
    const seg = { date: '20NOV', flightNo: 'QR977', depAirport: 'HAN', arrAirport: 'DOH', depTime: '19:10', arrTime: '23:10' };
    const f = migrateFlight({ id: 'x', segments: [seg], fares: [newFare()] });
    expect(f.segments).toEqual([seg]);
  });
  it('migrates legacy flat one-way into a single segment', () => {
    const legacy: LegacyQuoteFlight = { id: 'a', date: '01JAN', flightNo: 'VN310', depAirport: 'HAN', arrAirport: 'SGN', depTime: '08:00', arrTime: '10:10' };
    const f = migrateFlight(legacy);
    expect(f.segments).toHaveLength(1);
    expect(f.segments[0].flightNo).toBe('VN310');
    expect(f.fares).toHaveLength(1);
  });
  it('migrates legacy round-trip (flat + ret*) into two segments', () => {
    const legacy: LegacyQuoteFlight = {
      id: 'b', flightNo: 'VN310', depAirport: 'HAN', arrAirport: 'SGN',
      retFlightNo: 'VN317', retDepAirport: 'SGN', retArrAirport: 'HAN', retDate: '05JAN',
    };
    const f = migrateFlight(legacy);
    expect(f.segments).toHaveLength(2);
    expect(f.segments[1].flightNo).toBe('VN317');
    expect(f.segments[1].date).toBe('05JAN');
  });
  it('falls back to one empty segment for an empty legacy record', () => {
    const f = migrateFlight({ id: 'c' });
    expect(f.segments).toHaveLength(1);
    expect(f.segments[0].flightNo).toBe('');
  });
});
