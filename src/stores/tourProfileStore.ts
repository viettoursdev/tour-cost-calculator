import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  sbSubscribeTourProfiles,
  sbUpsertTourProfile,
  sbDeleteTourProfile,
  sbNextTourCode,
  sbSetQuoteTourProfile,
} from '@/lib/supabase';
import { useAuthStore } from './authStore';
import { useQuoteHistoryStore } from './quoteHistoryStore';
import { generateTourCode, visibleTourProfiles, nextPrimaryAfterDelete, tourCategoryOf } from '@/lib/tourProfile';
import { logAudit } from '@/lib/audit';
import type { Collaborator, DeleteRequest, TourCategory, TourKind, TourProfile } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

const newId = (): string => 'tp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Thông tin tối thiểu để mở một hồ sơ tour mới. */
export type NewTourProfileInput = {
  kind: TourKind;
  /** Phân loại nghiệp vụ (5 loại). Mặc định suy từ kind nếu thiếu. */
  category?: TourCategory;
  name: string;
  customerId?: string;
  customerName?: string;
  dest?: string;
  startDate?: string | null;
  pax?: number;
  primaryQuoteId?: string;
  collaborators?: Collaborator[];
};

type State = {
  profiles: TourProfile[];
  loading: boolean;
  error: string | null;
  /** Deep-link: hồ sơ cần mở khi vào tab "Hồ sơ tour" (đặt từ Global Search/Trợ lý). */
  focusId: string | null;
  requestFocus: (id: string) => void;
  /** Lấy & xoá focusId (TourProfilesView gọi lúc mount để mở đúng hồ sơ). */
  consumeFocus: () => string | null;
  init: () => Unsubscribe;
  /** Hồ sơ user được phép xem (creator / collab / follower / TP-PP cùng phòng / BGĐ-CEO). */
  visibleProfiles: () => TourProfile[];
  /** Tạo hồ sơ mới — sinh mã atomic ở DB (fallback client nếu RPC lỗi). */
  create: (input: NewTourProfileInput) => Promise<TourProfile | null>;
  save: (p: TourProfile) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setPrimaryQuote: (id: string, quoteId: string) => Promise<void>;
  /** Đồng bộ NGƯỢC thông tin hiển thị (tên/khách/ngày/pax) từ báo giá chính vào hồ sơ
   *  để báo cáo trực tiếp trên DB cũng đúng. Bỏ qua nếu không có gì đổi. */
  syncFromPrimary: (id: string, info: { name?: string; customerId?: string; customerName?: string; dest?: string; startDate?: string | null; pax?: number }) => Promise<void>;
  addCollaborator: (id: string, c: Collaborator) => Promise<void>;
  addFollower: (id: string, c: Collaborator) => Promise<void>;
  addEventStaff: (id: string, c: Collaborator) => Promise<void>;
  removeEventStaff: (id: string, u: string) => Promise<void>;
  /** Người dưới Trưởng Phòng gửi yêu cầu duyệt xoá (lưu trên hồ sơ). */
  requestDelete: (id: string, req: DeleteRequest) => Promise<void>;
  /** Người duyệt CHẤP THUẬN → xoá hẳn hồ sơ. */
  approveDelete: (id: string) => Promise<void>;
  /** Người duyệt TỪ CHỐI → gỡ yêu cầu, giữ hồ sơ. */
  rejectDelete: (id: string) => Promise<void>;
  archive: (id: string, on: boolean) => Promise<void>;
  /** Khi xoá một báo giá: nếu là báo giá CHÍNH thì chuyển primary sang báo giá khác
   *  còn lại của hồ sơ; nếu là báo giá cuối cùng thì lưu trữ (archive) hồ sơ. */
  onQuoteDeleted: (profileId: string, deletedCloudId: string) => Promise<void>;
  /** Chuyển một báo giá từ hồ sơ này sang hồ sơ khác (sửa khi gắn nhầm). */
  moveQuote: (cloudId: string, fromProfileId: string, toProfileId: string) => Promise<void>;
};

