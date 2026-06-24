import { describe, it, expect } from 'vitest';
import {
  defaultLayout, reconcileLayout, moveItem, reorder, hideItem, unhideItem, emptyLayout,
  type NavCatalogEntry,
} from './navLayout';

const catalog: NavCatalogEntry[] = [
  { id: 'home', container: 'top' },
  { id: 'cost', container: 'top' },
  { id: 'summary', container: 'grp:sales' },
  { id: 'payment', container: 'grp:sales' },
  { id: 'todo', container: 'grp:ops' },
];

describe('navLayout', () => {
  it('defaultLayout đặt mục về đúng container gốc', () => {
    const l = defaultLayout(catalog);
    expect(l.top).toEqual(['home', 'cost']);
    expect(l['grp:sales']).toEqual(['summary', 'payment']);
    expect(l['grp:ops']).toEqual(['todo']);
    expect(l.hidden).toEqual([]);
  });

  it('reconcile: layout null → bằng default', () => {
    expect(reconcileLayout(catalog, null)).toEqual(defaultLayout(catalog));
  });

  it('reconcile: GIỮ vị trí đã lưu + THÊM mục mới vào container mặc định ở cuối', () => {
    const saved = emptyLayout();
    saved.top = ['cost', 'home'];          // user đảo thứ tự + đưa summary lên top
    saved['grp:sales'] = ['summary'];      // (payment chưa có trong saved = mục "mới")
    const l = reconcileLayout(catalog, saved);
    expect(l.top).toEqual(['cost', 'home']);
    expect(l['grp:sales']).toEqual(['summary', 'payment']); // payment append cuối nhóm gốc
    expect(l['grp:ops']).toEqual(['todo']);
  });

  it('reconcile: BỎ id không còn khả dụng (mất quyền)', () => {
    const saved = emptyLayout();
    saved.top = ['home', 'cost', 'execboard']; // execboard không có trong catalog
    const l = reconcileLayout(catalog, saved);
    expect(l.top).toEqual(['home', 'cost']);
    expect(Object.values(l).flat()).not.toContain('execboard');
  });

  it('moveItem: dồn 1 mục từ nhóm ra top (tách ra)', () => {
    const l = moveItem(defaultLayout(catalog), 'summary', 'top', 1);
    expect(l.top).toEqual(['home', 'summary', 'cost']);
    expect(l['grp:sales']).toEqual(['payment']);
  });

  it('reorder: đổi thứ tự trong cùng container', () => {
    const l = reorder(defaultLayout(catalog), 'top', 0, 1);
    expect(l.top).toEqual(['cost', 'home']);
  });

  it('hide rồi unhide: quay về container mặc định', () => {
    const hidden = hideItem(defaultLayout(catalog), 'payment');
    expect(hidden.hidden).toEqual(['payment']);
    expect(hidden['grp:sales']).toEqual(['summary']);
    const back = unhideItem(hidden, catalog, 'payment');
    expect(back.hidden).toEqual([]);
    expect(back['grp:sales']).toEqual(['summary', 'payment']);
  });

  it('moveItem không nhân đôi id (luôn gỡ khỏi chỗ cũ)', () => {
    let l = defaultLayout(catalog);
    l = moveItem(l, 'todo', 'grp:sales', 0);
    l = moveItem(l, 'todo', 'top', 0);
    const all = Object.values(l).flat();
    expect(all.filter((x) => x === 'todo')).toHaveLength(1);
    expect(l.top[0]).toBe('todo');
    expect(l['grp:ops']).toEqual([]);
  });
});
