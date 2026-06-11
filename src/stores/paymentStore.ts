import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { fbSaveTourPayments, fbSubscribeTourPayments } from '@/lib/firebase';
import { useAuthStore } from './authStore';
import type { CustomCostItem, PaymentRecord, TourPayments } from '@/types';
import type { Unsubscribe } from 'firebase/firestore';

type Slot = {
  data: TourPayments;
  unsub: Unsubscribe | null;
  refCount: number;
  pushTimer: ReturnType<typeof setTimeout> | null;
};

type PaymentState = {
  slots: Record<string, Slot>;
  init: () => void;
  ensureSubscribed: (tourKey: string) => void;
  releaseSubscription: (tourKey: string) => void;
  setPayments: (tourKey: string, next: Record<string, PaymentRecord>) => void;
  setCustomItems: (tourKey: string, next: CustomCostItem[]) => void;
  getTour: (tourKey: string) => TourPayments;
};

const EMPTY: TourPayments = { payments: {}, customItems: [] };

const LS_PAYMENTS_PREFIX = 'vte_payments_';
const LS_CUSTOM_PREFIX = 'vte_pay_custom_';

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / disabled */
  }
}

export const usePaymentStore = create<PaymentState>()(
  subscribeWithSelector((set, get) => ({
    slots: {},

    init: () => {
      const slots: Record<string, Slot> = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key) continue;
          if (key.startsWith(LS_PAYMENTS_PREFIX)) {
            const tourKey = key.slice(LS_PAYMENTS_PREFIX.length);
            const payments = readLocal<Record<string, PaymentRecord>>(key, {});
            slots[tourKey] = slots[tourKey] ?? { data: { ...EMPTY }, unsub: null, refCount: 0, pushTimer: null };
            slots[tourKey].data = { ...slots[tourKey].data, payments };
          } else if (key.startsWith(LS_CUSTOM_PREFIX)) {
            const tourKey = key.slice(LS_CUSTOM_PREFIX.length);
            const customItems = readLocal<CustomCostItem[]>(key, []);
            slots[tourKey] = slots[tourKey] ?? { data: { ...EMPTY }, unsub: null, refCount: 0, pushTimer: null };
            slots[tourKey].data = { ...slots[tourKey].data, customItems };
          }
        }
      } catch {
        /* ignore */
      }
      set({ slots });
    },

    ensureSubscribed: (tourKey) => {
      if (!tourKey) return;
      const slots = { ...get().slots };
      let slot = slots[tourKey];
      if (!slot) {
        slot = { data: { ...EMPTY }, unsub: null, refCount: 0, pushTimer: null };
        slots[tourKey] = slot;
      }
      slot.refCount += 1;
      if (!slot.unsub) {
        slot.unsub = fbSubscribeTourPayments(tourKey, (data) => {
          if (!data) return;
          const cur = get().slots[tourKey];
          if (!cur) return;
          const merged: TourPayments = {
            payments: data.payments ?? {},
            customItems: data.customItems ?? [],
          };
          cur.data = merged;
          writeLocal(LS_PAYMENTS_PREFIX + tourKey, merged.payments);
          writeLocal(LS_CUSTOM_PREFIX + tourKey, merged.customItems);
          set({ slots: { ...get().slots, [tourKey]: { ...cur } } });
        });
      }
      set({ slots });
    },

    releaseSubscription: (tourKey) => {
      const slots = { ...get().slots };
      const slot = slots[tourKey];
      if (!slot) return;
      slot.refCount = Math.max(0, slot.refCount - 1);
      if (slot.refCount === 0 && slot.unsub) {
        slot.unsub();
        slot.unsub = null;
      }
      set({ slots });
    },

    setPayments: (tourKey, next) => {
      // New slot + data references so the zustand selector (Object.is on the slot)
      // detects the change and re-renders immediately — independent of the cloud
      // round-trip (which may fail/lag). Cloud push stays debounced below.
      const prev = get().slots[tourKey] ?? { data: { ...EMPTY }, unsub: null, refCount: 0, pushTimer: null };
      writeLocal(LS_PAYMENTS_PREFIX + tourKey, next);
      if (prev.pushTimer) clearTimeout(prev.pushTimer);
      const pushTimer = setTimeout(() => {
        const u = useAuthStore.getState().currentUser;
        const savedBy = u?.name ?? 'unknown';
        const latest = get().slots[tourKey]?.data ?? EMPTY;
        fbSaveTourPayments(tourKey, latest.payments, latest.customItems, savedBy).catch(() => {
          /* swallow — local state + localStorage keep the edit; last-write-wins */
        });
      }, 1000);
      const slot: Slot = { ...prev, data: { ...prev.data, payments: next }, pushTimer };
      set({ slots: { ...get().slots, [tourKey]: slot } });
    },

    setCustomItems: (tourKey, next) => {
      const prev = get().slots[tourKey] ?? { data: { ...EMPTY }, unsub: null, refCount: 0, pushTimer: null };
      writeLocal(LS_CUSTOM_PREFIX + tourKey, next);
      if (prev.pushTimer) clearTimeout(prev.pushTimer);
      const pushTimer = setTimeout(() => {
        const u = useAuthStore.getState().currentUser;
        const savedBy = u?.name ?? 'unknown';
        const latest = get().slots[tourKey]?.data ?? EMPTY;
        fbSaveTourPayments(tourKey, latest.payments, latest.customItems, savedBy).catch(() => {
          /* swallow */
        });
      }, 1000);
      const slot: Slot = { ...prev, data: { ...prev.data, customItems: next }, pushTimer };
      set({ slots: { ...get().slots, [tourKey]: slot } });
    },

    getTour: (tourKey) => get().slots[tourKey]?.data ?? EMPTY,
  })),
);
