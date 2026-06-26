import { create } from 'zustand';
import {
  sbSubscribeExportRequests,
  sbCreateExportRequest,
  sbApproveExportRequest,
  sbRejectExportRequest,
  sbDeleteExportRequest,
  sbSendNotification,
} from '@/lib/supabase';
import { useAuthStore } from './authStore';
import type { ExportRequest, ExportScope } from '@/types/exportRequest';
import type { Unsubscribe } from '@/lib/supabase/helpers';

const newId = (): string => 'xr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

type State = {
  requests: ExportRequest[];
  loading: boolean;
  init: () => Unsubscribe;
  /** Yêu cầu (mới nhất) của người đang đăng nhập cho một phạm vi xuất. */
  myRequest: (scope: ExportScope) => ExportRequest | undefined;
  /** Các yêu cầu đang chờ duyệt (cho người duyệt). */
  pending: (scope?: ExportScope) => ExportRequest[];
  /** Người gửi tạo yêu cầu xuất (status='pending') + lưu lạc quan. */
  request: (scope: ExportScope, detail: string) => Promise<void>;
  approve: (id: string) => Promise<void>;
  reject: (id: string, reason: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export const useExportRequestStore = create<State>((set, get) => ({
  requests: [],
  loading: true,

  init: () => sbSubscribeExportRequests((requests) => set({ requests, loading: false })),

  myRequest: (scope) => {
    const u = useAuthStore.getState().currentUser;
    if (!u) return undefined;
    return get().requests.find((r) => r.scope === scope && r.requestedByU === u.u);
  },

  pending: (scope) => get().requests.filter((r) => r.status === 'pending' && (!scope || r.scope === scope)),

  request: async (scope, detail) => {
    const u = useAuthStore.getState().currentUser;
    if (!u) return;
    const req: ExportRequest = {
      id: newId(), scope, detail, status: 'pending',
      requestedByU: u.u, requestedByName: u.name, requestedAt: new Date().toISOString(),
    };
    const prev = get().requests;
    set({ requests: [req, ...prev.filter((r) => !(r.scope === scope && r.requestedByU === u.u))] });
    try {
      await sbCreateExportRequest({ id: req.id, scope, detail, requestedByUsername: u.u, requestedByName: u.name });
    } catch (e) {
      set({ requests: prev });
      throw e;
    }
  },

  approve: async (id) => {
    const u = useAuthStore.getState().currentUser;
    const r = get().requests.find((x) => x.id === id);
    await sbApproveExportRequest(id);
    if (r?.requestedByU) {
      try {
        await sbSendNotification(r.requestedByU, {
          type: 'export_approval',
          title: 'Yêu cầu xuất Excel đã được duyệt',
          message: `${u?.name ?? 'Trưởng Phòng'} đã duyệt yêu cầu xuất ${r.detail ?? 'file'}. Bạn có thể tải về ngay.`,
          createdBy: u?.name ?? '',
          priority: 'high',
        });
      } catch { /* thông báo không chặn */ }
    }
  },

  reject: async (id, reason) => {
    const u = useAuthStore.getState().currentUser;
    const r = get().requests.find((x) => x.id === id);
    await sbRejectExportRequest(id, reason);
    if (r?.requestedByU) {
      try {
        await sbSendNotification(r.requestedByU, {
          type: 'export_approval',
          title: 'Yêu cầu xuất Excel bị từ chối',
          message: `${u?.name ?? 'Trưởng Phòng'} từ chối yêu cầu xuất ${r.detail ?? 'file'}.${reason ? ' Lý do: ' + reason : ''}`,
          createdBy: u?.name ?? '',
          priority: 'high',
        });
      } catch { /* thông báo không chặn */ }
    }
  },

  remove: async (id) => {
    const prev = get().requests;
    set({ requests: prev.filter((r) => r.id !== id) });
    try {
      await sbDeleteExportRequest(id);
    } catch (e) {
      set({ requests: prev });
      throw e;
    }
  },
}));
