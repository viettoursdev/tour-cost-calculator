import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { syncsSharedData } from '@/auth/ROLES';
import { getSignInMethod, startActivityTracker } from '@/auth/sessionTimeout';
import { sbSubscribeFxRates } from '@/lib/supabase';
import { useRateCardStore } from '@/stores/rateCardStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useTourProfileStore } from '@/stores/tourProfileStore';
import { useExportRequestStore } from '@/stores/exportRequestStore';
import { useCustomerStore } from '@/stores/customerStore';
import { useNccStore } from '@/stores/nccStore';
import { useNccProductsStore } from '@/stores/nccProductsStore';
import { useContractStore } from '@/stores/contractStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useChatStore } from '@/stores/chatStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { usePaymentApprovalStore } from '@/stores/paymentApprovalStore';
import { useItineraryStore } from '@/stores/itineraryStore';
import { useMenuStore } from '@/stores/menuStore';
import { useRestaurantStore } from '@/stores/restaurantStore';
import { useGuideScheduleStore } from '@/stores/guideScheduleStore';
import { useEmailStore } from '@/stores/emailStore';
import { useTodoStore } from '@/stores/todoStore';
import { useVisaProductsStore } from '@/stores/visaProductsStore';
import { useVisaProcStore } from '@/stores/visaProcStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { useProcessStore } from '@/stores/processStore';
import { useHrStore } from '@/stores/hrStore';
import { useHrGuideStore } from '@/stores/hrGuideStore';
import { useHrEvalStore } from '@/stores/hrEvalStore';
import { useHrRecruitStore } from '@/stores/hrRecruitStore';
import { useHrLeaveStore } from '@/stores/hrLeaveStore';
import { useAttendanceStore } from '@/stores/attendanceStore';
import { useAttendanceConfigStore } from '@/stores/attendanceConfigStore';
import { usePoiStore } from '@/stores/poiStore';
import { useInventoryStore } from '@/stores/inventoryStore';
import { useTrainingStore } from '@/stores/trainingStore';
import { useUiPrefStore } from '@/stores/uiPrefStore';
import { useTableColPrefStore } from '@/stores/tableColPrefStore';
import { checkContractDeadlines, checkVisaDeadlines, checkWorkflowDeadlines, checkProcessDeadlines, checkQuoteDeadlines, checkNccPayments, checkQuoteAcceptances, checkSalesFollowups, checkCustomerFollowups, checkDormantCustomers, checkDocExpiry, checkTodoReminders, checkTourProfileFollowers, checkTrainingDeadlines } from '@/lib/notifications';
import { checkHrExpiry } from '@/lib/hrNotifications';
import { autoBackfillWorkflowIndex } from '@/lib/workflowBackfill';
import { checkAttendanceConfirm } from '@/lib/attendanceNotify';
import { checkLowStock } from '@/lib/inventoryNotifications';
import { checkNotifReminders } from '@/lib/notifReminders';
import { AppShell } from './AppShell';
import { ToastHost } from '@/components/common/ToastHost';
import { UnsavedGuard } from '@/components/common/UnsavedGuard';
import { LoginScreen } from './LoginScreen';

