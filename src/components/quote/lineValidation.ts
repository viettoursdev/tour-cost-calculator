import type { CategoryId, Item } from '@/types';

/**
 * Kiểm tra nhanh 1 dòng chi phí → danh sách cảnh báo (rỗng = sạch).
 * Chỉ cảnh báo những lỗi nhập liệu phổ biến của dân văn phòng, KHÔNG chặn lưu.
 * `isDup` do nơi gọi tính (trùng tên trong cùng hạng mục).
 */
export function lineWarnings(item: Item, isDup: boolean): string[] {
  const w: string[] = [];
  // Dòng có cộng vào tổng? FOC / "đã gồm" được phép giá 0.
  const counts = item.enabled && !item.foc && !item.included;

  if (!item.name.trim()) w.push('Chưa có tên hạng mục');
  if (counts && item.price <= 0) w.push('Đơn giá = 0');
  if (item.times < 1) w.push('Số lần < 1');

  const editableQty = item.qtyMode === 'custom' || item.qtyMode === 'package' || item.qtyMode === 'room';
  if (editableQty && item.customQty < 1) w.push('Số lượng < 1');

  // Lỗi rất hay gặp: gõ 1500 mà ý là 1.500.000 (thiếu '000').
  if (counts && item.cur === 'VND' && item.price > 0 && item.price < 1000)
    w.push('Đơn giá < 1.000đ — có thể thiếu số 0?');

  if (isDup) w.push('Trùng tên với dòng khác cùng hạng mục');
  return w;
}

/**
 * Tính tập tên bị trùng (đã chuẩn hoá) trong 1 hạng mục, để báo "Trùng tên".
 * Chỉ tính các dòng có tên không rỗng.
 */
export function duplicateNames(items: Item[]): Set<string> {
  const seen = new Map<string, number>();
  for (const it of items) {
    const key = it.name.trim().toLowerCase();
    if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dup = new Set<string>();
  for (const [k, n] of seen) if (n > 1) dup.add(k);
  return dup;
}

/** Khoá chuẩn hoá tên dùng để so với tập trùng. */
export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Lỗi NGHIÊM TRỌNG cần hỏi xác nhận trước khi xuất/lưu: dòng đang BẬT, có cộng
 * vào tổng (không FOC/đã gồm) nhưng đơn giá = 0 → gần như chắc chắn quên nhập giá.
 * Trả về tên các dòng (hoặc '(chưa đặt tên)').
 */
export function blockingIssues(items: Partial<Record<CategoryId, Item[]>>): string[] {
  const out: string[] = [];
  for (const arr of Object.values(items)) {
    for (const it of arr ?? []) {
      if (it.enabled && !it.foc && !it.included && it.price <= 0)
        out.push(it.name.trim() || '(chưa đặt tên)');
    }
  }
  return out;
}
