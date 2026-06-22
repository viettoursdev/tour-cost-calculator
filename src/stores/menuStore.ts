import { create } from 'zustand';
import {
  sbDeleteMenu, sbGetMenu, sbSaveMenu, sbSubscribeMenus,
} from '@/lib/supabase';
import type { Menu, MenuIndexEntry } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type State = {
  list: MenuIndexEntry[];
  loading: boolean;
  init: () => Unsubscribe;
  save: (m: Menu, savedBy: string) => Promise<void>;
  load: (id: string) => Promise<Menu | null>;
  delete: (id: string) => Promise<void>;
};

export const useMenuStore = create<State>()((set) => ({
  list: [],
  loading: true,

  init: () => {
    set({ loading: true });
    return sbSubscribeMenus((items) => {
      set({ list: items, loading: false });
    });
  },

  save: async (m, savedBy) => {
    await sbSaveMenu(m, savedBy);
  },

  load: async (id) => sbGetMenu(id),

  delete: async (id) => {
    await sbDeleteMenu(id);
  },
}));
