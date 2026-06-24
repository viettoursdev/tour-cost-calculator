import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { sbSubscribeHrLeaves, sbPushHrLeaves } from '@/lib/supabase';
import { useAuthStore } from './authStore';
import type { HrLeave, LeaveStatus } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type HrLeaveState = {
  leaves: HrLeave[];
  loading: boolean;
  syncing: boolean;
  init: () => Unsubscribe;
  save: (form: HrLeave) => Promise<void>;
  delete: (id: string) => Promise<void>;
  /** Duyệt / từ chối đơn (người duyệt + thời điểm + ghi chú). */
  decide: (id: string, status: Extract<LeaveStatus, 'approved' | 'rejected'>, note?: string) => Promise<void>;
};

const newId = () => 'lv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const useHrLeaveStore = create<HrLeaveState>()(
  subscribeWithSelector((set, get) => ({
    leaves: [],
    loading: false,
    syncing: false,

    init: () => {
      set({ loading: true });
      return sbSubscribeHrLeaves((list) => set({ leaves: list, loading: false }));
    },

    save: async (form) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const { leaves } = get();
      const isNew = !form.id || !leaves.find((l) => l.id === form.id);
      const now = new Date().toISOString();
      const next = isNew
        ? [{ ...form, id: form.id || newId(), createdAt: now, createdBy: u.name }, ...leaves]
        : leaves.map((l) => (l.id === form.id ? { ...form, updatedAt: now, updatedBy: u.name } : l));
      set({ leaves: next, syncing: true });
      try {
        await sbPushHrLeaves(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi đồng bộ nghỉ phép: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    decide: async (id, status, note) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const lv = get().leaves.find((l) => l.id === id);
      if (!lv) return;
      await get().save({ ...lv, status, approverName: u.name, decidedAt: new Date().toISOString(), decisionNote: note ?? '' });
    },

    delete: async (id) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const next = get().leaves.filter((l) => l.id !== id);
      set({ leaves: next, syncing: true });
      try {
        await sbPushHrLeaves(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi xoá đơn nghỉ: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },
  })),
);
