import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { fbSubscribeNccProducts, fbPushNccProducts } from '@/lib/firebase';
import { useAuthStore } from './authStore';
import type { NccProduct } from '@/types';
import type { Unsubscribe } from 'firebase/firestore';

export const newNccProductId = () => 'np' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Quy đổi một mức giá NCC về VND theo tỷ giá báo giá (VND nếu không có tỷ giá). */
export function priceToVND(amount: number, cur: string, rates: Record<string, number>): number {
  return Math.round((amount || 0) * (rates[cur] || 1));
}

type State = {
  products: NccProduct[];
  loading: boolean;
  syncing: boolean;
  init: () => Unsubscribe;
  save: (product: NccProduct) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export const useNccProductsStore = create<State>()(
  subscribeWithSelector((set, get) => ({
    products: [],
    loading: true,
    syncing: false,

    init: () => {
      set({ loading: true });
      return fbSubscribeNccProducts((list) => set({ products: list, loading: false }));
    },

    save: async (product) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const { products } = get();
      const now = new Date().toISOString();
      const isNew = !products.find((p) => p.id === product.id);
      const stamped: NccProduct = isNew
        ? { ...product, id: product.id || newNccProductId(), createdAt: now, createdBy: u.name }
        : { ...product, updatedAt: now, updatedBy: u.name };
      const next = isNew ? [stamped, ...products] : products.map((p) => (p.id === product.id ? stamped : p));
      set({ products: next, syncing: true });
      try { await fbPushNccProducts(next, { name: u.name, role: u.role }); }
      catch (e) { window.alert('❌ Lỗi đồng bộ sản phẩm NCC: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },

    remove: async (id) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const next = get().products.filter((p) => p.id !== id);
      set({ products: next, syncing: true });
      try { await fbPushNccProducts(next, { name: u.name, role: u.role }); }
      catch (e) { window.alert('❌ Lỗi xoá sản phẩm NCC: ' + (e as Error).message); }
      finally { set({ syncing: false }); }
    },
  })),
);
