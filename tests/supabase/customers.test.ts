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
});
