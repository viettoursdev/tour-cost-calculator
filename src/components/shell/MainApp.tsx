import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useRateCardStore } from '@/stores/rateCardStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useCustomerStore } from '@/stores/customerStore';
import { useNccStore } from '@/stores/nccStore';
import { useContractStore } from '@/stores/contractStore';
import { AppShell } from './AppShell';
import { LoginScreen } from './LoginScreen';

export function MainApp() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const authInit = useAuthStore((s) => s.init);

  useEffect(() => {
    void authInit();
  }, [authInit]);

  useEffect(() => {
    if (!currentUser) {
      useQuoteStore.getState().reset();
      return;
    }
    const rcUnsub = useRateCardStore.getState().init();
    useQuoteStore.getState().init(currentUser);
    const qhUnsub = useQuoteHistoryStore.getState().init(currentUser);
    const custUnsub = useCustomerStore.getState().init();
    const nccUnsub = useNccStore.getState().init();
    const contractUnsub = useContractStore.getState().init();
    return () => {
      rcUnsub?.();
      qhUnsub?.();
      custUnsub?.();
      nccUnsub?.();
      contractUnsub?.();
    };
  }, [currentUser]);

  if (!currentUser) return <LoginScreen />;
  return <AppShell />;
}
