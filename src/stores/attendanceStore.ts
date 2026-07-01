import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  sbSubscribeHrAttendance, sbUpsertHrAttendance, sbUpsertHrAttendances, sbDeleteHrAttendance,
} from '@/lib/supabase';
import { summarizeAttendance } from '@/lib/attendance/attendanceCalc';
import { computeHours } from '@/lib/attendance/attendanceHours';
import { effectiveCodes, effectiveSettings } from './attendanceConfigStore';
import { useAuthStore } from './authStore';
import type {
  HrAttendance, HrEmployee, AttendanceCell, AttendanceDays, AttendanceStatus, AttendanceFeedback,
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
  /**
   * Trộn thêm mã vào nhiều bảng công của một kỳ. Mặc định CHỈ điền ô đang TRỐNG (không
   * đè mã đã có) — dùng cho "điền nghỉ phép" / "tạo khung tháng". `opts.overwrite=true`
   * thì ghi đè mọi ô (dùng cho điền hàng loạt đi tour). Trả về tổng số ô đã điền/đổi.
   */
  mergeDays: (period: string, entries: { emp: HrEmployee; add: AttendanceDays }[], opts?: { overwrite?: boolean }) => Promise<number>;
  /** Quản lý sửa GIỜ vào/ra một ô (chấm công theo giờ). Tự tính lại `hours`. */
  setCellTimes: (emp: HrEmployee, period: string, isoDate: string, times: { in?: string; out?: string }) => Promise<void>;
  /** Nhân viên TỰ chấm giờ (vào/ra) cho ngày của mình — ghi giờ hiện tại. */
  clockSelf: (emp: HrEmployee, period: string, isoDate: string, kind: 'in' | 'out') => Promise<void>;
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
      const oldCode = existing?.days[isoDate]?.code ?? '';
      const newCode = cell && cell.code.trim() ? cell.code : '';
      const days = { ...(existing?.days ?? {}) };
      if (newCode) days[isoDate] = cell!;
      else delete days[isoDate];
      // Nhật ký thay đổi ô (audit log) — chỉ ghi khi mã thực sự đổi. Giới hạn 300 mục.
      const history = oldCode !== newCode
        ? [...(existing?.history ?? []), { at: now, by: u.name, date: isoDate, from: oldCode, to: newCode }].slice(-300)
        : (existing?.history ?? []);
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
        summary: summarizeAttendance(days, effectiveCodes()),
        confirmation: resetConfirm ? { status: 'pending' } : base.confirmation,
        feedback,
        history,
        updatedAt: now,
        updatedBy: u.name,
      };
      const next = existing ? prev.map((x) => (x.id === id ? updated : x)) : [updated, ...prev];
      set({ attendances: next });
      await save(() => sbUpsertHrAttendance(updated), prev);
    },

    setCellTimes: async (emp, period, isoDate, times) => {
      await applyTimes(emp, period, isoDate, times, false);
    },

    clockSelf: async (emp, period, isoDate, kind) => {
      const d = new Date();
      const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      await applyTimes(emp, period, isoDate, kind === 'in' ? { in: hm } : { out: hm }, true);
    },

    mergeDays: async (period, entries, opts) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return 0;
      const overwrite = opts?.overwrite ?? false;
      const prev = get().attendances;
      const now = new Date().toISOString();
      const toUpsert: HrAttendance[] = [];
      let filled = 0;
      for (const { emp, add } of entries) {
        if (!add || !Object.keys(add).length) continue;
        const id = attendanceId(emp.id, period);
        const existing = prev.find((x) => x.id === id);
        const days = { ...(existing?.days ?? {}) };
        const histAdd: HrAttendance['history'] = [];
        let changed = false;
        for (const [iso, cell] of Object.entries(add)) {
          const old = days[iso]?.code ?? '';
          const isEmpty = !old.trim();
          if ((isEmpty || overwrite) && old !== cell.code) {
            days[iso] = cell; changed = true; filled++;
            histAdd!.push({ at: now, by: u.name, date: iso, from: old, to: cell.code });
          }
        }
        if (!changed) continue;
        const base: HrAttendance = existing ?? {
          id, employeeLegacyId: emp.id, employeeCode: emp.employeeCode, fullName: emp.fullName,
          department: emp.department || '', period, days: {}, summary: summarizeAttendance({}),
          status: 'draft', confirmation: { status: 'pending' }, feedback: [], source: 'manual',
          createdAt: now, createdBy: u.name,
        };
        // Nếu dòng đã xác nhận mà số liệu đổi → về "chờ xác nhận" + ghi vết (như setCell).
        const resetConfirm = !!existing && existing.confirmation.status !== 'pending';
        const feedback = resetConfirm
          ? [...(existing!.feedback ?? []), {
              id: fbId(), at: now, byName: u.name, type: 'dispute' as const,
              note: `${u.name} (nhân sự) đã điền nghỉ phép vào bảng công sau xác nhận — cần xác nhận lại.`,
            }]
          : (existing?.feedback ?? []);
        toUpsert.push({
          ...base, days, summary: summarizeAttendance(days, effectiveCodes()),
          confirmation: resetConfirm ? { status: 'pending' } : base.confirmation,
          feedback, history: [...(existing?.history ?? []), ...histAdd!].slice(-300),
          updatedAt: now, updatedBy: u.name,
        });
      }
      if (!toUpsert.length) return 0;
      const byId = new Map(toUpsert.map((a) => [a.id, a]));
      const merged = prev.map((x) => byId.get(x.id) ?? x);
      for (const a of toUpsert) if (!prev.some((x) => x.id === a.id)) merged.unshift(a);
      set({ attendances: merged });
      const ok = await save(() => sbUpsertHrAttendances(toUpsert), prev);
      return ok ? filled : 0;
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

