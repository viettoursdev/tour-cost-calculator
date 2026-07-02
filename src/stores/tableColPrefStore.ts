import { create } from 'zustand';
import {
  normalizeTableColPrefs,
  type TableColPref,
  type TableColPrefs,
} from '@/lib/tableColumnPrefs';
import { fetchUserPref, pushUserPref } from '@/lib/userPrefSync';

/**
 * Tuỳ chọn CỘT các bảng lớn theo TỪNG user — mẫu y hệt `homePrefStore`:
 * - Cache nhanh ở localStorage `vte_table_cols_{username}` (tải tức thì, offline).
 * - Đồng bộ đa thiết bị qua Supabase `user_prefs` (key `tableCols`).
 * Một object chung cho MỌI bảng, khoá theo tableId — thêm bảng mới không cần gì thêm.
 */
const keyFor = (username?: string | null) => `vte_table_cols_${username || 'guest'}`;

function readLocal(username?: string | null): TableColPrefs {
  try {
    const raw = localStorage.getItem(keyFor(username));
    return raw ? normalizeTableColPrefs(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function writeLocal(username: string | null | undefined, prefs: TableColPrefs) {
  try {
    localStorage.setItem(keyFor(username), JSON.stringify(prefs));
  } catch { /* quota */ }
}

interface TableColPrefState {
  /** Tuỳ chọn tất cả bảng của user hiện tại ({} = mặc định). */
  prefs: TableColPrefs;
  load: (username?: string | null) => void;
  save: (username: string | null | undefined, tableId: string, pref: TableColPref) => void;
  reset: (username: string | null | undefined, tableId: string) => void;
}

export const useTableColPrefStore = create<TableColPrefState>((set, get) => ({
  prefs: {},
  load: (username) => {
    // 1) Local trước cho tức thì.
    set({ prefs: readLocal(username) });
    // 2) Đồng bộ cloud (không chặn UI). Cloud có → làm chuẩn; chưa có → đẩy local lên.
    if (!username) return;
    void (async () => {
      try {
        const cloud = await fetchUserPref(username, 'tableCols');
        if (cloud) {
          const prefs = normalizeTableColPrefs(cloud);
          writeLocal(username, prefs);
          set({ prefs });
        } else {
          const local = readLocal(username);
          if (Object.keys(local).length) await pushUserPref(username, 'tableCols', local);
        }
      } catch { /* offline → giữ local */ }
    })();
  },
  save: (username, tableId, pref) => {
    const prefs = { ...get().prefs, [tableId]: pref };
    writeLocal(username, prefs);
    set({ prefs });
    if (username) void pushUserPref(username, 'tableCols', prefs).catch(() => { /* offline */ });
  },
  reset: (username, tableId) => {
    const prefs = { ...get().prefs };
    delete prefs[tableId];
    writeLocal(username, prefs);
    set({ prefs });
    if (username) void pushUserPref(username, 'tableCols', prefs).catch(() => { /* offline */ });
  },
}));
