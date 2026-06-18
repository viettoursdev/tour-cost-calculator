import { useRateCardStore } from '@/stores/rateCardStore';
import type { ItemSuggestion } from './itemSuggest';

/**
 * Trích gợi ý hạng mục từ rate card chung (khách sạn + các bảng giá khác) để
 * dropdown gợi ý có dữ liệu dùng ngay từ đầu, không cần "học" dần.
 * Dùng heuristic giống RateCardModal.pickRow để đọc tên/giá/đơn vị từ row tự do.
 */
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v)) || 0;

function fromHotels(hotels: unknown): ItemSuggestion[] {
  const out: ItemSuggestion[] = [];
  if (!hotels || typeof hotels !== 'object') return out;
  for (const arr of Object.values(hotels as Record<string, unknown>)) {
    if (!Array.isArray(arr)) continue;
    for (const h of arr) {
      if (!h || typeof h !== 'object') continue;
      const rec = h as Record<string, unknown>;
      const name = typeof rec.name === 'string' ? rec.name.trim() : '';
      if (!name) continue;
      const opts = Array.isArray(rec.options) ? rec.options : [];
      let price = 0;
      for (const o of opts) { const p = num((o as Record<string, unknown>)?.price); if (p > 0) { price = p; break; } }
      if (price > 0) out.push({ name, price, unit: '/phòng/đêm', cur: 'VND' });
    }
  }
  return out;
}

function rowToSug(r: Record<string, unknown>): ItemSuggestion | null {
  const name = String(r.label ?? r.name ?? r.title ?? '').trim();
  if (!name) return null;
  const min = num(r.min), max = num(r.max);
  let price = 0;
  if (min > 0 && max > 0) price = Math.round((min + max) / 2);
  else if (max > 0) price = max;
  else if (min > 0) price = min;
  else for (const k of ['price', 'cost', 'amount', 'fee']) { const n = num(r[k]); if (n > 0) { price = n; break; } }
  if (price <= 0) return null;
  const unit = String(r.unit ?? '').trim() || '/đơn vị';
  return { name, price, unit, cur: 'VND' };
}

function fromOther(otherRates: unknown): ItemSuggestion[] {
  const out: ItemSuggestion[] = [];
  if (!otherRates || typeof otherRates !== 'object') return out;
  for (const v of Object.values(otherRates as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    for (const r of v) if (r && typeof r === 'object') { const s = rowToSug(r as Record<string, unknown>); if (s) out.push(s); }
  }
  return out;
}

// Memo theo tham chiếu object `rates` (chỉ tính lại khi rate card đổi).
let cacheRef: unknown = null;
let cacheVal: ItemSuggestion[] = [];

export function rateCardSuggestions(): ItemSuggestion[] {
  const rates = useRateCardStore.getState().rates;
  if (rates === cacheRef) return cacheVal;
  cacheRef = rates;
  const seen = new Set<string>();
  cacheVal = [...fromHotels(rates?.hotels), ...fromOther(rates?.otherRates)].filter((s) => {
    const k = s.name.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return cacheVal;
}
