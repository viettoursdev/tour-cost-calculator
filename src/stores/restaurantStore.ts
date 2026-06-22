import { create } from 'zustand';
import { sbSaveRestaurants, sbSubscribeRestaurants } from '@/lib/supabase';
import type { Restaurant } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type State = {
  list: Restaurant[];
  loading: boolean;
  init: () => Unsubscribe;
  save: (next: Restaurant[], savedBy: string) => Promise<void>;
};

export const useRestaurantStore = create<State>()((set) => ({
  list: [],
  loading: true,

  init: () => {
    set({ loading: true });
    return sbSubscribeRestaurants((items) => {
      set({ list: items, loading: false });
    });
  },

  save: async (next, savedBy) => {
    set({ list: next });
    try {
      await sbSaveRestaurants(next, savedBy);
    } catch (e) {
      window.alert('Lỗi đồng bộ nhà hàng: ' + (e as Error).message);
    }
  },
}));
