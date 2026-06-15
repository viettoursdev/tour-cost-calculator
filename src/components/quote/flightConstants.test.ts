import { describe, it, expect } from 'vitest';
import { deriveAirline, deriveAirport, newFlight, newFare } from './flightConstants';

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
  it('newFlight seeds one fare and unique id', () => {
    const f = newFlight();
    expect(f.fares).toHaveLength(1);
    expect(f.id.length).toBeGreaterThan(2);
  });
});
