import { create } from 'zustand';
import { useQuoteStore } from './quoteStore';
import { useQuoteHistoryStore } from './quoteHistoryStore';
import { useAuthStore } from './authStore';

/**
 * "Vừa xem gần đây" — danh sách báo giá mở gần nhất để mở lại 1 chạm.
 * Lưu localStorage theo user (`vte_recent_{username}`); tự ghi nhận khi
 * `quoteStore.draft.currentQuoteId` đổi sang một báo giá khác.
 */
export interface RecentItem {
  cloudId: string;
  name: string;
  code?: string;
  at: number;
}

const CAP = 8;
const keyFor = (u?: string | null) => `vte_recent_${u || 'guest'}`;

function read(u?: string | null): RecentItem[] {
  try {
    const raw = localStorage.getItem(keyFor(u));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

interface RecentState {
  items: RecentItem[];
  load: (u?: string | null) => void;
  record: (u: string | null | undefined, item: RecentItem) => void;
}

export const useRecentStore = create<RecentState>((set) => ({
  items: [],
  load: (u) => set({ items: read(u) }),
  record: (u, item) => set(() => {
    const next = [item, ...read(u).filter((x) => x.cloudId !== item.cloudId)].slice(0, CAP);
    try { localStorage.setItem(keyFor(u), JSON.stringify(next)); } catch { /* quota */ }
    return { items: next };
  }),
}));

// Tự ghi nhận khi mở 1 báo giá (currentQuoteId đổi sang cloudId mới).
useQuoteStore.subscribe((s, prev) => {
  const id = s.draft.currentQuoteId;
  if (!id || id === prev.draft.currentQuoteId) return;
  const u = useAuthStore.getState().currentUser?.u;
  const e = useQuoteHistoryStore.getState().quotes.find((x) => x.cloudId === id);
  const name = e?.name ?? s.draft.info?.name ?? 'Báo giá';
  useRecentStore.getState().record(u, { cloudId: id, name, code: e?.quoteCode, at: Date.now() });
});
