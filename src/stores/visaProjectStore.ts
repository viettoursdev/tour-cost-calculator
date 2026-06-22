import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { sbSubscribeVisaProjects, sbPushVisaProjects } from '@/lib/supabase';
import { normalizeVN } from '@/lib/search';
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
  /** Tạo MỘT bộ hồ sơ visa gắn với (báo giá + quốc gia). Một yêu cầu/tour có thể
   *  có NHIỀU bộ — mỗi nước một bộ. Idempotent theo (quoteId + quốc gia): cùng báo
   *  giá + cùng nước → trả bộ đã có; khác nước → tạo bộ mới. Tự áp mẫu thủ tục
   *  đúng nước. Dùng cho "Hồ sơ tour" (Deal Cockpit). */
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
      const wantC = normalizeVN(country);
      // Idempotent theo (báo giá + quốc gia): cùng nước → không tạo trùng.
      const existing = get().projects.find((p) => p.linkedQuoteId === quoteId && normalizeVN(p.country) === wantC);
      if (existing) return existing;
      // Lazy-import factory + mẫu để không kéo visa/constants vào bundle store.
      const { newVisaProject, newVisaMilestone, VISA_PROC_PRESETS, visaPresetKeyForCountry } = await import('@/components/visa/constants');
      const preset = VISA_PROC_PRESETS.find((p) => p.key === visaPresetKeyForCountry(country));
      const c = country?.trim() ?? '';
      const proj: VisaProjectDoc = {
        ...newVisaProject(u),
        name: c ? `${quoteName} — ${c}` : quoteName,
        country: c,
        status: 'planning',
        linkedQuoteId: quoteId,
        linkedQuoteName: quoteName,
        startDate: new Date().toISOString().slice(0, 10),
        departureDate: departDate ?? null,
        // Áp mẫu thủ tục đúng nước ngay khi tạo (mặc định nếu không nhận diện).
        ...(preset ? { milestones: preset.steps.map((l) => newVisaMilestone(l)) } : {}),
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
