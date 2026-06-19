/** Tiện ích sắp xếp hạng mục chi phí theo thứ tự kéo-thả lưu trong draft.catOrder. */
type CatLike = { id: string };

/** Sắp xếp `cats` theo `order`; mục không có trong order giữ thứ tự mặc định ở cuối. */
export function orderCats<T extends CatLike>(cats: T[], order?: string[]): T[] {
  if (!order || order.length === 0) return cats;
  const pos = new Map(order.map((id, i) => [id, i]));
  return cats
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const pa = pos.has(a.c.id) ? pos.get(a.c.id)! : Infinity;
      const pb = pos.has(b.c.id) ? pos.get(b.c.id)! : Infinity;
      return pa - pb || a.i - b.i;
    })
    .map((x) => x.c);
}

/**
 * Sau khi kéo 1 mục trong danh sách ĐANG HIỂN THỊ (shown là subsequence của full),
 * trả về thứ tự id ĐẦY ĐỦ mới — giữ nguyên vị trí các mục bị ẩn.
 */
export function reorderWithinShown(fullIds: string[], shownIds: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= shownIds.length || to >= shownIds.length) return fullIds;
  const newShown = [...shownIds];
  const [m] = newShown.splice(from, 1);
  newShown.splice(to, 0, m);
  const shownSet = new Set(shownIds);
  let qi = 0;
  return fullIds.map((id) => (shownSet.has(id) ? newShown[qi++] : id));
}
