import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { fbSubscribeNcc, fbPushNcc } from '@/lib/firebase';
import { useAuthStore } from './authStore';
import type { Ncc } from '@/types';
import type { Unsubscribe } from 'firebase/firestore';

type NccState = {
  suppliers: Ncc[];
  loading: boolean;
  syncing: boolean;
  init: () => Unsubscribe;
  save: (form: Ncc) => Promise<void>;
  delete: (id: string) => Promise<void>;
};

export const useNccStore = create<NccState>()(
  subscribeWithSelector((set, get) => ({
    suppliers: [],
    loading: false,
    syncing: false,

    init: () => {
      set({ loading: true });
      return fbSubscribeNcc((list) => {
        set({ suppliers: list, loading: false });
      });
    },

    save: async (form) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const { suppliers } = get();
      const isNew = !suppliers.find((s) => s.id === form.id);
      const now = new Date().toISOString();
      const next = isNew
        ? [
            ...suppliers,
            {
              ...form,
              id: form.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              createdAt: now,
              createdBy: u.name,
            },
          ]
        : suppliers.map((s) =>
            s.id === form.id ? { ...form, updatedAt: now, updatedBy: u.name } : s,
          );
      set({ suppliers: next, syncing: true });
      try {
        await fbPushNcc(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi đồng bộ: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    delete: async (id) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const next = get().suppliers.filter((s) => s.id !== id);
      set({ suppliers: next, syncing: true });
      try {
        await fbPushNcc(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi xoá: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },
  })),
);
