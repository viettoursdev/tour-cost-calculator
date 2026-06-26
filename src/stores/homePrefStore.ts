import { create } from 'zustand';
import type { HomeLayout } from '@/components/quote/homeLayout';
import { fetchHomeLayout, pushHomeLayout } from '@/lib/homePrefSync';

/**
 * Tùy biến trang "Hôm nay" theo TỪNG user.
 * - Cache nhanh ở localStorage `vte_home_layout_{username}` (tải tức thì, chạy offline).
 * - Đồng bộ đa thiết bị qua Supabase `user_prefs` (key `home`) — xem `homePrefSync`.
 *   Khi đăng nhập: lấy bản cloud làm chuẩn (nếu có); chưa có thì đẩy bản local lên.
 */
const keyFor = (username?: string | null) => `vte_home_layout_${username || 'guest'}`;

function readLocal(username?: string | null): Partial<HomeLayout> | null {
  try {
    const raw = localStorage.getItem(keyFor(username));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.order)) return null;
    return obj as Partial<HomeLayout>;
  } catch {
    return null;
  }
}

function writeLocal(username: string | null | undefined, layout: HomeLayout | null) {
  try {
    if (layout) localStorage.setItem(keyFor(username), JSON.stringify(layout));
    else localStorage.removeItem(keyFor(username));
  } catch { /* quota */ }
}

interface HomePrefState {
  /** Layout thô của user hiện tại (null = dùng mặc định). Có thể là bản phần (partial). */
  raw: Partial<HomeLayout> | null;
  /** Mở hộp thoại tùy chỉnh (nút ⚙️ ở đầu trang chủ). */
  customizeOpen: boolean;
  setCustomizeOpen: (open: boolean) => void;
  load: (username?: string | null) => void;
  save: (username: string | null | undefined, layout: HomeLayout) => void;
  reset: (username?: string | null) => void;
}

export const useHomePrefStore = create<HomePrefState>((set) => ({
  raw: null,
  customizeOpen: false,
  setCustomizeOpen: (open) => set({ customizeOpen: open }),
  load: (username) => {
    // 1) Local trước cho tức thì.
    set({ raw: readLocal(username) });
    // 2) Đồng bộ cloud (không chặn UI). Cloud có → làm chuẩn; chưa có → đẩy local lên.
    if (!username) return;
    void (async () => {
      try {
        const cloud = await fetchHomeLayout(username);
        if (cloud) {
          writeLocal(username, cloud as HomeLayout);
          set({ raw: cloud });
        } else {
          const local = readLocal(username);
          if (local) await pushHomeLayout(username, local as HomeLayout);
        }
      } catch { /* offline → giữ local */ }
    })();
  },
  save: (username, layout) => {
    writeLocal(username, layout);
    set({ raw: layout });
    if (username) void pushHomeLayout(username, layout).catch(() => { /* offline */ });
  },
  reset: (username) => {
    writeLocal(username, null);
    set({ raw: null });
    if (username) void pushHomeLayout(username, null).catch(() => { /* offline */ });
  },
}));
