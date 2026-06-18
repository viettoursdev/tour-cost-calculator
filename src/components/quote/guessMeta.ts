import type { QtyMode } from '@/types';

/**
 * Đoán đơn vị + cách tính số lượng hợp lý từ tên hạng mục, để điền sẵn cho
 * dòng MỚI (chưa chỉnh tay). Chỉ gợi ý — nơi gọi quyết định có áp hay không.
 */
type Meta = { unit: string; qtyMode: QtyMode };

const RULES: { re: RegExp; meta: Meta }[] = [
  { re: /khách sạn|\bks\b|phòng nghỉ|phòng đôi|phòng đơn|hotel|resort|homestay|\bvilla\b|lưu trú|nghỉ đêm/, meta: { unit: '/phòng/đêm', qtyMode: 'double_room' } },
  { re: /hdv|hướng dẫn|guide|thuyết minh|tour ?guide/, meta: { unit: '/ngày', qtyMode: 'per_group' } },
  { re: /\bxe\b|ô ?tô|\boto\b|\bcar\b|coach|\bbus\b|limousine|đưa đón|vận chuyển|transport/, meta: { unit: '/xe', qtyMode: 'per_group' } },
  { re: /ăn|buffet|tiệc|gala|set ?menu|nhà hàng|lunch|dinner|breakfast|bữa|suất ăn/, meta: { unit: '/suất', qtyMode: 'per_pax' } },
  { re: /vé máy bay|máy bay|flight|\bvé\b|tham quan|vào cửa|entrance|ticket/, meta: { unit: '/khách', qtyMode: 'per_pax' } },
  { re: /visa|bảo hiểm|insurance/, meta: { unit: '/khách', qtyMode: 'per_pax' } },
];

export function guessItemMeta(name: string): Meta | null {
  const s = name.trim().toLowerCase();
  if (!s) return null;
  for (const r of RULES) if (r.re.test(s)) return r.meta;
  return null;
}
