import { describe, it, expect, beforeEach } from 'vitest';
import { getServiceClient, getViettoursClient, truncate } from './_setup';
import { replaceChildren } from '../../src/lib/supabase/helpers';

describe('replaceChildren', () => {
  beforeEach(async () => { await truncate(['customer_contacts', 'customers']); });

  it('replaces the child set for a parent', async () => {
    const admin = getServiceClient();
    const { data: cust } = await admin.from('customers')
      .insert({ name: 'Acme', type: 'company' }).select('id').single();
    const c = await getViettoursClient();
    await replaceChildren(c, 'customer_contacts', 'customer_id', cust!.id, [
      { customer_id: cust!.id, name: 'A', phone: '1', email: '', position: '', sort_order: 0 },
      { customer_id: cust!.id, name: 'B', phone: '2', email: '', position: '', sort_order: 1 },
    ]);
    const { data } = await c.from('customer_contacts').select('name').eq('customer_id', cust!.id).order('sort_order');
    expect(data!.map((r) => r.name)).toEqual(['A', 'B']);
    // replacing again with one row leaves exactly one
    await replaceChildren(c, 'customer_contacts', 'customer_id', cust!.id, [
      { customer_id: cust!.id, name: 'C', phone: '3', email: '', position: '', sort_order: 0 },
    ]);
    const { data: after } = await c.from('customer_contacts').select('name').eq('customer_id', cust!.id);
    expect(after!.map((r) => r.name)).toEqual(['C']);
  });
});
