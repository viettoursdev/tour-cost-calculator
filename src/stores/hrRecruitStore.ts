import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  sbSubscribeHrJobPostings, sbPushHrJobPostings,
  sbSubscribeHrCandidates, sbPushHrCandidates,
} from '@/lib/supabase';
import { useAuthStore } from './authStore';
import type { HrJobPosting, HrCandidate } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type HrRecruitState = {
  postings: HrJobPosting[];
  candidates: HrCandidate[];
  loading: boolean;
  syncing: boolean;
  init: () => Unsubscribe;
  savePosting: (form: HrJobPosting) => Promise<void>;
  deletePosting: (id: string) => Promise<void>;
  saveCandidate: (form: HrCandidate) => Promise<void>;
  deleteCandidate: (id: string) => Promise<void>;
  /** Đổi giai đoạn pipeline cho 1 ứng viên (kéo-thả Kanban). */
  moveCandidate: (id: string, stage: HrCandidate['stage']) => Promise<void>;
};

const newPid = () => 'jp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const newCid = () => 'ca' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const useHrRecruitStore = create<HrRecruitState>()(
  subscribeWithSelector((set, get) => ({
    postings: [],
    candidates: [],
    loading: false,
    syncing: false,

    init: () => {
      set({ loading: true });
      const u1 = sbSubscribeHrJobPostings((list) => set({ postings: list, loading: false }));
      const u2 = sbSubscribeHrCandidates((list) => set({ candidates: list }));
      return () => { u1(); u2(); };
    },

    savePosting: async (form) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const { postings } = get();
      const isNew = !form.id || !postings.find((p) => p.id === form.id);
      const now = new Date().toISOString();
      const next = isNew
        ? [{ ...form, id: form.id || newPid(), createdAt: now, createdBy: u.name }, ...postings]
        : postings.map((p) => (p.id === form.id ? { ...form, updatedAt: now, updatedBy: u.name } : p));
      set({ postings: next, syncing: true });
      try {
        await sbPushHrJobPostings(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi đồng bộ tin tuyển dụng: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    deletePosting: async (id) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const next = get().postings.filter((p) => p.id !== id);
      set({ postings: next, syncing: true });
      try {
        await sbPushHrJobPostings(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi xoá tin tuyển dụng: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    saveCandidate: async (form) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const { candidates } = get();
      const isNew = !form.id || !candidates.find((c) => c.id === form.id);
      const now = new Date().toISOString();
      const next = isNew
        ? [{ ...form, id: form.id || newCid(), createdAt: now, createdBy: u.name }, ...candidates]
        : candidates.map((c) => (c.id === form.id ? { ...form, updatedAt: now, updatedBy: u.name } : c));
      set({ candidates: next, syncing: true });
      try {
        await sbPushHrCandidates(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi đồng bộ ứng viên: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    deleteCandidate: async (id) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const next = get().candidates.filter((c) => c.id !== id);
      set({ candidates: next, syncing: true });
      try {
        await sbPushHrCandidates(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi xoá ứng viên: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    moveCandidate: async (id, stage) => {
      const c = get().candidates.find((x) => x.id === id);
      if (!c || c.stage === stage) return;
      await get().saveCandidate({ ...c, stage });
    },
  })),
);
