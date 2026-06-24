import { create } from 'zustand';
import type { NavLayout } from '@/components/quote/navLayout';
import { CONTAINER_IDS } from '@/components/quote/navLayout';

/**
 * Tùy biến thanh điều hướng theo TỪNG user — lưu localStorage `vte_nav_layout_{username}`.
 * Chỉ là sở thích cá nhân (không đồng bộ đa thiết bị), không đụng dữ liệu báo giá.
 */
const keyFor = (username?: string | null) => `vte_nav_layout_${username || 'guest'}`;

function readLayout(username?: string | null): NavLayout | null {
  try {
    const raw = localStorage.getItem(keyFor(username));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    // Chỉ nhận đúng hình dạng (mảng id theo từng container).
    for (const cid of CONTAINER_IDS) if (!Array.isArray(obj[cid])) return null;
    return obj as NavLayout;
  } catch {
    return null;
  }
}

interface NavPrefState {
  /** Layout thô đã lưu của user hiện tại (null = dùng mặc định). */
  raw: NavLayout | null;
  /** Mở hộp thoại tùy chỉnh (nút bấm ở header, modal render trong QuoteToolbar). */
  customizeOpen: boolean;
  setCustomizeOpen: (open: boolean) => void;
  load: (username?: string | null) => void;
  save: (username: string | null | undefined, layout: NavLayout) => void;
  reset: (username?: string | null) => void;
}

export const useNavPrefStore = create<NavPrefState>((set) => ({
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
