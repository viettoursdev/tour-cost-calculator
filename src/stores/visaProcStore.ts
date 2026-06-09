import { create } from 'zustand';
import {
  fbDeleteVisaProc, fbGetVisaProc, fbSaveVisaProc, fbSubscribeVisaProcs,
} from '@/lib/firebase';
import type { VisaProcDoc, VisaProcIndexEntry } from '@/types';
import type { Unsubscribe } from 'firebase/firestore';

type State = {
  list: VisaProcIndexEntry[];
  loading: boolean;
  init: () => Unsubscribe;
  save: (d: VisaProcDoc, savedBy: string) => Promise<void>;
  load: (id: string) => Promise<VisaProcDoc | null>;
  delete: (id: string) => Promise<void>;
};

export const useVisaProcStore = create<State>()((set) => ({
  list: [],
  loading: true,

  init: () => {
    set({ loading: true });
    return fbSubscribeVisaProcs((items) => {
      set({ list: items, loading: false });
    });
  },

  save: async (d, savedBy) => {
    await fbSaveVisaProc(d, savedBy);
  },

  load: async (id) => fbGetVisaProc(id),

  delete: async (id) => {
    await fbDeleteVisaProc(id);
  },
}));
