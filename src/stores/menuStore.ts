import { create } from 'zustand';
import {
  fbDeleteMenu, fbGetMenu, fbSaveMenu, fbSubscribeMenus,
} from '@/lib/firebase';
import type { Menu, MenuIndexEntry } from '@/types';
import type { Unsubscribe } from 'firebase/firestore';

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
    return fbSubscribeMenus((items) => {
      set({ list: items, loading: false });
    });
  },

  save: async (m, savedBy) => {
    await fbSaveMenu(m, savedBy);
  },

  load: async (id) => fbGetMenu(id),

  delete: async (id) => {
    await fbDeleteMenu(id);
  },
}));
