import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import {
  sbSaveTourPayments, sbGetTourPayments, sbSubscribeTourPayments,
  sbSetApprovalStage, sbSubscribePaymentApprovals,
} from '../../src/lib/supabase';
import type { PaymentRecord, CustomCostItem, TourPayments, PaymentApprovalDoc } from '@/types';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('tour payments gateway', () => {
  beforeEach(async () => {
    await truncate(['payment_records', 'custom_cost_items', 'tour_payments']);
  });

  it('save → get round-trips payments + customItems', async () => {
    const c = await getViettoursClient();
    const payments: Record<string, PaymentRecord> = {
      'hotel-1': { supplier: 'Sheraton', tracked: true, customAmount: 5_000_000 },
      'bus-1': {
        supplier: 'Xe Minh', tracked: false,
        installments: [
          { label: 'Đợt 1', amount: 1_000_000, status: 'paid', paidDate: '2026-06-01' },
          { label: 'Đợt 2', amount: 500_000, status: 'unpaid', paidDate: '' },
        ],
      },
    };
    const customItems: CustomCostItem[] = [
      { key: 'ci-1', catId: 'hotel', catLabel: 'Khách sạn', catIcon: '🏨', catColor: '#f00', name: 'Extra Room', amount: 800_000 },
    ];
    await sbSaveTourPayments('tour-abc', payments, customItems, 'tester', c);

    const got = await sbGetTourPayments('tour-abc', c);
    expect(got).not.toBeNull();
    expect(got!.payments['hotel-1'].supplier).toBe('Sheraton');
    expect(got!.payments['bus-1'].installments).toHaveLength(2);
    expect(got!.payments['bus-1'].installments![0].status).toBe('paid');
    expect(got!.customItems).toHaveLength(1);
    expect(got!.customItems[0].name).toBe('Extra Room');
  });

  it('subscribe yields the same assembled shape', async () => {
    const c = await getViettoursClient();
    await sbSaveTourPayments(
      'tour-sub',
      { 'visa-1': { supplier: 'Embassy', tracked: true } },
      [],
      'tester',
      c,
    );
    const data = await once<TourPayments | null>((cb) => sbSubscribeTourPayments('tour-sub', cb, c));
    expect(data).not.toBeNull();
    expect(data!.payments['visa-1'].supplier).toBe('Embassy');
    expect(data!.customItems).toEqual([]);
  });

  it('save overwrites previous records (full-overwrite parity)', async () => {
    const c = await getViettoursClient();
    await sbSaveTourPayments('tour-over', { 'old-key': { supplier: 'Old' } }, [], 'tester', c);
    await sbSaveTourPayments('tour-over', { 'new-key': { supplier: 'New' } }, [], 'tester', c);
    const got = await sbGetTourPayments('tour-over', c);
    expect(Object.keys(got!.payments)).toEqual(['new-key']);
    expect(got!.payments['new-key'].supplier).toBe('New');
  });
});

describe('payment approvals gateway', () => {
  beforeEach(async () => {
    await truncate(['payment_approval_stages', 'payment_approvals']);
  });

  it('stage 1 approved → finalStatus is pending_stage2', async () => {
    const c = await getViettoursClient();
    await sbSetApprovalStage(
      'appr-key-1', 1, 'approved', 'tester', 'QA Bot', 'Looks good',
      { intendedApprover1Name: 'Boss1', intendedApprover2Name: 'Boss2' }, c,
    );
    const doc = await once<PaymentApprovalDoc>((cb) => sbSubscribePaymentApprovals(cb, c));
    expect(doc['appr-key-1']).toBeDefined();
    expect(doc['appr-key-1'].finalStatus).toBe('pending_stage2');
    expect(doc['appr-key-1'].currentStage).toBe(1);
    expect(doc['appr-key-1'].stage1!.approverName).toBe('QA Bot');
    expect(doc['appr-key-1'].intendedApprover1Name).toBe('Boss1');
    expect(doc['appr-key-1'].intendedApprover2Name).toBe('Boss2');
  });

  it('stage 2 approved → finalStatus is approved', async () => {
    const c = await getViettoursClient();
    await sbSetApprovalStage('appr-key-2', 1, 'approved', 'tester', 'QA', '', {}, c);
    await sbSetApprovalStage('appr-key-2', 2, 'approved', 'tester', 'QA', 'All good', {}, c);
    const doc = await once<PaymentApprovalDoc>((cb) => sbSubscribePaymentApprovals(cb, c));
    expect(doc['appr-key-2'].finalStatus).toBe('approved');
    expect(doc['appr-key-2'].currentStage).toBe(2);
    expect(doc['appr-key-2'].stage2!.status).toBe('approved');
  });

  it('rejected at any stage → finalStatus is rejected', async () => {
    const c = await getViettoursClient();
    await sbSetApprovalStage('appr-key-3', 1, 'rejected', 'tester', 'QA', 'No', {}, c);
    const doc = await once<PaymentApprovalDoc>((cb) => sbSubscribePaymentApprovals(cb, c));
    expect(doc['appr-key-3'].finalStatus).toBe('rejected');
  });
});
