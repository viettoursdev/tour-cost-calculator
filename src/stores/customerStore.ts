import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { fbSubscribeCustomers, fbPushCustomers } from '@/lib/firebase';
import { useAuthStore } from './authStore';
import type { Customer } from '@/types';
import type { Unsubscribe } from 'firebase/firestore';

type CustomerState = {
  customers: Customer[];
  loading: boolean;
  syncing: boolean;
  init: () => Unsubscribe;
  save: (form: Customer) => Promise<void>;
  importMany: (rows: Customer[]) => Promise<number>;
  delete: (id: string) => Promise<void>;
};

export const useCustomerStore = create<CustomerState>()(
  subscribeWithSelector((set, get) => ({
    customers: [],
    loading: false,
    syncing: false,

    init: () => {
      set({ loading: true });
      return fbSubscribeCustomers((list) => {
        set({ customers: list, loading: false });
      });
    },

    save: async (form) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const { customers } = get();
      const isNew = !customers.find((c) => c.id === form.id);
      const now = new Date().toISOString();
      const next = isNew
        ? [
            ...customers,
            {
              ...form,
              id: form.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              createdAt: now,
              createdBy: u.name,
            },
          ]
        : customers.map((c) =>
            c.id === form.id ? { ...form, updatedAt: now, updatedBy: u.name } : c,
          );
      set({ customers: next, syncing: true });
      try {
        await fbPushCustomers(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi đồng bộ: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    importMany: async (rows) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return 0;
      const { customers } = get();
      const existing = new Set(customers.map((c) => c.name.trim().toLowerCase()));
      const now = new Date().toISOString();
      const toAdd: Customer[] = [];
      for (const r of rows) {
        const key = (r.name || '').trim().toLowerCase();
        if (!key || existing.has(key)) continue; // skip blank + duplicate-by-name
        existing.add(key);
        toAdd.push({
          ...r,
          id: r.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + toAdd.length,
          createdAt: now,
          createdBy: u.name,
        });
      }
      if (!toAdd.length) return 0;
      const next = [...customers, ...toAdd];
      set({ customers: next, syncing: true });
      try {
        await fbPushCustomers(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi đồng bộ: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
      return toAdd.length;
    },

    delete: async (id) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const next = get().customers.filter((c) => c.id !== id);
      set({ customers: next, syncing: true });
      try {
        await fbPushCustomers(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi xoá: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },
  })),
);