export const useTourProfileStore = create<State>()(
  subscribeWithSelector((set, get) => ({
    profiles: [],
    loading: true,
    error: null,
    focusId: null,
    requestFocus: (id) => set({ focusId: id }),
    consumeFocus: () => {
      const id = get().focusId;
      if (id) set({ focusId: null });
      return id;
    },

    init: () => sbSubscribeTourProfiles((profiles) => set({ profiles, loading: false })),

    visibleProfiles: () => {
      const u = useAuthStore.getState().currentUser;
      const users = useAuthStore.getState().users;
      return visibleTourProfiles(u, get().profiles, users);
    },

    create: async (input) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return null;
      const category = input.category ?? tourCategoryOf({ kind: input.kind });
      // Mã sinh atomic ở DB (theo category → prefix); nếu RPC lỗi thì đoán client.
      let code: string;
      try {
        code = await sbNextTourCode(category);
      } catch {
        code = generateTourCode(input.kind, get().profiles);
      }
      const now = new Date().toISOString();
      const profile: TourProfile = {
        id: newId(),
        code,
        kind: input.kind,
        category,
        name: input.name.trim(),
        customerId: input.customerId,
        customerName: input.customerName,
        dest: input.dest,
        startDate: input.startDate ?? null,
        pax: input.pax ?? 0,
        primaryQuoteId: input.primaryQuoteId,
        status: 'open',
        collaborators: input.collaborators ?? [],
        followers: [],
        createdByU: u.u,
        createdBy: u.name,
        createdAt: now,
      };
      const prev = get().profiles;
      set({ profiles: [profile, ...prev] });
      try {
        await sbUpsertTourProfile(profile);
        logAudit('create', 'Hồ sơ tour', profile.name || profile.code, profile.code);
      } catch (e) {
        set({ profiles: prev, error: (e as Error).message });
        return null;
      }
      return profile;
    },

    save: async (p) => {
      const u = useAuthStore.getState().currentUser;
      const next: TourProfile = {
        ...p,
        updatedAt: new Date().toISOString(),
        updatedBy: u ? `${u.name} (${u.role})` : p.updatedBy,
      };
      const prev = get().profiles;
      set({ profiles: prev.map((x) => (x.id === p.id ? next : x)) });
      try {
        await sbUpsertTourProfile(next);
      } catch (e) {
        set({ profiles: prev, error: (e as Error).message });
      }
    },

    remove: async (id) => {
      const prev = get().profiles;
      set({ profiles: prev.filter((x) => x.id !== id) });
      try {
        await sbDeleteTourProfile(id);
      } catch (e) {
        set({ profiles: prev, error: (e as Error).message });
      }
    },

    setPrimaryQuote: async (id, quoteId) => {
      const p = get().profiles.find((x) => x.id === id);
      if (!p || p.primaryQuoteId === quoteId) return;
      await get().save({ ...p, primaryQuoteId: quoteId });
      logAudit('update', 'Hồ sơ tour', p.name || p.code, 'Đổi báo giá chính');
    },

    syncFromPrimary: async (id, info) => {
      const p = get().profiles.find((x) => x.id === id);
      if (!p) return;
      const next: TourProfile = {
        ...p,
        name: info.name?.trim() || p.name,
        customerId: info.customerId ?? p.customerId,
        customerName: info.customerName ?? p.customerName,
        dest: info.dest ?? p.dest,
        startDate: info.startDate !== undefined ? info.startDate : p.startDate,
        pax: info.pax ?? p.pax,
      };
      // Chỉ ghi khi thực sự có thay đổi (tránh ghi thừa mỗi lần lưu báo giá).
      if (next.name === p.name && next.customerId === p.customerId && next.customerName === p.customerName &&
          next.dest === p.dest && next.startDate === p.startDate && next.pax === p.pax) return;
      await get().save(next);
    },

    addCollaborator: async (id, c) => {
      const p = get().profiles.find((x) => x.id === id);
      if (!p) return;
      if ((p.collaborators ?? []).some((x) => x.u === c.u)) return;
      await get().save({ ...p, collaborators: [...(p.collaborators ?? []), c] });
      logAudit('update', 'Hồ sơ tour', p.name || p.code, `Thêm cộng tác: ${c.name}`);
    },

    addFollower: async (id, c) => {
      const p = get().profiles.find((x) => x.id === id);
      if (!p) return;
      if ((p.followers ?? []).some((x) => x.u === c.u)) return;
      await get().save({ ...p, followers: [...(p.followers ?? []), c] });
      logAudit('update', 'Hồ sơ tour', p.name || p.code, `Thêm theo dõi: ${c.name}`);
    },

    addEventStaff: async (id, c) => {
      const p = get().profiles.find((x) => x.id === id);
      if (!p) return;
      if ((p.eventStaff ?? []).some((x) => x.u === c.u)) return;
      await get().save({ ...p, eventStaff: [...(p.eventStaff ?? []), c] });
      logAudit('update', 'Hồ sơ tour', p.name || p.code, `Thêm nhân sự event: ${c.name}`);
    },

    removeEventStaff: async (id, u) => {
      const p = get().profiles.find((x) => x.id === id);
      if (!p) return;
      if (!(p.eventStaff ?? []).some((x) => x.u === u)) return;
      await get().save({ ...p, eventStaff: (p.eventStaff ?? []).filter((x) => x.u !== u) });
      logAudit('update', 'Hồ sơ tour', p.name || p.code, 'Gỡ nhân sự event');
    },

    requestDelete: async (id, req) => {
      const p = get().profiles.find((x) => x.id === id);
      if (!p) return;
      await get().save({ ...p, deleteRequest: req });
      logAudit('update', 'Hồ sơ tour', p.name || p.code, `Gửi yêu cầu xoá → ${req.approverName}`);
    },

    approveDelete: async (id) => {
      const p = get().profiles.find((x) => x.id === id);
      if (!p) return;
      logAudit('delete', 'Hồ sơ tour', p.name || p.code, `Duyệt xoá (yêu cầu của ${p.deleteRequest?.byName ?? '—'})`);
      await get().remove(id);
    },

    rejectDelete: async (id) => {
      const p = get().profiles.find((x) => x.id === id);
      if (!p) return;
      await get().save({ ...p, deleteRequest: null });
      logAudit('update', 'Hồ sơ tour', p.name || p.code, 'Từ chối yêu cầu xoá');
    },

    archive: async (id, on) => {
      const p = get().profiles.find((x) => x.id === id);
      if (!p) return;
      await get().save({ ...p, status: on ? 'archived' : 'open' });
      logAudit('update', 'Hồ sơ tour', p.name || p.code, on ? 'Lưu trữ hồ sơ' : 'Mở lại hồ sơ');
    },

    onQuoteDeleted: async (profileId, deletedCloudId) => {
      const p = get().profiles.find((x) => x.id === profileId);
      if (!p) return;
      // Báo giá còn lại của hồ sơ (loại trừ cái vừa xoá).
      const remaining = useQuoteHistoryStore.getState().quotes
        .filter((q) => q.tourProfileId === profileId && q.cloudId !== deletedCloudId)
        .map((q) => q.cloudId);
      const decision = nextPrimaryAfterDelete(p.primaryQuoteId, deletedCloudId, remaining);
      if (!decision) return; // xoá báo giá không phải chính → không đổi gì
      if (decision.archive) {
        // Báo giá cuối cùng bị xoá → lưu trữ hồ sơ, gỡ con trỏ primary mồ côi.
        await get().save({ ...p, primaryQuoteId: undefined, status: 'archived' });
        logAudit('update', 'Hồ sơ tour', p.name || p.code, 'Lưu trữ (đã xoá báo giá cuối cùng)');
      } else {
        await get().save({ ...p, primaryQuoteId: decision.primaryQuoteId });
        logAudit('update', 'Hồ sơ tour', p.name || p.code, 'Tự chuyển báo giá chính (báo giá cũ bị xoá)');
      }
    },

    moveQuote: async (cloudId, fromProfileId, toProfileId) => {
      if (fromProfileId === toProfileId) return;
      const target = get().profiles.find((x) => x.id === toProfileId);
      if (!target) return;
      // 1) Đổi tour_profile_id của báo giá sang hồ sơ đích.
      await sbSetQuoteTourProfile(cloudId, target.id, target.code);
      // 2) Hồ sơ nguồn: nếu báo giá vừa chuyển là báo giá chính → tự dọn (như khi xoá).
      await get().onQuoteDeleted(fromProfileId, cloudId);
      // 3) Hồ sơ đích: nếu chưa có báo giá chính → đặt báo giá này làm chính.
      if (!target.primaryQuoteId) await get().setPrimaryQuote(target.id, cloudId);
      logAudit('update', 'Hồ sơ tour', target.name || target.code, 'Nhận báo giá chuyển từ hồ sơ khác');
    },
  })),
);
