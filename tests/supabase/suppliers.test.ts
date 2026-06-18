import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbPushNcc, sbSubscribeNcc } from '../../src/lib/supabase';
import type { Ncc } from '../../src/types';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('suppliers gateway', () => {
  beforeEach(async () => { await truncate(['supplier_contacts', 'suppliers']); });

  it('round-trips a supplier with contacts and sectors', async () => {
    const c = await getViettoursClient();
    await sbPushNcc([{
      id: 'ncc-1',
      name: 'Khách sạn Sunrise',
      sectors: ['hotel', 'spa'],
      location: 'Đà Nẵng',
      contacts: [
        { name: 'Hoa', phone: '090', email: 'hoa@sunrise.vn', position: 'Sales' },
        { name: 'Minh', phone: '091', email: 'minh@sunrise.vn', position: 'Director' },
      ],
      note: 'Đối tác lâu năm',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'tester',
    } as Ncc], { name: 'QA', role: 'Operations' }, c);

    const list = await once<Ncc[]>((cb) => sbSubscribeNcc(cb, c));
    const ncc = list.find((x) => x.id === 'ncc-1')!;
    expect(ncc.name).toBe('Khách sạn Sunrise');
    expect(ncc.sectors).toEqual(['hotel', 'spa']);
    expect(ncc.location).toBe('Đà Nẵng');
    expect(ncc.note).toBe('Đối tác lâu năm');
    expect(ncc.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(ncc.contacts).toEqual([
      { name: 'Hoa', phone: '090', email: 'hoa@sunrise.vn', position: 'Sales' },
      { name: 'Minh', phone: '091', email: 'minh@sunrise.vn', position: 'Director' },
    ]);
  });

  it('full-overwrite: removes suppliers not in the new list', async () => {
    const c = await getViettoursClient();
    await sbPushNcc([
      { id: 'ncc-a', name: 'A', sectors: [], location: '', contacts: [], note: '', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'tester' },
      { id: 'ncc-b', name: 'B', sectors: [], location: '', contacts: [], note: '', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'tester' },
    ] as Ncc[], { name: 'QA', role: 'Operations' }, c);
    await sbPushNcc([
      { id: 'ncc-a', name: 'A updated', sectors: ['transport'], location: 'HN', contacts: [], note: '', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'tester' },
    ] as Ncc[], { name: 'QA', role: 'Operations' }, c);
    const list = await once<Ncc[]>((cb) => sbSubscribeNcc(cb, c));
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('A updated');
    expect(list[0].sectors).toEqual(['transport']);
  });
});
