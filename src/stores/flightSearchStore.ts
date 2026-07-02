import { create } from 'zustand';
import { sbListFlightSearches, sbUpsertFlightSearch, sbDeleteFlightSearch } from '@/lib/supabase';
import { useAuthStore } from './authStore';
import type { FlightSearchParams, FlightSearchResult, SavedFlightSearch } from '@/lib/flightSearch';

const newId = () => 'fs' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Nhãn hiển thị ngắn cho 1 lần tra cứu. */
export function searchLabel(p: FlightSearchParams): string {
  const route = `${p.origin.toUpperCase()} → ${p.destination.toUpperCase()}`;
  const dep = p.departDate ? ` · ${p.departDate}` : '';
  const rt = p.returnDate ? ' ⇄' : '';
  return route + dep + rt;
}

type State = {
  searches: SavedFlightSearch[];
  loading: boolean;
  /** Nạp lịch sử tra cứu của user hiện tại (mới nhất trước). */
  load: () => Promise<void>;
  /** Lưu 1 lần tra cứu; trả bản đã lưu (hoặc null nếu lỗi/không đăng nhập). */
  saveSearch: (params: FlightSearchParams, result: FlightSearchResult) => Promise<SavedFlightSearch | null>;
  remove: (id: string) => Promise<void>;
};

export const useFlightSearchStore = create<State>((set, get) => ({
  searches: [],
  loading: false,

  load: async () => {
    const u = useAuthStore.getState().currentUser;
    if (!u) { set({ searches: [], loading: false }); return; }
    set({ loading: true });
    try {
      const searches = await sbListFlightSearches(u.u);
      set({ searches, loading: false });
    } catch (e) {
      set({ loading: false });
      window.alert('❌ Lỗi tải lịch sử tra cứu: ' + (e as Error).message);
    }
  },

  saveSearch: async (params, result) => {
    const u = useAuthStore.getState().currentUser;
    if (!u) return null;
    const rec: SavedFlightSearch = {
      id: newId(),
      createdBy: u.u,
      createdAt: new Date().toISOString(),
      label: searchLabel(params),
      params,
      result,
    };
    const prev = get().searches;
    set({ searches: [rec, ...prev] });
    try {
      await sbUpsertFlightSearch(rec);
      return rec;
    } catch (e) {
      set({ searches: prev }); // rollback lạc quan
      window.alert('❌ Lỗi lưu tra cứu: ' + (e as Error).message);
      return null;
    }
  },

  remove: async (id) => {
    const prev = get().searches;
    set({ searches: prev.filter((s) => s.id !== id) });
    try {
      await sbDeleteFlightSearch(id);
    } catch (e) {
      set({ searches: prev });
      window.alert('❌ Lỗi xoá tra cứu: ' + (e as Error).message);
    }
  },
}));
