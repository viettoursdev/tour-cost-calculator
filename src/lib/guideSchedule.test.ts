import { describe, it, expect } from 'vitest';
import {
  parseDDMMM, resolveYear, resolveSegmentTimes, buildLegsFromFlights,
  detectConflicts, conflictedLegIds, colorFor, DEFAULT_BUFFER_MINS,
} from './guideSchedule';
import type { FlightSegment, QuoteFlight } from '@/types/quote';
import type { GuideFlightLeg } from '@/types/guide';

const seg = (o: Partial<FlightSegment>): FlightSegment => ({
  date: '20NOV', flightNo: 'VN123', depAirport: 'HAN', arrAirport: 'SGN',
  depTime: '10:00', arrTime: '12:00', ...o,
});

const leg = (o: Partial<GuideFlightLeg> & { id: string; startISO: string; endISO: string }): GuideFlightLeg => ({
  guideId: 'g1', tourCloudId: 't1', source: 'manual', ...o,
});

const minutesBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;

describe('parseDDMMM', () => {
  it('parses standard and loose formats', () => {
    expect(parseDDMMM('20NOV')).toEqual({ day: 20, month: 10 });
    expect(parseDDMMM('5dec')).toEqual({ day: 5, month: 11 });
    expect(parseDDMMM('01 jan')).toEqual({ day: 1, month: 0 });
  });
  it('rejects garbage', () => {
    expect(parseDDMMM('')).toBeNull();
    expect(parseDDMMM('NOV')).toBeNull();
    expect(parseDDMMM('40FOO')).toBeNull();
  });
});

describe('resolveYear', () => {
  it('uses the tour departure year by default', () => {
    expect(resolveYear(10, '2026-11-20')).toBe(2026); // NOV
  });
  it('wraps to next year for early-month legs after a late-year departure', () => {
    expect(resolveYear(0, '2026-12-28')).toBe(2027); // JAN after DEC depart
  });
  it('does not wrap when departure is early in the year', () => {
    expect(resolveYear(0, '2026-01-05')).toBe(2026);
  });
});

describe('resolveSegmentTimes', () => {
  it('builds a same-day interval', () => {
    const t = resolveSegmentTimes(seg({ depTime: '10:00', arrTime: '12:30' }), '2026-11-20')!;
    expect(minutesBetween(t.startISO, t.endISO)).toBe(150);
  });
  it('infers overnight when arrival is earlier than departure', () => {
    const t = resolveSegmentTimes(seg({ depTime: '23:00', arrTime: '01:00' }), '2026-11-20')!;
    expect(minutesBetween(t.startISO, t.endISO)).toBe(120);
  });
  it('respects an explicit arrival day offset', () => {
    const t = resolveSegmentTimes(seg({ depTime: '10:00', arrTime: '08:00', arrDayOffset: 1 }), '2026-11-20')!;
    expect(minutesBetween(t.startISO, t.endISO)).toBe(22 * 60);
  });
  it('returns null on missing date/time', () => {
    expect(resolveSegmentTimes(seg({ date: '' }), '2026-11-20')).toBeNull();
    expect(resolveSegmentTimes(seg({ depTime: '' }), '2026-11-20')).toBeNull();
  });
});

describe('buildLegsFromFlights', () => {
  it('flattens segments across bookings, skipping invalid ones', () => {
    const flights: QuoteFlight[] = [
      { id: 'f1', fares: [], segments: [seg({ flightNo: 'VN1' }), seg({ date: '', flightNo: 'BAD' })] },
      { id: 'f2', fares: [], segments: [seg({ flightNo: 'VN2', depTime: '15:00', arrTime: '17:00' })] },
    ];
    const legs = buildLegsFromFlights(flights, 'g1', 't1', '2026-11-20');
    expect(legs.map((l) => l.flightNo)).toEqual(['VN1', 'VN2']);
    expect(legs.every((l) => l.source === 'quote' && l.guideId === 'g1')).toBe(true);
  });
  it('returns empty for no flights', () => {
    expect(buildLegsFromFlights(undefined, 'g1', 't1')).toEqual([]);
  });
});

