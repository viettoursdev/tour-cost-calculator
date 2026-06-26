import { describe, it, expect } from 'vitest';
import {
  defaultHomeLayout, reconcileHomeLayout, toggleHidden, toggleCollapsed, setRowsPer,
  setDocsDays, setTourDays, reorderSection, isHidden, isCollapsed,
  DEFAULT_ROWS, DEFAULT_DOCS_DAYS, DEFAULT_TOUR_DAYS,
  type HomeLayout,
} from './homeLayout';

const catalog = ['todo', 'process', 'soon', 'owing'];

describe('homeLayout', () => {
  it('defaultHomeLayout = thứ tự catalog, không ẩn/thu gọn, mặc định rows/ngưỡng', () => {
    expect(defaultHomeLayout(catalog)).toEqual({
      order: ['todo', 'process', 'soon', 'owing'], hidden: [], collapsed: [],
      rowsPer: DEFAULT_ROWS, docsDays: DEFAULT_DOCS_DAYS, tourDays: DEFAULT_TOUR_DAYS,
    });
  });

  it('reconcile: null → bằng default', () => {
    expect(reconcileHomeLayout(catalog, null)).toEqual(defaultHomeLayout(catalog));
  });

  it('reconcile: giữ thứ tự + ẩn + thu gọn + rowsPer + ngưỡng đã lưu', () => {
    const saved: HomeLayout = { order: ['owing', 'soon', 'process', 'todo'], hidden: ['soon'], collapsed: ['owing'], rowsPer: 10, docsDays: 30, tourDays: 14 };
    expect(reconcileHomeLayout(catalog, saved)).toEqual(saved);
  });

  it('reconcile: bỏ id không còn khả dụng, thêm id mới vào cuối (hiện)', () => {
    const saved: HomeLayout = { order: ['gone', 'owing', 'todo'], hidden: ['gone', 'owing'], collapsed: ['gone'], rowsPer: 3, docsDays: 60, tourDays: 7 };
    const r = reconcileHomeLayout(catalog, saved);
    expect(r.order).toEqual(['owing', 'todo', 'process', 'soon']);
    expect(r.hidden).toEqual(['owing']);   // 'gone' bị lọc
    expect(r.collapsed).toEqual([]);       // 'gone' bị lọc
    expect(r.rowsPer).toBe(3);
    expect(r.docsDays).toBe(60);
  });

  it('reconcile: rows/ngưỡng sai/thiếu → về mặc định; back-compat layout cũ thiếu field', () => {
    const bad = reconcileHomeLayout(catalog, { order: ['todo'], hidden: [], rowsPer: 7, docsDays: 45, tourDays: 99 } as never);
    expect(bad.rowsPer).toBe(DEFAULT_ROWS);
    expect(bad.docsDays).toBe(DEFAULT_DOCS_DAYS); // 45 không thuộc options
    expect(bad.tourDays).toBe(DEFAULT_TOUR_DAYS); // 99 không thuộc options
    const old = reconcileHomeLayout(catalog, { order: ['todo', 'process'], hidden: ['process'] } as never);
    expect(old.collapsed).toEqual([]);
    expect(old.rowsPer).toBe(DEFAULT_ROWS);
    expect(old.docsDays).toBe(DEFAULT_DOCS_DAYS);
    expect(old.tourDays).toBe(DEFAULT_TOUR_DAYS);
  });

  it('setDocsDays / setTourDays chỉ nhận giá trị hợp lệ', () => {
    const l = defaultHomeLayout(catalog);
    expect(setDocsDays(l, 30).docsDays).toBe(30);
    expect(setDocsDays(l, 45).docsDays).toBe(DEFAULT_DOCS_DAYS);
    expect(setTourDays(l, 14).tourDays).toBe(14);
    expect(setTourDays(l, 5).tourDays).toBe(DEFAULT_TOUR_DAYS);
  });

  it('reconcile: khử trùng lặp trong order', () => {
    const saved = { order: ['todo', 'todo', 'process'], hidden: [], collapsed: [], rowsPer: 5 };
    expect(reconcileHomeLayout(catalog, saved).order).toEqual(['todo', 'process', 'soon', 'owing']);
  });

  it('toggleHidden / toggleCollapsed bật-tắt', () => {
    let l = defaultHomeLayout(catalog);
    l = toggleHidden(l, 'soon');
    expect(isHidden(l, 'soon')).toBe(true);
    l = toggleHidden(l, 'soon');
    expect(isHidden(l, 'soon')).toBe(false);
    l = toggleCollapsed(l, 'owing');
    expect(isCollapsed(l, 'owing')).toBe(true);
    l = toggleCollapsed(l, 'owing');
    expect(isCollapsed(l, 'owing')).toBe(false);
  });

  it('setRowsPer chỉ nhận giá trị hợp lệ', () => {
    const l = defaultHomeLayout(catalog);
    expect(setRowsPer(l, 10).rowsPer).toBe(10);
    expect(setRowsPer(l, 9999).rowsPer).toBe(9999);
    expect(setRowsPer(l, 4).rowsPer).toBe(DEFAULT_ROWS); // không thuộc ROWS_OPTIONS
  });

  it('reorderSection di chuyển trong order, giữ field khác', () => {
    const l = setRowsPer(defaultHomeLayout(catalog), 10);
    const r = reorderSection(l, 0, 2);
    expect(r.order).toEqual(['process', 'soon', 'todo', 'owing']);
    expect(r.rowsPer).toBe(10);
  });

  it('reorderSection chỉ số ngoài biên → giữ nguyên', () => {
    const l = defaultHomeLayout(catalog);
    expect(reorderSection(l, 0, 0)).toBe(l);
    expect(reorderSection(l, -1, 2)).toBe(l);
    expect(reorderSection(l, 0, 9)).toBe(l);
  });
});
