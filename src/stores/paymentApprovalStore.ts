import { create } from 'zustand';
import { fbSubscribePaymentApprovals } from '@/lib/dataBackend';
import type { PaymentApprovalDoc } from '@/types';
import type { Unsubscribe } from 'firebase/firestore';

type State = {
  approvals: PaymentApprovalDoc;
  init: () => Unsubscribe;
};

export const usePaymentApprovalStore = create<State>()((set) => ({
  approvals: {},
  init: () =>
    fbSubscribePaymentApprovals((data) => {
      set({ approvals: data });
    }),
}));
