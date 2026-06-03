import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { fbSubscribeQuoteHistory } from '@/lib/firebase';
import { useAuthStore } from './authStore';
import type { CloudQuoteEntry, User } from '@/types';
import type { Unsubscribe } from 'firebase/firestore';

type QuoteHistoryState = {
  quotes: CloudQuoteEntry[];
  loading: boolean;
  error: string | null;
  init: (user: User) => Unsubscribe;
  visibleQuotes: () => CloudQuoteEntry[];
};

export const useQuoteHistoryStore = create<QuoteHistoryState>()(
  subscribeWithSelector((set, get) => ({
    quotes: [],
    loading: false,
    error: null,

    init: (_user) => {
      set({ loading: true, error: null });
      const unsub = fbSubscribeQuoteHistory((quotes) => {
        set({ quotes, loading: false });
      });
      return unsub;
    },

    visibleQuotes: () => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return [];
      return get().quotes.filter((q) => {
        // Defensive: legacy-written entries may have a missing `collaborators` field.
        const collabs = q.collaborators ?? [];
        return q.createdByUsername === u.u || collabs.some((c) => c.u === u.u);
      });
    },
  })),
);
