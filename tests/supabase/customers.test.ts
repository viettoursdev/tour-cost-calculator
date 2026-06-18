import { describe, it, expect, beforeEach } from 'vitest';
import type { Customer } from '../../src/types';
import { getViettoursClient, truncate } from './_setup';
import { sbPushCustomers, sbSubscribeCustomers } from '../../src/lib/supabase';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('customers gateway', () => {
  beforeEach(async () => { await truncate(['customer_contacts', 'customers']); });

  it('round-trips a customer with contacts', async () => {
    const c = await getViettoursClient();
    await sbPushCustomers([{
      id: 'cust-1', name: 'Acme Co', type: 'company', address: 'HN', taxCode: '123',
      contacts: [{ name: 'Linh', phone: '09', email: 'l@x.vn', position: 'PM' }],
      note: 'vip', createdAt: '2026-01-01T00:00:00Z', createdBy: 'tester',
    }], { name: 'QA', role: 'Sales' }, c);

    const list = await once<Customer[]>((cb) => sbSubscribeCustomers(cb, c));
    const cu = list.find((x) => x.id === 'cust-1')!;
    expect(cu.name).toBe('Acme Co');
    expect(cu.contacts).toEqual([{ name: 'Linh', phone: '09', email: 'l@x.vn', position: 'PM' }]);
  });

  it('preserves original createdAt on upsert (round-trip parity)', async () => {
    const c = await getViettoursClient();
    const originalCreatedAt = '2025-06-15T10:00:00Z';
    const cust: Customer = {
      id: 'cust-2', name: 'Beta Ltd', type: 'company',
      contacts: [{ name: 'An', phone: '08', email: 'a@b.vn', position: 'CEO' }],
      note: '', createdAt: originalCreatedAt, createdBy: 'tester',
    };
    await sbPushCustomers([cust], { name: 'QA', role: 'Sales' }, c);

    const list = await once<Customer[]>((cb) => sbSubscribeCustomers(cb, c));
    const cu = list.find((x) => x.id === 'cust-2')!;
    // Postgres may normalise the tz suffix (Z → +00:00); compare as epoch ms.
    expect(new Date(cu.createdAt).getTime()).toBe(new Date(originalCreatedAt).getTime());
  });

  it('removes deleted customers on full-overwrite push', async () => {
    const c = await getViettoursClient();
    const custA: Customer = {
      id: 'cust-a', name: 'Alpha', type: 'company',
      contacts: [], note: '', createdAt: '2026-01-01T00:00:00Z', createdBy: 'tester',
    };
    const custB: Customer = {
      id: 'cust-b', name: 'Beta', type: 'individual',
      contacts: [], note: '', createdAt: '2026-01-02T00:00:00Z', createdBy: 'tester',
    };
    // Push both A and B first.
    await sbPushCustomers([custA, custB], { name: 'QA', role: 'Sales' }, c);
    // Push only A — B should be removed.
    await sbPushCustomers([custA], { name: 'QA', role: 'Sales' }, c);

    const list = await once<Customer[]>((cb) => sbSubscribeCustomers(cb, c));
    expect(list.find((x) => x.id === 'cust-a')).toBeDefined();
    expect(list.find((x) => x.id === 'cust-b')).toBeUndefined();
  });

  it('round-trips a customer with zero contacts', async () => {
    const c = await getViettoursClient();
    const cust: Customer = {
      id: 'cust-3', name: 'Empty Contacts Co', type: 'company',
      contacts: [], note: '', createdAt: '2026-01-01T00:00:00Z', createdBy: 'tester',
    };
    await sbPushCustomers([cust], { name: 'QA', role: 'Sales' }, c);

    const list = await once<Customer[]>((cb) => sbSubscribeCustomers(cb, c));
    const cu = list.find((x) => x.id === 'cust-3')!;
    expect(cu.contacts).toEqual([]);
  });
});
