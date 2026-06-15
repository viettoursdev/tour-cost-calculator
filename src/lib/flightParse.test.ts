import { describe, it, expect } from 'vitest';
import { extractFlightJson, mapToFlight } from './flightParse';

describe('extractFlightJson', () => {
  it('strips ``` fences and returns the array', () => {
    const raw = '```json\n[{"flightNo":"VN310"}]\n```';
    expect(JSON.parse(extractFlightJson(raw))).toEqual([{ flightNo: 'VN310' }]);
  });
  it('wraps a single object in an array', () => {
    expect(JSON.parse(extractFlightJson('{"flightNo":"VJ1"}'))).toEqual([{ flightNo: 'VJ1' }]);
  });
  it('ignores prose around the JSON', () => {
    expect(JSON.parse(extractFlightJson('Đây là kết quả: [{"a":1}] xong'))).toEqual([{ a: 1 }]);
  });
  it('returns empty array when no JSON found', () => {
    expect(JSON.parse(extractFlightJson('không có gì'))).toEqual([]);
  });
});

describe('mapToFlight', () => {
  it('normalises and derives airline + cities', () => {
    const f = mapToFlight({ date: '01jan', flightNo: 'vn310', depAirport: 'han', arrAirport: 'sgn', depTime: '08:00', arrTime: '10:10' });
    expect(f.date).toBe('01JAN');
    expect(f.flightNo).toBe('VN310');
    expect(f.airlineName).toBe('Vietnam Airlines');
    expect(f.depAirport).toBe('HAN');
    expect(f.depCity).toBe('Hanoi');
    expect(f.arrCity).toBe('Ho Chi Minh City');
    expect(f.fares).toHaveLength(1);
  });
  it('handles missing fields gracefully', () => {
    const f = mapToFlight({ flightNo: 'ZZ9' });
    expect(f.depAirport).toBe('');
    expect(f.airlineName).toBeUndefined();
  });
  it('captures explicit day offsets from source', () => {
    const f = mapToFlight({ flightNo: 'MU281', depTime: '22:15', arrTime: '01:35', depOffset: 1, arrOffset: 2 });
    expect(f.depDayOffset).toBe(1);
    expect(f.arrDayOffset).toBe(2);
  });
  it('auto +1 when arrival time is before departure time (overnight)', () => {
    const f = mapToFlight({ flightNo: 'VN1', depTime: '23:00', arrTime: '01:00' });
    expect(f.arrDayOffset).toBe(1);
  });
});
