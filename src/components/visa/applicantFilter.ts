/**
 * Áp thay đổi/xoá từ tập ĐANG HIỂN THỊ (đã lọc/sắp xếp) trở lại danh sách ĐẦY ĐỦ
 * theo id — để lọc danh sách khách mà KHÔNG mất các khách đang bị ẩn.
 *
 * `after` là tập hiển thị sau khi bảng sửa/xoá (bảng luôn map/filter theo id trên
 * chính tập được đưa vào). Quy tắc: khách ẩn (không thuộc `visibleIds`) giữ nguyên;
 * khách đang hiện được thay bằng bản đã sửa; khách đang hiện bị bảng xoá (không còn
 * trong `after`) thì loại khỏi danh sách đầy đủ. Thứ tự danh sách đầy đủ giữ nguyên.
 */
export function reconcileVisibleEdits<T extends { id: string }>(
  full: T[], visibleIds: Set<string>, after: T[],
): T[] {
  const afterById = new Map(after.map((p) => [p.id, p]));
  return full
    .filter((p) => !visibleIds.has(p.id) || afterById.has(p.id))
    .map((p) => afterById.get(p.id) ?? p);
}