describe('detectConflicts', () => {
  it('flags true overlap', () => {
    const legs = [
      leg({ id: 'a', startISO: '2026-11-20T10:00:00Z', endISO: '2026-11-20T14:00:00Z' }),
      leg({ id: 'b', startISO: '2026-11-20T12:00:00Z', endISO: '2026-11-20T16:00:00Z' }),
    ];
    const c = detectConflicts(legs, 120);
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe('overlap');
    expect(c[0].gapMins).toBeLessThan(0);
  });
  it('flags insufficient buffer (gap below threshold)', () => {
    const legs = [
      leg({ id: 'a', startISO: '2026-11-20T10:00:00Z', endISO: '2026-11-20T12:00:00Z' }),
      leg({ id: 'b', startISO: '2026-11-20T13:00:00Z', endISO: '2026-11-20T15:00:00Z' }), // gap 60'
    ];
    const c = detectConflicts(legs, 120);
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe('buffer');
    expect(c[0].gapMins).toBe(60);
  });
  it('does not flag when gap equals the buffer (exclusive boundary)', () => {
    const legs = [
      leg({ id: 'a', startISO: '2026-11-20T10:00:00Z', endISO: '2026-11-20T12:00:00Z' }),
      leg({ id: 'b', startISO: '2026-11-20T14:00:00Z', endISO: '2026-11-20T16:00:00Z' }), // gap 120'
    ];
    expect(detectConflicts(legs, 120)).toHaveLength(0);
  });
  it('ignores conflicts across different guides', () => {
    const legs = [
      leg({ id: 'a', guideId: 'g1', startISO: '2026-11-20T10:00:00Z', endISO: '2026-11-20T14:00:00Z' }),
      leg({ id: 'b', guideId: 'g2', startISO: '2026-11-20T12:00:00Z', endISO: '2026-11-20T16:00:00Z' }),
    ];
    expect(detectConflicts(legs, 120)).toHaveLength(0);
  });
  it('flags the same guide double-booked across two tours', () => {
    const legs = [
      leg({ id: 'a', tourCloudId: 't1', startISO: '2026-11-20T10:00:00Z', endISO: '2026-11-20T14:00:00Z' }),
      leg({ id: 'b', tourCloudId: 't2', startISO: '2026-11-20T13:00:00Z', endISO: '2026-11-20T18:00:00Z' }),
    ];
    const c = detectConflicts(legs, 120);
    expect(c).toHaveLength(1);
    expect(conflictedLegIds(c)).toEqual(new Set(['a', 'b']));
  });
  it('does not flag two legs in the same booking (connection within one PNR)', () => {
    const legs = [
      leg({ id: 'a', bookingId: 'bk1', startISO: '2026-11-20T10:00:00Z', endISO: '2026-11-20T12:00:00Z' }),
      leg({ id: 'b', bookingId: 'bk1', startISO: '2026-11-20T13:00:00Z', endISO: '2026-11-20T15:00:00Z' }), // gap 60' nhưng cùng booking
    ];
    expect(detectConflicts(legs, 120)).toHaveLength(0);
  });
  it('still flags a different booking that crowds a connection (maxEnd kept across same-booking legs)', () => {
    const legs = [
      leg({ id: 'a', bookingId: 'bk1', startISO: '2026-11-20T08:00:00Z', endISO: '2026-11-20T10:00:00Z' }),
      leg({ id: 'b', bookingId: 'bk1', startISO: '2026-11-20T11:00:00Z', endISO: '2026-11-20T13:00:00Z' }), // nối chuyến cùng booking
      leg({ id: 'c', bookingId: 'bk2', startISO: '2026-11-20T13:30:00Z', endISO: '2026-11-20T15:00:00Z' }), // booking khác, sát chặng b
    ];
    expect(conflictedLegIds(detectConflicts(legs, 120)).has('c')).toBe(true);
  });
  it('catches a long leg overlapping several later short legs', () => {
    const legs = [
      leg({ id: 'long', startISO: '2026-11-20T08:00:00Z', endISO: '2026-11-20T20:00:00Z' }),
      leg({ id: 's1', startISO: '2026-11-20T10:00:00Z', endISO: '2026-11-20T11:00:00Z' }),
      leg({ id: 's2', startISO: '2026-11-20T15:00:00Z', endISO: '2026-11-20T16:00:00Z' }),
    ];
    const ids = conflictedLegIds(detectConflicts(legs, 0));
    expect(ids.has('long')).toBe(true);
    expect(ids.has('s1')).toBe(true);
    expect(ids.has('s2')).toBe(true);
  });
});

describe('colorFor', () => {
  it('is deterministic and within the palette', () => {
    expect(colorFor('tour-abc')).toBe(colorFor('tour-abc'));
    expect(colorFor('tour-abc')).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('exposes a sane default buffer', () => {
    expect(DEFAULT_BUFFER_MINS).toBeGreaterThan(0);
  });
});
