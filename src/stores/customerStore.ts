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