export function MainApp() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const authInit = useAuthStore((s) => s.init);

  useEffect(() => {
    void authInit();
  }, [authInit]);

  useEffect(() => {
    if (!currentUser) return;
    if (getSignInMethod(currentUser.u) !== 'link') return;
    const stop = startActivityTracker(currentUser.u, () => {
      void useAuthStore.getState().expireSession();
    });
    return stop;
  }, [currentUser]);

  // Tùy chọn giao diện cá nhân (sáng/tối + mật độ) + cột bảng: nạp local ngay
  // + đồng bộ cloud. Đăng xuất → về mặc định để không lộ tùy chọn của user trước.
  useEffect(() => {
    useUiPrefStore.getState().load(currentUser?.u ?? null);
    useTableColPrefStore.getState().load(currentUser?.u ?? null);
  }, [currentUser?.u]);

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
    const tpUnsub = useTourProfileStore.getState().init();
    // FX rates are shared across ALL accounts (not gated by syncsSharedData).
    const fxUnsub = sbSubscribeFxRates((d) => {
      if (d.rates) useQuoteStore.getState().setRatesSynced(d.rates, d._meta?.pushedAt, d._meta?.pushedBy);
    });
    // Instant cross-tab sync within the same browser (fires only in OTHER tabs).
    const onFxStorage = (e: StorageEvent) => {
      if (e.key === 'vte_fx_rates' && e.newValue) {
        // LS stores { rates, at } — extract the rates map (not the whole wrapper).
        // persistLocal=false: value already in LS (it triggered this event).
        try {
          const parsed = JSON.parse(e.newValue) as { rates?: Record<string, number> };
          const r = (parsed?.rates ?? parsed) as Record<string, number>;
          useQuoteStore.getState().setRatesSynced(r, undefined, undefined, false);
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', onFxStorage);
    const notifUnsub = useNotificationStore.getState().init(currentUser.u);
    const todoUnsub = useTodoStore.getState().init();
    const chatUnsub = useChatStore.getState().init(currentUser.u, currentUser.name);
    usePaymentStore.getState().init();
    const paUnsub = usePaymentApprovalStore.getState().init();
    const vpUnsub = useVisaProductsStore.getState().init();
    const vprocUnsub = useVisaProcStore.getState().init();
    const vprojUnsub = useVisaProjectStore.getState().init();
    const poiUnsub = usePoiStore.getState().init();
    const processUnsub = useProcessStore.getState().init();
    const hrUnsub = useHrStore.getState().init();
    const hrGuideUnsub = useHrGuideStore.getState().init();
    const hrEvalUnsub = useHrEvalStore.getState().init();
    const hrRecruitUnsub = useHrRecruitStore.getState().init();
    const hrLeaveUnsub = useHrLeaveStore.getState().init();
    const hrAttendanceUnsub = useAttendanceStore.getState().init();
    const hrAttConfigUnsub = useAttendanceConfigStore.getState().init();
    const invUnsub = useInventoryStore.getState().init();
    const trainingUnsub = useTrainingStore.getState().init();
    const exportReqUnsub = useExportRequestStore.getState().init();

    const rcUnsub = sync ? useRateCardStore.getState().init() : undefined;
    const custUnsub = sync ? useCustomerStore.getState().init() : undefined;
    const nccUnsub = sync ? useNccStore.getState().init() : undefined;
    const nccProdUnsub = sync ? useNccProductsStore.getState().init() : undefined;
    const contractUnsub = sync ? useContractStore.getState().init() : undefined;
    const itinUnsub = sync ? useItineraryStore.getState().init() : undefined;
    const menuUnsub = sync ? useMenuStore.getState().init() : undefined;
    const restUnsub = sync ? useRestaurantStore.getState().init() : undefined;
    const guideUnsub = sync ? useGuideScheduleStore.getState().init() : undefined;
    const emailUnsub = sync ? useEmailStore.getState().init() : undefined;

    setTimeout(() => { void checkContractDeadlines(currentUser); }, 3000);
    setTimeout(() => { void checkVisaDeadlines(currentUser); }, 4000);
    setTimeout(() => { void checkWorkflowDeadlines(currentUser); }, 5000);
    setTimeout(() => { void checkProcessDeadlines(currentUser); }, 5200);
    setTimeout(() => { void checkQuoteDeadlines(currentUser); }, 5500);
    setTimeout(() => { void checkNccPayments(currentUser); }, 5800);
    setTimeout(() => { void checkQuoteAcceptances(currentUser); }, 6200);
    setTimeout(() => { void checkSalesFollowups(currentUser); }, 6000);
    setTimeout(() => { void checkCustomerFollowups(currentUser); }, 7000);
    setTimeout(() => { void checkDormantCustomers(currentUser); }, 8000);
    setTimeout(() => { void checkDocExpiry(currentUser); }, 8500);
    setTimeout(() => { void checkHrExpiry(currentUser); }, 8800);
    setTimeout(() => { void checkAttendanceConfirm(currentUser); }, 9600);
    setTimeout(() => { void checkLowStock(currentUser); }, 9400);
    setTimeout(() => { void checkTourProfileFollowers(currentUser); }, 9200);
    setTimeout(() => { void checkTrainingDeadlines(currentUser); }, 9600);
    // Backfill nền chỉ số quy trình cho báo giá cũ → Bảng điều phối & SLA hết trống.
    setTimeout(() => { void autoBackfillWorkflowIndex(); }, 10000);
    // Nhắc lại lặp lại: kiểm tra ngay + mỗi 5 phút khi app mở (gồm cả nhắc việc To-Do).
    const remindOnce = () => {
      checkNotifReminders(useNotificationStore.getState().notifications, currentUser.u);
      void checkTodoReminders(currentUser);
    };
    setTimeout(remindOnce, 9000);
    const remindTimer = setInterval(remindOnce, 5 * 60 * 1000);
    return () => {
      clearInterval(remindTimer);
      window.removeEventListener('storage', onFxStorage);
      fxUnsub?.();
      rcUnsub?.();
      qhUnsub?.();
      tpUnsub?.();
      custUnsub?.();
      nccUnsub?.();
      nccProdUnsub?.();
      contractUnsub?.();
      notifUnsub?.();
      todoUnsub?.();
      chatUnsub?.();
      paUnsub?.();
      itinUnsub?.();
      menuUnsub?.();
      restUnsub?.();
      guideUnsub?.();
      emailUnsub?.();
      vpUnsub?.();
      vprocUnsub?.();
      vprojUnsub?.();
      poiUnsub?.();
      processUnsub?.();
      hrUnsub?.();
      hrGuideUnsub?.();
      hrEvalUnsub?.();
      hrRecruitUnsub?.();
      hrLeaveUnsub?.();
      hrAttendanceUnsub?.();
      hrAttConfigUnsub?.();
      invUnsub?.();
      trainingUnsub?.();
      exportReqUnsub?.();
    };
  }, [currentUser]);

  if (!currentUser) return <LoginScreen />;
  return <><AppShell /><ToastHost /><UnsavedGuard /></>;
}
