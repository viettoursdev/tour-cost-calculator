import { describe, it, expect } from 'vitest';
import {
  defaultHomeLayout, reconcileHomeLayout, toggleHidden, reorderSection, isHidden,
  type HomeLayout,
} from './homeLayout';

const catalog = ['todo', 'process', 'soon', 'owing'];

describe('homeLayout', () => {
  it('defaultHomeLayout = thứ tự catalog, không ẩn gì', () => {
    expect(defaultHomeLayout(catalog)).toEqual({ order: ['todo', 'process', 'soon', 'owing'], hidden: [] });
  });

  it('reconcile: null → bằng default', () => {
    expect(reconcileHomeLayout(catalog, null)).toEqual(defaultHomeLayout(catalog));
  });

  it('reconcile: giữ thứ tự đã lưu', () => {
    const saved: HomeLayout = { order: ['owing', 'soon', 'process', 'todo'], hidden: ['soon'] };
    expect(reconcileHomeLayout(catalog, saved)).toEqual({ order: ['owing', 'soon', 'process', 'todo'], hidden: ['soon'] });
  });

  it('reconcile: bỏ id không còn khả dụng, thêm id mới vào cuối (hiện)', () => {
    const saved: HomeLayout = { order: ['gone', 'owing', 'todo'], hidden: ['gone', 'owing'] };
    const r = reconcileHomeLayout(catalog, saved);
    // 'gone' bị bỏ; 'process' & 'soon' (mới) thêm vào cuối theo thứ tự catalog
    expect(r.order).toEqual(['owing', 'todo', 'process', 'soon']);
    expect(r.hidden).toEqual(['owing']); // 'gone' bị lọc
  });

  it('reconcile: khử trùng lặp trong order', () => {
    const saved: HomeLayout = { order: ['todo', 'todo', 'process'], hidden: [] };
    const r = reconcileHomeLayout(catalog, saved);
    expect(r.order).toEqual(['todo', 'process', 'soon', 'owing']);
  });

  it('toggleHidden bật/tắt một thẻ', () => {
    let l = defaultHomeLayout(catalog);
    l = toggleHidden(l, 'soon');
    expect(isHidden(l, 'soon')).toBe(true);
    l = toggleHidden(l, 'soon');
    expect(isHidden(l, 'soon')).toBe(false);
  });

  it('reorderSection di chuyển trong order', () => {
    const l = defaultHomeLayout(catalog);
    expect(reorderSection(l, 0, 2).order).toEqual(['process', 'soon', 'todo', 'owing']);
    expect(reorderSection(l, 3, 0).order).toEqual(['owing', 'todo', 'process', 'soon']);
  });

  it('reorderSection chỉ số ngoài biên → giữ nguyên', () => {
    const l = defaultHomeLayout(catalog);
    expect(reorderSection(l, 0, 0)).toBe(l);
    expect(reorderSection(l, -1, 2)).toBe(l);
    expect(reorderSection(l, 0, 9)).toBe(l);
  });
});
