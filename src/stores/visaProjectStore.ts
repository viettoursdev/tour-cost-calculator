import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { sbSubscribeVisaProjects, sbPushVisaProjects } from '@/lib/supabase';
import { useAuthStore } from './authStore';
import type { VisaProjectDoc } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type State = {
  projects: VisaProjectDoc[];
  loading: boolean;
  syncing: boolean;
  init: () => Unsubscribe;
  save: (proj: VisaProjectDoc) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Tạo dự án visa liên kết một báo giá (idempotent — trả về dự án đã có nếu
   *  báo giá đã được gắn). Dùng cho "Hồ sơ tour" (Deal Cockpit). */
  spawnFromQuote: (q: { quoteId: string; quoteName: string; country?: string; departDate?: string | null }) => Promise<VisaProjectDoc | null>;
};

export const useVisaProjectStore = create<State>()(
  subscribeWithSelector((set, get) => ({
    projects: [],
    loading: true,
    syncing: false,

    init: () => {
      set({ loading: true });
      return sbSubscribeVisaProjects((list) => {
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
        await sbPushVisaProjects(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi đồng bộ dự án visa: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },

    spawnFromQuote: async ({ quoteId, quoteName, country, departDate }) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return null;
      const existing = get().projects.find((p) => p.linkedQuoteId === quoteId);
      if (existing) return existing; // đã gắn → không tạo trùng
      // Lazy-import factory để không kéo visa/constants vào bundle của store.
      const { newVisaProject } = await import('@/components/visa/constants');
      const proj: VisaProjectDoc = {
        ...newVisaProject(u),
        name: quoteName,
        country: country?.trim() ?? '',
        status: 'planning',
        linkedQuoteId: quoteId,
        linkedQuoteName: quoteName,
        startDate: new Date().toISOString().slice(0, 10),
        departureDate: departDate ?? null,
      };
      await get().save(proj);
      return proj;
    },

    remove: async (id) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const next = get().projects.filter((p) => p.id !== id);
      set({ projects: next, syncing: true });
      try {
        await sbPushVisaProjects(next, { name: u.name, role: u.role });
      } catch (e) {
        window.alert('❌ Lỗi xoá dự án visa: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    },
  })),
);
