// tests/etl/payments.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient, resetAll } from '../../scripts/etl/db.mjs';
import { loadProfiles, makeResolver } from '../../scripts/etl/profiles.mjs';
import { loadTourPayments, loadPaymentApprovals } from '../../scripts/etl/payments.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));
const c = serviceClient();

describe('etl payments', () => {
  let r: ReturnType<typeof makeResolver>;
  beforeAll(async () => {
    await resetAll(c);
    r = makeResolver(await loadProfiles(c, dump));
    await loadTourPayments(c, dump, r);
    await loadPaymentApprovals(c, dump, r);
  });

  it('loads tour payments with records + custom items', async () => {
    const { data: tp } = await c.from('tour_payments').select('tour_key');
    expect(tp).toEqual([{ tour_key: 'tourA' }]);
    const { data: rec } = await c.from('payment_records').select('record_key, supplier');
    expect(rec![0].record_key).toBe('hotel::HotelX');
    const { count: ci } = await c.from('custom_cost_items').select('*', { count: 'exact', head: true });
    expect(ci).toBe(1);
  });

  it('loads approvals with stages, resolving approver UUID', async () => {
    const { data: ap } = await c.from('payment_approvals').select('approval_key, current_stage, final_status');
    expect(ap![0].approval_key).toBe('tourA::deposit');
    expect(ap![0].final_status).toBe('approved');
    const { data: st } = await c.from('payment_approval_stages').select('stage, status, approver_user_id, approver_username');
    expect(st![0].stage).toBe(1);
    expect(st![0].approver_user_id).toBe(r.resolve('tony'));
    expect(st![0].approver_username).toBe('tony');
  });
});
