import { AIRPORT_BY_CODE } from '@/components/quote/flightConstants';
import type { Cabin } from '@/lib/flightSearch';

export interface AirportOption {
  code: string;   // IATA
  city: string;
  label: string;  // "HAN — Hanoi"
}

/** Danh sách sân bay cho autocomplete — tái dùng bản đồ IATA→TP của tab Chuyến bay. */
export const AIRPORTS: AirportOption[] = Object.entries(AIRPORT_BY_CODE)
  .map(([code, city]) => ({ code, city, label: `${code} — ${city}` }))
  .sort((a, b) => a.city.localeCompare(b.city));

export const CABIN_LABELS: Record<Cabin, string> = {
  economy: 'Phổ thông',
  premium: 'Phổ thông đặc biệt',
  business: 'Thương gia',
  first: 'Hạng nhất',
};

export const CABINS: Cabin[] = ['economy', 'premium', 'business', 'first'];

/** Nhãn + màu cho tag của một option (badge). `warn` = màu cảnh báo (đỏ cam). */
export const TAG_META: Record<string, { label: string; warn?: boolean }> = {
  cheapest: { label: '💰 Rẻ nhất' },
  fastest: { label: '⚡ Nhanh nhất' },
  nonstop: { label: '✈️ Bay thẳng' },
  'overnight-layover': { label: '🌙 Nối chờ qua đêm', warn: true },
  'long-layover': { label: '⏳ Chờ nối lâu', warn: true },
  'self-transfer': { label: '🧳 Tự nối chuyến', warn: true },
  'visa-transit': { label: '🛂 Cần visa quá cảnh', warn: true },
  redeye: { label: '🌃 Bay đêm' },
};

export const tagLabel = (t: string) => TAG_META[t]?.label ?? t;
export const tagIsWarn = (t: string) => TAG_META[t]?.warn === true;

/** Định dạng VND gọn (không thập phân). */
export function fmtVnd(n?: number): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' ₫';
}

/** Định dạng giá gốc ngoại tệ (vd "350 USD"). */
export function fmtOrig(amount?: number, cur?: string): string {
  if (amount == null || !cur) return '';
  return `${new Intl.NumberFormat('en-US').format(amount)} ${cur}`;
}
