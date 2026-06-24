import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbPushNcc, sbUpsertNcc, sbDeleteNcc, sbSubscribeNcc } from '../../src/lib/supabase';
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

  it('round-trips the full extended payload (bank, status, files, ratings…)', async () => {
    const c = await getViettoursClient();
    const full: Ncc = {
      id: 'ncc-full',
      name: 'GEM Center',
      sectors: ['venue', 'event'],
      continent: 'Châu Á',
      country: 'Việt Nam',
      location: 'TP.HCM',
      address: '08 Nguyễn Bỉnh Khiêm, P. Sài Gòn, TP.HCM',
      website: 'gemcenter.com.vn',
      taxCode: '0312345678',
      status: 'active',
      bank: { accountName: 'GEM JSC', accountNo: '123456789', bankName: 'VCB', branch: 'HCM', swift: 'BFTVVNVX' },
      paymentTerms: 'Cọc 30%, còn lại trước 7 ngày',
      commission: '10%',
      creditLimit: 500_000_000,
      files: [{ key: 'r2/abc', name: 'baogia.pdf' }],
      tours: ['Gala 2026'],
      contacts: [{ name: 'Lan', phone: '0900', email: 'lan@gem.vn', position: 'Sales' }],
      note: 'Trung tâm sự kiện',
      aiAnalysis: 'Đối tác mạnh mảng MICE.',
      ratings: [{ id: 'r1', by: 'qa', byName: 'QA', at: '2026-01-01T00:00:00.000Z', stars: 5, comment: 'Tốt' }],
      collaborators: [{ u: 'sale1', name: 'Sale 1' }],
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'tester',
      createdByU: 'tester',
    };
    await sbUpsertNcc(full, { name: 'QA', role: 'Operations' }, c);

    const list = await once<Ncc[]>((cb) => sbSubscribeNcc(cb, c));
    const ncc = list.find((x) => x.id === 'ncc-full')!;
    expect(ncc.continent).toBe('Châu Á');
    expect(ncc.country).toBe('Việt Nam');
    expect(ncc.address).toBe('08 Nguyễn Bỉnh Khiêm, P. Sài Gòn, TP.HCM');
    expect(ncc.website).toBe('gemcenter.com.vn');
    expect(ncc.taxCode).toBe('0312345678');
    expect(ncc.status).toBe('active');
    expect(ncc.bank).toEqual(full.bank);
    expect(ncc.paymentTerms).toBe('Cọc 30%, còn lại trước 7 ngày');
    expect(ncc.commission).toBe('10%');
    expect(ncc.creditLimit).toBe(500_000_000);
    expect(ncc.files).toEqual(full.files);
    expect(ncc.tours).toEqual(['Gala 2026']);
    expect(ncc.aiAnalysis).toBe('Đối tác mạnh mảng MICE.');
    expect(ncc.ratings).toEqual(full.ratings);
    expect(ncc.collaborators).toEqual(full.collaborators);
    expect(ncc.createdByU).toBe('tester');
  });

  it('sbUpsertNcc edits only its own row; sbDeleteNcc removes a single supplier', async () => {
    const c = await getViettoursClient();
    const base = (over: Partial<Ncc>): Ncc => ({
      id: '', name: '', sectors: [], location: '', contacts: [], note: '',
      createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'tester', ...over,
    });
    await sbUpsertNcc(base({ id: 'x1', name: 'X1' }), { name: 'QA', role: 'Operations' }, c);
    await sbUpsertNcc(base({ id: 'x2', name: 'X2' }), { name: 'QA', role: 'Operations' }, c);
    // Edit only x1 — x2 must be untouched (the old bug rewrote the whole list).
    await sbUpsertNcc(base({ id: 'x1', name: 'X1 renamed' }), { name: 'QA', role: 'Operations' }, c);
    let list = await once<Ncc[]>((cb) => sbSubscribeNcc(cb, c));
    expect(list.find((x) => x.id === 'x1')!.name).toBe('X1 renamed');
    expect(list.find((x) => x.id === 'x2')!.name).toBe('X2');

    await sbDeleteNcc('x1', c);
    list = await once<Ncc[]>((cb) => sbSubscribeNcc(cb, c));
    expect(list.map((x) => x.id).sort()).toEqual(['x2']);
  });
});
