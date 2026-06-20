import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import { fbPullMasterRC, fbPushMasterRC, fbSubscribeMasterRC } from '@/lib/dataBackend';
import { migrateLegacyRateCard } from '@/lib/storage';
import { debounce } from '@/lib/util';
import { useAuthStore } from './authStore';
import type { RateCard } from '@/types';
import type { Unsubscribe } from 'firebase/firestore';

const EMPTY_RC: RateCard = { hotels: {}, visaRates: {}, otherRates: {} };

type Status = 'idle' | 'syncing' | 'error';

type RateCardState = {
  rates: RateCard;
  status: Status;
  init: () => Unsubscribe | undefined;
  setRates: (next: RateCard) => void;
  updateHotels: (city: string, rows: RateCard['hotels'][string]) => void;
  updateVisa: (visaRates: RateCard['visaRates']) => void;
  updateOtherRate: (key: string, value: RateCard['otherRates'][string]) => void;
};

let pushDebounced: ((rc: RateCard, pushedBy: string) => void) | null = null;
// `pushedAt` of this client's most recent push. The onSnapshot listener uses it
// to ignore our own write when it round-trips back (~2s later) — applying it
// would clobber any edits typed in the meantime and disrupt the active input.
let lastSelfPushAt: string | null = null;

export const useRateCardStore = create<RateCardState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        rates: EMPTY_RC,
        status: 'idle',

        init: () => {
          // 1. One-time legacy migration.
          const migrated = migrateLegacyRateCard();
          if (migrated) set({ rates: migrated });

          // 2. Pull current cloud state.
          void fbPullMasterRC().then((cloud) => {
            if (cloud)
              set({
                rates: {
                  hotels: cloud.hotels,
                  visaRates: cloud.visaRates,
                  otherRates: cloud.otherRates,
                },
              });
          });

          // 3. Wire push debouncer (2s, matches legacy auto-sync).
          if (!pushDebounced) {
            pushDebounced = debounce((rc: RateCard, pushedBy: string) => {
              fbPushMasterRC(rc, pushedBy)
                .then((pushedAt) => {
                  lastSelfPushAt = pushedAt;
                  set({ status: 'idle' });
                })
                .catch(() => set({ status: 'error' }));
            }, 2000);
          }

          // 4. Subscribe to remote changes from other clients.
          return fbSubscribeMasterRC((cloud) => {
            // Ignore the echo of our own push — applying it would overwrite
            // local edits made after the push and reset the active input.
            if (cloud._meta?.pushedAt && cloud._meta.pushedAt === lastSelfPushAt) return;
            set({
              rates: {
                hotels: cloud.hotels,
                visaRates: cloud.visaRates,
                otherRates: cloud.otherRates,
              },
            });
          });
        },

        setRates: (next) => {
          const u = useAuthStore.getState().currentUser;
          const pushedBy = u ? `${u.name} (${u.role})` : 'unknown';
          set({ rates: next, status: 'syncing' });
          pushDebounced?.(next, pushedBy);
        },

        updateHotels: (city, rows) => {
          const next: RateCard = {
            ...get().rates,
            hotels: { ...get().rates.hotels, [city]: rows },
          };
          get().setRates(next);
        },

        updateVisa: (visaRates) => {
          const next: RateCard = { ...get().rates, visaRates };
          get().setRates(next);
        },

        updateOtherRate: (key, value) => {
          const next: RateCard = {
            ...get().rates,
            otherRates: { ...get().rates.otherRates, [key]: value },
          };
          get().setRates(next);
        },
      }),
      { name: 'vte_master_rate_card' },
    ),
  ),
);
