import { describe, it, expect } from 'vitest';
import { extractFlightJson, mapToFlight, parseSegment } from './flightParse';

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

describe('parseSegment', () => {
  it('normalises and derives airline + cities', () => {
    const s = parseSegment({ date: '20nov', flightNo: 'qr977', depAirport: 'han', arrAirport: 'doh', depTime: '19:10', arrTime: '23:10' });
    expect(s.date).toBe('20NOV');
    expect(s.flightNo).toBe('QR977');
    expect(s.airlineName).toBe('Qatar Airways');
    expect(s.depAirport).toBe('HAN');
    expect(s.depCity).toBe('Hanoi');
    expect(s.arrCity).toBe('Doha');
  });
  it('captures explicit day offsets from source', () => {
    const s = parseSegment({ flightNo: 'MU281', depTime: '22:15', arrTime: '01:35', depOffset: 1, arrOffset: 2 });
    expect(s.depDayOffset).toBe(1);
    expect(s.arrDayOffset).toBe(2);
  });
  it('auto +1 when arrival time is before departure time (overnight)', () => {
    const s = parseSegment({ flightNo: 'QR008', depTime: '14:55', arrTime: '00:35' });
    expect(s.arrDayOffset).toBe(1);
  });
});

describe('mapToFlight', () => {
  it('maps a single flat leg into a 1-segment booking', () => {
    const f = mapToFlight({ date: '01jan', flightNo: 'vn310', depAirport: 'han', arrAirport: 'sgn', depTime: '08:00', arrTime: '10:10' });
    expect(f.segments).toHaveLength(1);
    expect(f.segments[0].flightNo).toBe('VN310');
    expect(f.segments[0].depAirport).toBe('HAN');
    expect(f.fares).toHaveLength(1);
  });
  it('handles missing fields gracefully', () => {
    const f = mapToFlight({ flightNo: 'ZZ9' });
    expect(f.segments).toHaveLength(1);
    expect(f.segments[0].depAirport).toBe('');
    expect(f.segments[0].airlineName).toBeUndefined();
  });

  it('maps a multi-segment booking (4 legs on one PNR)', () => {
    const f = mapToFlight({ segments: [
      { date: '20nov', flightNo: 'qr977', depAirport: 'han', arrAirport: 'doh', depTime: '19:10', arrTime: '23:10' },
      { date: '21nov', flightNo: 'qr031', depAirport: 'doh', arrAirport: 'edi', depTime: '01:20', arrTime: '06:00' },
      { date: '26nov', flightNo: 'qr008', depAirport: 'lhr', arrAirport: 'doh', depTime: '14:55', arrTime: '00:35', arrOffset: 1 },
      { date: '27nov', flightNo: 'qr976', depAirport: 'doh', arrAirport: 'han', depTime: '01:50', arrTime: '12:20' },
    ] });
    expect(f.segments).toHaveLength(4);
    expect(f.segments.map((s) => s.flightNo)).toEqual(['QR977', 'QR031', 'QR008', 'QR976']);
    expect(f.segments[0].depAirport).toBe('HAN');
    expect(f.segments[3].arrAirport).toBe('HAN');
    expect(f.segments[2].arrDayOffset).toBe(1);
  });
  it('maps a round-trip (2 segments)', () => {
    const f = mapToFlight({ segments: [
      { flightNo: 'vn310', depAirport: 'han', arrAirport: 'sgn' },
      { flightNo: 'vn317', depAirport: 'sgn', arrAirport: 'han' },
    ] });
    expect(f.segments).toHaveLength(2);
    expect(f.segments[1].flightNo).toBe('VN317');
  });
  it('still supports legacy {outbound, return} shape', () => {
    const f = mapToFlight({
      outbound: { flightNo: 'vn310', depAirport: 'han', arrAirport: 'sgn' },
      return: { flightNo: 'vn317', depAirport: 'sgn', arrAirport: 'han' },
    });
    expect(f.segments).toHaveLength(2);
    expect(f.segments[0].flightNo).toBe('VN310');
    expect(f.segments[1].depAirport).toBe('SGN');
  });
});
