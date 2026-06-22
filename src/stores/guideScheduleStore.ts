import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { sbSubscribeGuideSchedule, sbPushGuideSchedule } from '@/lib/supabase';
import { sbGetQuoteProject } from '@/lib/supabase';
import { buildLegsFromFlights } from '@/lib/guideSchedule';
import { useAuthStore } from './authStore';
import type { FreelanceGuide, GuideFlightLeg, GuideRef, TourGuideAssignment } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

const newId = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

type State = {
  freelancers: FreelanceGuide[];
  assignments: Record<string, TourGuideAssignment>;
  loading: boolean;
  syncing: boolean;
  init: () => Unsubscribe;
  /** Thêm HDV freelance (ngoài danh sách nhân sự). Trả về bản ghi đã tạo. */
  addFreelancer: (name: string, extra?: { phone?: string; note?: string }) => Promise<FreelanceGuide | null>;
  removeFreelancer: (id: string) => Promise<void>;
  /** Đặt danh sách HDV cho một tour (giữ nguyên legs hiện có). */
  setGuides: (tourCloudId: string, meta: { tourName: string; departDate?: string }, guides: GuideRef[]) => Promise<void>;
  /** Ghi đè toàn bộ legs của một tour (sau khi sửa tay). */
  setLegs: (tourCloudId: string, legs: GuideFlightLeg[]) => Promise<void>;
  removeAssignment: (tourCloudId: string) => Promise<void>;
  /**
   * Seed lịch bay cho các HDV của một tour từ chuyến bay của báo giá. Giữ lại các
   * leg đã sửa tay (manual/edited), chỉ làm mới các leg nguồn 'quote'. Trả về số
   * leg vừa seed.
   */
  seedLegsFromQuote: (tourCloudId: string, guideIds: string[], meta: { tourName: string; departDate?: string }) => Promise<number>;
  /** Đọc các chặng bay của báo giá (đã quy đổi giờ) để CHỌN — guideId để trống. */
  loadTourFlightCandidates: (tourCloudId: string, departDate?: string) => Promise<GuideFlightLeg[]>;
};

export const useGuideScheduleStore = create<State>()(
  subscribeWithSelector((set, get) => {
    /** Ghi cả doc lên cloud (optimistic: đã set local trước đó). */
    const push = async () => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      set({ syncing: true });
      try {
        await sbPushGuideSchedule(
          { freelancers: get().freelancers, assignments: get().assignments },
          { name: u.name, role: u.role },
        );
      } catch (e) {
        window.alert('❌ Lỗi đồng bộ lịch HDV: ' + (e as Error).message);
      } finally {
        set({ syncing: false });
      }
    };

    /** Cập nhật một assignment (merge) + đóng dấu người sửa, rồi đẩy cloud. */
    const writeAssignment = async (tourCloudId: string, patch: Partial<TourGuideAssignment>) => {
      const u = useAuthStore.getState().currentUser;
      const prev = get().assignments[tourCloudId];
      const next: TourGuideAssignment = {
        tourCloudId,
        tourName: patch.tourName ?? prev?.tourName ?? '',
        departDate: patch.departDate ?? prev?.departDate,
        guides: patch.guides ?? prev?.guides ?? [],
        legs: patch.legs ?? prev?.legs ?? [],
        updatedAt: new Date().toISOString(),
        updatedBy: u?.name,
      };
      set((s) => ({ assignments: { ...s.assignments, [tourCloudId]: next } }));
      await push();
    };

    return {
      freelancers: [],
      assignments: {},
      loading: true,
      syncing: false,

      init: () => {
        set({ loading: true });
        return sbSubscribeGuideSchedule((d) =>
          set({ freelancers: d.freelancers, assignments: d.assignments, loading: false }),
        );
      },

      addFreelancer: async (name, extra) => {
        const u = useAuthStore.getState().currentUser;
        const nm = name.trim();
        if (!nm || !u) return null;
        // Tránh trùng tên freelance (không phân biệt hoa/thường).
        const dup = get().freelancers.find((f) => f.name.trim().toLowerCase() === nm.toLowerCase());
        if (dup) return dup;
        const f: FreelanceGuide = {
          id: newId('fg'), name: nm, phone: extra?.phone, note: extra?.note,
          createdAt: new Date().toISOString(), createdBy: u.name,
        };
        set((s) => ({ freelancers: [...s.freelancers, f] }));
        await push();
        return f;
      },

      removeFreelancer: async (id) => {
        set((s) => ({ freelancers: s.freelancers.filter((f) => f.id !== id) }));
        await push();
      },

      setGuides: (tourCloudId, meta, guides) => writeAssignment(tourCloudId, { ...meta, guides }),

      setLegs: (tourCloudId, legs) => writeAssignment(tourCloudId, { legs }),

      removeAssignment: async (tourCloudId) => {
        set((s) => {
          const next = { ...s.assignments };
          delete next[tourCloudId];
          return { assignments: next };
        });
        await push();
      },

      seedLegsFromQuote: async (tourCloudId, guideIds, meta) => {
        const proj = await sbGetQuoteProject(tourCloudId);
        const flights = proj?.currentState?.flights;
        const departISO = meta.departDate ?? proj?.currentState?.info?.startDate ?? undefined;
        const fresh: GuideFlightLeg[] = guideIds.flatMap((gid, gi) =>
          buildLegsFromFlights(flights, gid, tourCloudId, departISO,
            (i, seg) => `${tourCloudId}:${gid}:${seg.flightNo || 'seg'}:${i}:${gi}`),
        );
        const existing = get().assignments[tourCloudId]?.legs ?? [];
        // Giữ leg đã sửa tay / nhập tay; thay các leg seed từ báo giá.
        const kept = existing.filter((l) => l.source === 'manual' || l.edited);
        await writeAssignment(tourCloudId, { ...meta, legs: [...kept, ...fresh] });
        return fresh.length;
      },

      loadTourFlightCandidates: async (tourCloudId, departDate) => {
        const proj = await sbGetQuoteProject(tourCloudId);
        const flights = proj?.currentState?.flights;
        const departISO = departDate ?? proj?.currentState?.info?.startDate ?? undefined;
        return buildLegsFromFlights(flights, '', tourCloudId, departISO,
          (i, seg) => `${tourCloudId}::${seg.flightNo || 'seg'}:${i}`);
      },
    };
  }),
);
