import { create } from 'zustand';
import { sbSubscribePaymentApprovals } from '@/lib/supabase';
import type { PaymentApprovalDoc } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type State = {
  approvals: PaymentApprovalDoc;
  init: () => Unsubscribe;
};

export const usePaymentApprovalStore = create<State>()((set) => ({
  approvals: {},
  init: () =>
    sbSubscribePaymentApprovals((data) => {
      set({ approvals: data });
    }),
}));
