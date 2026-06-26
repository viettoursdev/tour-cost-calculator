import { create } from 'zustand';
import type { HomeLayout } from '@/components/quote/homeLayout';

/**
 * Tùy biến trang "Hôm nay" theo TỪNG user — lưu localStorage `vte_home_layout_{username}`.
 * Chỉ là sở thích cá nhân (không đồng bộ đa thiết bị), không đụng dữ liệu báo giá.
 * Cùng khuôn với `navPrefStore`.
 */
const keyFor = (username?: string | null) => `vte_home_layout_${username || 'guest'}`;

function readLayout(username?: string | null): HomeLayout | null {
  try {
    const raw = localStorage.getItem(keyFor(username));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    if (!Array.isArray(obj.order) || !Array.isArray(obj.hidden)) return null;
    return obj as HomeLayout;
  } catch {
    return null;
  }
}

interface HomePrefState {
  /** Layout thô đã lưu của user hiện tại (null = dùng mặc định). */
  raw: HomeLayout | null;
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
  load: (username) => set({ raw: readLayout(username) }),
  save: (username, layout) => {
    try { localStorage.setItem(keyFor(username), JSON.stringify(layout)); } catch { /* quota */ }
    set({ raw: layout });
  },
  reset: (username) => {
    try { localStorage.removeItem(keyFor(username)); } catch { /* ignore */ }
    set({ raw: null });
  },
}));
