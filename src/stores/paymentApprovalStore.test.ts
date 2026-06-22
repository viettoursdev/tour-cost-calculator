import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));

import { usePaymentApprovalStore } from './paymentApprovalStore';
import { snapshotInitial } from '@/test/storeReset';
import * as sb from '@/lib/supabase';

const reset = snapshotInitial(usePaymentApprovalStore);
beforeEach(() => { reset(); vi.clearAllMocks(); });

describe('paymentApprovalStore', () => {
  it('starts with empty approvals', () => {
    expect(usePaymentApprovalStore.getState().approvals).toEqual({});
  });

  it('init subscribes to sbSubscribePaymentApprovals', () => {
    usePaymentApprovalStore.getState().init();
    expect(sb.sbSubscribePaymentApprovals).toHaveBeenCalledTimes(1);
  });

  it('updates approvals when the subscription callback fires', () => {
    usePaymentApprovalStore.getState().init();
    const cb = vi.mocked(sb.sbSubscribePaymentApprovals).mock.calls[0][0];
    cb({ contractA: { p1: { stage: 'approved' } as never } } as never);
    expect(usePaymentApprovalStore.getState().approvals)
      .toEqual({ contractA: { p1: { stage: 'approved' } } });
  });

  it('init returns the unsubscribe function from supabase', () => {
    const unsub = usePaymentApprovalStore.getState().init();
    expect(typeof unsub).toBe('function');
  });
});
