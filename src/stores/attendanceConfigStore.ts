import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { sbSubscribeAttendanceConfig, sbSaveAttendanceConfig } from '@/lib/supabase';
import { ATTENDANCE_CODES } from '@/lib/attendance/attendanceCodes';
import { withDefaults } from '@/lib/attendance/attendanceHours';
import { useAuthStore } from './authStore';
import type { AttendanceCodeDef, AttendanceSettings } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type State = {
  /** Bộ mã HIỆU LỰC: bản HR tự sửa nếu có, ngược lại bộ mặc định trong code. */
  codes: AttendanceCodeDef[];
  /** Cài đặt giờ HIỆU LỰC (đã gộp mặc định). */
  settings: AttendanceSettings;
  /** true nếu đang dùng bộ mã tùy chỉnh của HR (khác mặc định). */
  custom: boolean;
  init: () => Unsubscribe;
  /** Lưu bộ mã + cài đặt (HR). Mã rỗng = quay về mã mặc định. */
  save: (codes: AttendanceCodeDef[], settings?: Partial<AttendanceSettings>) => Promise<boolean>;
  /** Lưu chỉ cài đặt giờ (giữ nguyên mã hiện tại). */
  saveSettings: (settings: Partial<AttendanceSettings>) => Promise<boolean>;
  resetToDefault: () => Promise<boolean>;
};

export const useAttendanceConfigStore = create<State>()(
  subscribeWithSelector((set, get) => ({
    codes: ATTENDANCE_CODES,
    settings: withDefaults(null),
    custom: false,

    init: () => sbSubscribeAttendanceConfig(({ codes, settings }) => {
      set({
        codes: codes.length ? codes : ATTENDANCE_CODES,
        custom: codes.length > 0,
        settings: withDefaults(settings),
      });
    }),

    save: async (codes, settings) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return false;
      const prev = { codes: get().codes, custom: get().custom, settings: get().settings };
      const nextSettings = withDefaults({ ...prev.settings, ...(settings ?? {}) });
      set({ codes: codes.length ? codes : ATTENDANCE_CODES, custom: codes.length > 0, settings: nextSettings });
      try {
        await sbSaveAttendanceConfig(codes, nextSettings, u.name);
        return true;
      } catch (e) {
        set(prev);
        window.alert('❌ Lỗi lưu cấu hình chấm công: ' + (e as Error).message);
        return false;
      }
    },

    saveSettings: async (settings) => {
      const cur = get().codes;
      // Nếu đang dùng mặc định (custom=false), lưu mảng rỗng để giữ "mặc định".
      return get().save(get().custom ? cur : [], settings);
    },

    resetToDefault: async (): Promise<boolean> => get().save([]),
  })),
);

/** Đọc bộ mã hiệu lực ngoài React (cho store/logic). */
export const effectiveCodes = (): AttendanceCodeDef[] => useAttendanceConfigStore.getState().codes;
/** Đọc cài đặt giờ hiệu lực ngoài React. */
export const effectiveSettings = (): AttendanceSettings => useAttendanceConfigStore.getState().settings;
