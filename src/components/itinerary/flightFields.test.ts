import { describe, it, expect } from 'vitest';
import { splitAirportTime, flightDep, flightArr, flightDepStr, normalizeFlight } from './flightFields';
import type { Flight } from '@/types';

const mk = (p: Partial<Flight>): Flight => ({ id: 'f1', group: '', leg: '', flightNo: '', dep: '', arr: '', ...p });

describe('splitAirportTime', () => {
  it('splits airport + HH:MM', () => expect(splitAirportTime('TSN 05:40')).toEqual({ airport: 'TSN', time: '05:40' }));
  it('splits airport + HHMM (4 digits)', () => expect(splitAirportTime('PEK 1545')).toEqual({ airport: 'PEK', time: '15:45' }));
  it('airport only', () => expect(splitAirportTime('TSN')).toEqual({ airport: 'TSN', time: '' }));
  it('time only', () => expect(splitAirportTime('05:40')).toEqual({ airport: '', time: '05:40' }));
  it('empty', () => expect(splitAirportTime('')).toEqual({ airport: '', time: '' }));
});

describe('flightDep/flightArr (backward compat)', () => {
  it('reads legacy combined dep/arr', () => {
    const f = mk({ dep: 'TSN 05:40', arr: 'PEK 11:35' });
    expect(flightDep(f)).toEqual({ airport: 'TSN', time: '05:40' });
    expect(flightArr(f)).toEqual({ airport: 'PEK', time: '11:35' });
  });
  it('prefers new split fields when present', () => {
    const f = mk({ dep: 'OLD 00:00', depAirport: 'HAN', depTime: '08:00' });
    expect(flightDep(f)).toEqual({ airport: 'HAN', time: '08:00' });
  });
});

describe('normalizeFlight', () => {
  it('fills the 4 split fields from legacy and keeps dep/arr in sync', () => {
    const out = normalizeFlight(mk({ dep: 'TSN 05:40', arr: 'PEK 11:35' }));
    expect(out.depAirport).toBe('TSN');
    expect(out.depTime).toBe('05:40');
    expect(out.arrAirport).toBe('PEK');
    expect(out.arrTime).toBe('11:35');
    expect(out.dep).toBe('TSN 05:40');
  });
});

describe('flightDepStr', () => {
  it('composes from split fields', () => expect(flightDepStr(mk({ depAirport: 'SGN', depTime: '02:35' }))).toBe('SGN 02:35'));
});
