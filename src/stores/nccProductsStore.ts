import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { sbSubscribeNccProducts, sbUpsertNccProduct, sbDeleteNccProduct } from '@/lib/supabase';
import { useAuthStore } from './authStore';
import type { NccProduct } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

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
      return sbSubscribeNccProducts((list) => set({ products: list, loading: false }));
    },

    save: async (product) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) {
        window.alert('⚠️ Chưa đăng nhập (hoặc phiên đã hết hạn) — không thể lưu. Vui lòng đăng nhập lại rồi lưu lại.');
        throw new Error('Chưa đăng nhập');
      }
      const prev = get().products; // để rollback nếu đồng bộ thất bại
      const now = new Date().toISOString();
      const isNew = !prev.find((p) => p.id === product.id);
      const stamped: NccProduct = isNew
        ? { ...product, id: product.id || newNccProductId(), createdAt: now, createdBy: u.name }
        : { ...product, updatedAt: now, updatedBy: u.name };
      const next = isNew ? [stamped, ...prev] : prev.map((p) => (p.id === product.id ? stamped : p));
      set({ products: next, syncing: true });
      try {
        // Chỉ upsert ĐÚNG sản phẩm vừa sửa — KHÔNG xoá/đụng sản phẩm khác.
        await sbUpsertNccProduct(stamped, { name: u.name, role: u.role });
      } catch (e) {
        set({ products: prev }); // rollback: không để UI báo "đã lưu" giả
        window.alert('❌ Lỗi đồng bộ sản phẩm NCC (CHƯA lưu được): ' + (e as Error).message);
        throw e;
      } finally {
        set({ syncing: false });
      }
    },

    remove: async (id) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) {
        window.alert('⚠️ Chưa đăng nhập (hoặc phiên đã hết hạn) — không thể xoá. Vui lòng đăng nhập lại.');
        return;
      }
      const prev = get().products;
      set({ products: prev.filter((p) => p.id !== id), syncing: true });
      try {
        await sbDeleteNccProduct(id);
      } catch (e) {
        set({ products: prev }); // rollback — không để mục đã xoá biến mất trên UI nếu DB chưa xoá
        window.alert('❌ Lỗi xoá sản phẩm NCC (CHƯA xoá được): ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },
  })),
);
