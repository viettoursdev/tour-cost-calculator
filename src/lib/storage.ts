import type { RateCard } from '@/types';

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded — ignore, behavior matches legacy */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// Drains vte_hotels_v2_*, vte_rate_*, vte_visa_rates into a RateCard shape.
// Returns null if nothing legacy found.
export function migrateLegacyRateCard(): RateCard | null {
  const hotels: RateCard['hotels'] = {};
  const otherRates: RateCard['otherRates'] = {};
  let visaRates: RateCard['visaRates'] = {};
  let found = false;
  const toDelete: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith('vte_hotels_v2_')) {
      const city = k.replace('vte_hotels_v2_', '');
      const parsed = readJSON<unknown>(k, null);
      if (parsed) {
        hotels[city] = parsed as RateCard['hotels'][string];
        toDelete.push(k);
        found = true;
      }
    } else if (k === 'vte_visa_rates') {
      visaRates = readJSON<RateCard['visaRates']>(k, {});
      toDelete.push(k);
      found = true;
    } else if (k.startsWith('vte_rate_')) {
      otherRates[k] = readJSON<unknown>(k, null) as RateCard['otherRates'][string];
      toDelete.push(k);
      found = true;
    }
  }

  if (!found) return null;
  toDelete.forEach(remove);
  return { hotels, visaRates, otherRates };
}
