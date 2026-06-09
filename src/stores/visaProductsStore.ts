import { create } from 'zustand';
import { fbSaveVisaProducts, fbSubscribeVisaProducts } from '@/lib/firebase';
import { RATES_INIT } from '@/components/quote/constants';
import type { VisaProduct } from '@/types';
import type { Unsubscribe } from 'firebase/firestore';

type State = {
  products: VisaProduct[];
  rates: Record<string, number>;
  loaded: boolean;
  init: () => Unsubscribe;
  save: (data: { products: VisaProduct[]; rates: Record<string, number> }, savedBy: string) => Promise<void>;
};

export const useVisaProductsStore = create<State>()((set) => ({
  products: [],
  rates: { ...RATES_INIT },
  loaded: false,

  init: () => fbSubscribeVisaProducts((d) => {
    if (d) {
      set((s) => ({
        products: d.products ?? [],
        rates: d.rates && Object.keys(d.rates).length ? { ...s.rates, ...d.rates } : s.rates,
        loaded: true,
      }));
    } else {
      set({ loaded: true });
    }
  }),

  save: async (data, savedBy) => {
    set({ products: data.products, rates: data.rates });
    try {
      await fbSaveVisaProducts(data, savedBy);
    } catch (e) {
      window.alert('Lỗi đồng bộ visa: ' + (e as Error).message);
    }
  },
}));
