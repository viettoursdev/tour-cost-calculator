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

  it('maps a round-trip (outbound + return) into one flight', () => {
    const f = mapToFlight({
      outbound: { date: '01jan', flightNo: 'vn310', depAirport: 'han', arrAirport: 'sgn', depTime: '08:00', arrTime: '10:10' },
      return: { date: '05jan', flightNo: 'vn317', depAirport: 'sgn', arrAirport: 'han', depTime: '18:30', arrTime: '20:40' },
    });
    expect(f.flightNo).toBe('VN310');
    expect(f.depAirport).toBe('HAN');
    expect(f.retFlightNo).toBe('VN317');
    expect(f.retDepAirport).toBe('SGN');
    expect(f.retArrAirport).toBe('HAN');
    expect(f.retDate).toBe('05JAN');
  });
  it('leaves return fields empty for a one-way (return null)', () => {
    const f = mapToFlight({ outbound: { flightNo: 'vj1', depAirport: 'sgn', arrAirport: 'dad' }, return: null });
    expect(f.flightNo).toBe('VJ1');
    expect(f.retFlightNo).toBeUndefined();
    expect(f.retDepAirport).toBeUndefined();
  });
  it('applies overnight +1 to the return leg independently', () => {
    const f = mapToFlight({
      outbound: { flightNo: 'qr1', depTime: '08:00', arrTime: '12:00' },
      return: { flightNo: 'qr2', depTime: '23:30', arrTime: '06:00' },
    });
    expect(f.arrDayOffset).toBeUndefined();
    expect(f.retArrDayOffset).toBe(1);
  });
});
