import { create } from 'zustand';
import { sbSaveRestaurants, sbSubscribeRestaurants } from '@/lib/supabase';
import type { Restaurant } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type State = {
  list: Restaurant[];
  loading: boolean;
  init: () => Unsubscribe;
  save: (next: Restaurant[], savedBy: string) => void;
  /** Flush any debounced write immediately (call before leaving the screen). */
  flush: () => Promise<void>;
};

/**
 * Re-order the incoming list to follow the current local order (match by id),
 * appending any genuinely new (remote) restaurants at the end. The realtime
 * re-fetch comes back `ORDER BY name`; applying that order directly would MOVE
 * a card's DOM node while the user is typing into it — and moving a focused
 * input in the DOM blurs it. Keeping the existing order means React only updates
 * props in place, so focus is preserved.
 */
function reconcileOrder(prev: Restaurant[], next: Restaurant[]): Restaurant[] {
  if (prev.length === 0) return next;
  const rank = new Map(prev.map((r, i) => [r.id, i]));
  return [...next].sort(
    (a, b) =>
      (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

// Debounce state for the (heavy, full-overwrite) network push. The optimistic
// in-memory `set` stays synchronous; only the DB write is deferred so we don't
// write + echo on every keystroke.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: { list: Restaurant[]; savedBy: string } | null = null;
const SAVE_DEBOUNCE_MS = 700;

async function pushNow(): Promise<void> {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  const p = pending;
  pending = null;
  if (!p) return;
  try {
    await sbSaveRestaurants(p.list, p.savedBy);
  } catch (e) {
    window.alert('Lỗi đồng bộ nhà hàng: ' + (e as Error).message);
  }
}

export const useRestaurantStore = create<State>()((set) => ({
  list: [],
  loading: true,

  init: () => {
    set({ loading: true });
    return sbSubscribeRestaurants((items) => {
      set((s) => ({ list: reconcileOrder(s.list, items), loading: false }));
    });
  },

  save: (next, savedBy) => {
    // Immediate optimistic update (order-preserving → no focus loss).
    set({ list: next });
    // Defer the network write; always flush the latest snapshot.
    pending = { list: next, savedBy };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void pushNow(); }, SAVE_DEBOUNCE_MS);
  },

  flush: pushNow,
}));
