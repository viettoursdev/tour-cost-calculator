import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { sbSubscribeHrEvaluations, sbUpsertHrEvaluation, sbDeleteHrEvaluation } from '@/lib/supabase';
import { useAuthStore } from './authStore';
import type { HrEvaluation } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type HrEvalState = {
  evaluations: HrEvaluation[];
  loading: boolean;
  syncing: boolean;
  init: () => Unsubscribe;
  save: (form: HrEvaluation) => Promise<void>;
  delete: (id: string) => Promise<void>;
};

const newId = () => 'ev' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const useHrEvalStore = create<HrEvalState>()(
  subscribeWithSelector((set, get) => ({
    evaluations: [],
    loading: false,
    syncing: false,

    init: () => {
      set({ loading: true });
      return sbSubscribeHrEvaluations((list) => set({ evaluations: list, loading: false }));
    },

    save: async (form) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const { evaluations } = get();
      const isNew = !form.id || !evaluations.find((e) => e.id === form.id);
      const now = new Date().toISOString();
      const saved: HrEvaluation = isNew
        ? { ...form, id: form.id || newId(), createdAt: now, createdBy: u.name }
        : { ...form, updatedAt: now, updatedBy: u.name };
      const next = isNew ? [saved, ...evaluations] : evaluations.map((e) => (e.id === saved.id ? saved : e));
      set({ evaluations: next, syncing: true });
      try {
        // Per-row — CHỈ ghi đánh giá vừa sửa (chống wipe khi 2 người chấm song song).
        await sbUpsertHrEvaluation(saved, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi đồng bộ đánh giá: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    delete: async (id) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const next = get().evaluations.filter((e) => e.id !== id);
      set({ evaluations: next, syncing: true });
      try {
        await sbDeleteHrEvaluation(id); // targeted — KHÔNG full-overwrite
      } catch (e) {
        window.alert('❌ Lỗi xoá đánh giá: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },
  })),
);
