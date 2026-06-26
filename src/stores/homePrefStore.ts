import { create } from 'zustand';
import type { PresetState } from '@/components/quote/homePresets';
import { fetchHomePref, pushHomePref } from '@/lib/homePrefSync';

/**
 * Tùy biến trang "Hôm nay" theo TỪNG user (gồm nhiều "bố cục đặt tên").
 * - Cache nhanh ở localStorage `vte_home_layout_{username}` (tải tức thì, chạy offline).
 * - Đồng bộ đa thiết bị qua Supabase `user_prefs` (key `home`) — xem `homePrefSync`.
 *   Khi đăng nhập: lấy bản cloud làm chuẩn (nếu có); chưa có thì đẩy bản local lên.
 * - `raw` là BLOB thô (PresetState v2 hoặc HomeLayout cũ); HomeView chuẩn hoá bằng
 *   `normalizePresets` để robust với dữ liệu cũ/mất quyền.
 */
const keyFor = (username?: string | null) => `vte_home_layout_${username || 'guest'}`;

function readLocal(username?: string | null): unknown {
  try {
    const raw = localStorage.getItem(keyFor(username));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

function writeLocal(username: string | null | undefined, blob: PresetState | null) {
  try {
    if (blob) localStorage.setItem(keyFor(username), JSON.stringify(blob));
    else localStorage.removeItem(keyFor(username));
  } catch { /* quota */ }
}

interface HomePrefState {
  /** Blob thô của user hiện tại (null = dùng mặc định). */
  raw: unknown;
  /** Mở hộp thoại tùy chỉnh (nút ⚙️ ở đầu trang chủ). */
  customizeOpen: boolean;
  setCustomizeOpen: (open: boolean) => void;
  load: (username?: string | null) => void;
  save: (username: string | null | undefined, blob: PresetState) => void;
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
        const cloud = await fetchHomePref(username);
        if (cloud) {
          writeLocal(username, cloud as PresetState);
          set({ raw: cloud });
        } else {
          const local = readLocal(username);
          if (local) await pushHomePref(username, local as PresetState);
        }
      } catch { /* offline → giữ local */ }
    })();
  },
  save: (username, blob) => {
    writeLocal(username, blob);
    set({ raw: blob });
    if (username) void pushHomePref(username, blob).catch(() => { /* offline */ });
  },
  reset: (username) => {
    writeLocal(username, null);
    set({ raw: null });
    if (username) void pushHomePref(username, null).catch(() => { /* offline */ });
  },
}));
