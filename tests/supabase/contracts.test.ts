import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbPushContracts, sbGetContracts, sbSubscribeContracts } from '../../src/lib/supabase';
import type { Contract } from '../../src/types/contract';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

const BASE: Contract = {
  id: 'ct-1',
  contractNo: 'HD-001',
  contractDate: '2026-01-01',
  contractStatus: 'signed',
  tourName: 'Hà Nội 3N2Đ',
  tourDest: 'HN',
  tourDays: 3,
  tourNights: 2,
  tourStartDate: '2026-03-01',
  departure: 'HCM',
  contractPax: 20,
  pricePerPax: 3_500_000,
  partyB: { name: 'Công ty ABC', address: '123 HN', tel: '024-1234', rep: 'Nguyễn A', title: 'GĐ', taxCode: '0123456789', email: 'abc@example.com' },
  includes: ['Xe đưa đón', 'Khách sạn 3*'],
  excludes: ['Vé máy bay', 'Bảo hiểm'],
  payments: [
    { id: 'pay-1', label: 'Đặt cọc 30%', mode: 'percent', percent: 30, amount: 2_100_000, dueDate: '2026-02-01', note: '', status: 'paid', paidDate: '2026-02-02', receivedAmount: 2_100_000 },
    { id: 'pay-2', label: 'Thanh toán cuối', mode: 'percent', percent: 70, amount: 4_900_000, dueDate: '2026-03-01', note: 'Trước khởi hành', status: 'pending' },
  ],
  cancels: [
    { when: 'Trước 15 ngày', penalty: 30 },
    { when: 'Trước 7 ngày', penalty: 50 },
  ],
  bondPercent: 30,
  hasAcceptance: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'tester',
};

describe('contracts gateway', () => {
  beforeEach(async () => {
    await truncate(['contract_cancels', 'contract_payments', 'contracts']);
  });

  it('round-trips a contract with 2 payments + 1 cancel + partyB via sbPushContracts / sbGetContracts', async () => {
    const c = await getViettoursClient();
    const contract: Contract = { ...BASE, cancels: [{ when: 'Trước 10 ngày', penalty: 40 }] };
    await sbPushContracts([contract], { name: 'QA', role: 'Sales' }, c);

    const list = await sbGetContracts(c);
    const got = list.find((x) => x.id === 'ct-1')!;
    expect(got).toBeDefined();
    expect(got.contractNo).toBe('HD-001');
    expect(got.partyB.name).toBe('Công ty ABC');
    expect(got.includes).toEqual(['Xe đưa đón', 'Khách sạn 3*']);
    expect(got.excludes).toEqual(['Vé máy bay', 'Bảo hiểm']);
    expect(got.payments).toHaveLength(2);
    expect(got.payments[0].label).toBe('Đặt cọc 30%');
    expect(got.payments[0].status).toBe('paid');
    expect(got.payments[1].label).toBe('Thanh toán cuối');
    expect(got.cancels).toHaveLength(1);
    expect(got.cancels[0].when).toBe('Trước 10 ngày');
    expect(got.cancels[0].penalty).toBe(40);
  });

  it('subscribe fires with assembled Contract[]', async () => {
    const c = await getViettoursClient();
    await sbPushContracts([BASE], { name: 'QA', role: 'Sales' }, c);
    const list = await once<Contract[]>((cb) => sbSubscribeContracts(cb, c));
    expect(list.some((x) => x.id === 'ct-1')).toBe(true);
  });

  it('full-overwrite removes contracts not in the new list', async () => {
    const c = await getViettoursClient();
    await sbPushContracts([BASE, { ...BASE, id: 'ct-2', contractNo: 'HD-002' }], { name: 'QA', role: 'Sales' }, c);
    await sbPushContracts([BASE], { name: 'QA', role: 'Sales' }, c);
    const list = await sbGetContracts(c);
    expect(list.map((x) => x.id)).not.toContain('ct-2');
  });
});
