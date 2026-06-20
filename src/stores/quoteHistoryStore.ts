import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { fbSubscribeQuoteHistory, fbSubscribeDMCQuoteHistory } from '@/lib/dataBackend';
import { useAuthStore } from './authStore';
import type { CloudQuoteEntry, Template, User } from '@/types';
import type { Unsubscribe } from 'firebase/firestore';

type QuoteHistoryState = {
  quotes: CloudQuoteEntry[];          // regular template quotes
  dmcQuotes: CloudQuoteEntry[];       // DMC template quotes (separate Firestore doc)
  loading: boolean;
  error: string | null;
  init: (user: User) => Unsubscribe;
  visibleQuotes: (template?: Template) => CloudQuoteEntry[];
};

export const useQuoteHistoryStore = create<QuoteHistoryState>()(
  subscribeWithSelector((set, get) => ({
    quotes: [],
    dmcQuotes: [],
    loading: false,
    error: null,

    init: (_user) => {
      set({ loading: true, error: null });
      const u1 = fbSubscribeQuoteHistory((quotes) => {
        set({ quotes, loading: false });
      });
      const u2 = fbSubscribeDMCQuoteHistory((dmcQuotes) => {
        set({ dmcQuotes });
      });
      return () => {
        u1();
        u2();
      };
    },

    visibleQuotes: (template) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return [];
      const src = template === 'dmc' ? get().dmcQuotes : get().quotes;
      return src.filter((q) => {
        const collabs = q.collaborators ?? [];
        return q.createdByUsername === u.u || collabs.some((c) => c.u === u.u);
      });
    },
  })),
);
