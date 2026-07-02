import { create } from 'zustand';
import type { NavLayout } from '@/components/quote/navLayout';
import { CONTAINER_IDS } from '@/components/quote/navLayout';
import { fetchUserPref, pushUserPref } from '@/lib/userPrefSync';
import { fetchOrgPref, navPresetKey } from '@/lib/orgPrefs';
import type { Department } from '@/types';

/**
 * Tùy biến thanh điều hướng theo TỪNG user — mẫu y hệt `homePrefStore`:
 * - Cache nhanh ở localStorage `vte_nav_layout_{username}` (tải tức thì, chạy offline).
 * - Đồng bộ đa thiết bị qua Supabase `user_prefs` (key `nav`) — xem `userPrefSync`.
 *   Khi đăng nhập: bản cloud làm chuẩn (nếu có); chưa có thì đẩy bản local lên.
 * - `deptPreset`: bố cục MẶC ĐỊNH của phòng ban (app_config `nav_preset_{dept}`,
 *   Trưởng/Phó Phòng đặt) — dùng làm điểm xuất phát khi user CHƯA tự tùy chỉnh
 *   (`raw` null); user chỉnh gì đó thì bản cá nhân đè lên.
 * Chỉ là sở thích cá nhân, không đụng dữ liệu báo giá.
 */
const keyFor = (username?: string | null) => `vte_nav_layout_${username || 'guest'}`;

/** Chỉ nhận đúng hình dạng (mảng id theo từng container) — dùng cho cả local lẫn cloud. */
function validLayout(obj: unknown): NavLayout | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  for (const cid of CONTAINER_IDS) if (!Array.isArray(o[cid])) return null;
  return obj as NavLayout;
}

function readLocal(username?: string | null): NavLayout | null {
  try {
    const raw = localStorage.getItem(keyFor(username));
    return raw ? validLayout(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocal(username: string | null | undefined, layout: NavLayout | null) {
  try {
    if (layout) localStorage.setItem(keyFor(username), JSON.stringify(layout));
    else localStorage.removeItem(keyFor(username));
  } catch { /* quota */ }
}

interface NavPrefState {
  /** Layout thô đã lưu của user hiện tại (null = dùng preset phòng/mặc định). */
  raw: NavLayout | null;
  /** Bố cục mặc định của PHÒNG user (null = phòng chưa đặt). */
  deptPreset: NavLayout | null;
  /** Mở hộp thoại tùy chỉnh (nút ở Cài đặt cá nhân, modal render trong QuoteToolbar). */
  customizeOpen: boolean;
  setCustomizeOpen: (open: boolean) => void;
  setDeptPreset: (layout: NavLayout | null) => void;
  load: (username?: string | null, department?: Department | null) => void;
  save: (username: string | null | undefined, layout: NavLayout) => void;
  reset: (username?: string | null) => void;
}

export const useNavPrefStore = create<NavPrefState>((set) => ({
  raw: null,
  deptPreset: null,
  customizeOpen: false,
  setCustomizeOpen: (open) => set({ customizeOpen: open }),
  setDeptPreset: (layout) => set({ deptPreset: layout }),
  load: (username, department) => {
    // 1) Local trước cho tức thì.
    set({ raw: readLocal(username) });
    // 2) Đồng bộ cloud (không chặn UI). Cloud có → làm chuẩn; chưa có → đẩy local lên.
    if (!username) return;
    void (async () => {
      try {
        const cloud = validLayout(await fetchUserPref(username, 'nav'));
        if (cloud) {
          writeLocal(username, cloud);
          set({ raw: cloud });
        } else {
          const local = readLocal(username);
          if (local) await pushUserPref(username, 'nav', local);
        }
      } catch { /* offline → giữ local */ }
    })();
    // 3) Preset phòng ban (độc lập bản cá nhân — chỉ dùng khi raw null).
    if (!department) { set({ deptPreset: null }); return; }
    void (async () => {
      try {
        const v = await fetchOrgPref(navPresetKey(department));
        set({ deptPreset: v ? validLayout(JSON.parse(v)) : null });
      } catch { /* offline → bỏ qua */ }
    })();
  },
  save: (username, layout) => {
    writeLocal(username, layout);
    set({ raw: layout });
    if (username) void pushUserPref(username, 'nav', layout).catch(() => { /* offline */ });
  },
  reset: (username) => {
    writeLocal(username, null);
    set({ raw: null });
    if (username) void pushUserPref(username, 'nav', null).catch(() => { /* offline */ });
  },
}));
