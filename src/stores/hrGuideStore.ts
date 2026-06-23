import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { sbSubscribeHrGuides, sbPushHrGuides } from '@/lib/supabase';
import { useAuthStore } from './authStore';
import type { HrGuide } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type HrGuideState = {
  guides: HrGuide[];
  loading: boolean;
  syncing: boolean;
  init: () => Unsubscribe;
  save: (form: HrGuide) => Promise<void>;
  delete: (id: string) => Promise<void>;
};

const newId = () => 'gd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const useHrGuideStore = create<HrGuideState>()(
  subscribeWithSelector((set, get) => ({
    guides: [],
    loading: false,
    syncing: false,

    init: () => {
      set({ loading: true });
      return sbSubscribeHrGuides((list) => {
        set({ guides: list, loading: false });
      });
    },

    save: async (form) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const { guides } = get();
      const isNew = !form.id || !guides.find((g) => g.id === form.id);
      const now = new Date().toISOString();
      const next = isNew
        ? [{ ...form, id: form.id || newId(), createdAt: now, createdBy: u.name }, ...guides]
        : guides.map((g) => (g.id === form.id ? { ...form, updatedAt: now, updatedBy: u.name } : g));
      set({ guides: next, syncing: true });
      try {
        await sbPushHrGuides(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi đồng bộ HDV: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    delete: async (id) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const next = get().guides.filter((g) => g.id !== id);
      set({ guides: next, syncing: true });
      try {
        await sbPushHrGuides(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi xoá HDV: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },
  })),
);
