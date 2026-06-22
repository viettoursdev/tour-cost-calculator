import { create } from 'zustand';
import {
  sbDeleteItinerary, sbGetItinerary, sbSaveItinerary, sbSubscribeItineraries,
} from '@/lib/supabase';
import type { Itinerary, ItineraryIndexEntry } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type State = {
  list: ItineraryIndexEntry[];
  loading: boolean;
  init: () => Unsubscribe;
  save: (itin: Itinerary, savedBy: string) => Promise<void>;
  load: (id: string) => Promise<Itinerary | null>;
  delete: (id: string) => Promise<void>;
};

export const useItineraryStore = create<State>()((set) => ({
  list: [],
  loading: true,

  init: () => {
    set({ loading: true });
    return sbSubscribeItineraries((items) => {
      set({ list: items, loading: false });
    });
  },

  save: async (itin, savedBy) => {
    await sbSaveItinerary(itin, savedBy);
  },

  load: async (id) => sbGetItinerary(id),

  delete: async (id) => {
    await sbDeleteItinerary(id);
  },
}));
