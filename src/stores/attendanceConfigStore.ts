import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { sbSubscribeAttendanceConfig, sbSaveAttendanceConfig } from '@/lib/supabase';
import { ATTENDANCE_CODES } from '@/lib/attendance/attendanceCodes';
import { useAuthStore } from './authStore';
import type { AttendanceCodeDef } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type State = {
  /** Bộ mã HIỆU LỰC: bản HR tự sửa nếu có, ngược lại bộ mặc định trong code. */
  codes: AttendanceCodeDef[];
  /** true nếu đang dùng bản tùy chỉnh của HR (khác mặc định). */
  custom: boolean;
  init: () => Unsubscribe;
  /** Lưu bộ mã tùy chỉnh (HR). Mảng rỗng = quay về mặc định. */
  save: (codes: AttendanceCodeDef[]) => Promise<boolean>;
  resetToDefault: () => Promise<boolean>;
};

export const useAttendanceConfigStore = create<State>()(
  subscribeWithSelector((set) => ({
    codes: ATTENDANCE_CODES,
    custom: false,

    init: () => sbSubscribeAttendanceConfig((codes) => {
      set(codes.length ? { codes, custom: true } : { codes: ATTENDANCE_CODES, custom: false });
    }),

    save: async (codes) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return false;
      const prev = { codes: useAttendanceConfigStore.getState().codes, custom: useAttendanceConfigStore.getState().custom };
      set(codes.length ? { codes, custom: true } : { codes: ATTENDANCE_CODES, custom: false });
      try {
        await sbSaveAttendanceConfig(codes, u.name);
        return true;
      } catch (e) {
        set(prev);
        window.alert('❌ Lỗi lưu từ điển mã: ' + (e as Error).message);
        return false;
      }
    },

    resetToDefault: async (): Promise<boolean> => useAttendanceConfigStore.getState().save([]),
  })),
);

/** Đọc bộ mã hiệu lực ngoài React (cho store/logic). */
export const effectiveCodes = (): AttendanceCodeDef[] => useAttendanceConfigStore.getState().codes;
