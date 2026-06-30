import { describe, it, expect, beforeEach } from 'vitest';
import type { Customer, CustomerInteraction } from '../../src/types/customer';
import { getViettoursClient, truncate } from './_setup';
import { sbPushCustomers, sbSubscribeCustomers, sbDeleteCustomers } from '../../src/lib/supabase';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('customers gateway', () => {
  beforeEach(async () => { await truncate(['customer_interactions', 'customer_contacts', 'customers']); });

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

  it('push is UPSERT-ONLY — không xoá khách vắng mặt (chống wipe khi sửa song song)', async () => {
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
    // Push only A (mô phỏng danh sách CŨ) — B PHẢI còn nguyên (upsert-only, không xoá-diff).
    await sbPushCustomers([custA], { name: 'QA', role: 'Sales' }, c);
    let list = await once<Customer[]>((cb) => sbSubscribeCustomers(cb, c));
    expect(list.find((x) => x.id === 'cust-a')).toBeDefined();
    expect(list.find((x) => x.id === 'cust-b')).toBeDefined();

    // Xoá thật chỉ qua sbDeleteCustomers (targeted).
    await sbDeleteCustomers([custB], c);
    list = await once<Customer[]>((cb) => sbSubscribeCustomers(cb, c));
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

  it('round-trips CRM fields: source, tags, interactions, nextFollowUp', async () => {
    const c = await getViettoursClient();
    const interactions: CustomerInteraction[] = [
      { id: 'ia-1', at: '2026-01-10T09:00:00Z', byU: 'sales1', byName: 'Hoa', type: 'call', text: 'Gọi tư vấn tour' },
      { id: 'ia-2', at: '2026-01-15T14:00:00Z', byU: 'sales2', byName: 'Minh', type: 'email', text: 'Gửi báo giá' },
    ];
    const cust: Customer = {
      id: 'cust-crm', name: 'VIP Corp', type: 'company',
      contacts: [], note: '',
      source: 'Hội chợ Du lịch 2026',
      tags: ['vip', 'intl'],
      interactions,
      nextFollowUp: { date: '2026-02-01', note: 'Xác nhận đặt cọc', byU: 'sales1', byName: 'Hoa' },
      createdAt: '2026-01-01T00:00:00Z', createdBy: 'tester',
    };

    await sbPushCustomers([cust], { name: 'QA', role: 'Sales' }, c);
    const list = await once<Customer[]>((cb) => sbSubscribeCustomers(cb, c));
    const cu = list.find((x) => x.id === 'cust-crm')!;

    expect(cu.source).toBe('Hội chợ Du lịch 2026');
    expect(cu.tags).toEqual(['vip', 'intl']);
    expect(cu.nextFollowUp).toEqual({ date: '2026-02-01', note: 'Xác nhận đặt cọc', byU: 'sales1', byName: 'Hoa' });
    expect(cu.interactions).toHaveLength(2);
    const ia1 = cu.interactions!.find((i) => i.id === 'ia-1')!;
    expect(ia1.byU).toBe('sales1');
    expect(ia1.byName).toBe('Hoa');
    expect(ia1.type).toBe('call');
    expect(ia1.text).toBe('Gọi tư vấn tour');
    expect(new Date(ia1.at).getTime()).toBe(new Date('2026-01-10T09:00:00Z').getTime());
    const ia2 = cu.interactions!.find((i) => i.id === 'ia-2')!;
    expect(ia2.type).toBe('email');
  });
});
