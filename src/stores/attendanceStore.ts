import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  sbSubscribeHrAttendance, sbUpsertHrAttendance, sbUpsertHrAttendances, sbDeleteHrAttendance,
} from '@/lib/supabase';
import { summarizeAttendance } from '@/lib/attendance/attendanceCalc';
import { useAuthStore } from './authStore';
import type {
  HrAttendance, HrEmployee, AttendanceCell, AttendanceStatus, AttendanceFeedback,
} from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

/** Id tất định cho một bảng công NV×tháng → import lại KHÔNG sinh trùng dòng. */
export const attendanceId = (employeeLegacyId: string, period: string): string =>
  `att-${employeeLegacyId}-${period}`;

const fbId = () => 'fb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

type State = {
  attendances: HrAttendance[];
  loading: boolean;
  init: () => Unsubscribe;
  /** Lưu (tạo/sửa) một bảng công đã dựng sẵn (dùng cho import). */
  upsert: (a: HrAttendance) => Promise<boolean>;
  /** Lưu hàng loạt (import cả tháng). */
  upsertMany: (list: HrAttendance[]) => Promise<boolean>;
  /** Quản lý sửa 1 ô (chủ động điều chỉnh Gantt). `cell=null` = xoá ô. Tự tính lại tổng. */
  setCell: (emp: HrEmployee, period: string, isoDate: string, cell: AttendanceCell | null) => Promise<void>;
  /** Đổi trạng thái kỳ công (draft→published→locked). */
  setStatus: (id: string, status: AttendanceStatus) => Promise<void>;
  /** Nhân viên xác nhận / báo sai sót bảng công của mình. */
  confirm: (id: string, accepted: boolean, note: string | undefined, byName: string) => Promise<HrAttendance | null>;
  remove: (id: string) => Promise<void>;
};

export const useAttendanceStore = create<State>()(
  subscribeWithSelector((set, get) => ({
    attendances: [],
    loading: true,

    init: () => sbSubscribeHrAttendance((attendances) => set({ attendances, loading: false })),

    upsert: async (a) => {
      const prev = get().attendances;
      const next = prev.some((x) => x.id === a.id)
        ? prev.map((x) => (x.id === a.id ? a : x))
        : [a, ...prev];
      set({ attendances: next });
      return save(() => sbUpsertHrAttendance(a), prev);
    },

    upsertMany: async (list) => {
      if (!list.length) return true;
      const prev = get().attendances;
      const byId = new Map(list.map((a) => [a.id, a]));
      const merged = prev.map((x) => byId.get(x.id) ?? x);
      for (const a of list) if (!prev.some((x) => x.id === a.id)) merged.unshift(a);
      set({ attendances: merged });
      return save(() => sbUpsertHrAttendances(list), prev);
    },

    setCell: async (emp, period, isoDate, cell) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const id = attendanceId(emp.id, period);
      const prev = get().attendances;
      const existing = prev.find((x) => x.id === id);
      const now = new Date().toISOString();
      const days = { ...(existing?.days ?? {}) };
      if (cell && cell.code.trim()) days[isoDate] = cell;
      else delete days[isoDate];
      const base: HrAttendance = existing ?? {
        id,
        employeeLegacyId: emp.id,
        employeeCode: emp.employeeCode,
        fullName: emp.fullName,
        department: emp.department || '',
        period,
        days: {},
        summary: summarizeAttendance({}),
        status: 'draft',
        confirmation: { status: 'pending' },
        feedback: [],
        source: 'manual',
        createdAt: now,
        createdBy: u.name,
      };
      // Dữ liệu công thay đổi sau khi NV đã xác nhận/báo sai sót → đưa về "chờ xác nhận"
      // để NV xác nhận lại (tránh hiển thị "đã xác nhận" với số liệu đã bị sửa).
      const resetConfirm = !!existing && existing.confirmation.status !== 'pending';
      const feedback = resetConfirm
        ? [...(existing!.feedback ?? []), {
            id: fbId(), at: now, byName: u.name, type: 'dispute' as const,
            note: `${u.name} (nhân sự) đã điều chỉnh bảng công sau xác nhận — cần xác nhận lại.`,
          }]
        : (existing?.feedback ?? []);
      const updated: HrAttendance = {
        ...base,
        days,
        summary: summarizeAttendance(days),
        confirmation: resetConfirm ? { status: 'pending' } : base.confirmation,
        feedback,
        updatedAt: now,
        updatedBy: u.name,
      };
      const next = existing ? prev.map((x) => (x.id === id ? updated : x)) : [updated, ...prev];
      set({ attendances: next });
      await save(() => sbUpsertHrAttendance(updated), prev);
    },

    setStatus: async (id, status) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const prev = get().attendances;
      const cur = prev.find((x) => x.id === id);
      if (!cur) return;
      const updated: HrAttendance = { ...cur, status, updatedAt: new Date().toISOString(), updatedBy: u.name };
      set({ attendances: prev.map((x) => (x.id === id ? updated : x)) });
      await save(() => sbUpsertHrAttendance(updated), prev);
    },

    confirm: async (id, accepted, note, byName) => {
      const prev = get().attendances;
      const cur = prev.find((x) => x.id === id);
      if (!cur) return null;
      const now = new Date().toISOString();
      const fb: AttendanceFeedback = {
        id: fbId(), at: now, byName, type: accepted ? 'confirm' : 'dispute', note: (note ?? '').trim(),
      };
      const updated: HrAttendance = {
        ...cur,
        confirmation: { status: accepted ? 'confirmed' : 'disputed', at: now, note: fb.note || undefined },
        feedback: [...(cur.feedback ?? []), fb],
        updatedAt: now,
        updatedBy: byName,
      };
      set({ attendances: prev.map((x) => (x.id === id ? updated : x)) });
      const ok = await save(() => sbUpsertHrAttendance(updated), prev);
      return ok ? updated : null;
    },

    remove: async (id) => {
      const prev = get().attendances;
      set({ attendances: prev.filter((x) => x.id !== id) });
      await save(() => sbDeleteHrAttendance(id), prev);
    },
  })),
);

/** Ghi Supabase; lỗi thì khôi phục state (rollback lạc quan) + báo lỗi. true nếu OK. */
async function save(op: () => Promise<void>, prev: HrAttendance[]): Promise<boolean> {
  try { await op(); return true; }
  catch (e) {
    useAttendanceStore.setState({ attendances: prev });
    window.alert('❌ Lỗi đồng bộ chấm công: ' + (e as Error).message);
    return false;
  }
}
