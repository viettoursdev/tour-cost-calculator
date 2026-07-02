import { create } from 'zustand';
import { normalizeModuleFlags, type ModuleFlags } from '@/lib/featureFlags';
import { MODULE_FLAGS_KEY, fetchOrgPref, setOrgPref } from '@/lib/orgPrefs';

/**
 * Feature flag cấp TỔ CHỨC (chung mọi người) — đọc `app_config.module_flags`
 * khi đăng nhập; BGĐ+ sửa qua ModuleFlagsDialog (ghi bằng RPC set_org_pref).
 * Khác các *PrefStore (tùy chọn cá nhân): đây là cấu hình chung, không cache LS.
 */
interface FeatureFlagState {
  flags: ModuleFlags;
  loaded: boolean;
  load: () => void;
  /** Ghi lên cloud (ném lỗi nếu bị gate) rồi cập nhật state. */
  save: (flags: ModuleFlags) => Promise<void>;
}

export const useFeatureFlagStore = create<FeatureFlagState>((set) => ({
  flags: {},
  loaded: false,
  load: () => {
    void (async () => {
      try {
        const raw = await fetchOrgPref(MODULE_FLAGS_KEY);
        set({ flags: raw ? normalizeModuleFlags(JSON.parse(raw)) : {}, loaded: true });
      } catch { /* offline → coi như không gate */
        set({ loaded: true });
      }
    })();
  },
  save: async (flags) => {
    const clean = normalizeModuleFlags(flags);
    await setOrgPref(MODULE_FLAGS_KEY, Object.keys(clean).length ? JSON.stringify(clean) : null);
    set({ flags: clean });
  },
}));
