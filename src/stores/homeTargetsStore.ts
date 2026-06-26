import { create } from 'zustand';
import { fetchTargets, pushTargets, EMPTY_TARGETS, type MonthlyTargets } from '@/lib/homeTargetsSync';

/**
 * Chỉ tiêu tháng theo user. Cache localStorage `vte_targets_{username}` +
 * đồng bộ Supabase `user_prefs.targets` (cùng khuôn homePrefStore).
 */
const keyFor = (u?: string | null) => `vte_targets_${u || 'guest'}`;

function readLocal(u?: string | null): MonthlyTargets | null {
  try {
    const raw = localStorage.getItem(keyFor(u));
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o.quotes !== 'number' || typeof o.revenue !== 'number') return null;
    return o as MonthlyTargets;
  } catch {
    return null;
  }
}

interface TargetsState {
  targets: MonthlyTargets;
  load: (u?: string | null) => void;
  save: (u: string | null | undefined, t: MonthlyTargets) => void;
}

export const useHomeTargetsStore = create<TargetsState>((set) => ({
  targets: EMPTY_TARGETS,
  load: (u) => {
    set({ targets: readLocal(u) ?? EMPTY_TARGETS });
    if (!u) return;
    void (async () => {
      try {
        const cloud = await fetchTargets(u);
        if (cloud) {
          try { localStorage.setItem(keyFor(u), JSON.stringify(cloud)); } catch { /* quota */ }
          set({ targets: cloud });
        } else {
          const local = readLocal(u);
          if (local) await pushTargets(u, local);
        }
      } catch { /* offline */ }
    })();
  },
  save: (u, t) => {
    try { localStorage.setItem(keyFor(u), JSON.stringify(t)); } catch { /* quota */ }
    set({ targets: t });
    if (u) void pushTargets(u, t).catch(() => { /* offline */ });
  },
}));
