import { create } from 'zustand';
import {
  DEFAULT_UI_PREFS,
  isDefaultUiPrefs,
  normalizeUiPrefs,
  type UiPrefs,
} from '@/lib/uiPrefs';
import { fetchUserPref, pushUserPref } from '@/lib/userPrefSync';

/**
 * Tùy chọn GIAO DIỆN (sáng/tối + mật độ) theo TỪNG user — mẫu y hệt `homePrefStore`:
 * - Cache nhanh ở localStorage `vte_ui_prefs_{username}` (tải tức thì, chạy offline).
 * - Đồng bộ đa thiết bị qua Supabase `user_prefs` (key `ui`) — xem `userPrefSync`.
 *   Khi đăng nhập: bản cloud làm chuẩn (nếu có); chưa có thì đẩy bản local lên.
 * App.tsx đọc `prefs` để build theme MUI + set `data-theme` trên <html>.
 */
const keyFor = (username?: string | null) => `vte_ui_prefs_${username || 'guest'}`;

function readLocal(username?: string | null): UiPrefs {
  try {
    const raw = localStorage.getItem(keyFor(username));
    return raw ? normalizeUiPrefs(JSON.parse(raw)) : { ...DEFAULT_UI_PREFS };
  } catch {
    return { ...DEFAULT_UI_PREFS };
  }
}

function writeLocal(username: string | null | undefined, prefs: UiPrefs) {
  try {
    localStorage.setItem(keyFor(username), JSON.stringify(prefs));
  } catch { /* quota */ }
}

interface UiPrefState {
  /** Tùy chọn đã chuẩn hoá của user hiện tại (mặc định khi chưa đăng nhập). */
  prefs: UiPrefs;
  load: (username?: string | null) => void;
  save: (username: string | null | undefined, prefs: UiPrefs) => void;
}

export const useUiPrefStore = create<UiPrefState>((set) => ({
  prefs: { ...DEFAULT_UI_PREFS },
  load: (username) => {
    // 1) Local trước cho tức thì.
    const local = readLocal(username);
    set({ prefs: local });
    // 2) Đồng bộ cloud (không chặn UI). Cloud có → làm chuẩn; chưa có → đẩy local lên.
    if (!username) return;
    void (async () => {
      try {
        const cloud = await fetchUserPref(username, 'ui');
        if (cloud) {
          const prefs = normalizeUiPrefs(cloud);
          writeLocal(username, prefs);
          set({ prefs });
        } else if (!isDefaultUiPrefs(local)) {
          await pushUserPref(username, 'ui', local);
        }
      } catch { /* offline → giữ local */ }
    })();
  },
  save: (username, prefs) => {
    writeLocal(username, prefs);
    set({ prefs });
    if (username) void pushUserPref(username, 'ui', prefs).catch(() => { /* offline */ });
  },
}));
