import { describe, expect, it } from 'vitest';
import { normalizeTableColPrefs, reconcileColumns, visibleColumns } from './tableColumnPrefs';

const ALL = ['code', 'name', 'dest', 'pax', 'total', 'actions'];

describe('reconcileColumns', () => {
  it('không có pref → thứ tự catalog, không ẩn gì', () => {
    const r = reconcileColumns(ALL, null);
    expect(r.order).toEqual(ALL);
    expect(r.hidden.size).toBe(0);
  });

  it('giữ thứ tự đã lưu, bỏ cột không còn, thêm cột mới vào cuối', () => {
    const r = reconcileColumns(ALL, { order: ['total', 'dest', 'ghost'], hidden: ['ghost'] });
    // saved (total, dest) trước, cột chưa lưu theo catalog sau.
    expect(r.order).toEqual(['total', 'dest', 'code', 'name', 'pax', 'actions']);
    expect(r.hidden.size).toBe(0); // 'ghost' không còn → bỏ
  });

  it('cột khoá đầu/cuối luôn đúng vị trí và không ẩn được', () => {
    const r = reconcileColumns(
      ALL,
      { order: ['total', 'code', 'dest'], hidden: ['code', 'actions', 'pax'] },
      { start: ['code', 'name'], end: ['actions'] },
    );
    expect(r.order[0]).toBe('code');
    expect(r.order[1]).toBe('name');
    expect(r.order[r.order.length - 1]).toBe('actions');
    // saved bỏ qua cột khoá: total rồi dest, cột mới (pax) sau.
    expect(r.order).toEqual(['code', 'name', 'total', 'dest', 'pax', 'actions']);
    expect(r.hidden.has('code')).toBe(false);
    expect(r.hidden.has('actions')).toBe(false);
    expect(r.hidden.has('pax')).toBe(true);
  });

  it('visibleColumns lọc cột ẩn', () => {
    expect(visibleColumns(ALL, { order: [], hidden: ['dest', 'pax'] })).toEqual([
      'code', 'name', 'total', 'actions',
    ]);
  });
});

describe('normalizeTableColPrefs', () => {
  it('bỏ entry sai hình dạng, giữ entry đúng', () => {
    const out = normalizeTableColPrefs({
      good: { order: ['a'], hidden: [] },
      bad: { order: 'x' },
      alsoBad: 42,
    });
    expect(Object.keys(out)).toEqual(['good']);
    expect(out.good).toEqual({ order: ['a'], hidden: [] });
  });

  it('blob rỗng/sai kiểu → {}', () => {
    expect(normalizeTableColPrefs(null)).toEqual({});
    expect(normalizeTableColPrefs('x')).toEqual({});
  });
});
