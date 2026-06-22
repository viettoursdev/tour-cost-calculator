import { create } from 'zustand';
import {
  sbDeleteVisaProc, sbGetVisaProc, sbSaveVisaProc, sbSubscribeVisaProcs,
} from '@/lib/supabase';
import type { VisaProcDoc, VisaProcIndexEntry } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

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
    return sbSubscribeVisaProcs((items) => {
      set({ list: items, loading: false });
    });
  },

  save: async (d, savedBy) => {
    await sbSaveVisaProc(d, savedBy);
  },

  load: async (id) => sbGetVisaProc(id),

  delete: async (id) => {
    await sbDeleteVisaProc(id);
  },
}));