/**
 * Ghi giờ vào/ra cho một ô (dùng chung cho HR sửa giờ & NV tự chấm). Ô chưa có mã →
 * mặc định 'X'. Tự tính lại `hours` (trừ nghỉ trưa) và tổng công.
 */
async function applyTimes(
  emp: HrEmployee, period: string, isoDate: string,
  times: { in?: string; out?: string }, isSelf: boolean,
): Promise<void> {
  const u = useAuthStore.getState().currentUser;
  if (!u) return;
  const settings = effectiveSettings();
  const id = attendanceId(emp.id, period);
  const prev = useAttendanceStore.getState().attendances;
  const existing = prev.find((x) => x.id === id);
  const now = new Date().toISOString();
  const prevCell = existing?.days[isoDate];
  const cell: HrAttendance['days'][string] = { ...(prevCell ?? { code: 'X' }) };
  if (!cell.code?.trim()) cell.code = 'X';
  if (times.in !== undefined) cell.in = times.in;
  if (times.out !== undefined) cell.out = times.out;
  cell.hours = computeHours(cell.in, cell.out, settings.breakMins);
  const days = { ...(existing?.days ?? {}), [isoDate]: cell };
  const base: HrAttendance = existing ?? {
    id, employeeLegacyId: emp.id, employeeCode: emp.employeeCode, fullName: emp.fullName,
    department: emp.department || '', period, days: {}, summary: summarizeAttendance({}),
    status: 'draft', confirmation: { status: 'pending' }, feedback: [], source: isSelf ? 'self' : 'manual',
    createdAt: now, createdBy: u.name,
  };
  const codeAdded = !prevCell?.code?.trim();
  const history = codeAdded
    ? [...(existing?.history ?? []), { at: now, by: u.name, date: isoDate, from: '', to: cell.code }].slice(-300)
    : (existing?.history ?? []);
  const updated: HrAttendance = {
    ...base, days, summary: summarizeAttendance(days, effectiveCodes()),
    history, updatedAt: now, updatedBy: u.name,
  };
  const next = existing ? prev.map((x) => (x.id === id ? updated : x)) : [updated, ...prev];
  useAttendanceStore.setState({ attendances: next });
  await save(() => sbUpsertHrAttendance(updated), prev);
}

/** Ghi Supabase; lỗi thì khôi phục state (rollback lạc quan) + báo lỗi. true nếu OK. */
async function save(op: () => Promise<void>, prev: HrAttendance[]): Promise<boolean> {
  try { await op(); return true; }
  catch (e) {
    useAttendanceStore.setState({ attendances: prev });
    window.alert('❌ Lỗi đồng bộ chấm công: ' + (e as Error).message);
    return false;
  }
}
