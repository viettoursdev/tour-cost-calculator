import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { syncsSharedData } from '@/auth/ROLES';
import { fbSubscribeFxRates } from '@/lib/firebase';
import { useRateCardStore } from '@/stores/rateCardStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useCustomerStore } from '@/stores/customerStore';
import { useNccStore } from '@/stores/nccStore';
import { useContractStore } from '@/stores/contractStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { usePaymentApprovalStore } from '@/stores/paymentApprovalStore';
import { useItineraryStore } from '@/stores/itineraryStore';
import { useMenuStore } from '@/stores/menuStore';
import { useRestaurantStore } from '@/stores/restaurantStore';
import { useVisaProductsStore } from '@/stores/visaProductsStore';
import { useVisaProcStore } from '@/stores/visaProcStore';
import { checkContractDeadlines } from '@/lib/notifications';
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
    // Shared data areas (Hợp đồng, Thực đơn, Chương trình, Rate Card, NCC,
    // Khách hàng) sync continuously for everyone EXCEPT Marketing/Admin/Accountant.
    const sync = syncsSharedData(currentUser.role);

    useQuoteStore.getState().init(currentUser);
    const qhUnsub = useQuoteHistoryStore.getState().init(currentUser);
    // FX rates are shared across ALL accounts (not gated by syncsSharedData).
    const fxUnsub = fbSubscribeFxRates((d) => {
      if (d.rates) useQuoteStore.getState().setRatesSynced(d.rates, d._meta?.pushedAt);
    });
    const notifUnsub = useNotificationStore.getState().init(currentUser.u);
    usePaymentStore.getState().init();
    const paUnsub = usePaymentApprovalStore.getState().init();
    const vpUnsub = useVisaProductsStore.getState().init();
    const vprocUnsub = useVisaProcStore.getState().init();

    const rcUnsub = sync ? useRateCardStore.getState().init() : undefined;
    const custUnsub = sync ? useCustomerStore.getState().init() : undefined;
    const nccUnsub = sync ? useNccStore.getState().init() : undefined;
    const contractUnsub = sync ? useContractStore.getState().init() : undefined;
    const itinUnsub = sync ? useItineraryStore.getState().init() : undefined;
    const menuUnsub = sync ? useMenuStore.getState().init() : undefined;
    const restUnsub = sync ? useRestaurantStore.getState().init() : undefined;

    setTimeout(() => { void checkContractDeadlines(currentUser); }, 3000);
    return () => {
      fxUnsub?.();
      rcUnsub?.();
      qhUnsub?.();
      custUnsub?.();
      nccUnsub?.();
      contractUnsub?.();
      notifUnsub?.();
      paUnsub?.();
      itinUnsub?.();
      menuUnsub?.();
      restUnsub?.();
      vpUnsub?.();
      vprocUnsub?.();
    };
  }, [currentUser]);

  if (!currentUser) return <LoginScreen />;
  return <AppShell />;
}
