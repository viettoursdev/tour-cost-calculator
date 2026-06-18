import { useAuthStore } from '@/stores/authStore';

/**
 * Từ điển hạng mục tự học (per-user, localStorage `vte_item_dict_{username}`).
 * Mỗi khi người dùng nhập xong 1 dòng (có tên + đơn giá), ta ghi nhớ
 * {tên → đơn giá, đơn vị, tiền tệ}. Lần sau gõ tên sẽ gợi ý điền nhanh.
 * Nguồn dữ liệu = chính các báo giá trước của người dùng, không cần backend.
 */
export type ItemSuggestion = { name: string; price: number; unit: string; cur: string };
type Rec = ItemSuggestion & { n: number; t: number };

const MAX = 400;
const KEEP = 300;
const norm = (s: string) => s.trim().toLowerCase();

function dictKey(): string {
  const u = useAuthStore.getState().currentUser?.u;
  return `vte_item_dict_${u ?? 'anon'}`;
}

function load(): Record<string, Rec> {
  try {
    const raw = localStorage.getItem(dictKey());
    const d = raw ? JSON.parse(raw) : {};
    return d && typeof d === 'object' ? d : {};
  } catch {
    return {};
  }
}

function persist(d: Record<string, Rec>): void {
  try { localStorage.setItem(dictKey(), JSON.stringify(d)); } catch { /* quota — bỏ qua */ }
}

/** Ghi nhớ 1 dòng đã nhập (chỉ khi có tên & đơn giá > 0). */
export function recordItem(it: { name: string; price: number; unit: string; cur: string }): void {
  const key = norm(it.name);
  if (!key || !(it.price > 0)) return;
  const d = load();
  const prev = d[key];
  d[key] = { name: it.name.trim(), price: it.price, unit: it.unit, cur: it.cur, n: (prev?.n ?? 0) + 1, t: Date.now() };

  const keys = Object.keys(d);
  if (keys.length > MAX) {
    keys.sort((a, b) => d[b].n - d[a].n || d[b].t - d[a].t);
    const nd: Record<string, Rec> = {};
    for (const k of keys.slice(0, KEEP)) nd[k] = d[k];
    persist(nd);
    return;
  }
  persist(d);
}

/** Gợi ý các hạng mục khớp `query` (đã dùng nhiều / gần đây xếp trước). */
export function suggestItems(query: string, limit = 6): ItemSuggestion[] {
  const q = norm(query);
  if (!q) return [];
  return Object.values(load())
    .filter((r) => { const n = norm(r.name); return n !== q && n.includes(q); })
    .sort((a, b) => b.n - a.n || b.t - a.t)
    .slice(0, limit)
    .map(({ name, price, unit, cur }) => ({ name, price, unit, cur }));
}
