import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbPushNccProducts, sbSubscribeNccProducts } from '../../src/lib/supabase';
import type { NccProduct } from '../../src/types';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('ncc_products gateway', () => {
  beforeEach(async () => {
    await truncate(['attachments', 'ncc_product_prices', 'ncc_products', 'supplier_contacts', 'suppliers']);
  });

  it('round-trips a product with prices and a file attachment', async () => {
    const c = await getViettoursClient();
    await sbPushNccProducts([{
      id: 'prod-1',
      nccId: null,
      nccName: 'Sunrise Hotel',
      category: 'hotel',
      name: 'Phòng Deluxe',
      description: 'Hướng biển, tầng cao',
      prices: [
        { id: 'pr-1', label: 'Mùa cao điểm', amount: 2_500_000, cur: 'VND', unit: 'đêm', note: 'T6-T8' },
        { id: 'pr-2', label: 'Mùa thấp điểm', amount: 1_800_000, cur: 'VND', unit: 'đêm' },
      ],
      files: [
        { key: 'r2-prod-1-quote.pdf', name: 'báo giá.pdf', uploadedBy: 'Hoa', uploadedAt: '2026-03-01T08:00:00.000Z' },
      ],
      note: 'Giá chưa VAT',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'tester',
    } as NccProduct], { name: 'QA', role: 'Operations' }, c);

    const list = await once<NccProduct[]>((cb) => sbSubscribeNccProducts(cb, c));
    const prod = list.find((x) => x.id === 'prod-1')!;
    expect(prod.name).toBe('Phòng Deluxe');
    expect(prod.nccName).toBe('Sunrise Hotel');
    expect(prod.category).toBe('hotel');
    expect(prod.description).toBe('Hướng biển, tầng cao');
    expect(prod.note).toBe('Giá chưa VAT');
    expect(prod.createdAt).toBe('2026-01-01T00:00:00.000Z');
    // ncc_product_prices has no legacy_id column — price ids are Postgres-generated UUIDs.
    // We assert the content fields only (label, amount, cur, unit, note) and ignore id.
    expect(prod.prices).toHaveLength(2);
    expect(prod.prices[0]).toMatchObject({ label: 'Mùa cao điểm', amount: 2_500_000, cur: 'VND', unit: 'đêm', note: 'T6-T8' });
    expect(prod.prices[1]).toMatchObject({ label: 'Mùa thấp điểm', amount: 1_800_000, cur: 'VND', unit: 'đêm' });
    expect(prod.files).toEqual([
      { key: 'r2-prod-1-quote.pdf', name: 'báo giá.pdf', uploadedBy: 'Hoa', uploadedAt: '2026-03-01T08:00:00.000Z' },
    ]);
  });

  it('full-overwrite: removes products not in the new list', async () => {
    const c = await getViettoursClient();
    const base: NccProduct = {
      id: 'prod-placeholder',
      nccId: null,
      nccName: 'X',
      category: 'transport',
      name: 'X',
      prices: [],
      files: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'tester',
    };
    await sbPushNccProducts([
      { ...base, id: 'prod-a', name: 'A' },
      { ...base, id: 'prod-b', name: 'B' },
    ], { name: 'QA', role: 'Operations' }, c);
    await sbPushNccProducts([
      { ...base, id: 'prod-a', name: 'A v2' },
    ], { name: 'QA', role: 'Operations' }, c);
    const list = await once<NccProduct[]>((cb) => sbSubscribeNccProducts(cb, c));
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('A v2');
  });
});
