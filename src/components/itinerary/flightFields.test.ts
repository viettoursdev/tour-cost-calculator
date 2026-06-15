import { describe, it, expect } from 'vitest';
import { splitAirportTime, flightDep, flightArr, flightDepStr, normalizeFlight } from './flightFields';
import type { Flight } from '@/types';

const mk = (p: Partial<Flight>): Flight => ({ id: 'f1', group: '', leg: '', flightNo: '', dep: '', arr: '', ...p });

describe('splitAirportTime', () => {
  it('splits airport + HH:MM', () => expect(splitAirportTime('TSN 05:40')).toEqual({ airport: 'TSN', time: '05:40', offset: 0 }));
  it('splits airport + HHMM (4 digits)', () => expect(splitAirportTime('PEK 1545')).toEqual({ airport: 'PEK', time: '15:45', offset: 0 }));
  it('parses overnight +N suffix', () => expect(splitAirportTime('SGN 01:35+2')).toEqual({ airport: 'SGN', time: '01:35', offset: 2 }));
  it('airport only', () => expect(splitAirportTime('TSN')).toEqual({ airport: 'TSN', time: '', offset: 0 }));
  it('time only', () => expect(splitAirportTime('05:40')).toEqual({ airport: '', time: '05:40', offset: 0 }));
  it('empty', () => expect(splitAirportTime('')).toEqual({ airport: '', time: '', offset: 0 }));
});

describe('flightDep/flightArr (backward compat)', () => {
  it('reads legacy combined dep/arr', () => {
    const f = mk({ dep: 'TSN 05:40', arr: 'PEK 11:35' });
    expect(flightDep(f)).toEqual({ airport: 'TSN', time: '05:40', offset: 0 });
    expect(flightArr(f)).toEqual({ airport: 'PEK', time: '11:35', offset: 0 });
  });
  it('prefers new split fields when present', () => {
    const f = mk({ dep: 'OLD 00:00', depAirport: 'HAN', depTime: '08:00', arrDayOffset: 1, arrAirport: 'NRT', arrTime: '06:00' });
    expect(flightDep(f)).toEqual({ airport: 'HAN', time: '08:00', offset: 0 });
    expect(flightArr(f).offset).toBe(1);
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
  it('appends +N for overnight', () => expect(flightDepStr(mk({ depAirport: 'PVG', depTime: '22:15', depDayOffset: 1 }))).toBe('PVG 22:15+1'));
});

describe('normalizeFlight overnight', () => {
  it('auto-sets arr +1 when arrival time is before departure time', () => {
    const out = normalizeFlight(mk({ depAirport: 'PVG', depTime: '22:15', arrAirport: 'SGN', arrTime: '01:35' }));
    expect(out.arrDayOffset).toBe(1);
    expect(out.arr).toBe('SGN 01:35+1');
  });
});
