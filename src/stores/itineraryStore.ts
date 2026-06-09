import { create } from 'zustand';
import {
  fbDeleteItinerary, fbGetItinerary, fbSaveItinerary, fbSubscribeItineraries,
} from '@/lib/firebase';
import type { Itinerary, ItineraryIndexEntry } from '@/types';
import type { Unsubscribe } from 'firebase/firestore';

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
    return fbSubscribeItineraries((items) => {
      set({ list: items, loading: false });
    });
  },

  save: async (itin, savedBy) => {
    await fbSaveItinerary(itin, savedBy);
  },

  load: async (id) => fbGetItinerary(id),

  delete: async (id) => {
    await fbDeleteItinerary(id);
  },
}));
