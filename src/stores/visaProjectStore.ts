import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { fbSubscribeVisaProjects, fbPushVisaProjects } from '@/lib/dataBackend';
import { useAuthStore } from './authStore';
import type { VisaProjectDoc } from '@/types';
import type { Unsubscribe } from 'firebase/firestore';

type State = {
  projects: VisaProjectDoc[];
  loading: boolean;
  syncing: boolean;
  init: () => Unsubscribe;
  save: (proj: VisaProjectDoc) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export const useVisaProjectStore = create<State>()(
  subscribeWithSelector((set, get) => ({
    projects: [],
    loading: true,
    syncing: false,

    init: () => {
      set({ loading: true });
      return fbSubscribeVisaProjects((list) => {
        set({ projects: list, loading: false });
      });
    },

    save: async (proj) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const { projects } = get();
      const now = new Date().toISOString();
      const isNew = !projects.find((p) => p.id === proj.id);
      const stamped: VisaProjectDoc = isNew
        ? { ...proj, createdByUsername: proj.createdByUsername || u.u, createdByName: proj.createdByName || u.name, createdAt: proj.createdAt ?? now, updatedAt: now, updatedBy: u.name }
        : { ...proj, updatedAt: now, updatedBy: u.name };
      const next = isNew
        ? [stamped, ...projects]
        : projects.map((p) => (p.id === proj.id ? stamped : p));
      set({ projects: next, syncing: true });
      try {
        await fbPushVisaProjects(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi đồng bộ dự án visa: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    remove: async (id) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const next = get().projects.filter((p) => p.id !== id);
      set({ projects: next, syncing: true });
      try {
        await fbPushVisaProjects(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi xoá dự án visa: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },
  })),
);
