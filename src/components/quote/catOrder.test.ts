import { describe, it, expect } from 'vitest';
import { orderCats, reorderWithinShown } from './catOrder';

const cats = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

describe('orderCats', () => {
  it('không có order → giữ nguyên', () => {
    expect(orderCats(cats).map((c) => c.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('sắp theo order; mục thiếu xuống cuối theo thứ tự mặc định', () => {
    expect(orderCats(cats, ['c', 'a']).map((c) => c.id)).toEqual(['c', 'a', 'b', 'd']);
  });
});

describe('reorderWithinShown', () => {
  it('kéo trong tập hiển thị, giữ vị trí mục ẩn', () => {
    // full = a b c d; ẩn 'b' → shown = a c d; kéo 'd'(2) lên đầu(0)
    const out = reorderWithinShown(['a', 'b', 'c', 'd'], ['a', 'c', 'd'], 2, 0);
    // shown mới = d a c; ghép lại giữ 'b' đúng vị trí (index 1 của full)
    expect(out).toEqual(['d', 'b', 'a', 'c']);
  });
  it('from===to → không đổi', () => {
    expect(reorderWithinShown(['a', 'b'], ['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});
