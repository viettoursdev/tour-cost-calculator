import { create } from 'zustand';
import {
  sbDeleteMenu, sbGetMenu, sbGetRestaurantTourLinks, sbSaveMenu, sbSubscribeMenus,
} from '@/lib/supabase';
import type { Menu, MenuIndexEntry, RestaurantTourLink } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type State = {
  list: MenuIndexEntry[];
  loading: boolean;
  init: () => Unsubscribe;
  save: (m: Menu, savedBy: string) => Promise<void>;
  load: (id: string) => Promise<Menu | null>;
  delete: (id: string) => Promise<void>;
  /** Bản đồ restaurantId → các tour (menu) đang dùng nhà hàng đó. */
  restaurantLinks: () => Promise<Record<string, RestaurantTourLink[]>>;
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

  restaurantLinks: () => sbGetRestaurantTourLinks(),
}));
