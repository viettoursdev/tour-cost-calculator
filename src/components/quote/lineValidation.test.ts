import { describe, it, expect } from 'vitest';
import { lineWarnings, duplicateNames, nameKey } from './lineValidation';
import type { Item } from '@/types';

const base: Item = {
  id: 1, name: 'Xe 45 chỗ', cur: 'VND', price: 5500000, times: 1,
  qtyMode: 'per_group', customQty: 1, unit: '/xe', enabled: true, foc: false,
} as Item;

describe('lineWarnings', () => {
  it('dòng hợp lệ → không cảnh báo', () => {
    expect(lineWarnings(base, false)).toEqual([]);
  });
  it('thiếu tên & giá 0', () => {
    const w = lineWarnings({ ...base, name: '  ', price: 0 }, false);
    expect(w).toContain('Chưa có tên hạng mục');
    expect(w).toContain('Đơn giá = 0');
  });
  it('FOC được phép giá 0', () => {
    expect(lineWarnings({ ...base, price: 0, foc: true }, false)).toEqual([]);
  });
  it('giá VND < 1.000 → nghi thiếu số 0', () => {
    expect(lineWarnings({ ...base, price: 500 }, false))
      .toContain('Đơn giá < 1.000đ — có thể thiếu số 0?');
  });
  it('số lần / số lượng < 1', () => {
    expect(lineWarnings({ ...base, times: 0 }, false)).toContain('Số lần < 1');
    expect(lineWarnings({ ...base, qtyMode: 'custom', customQty: 0 }, false)).toContain('Số lượng < 1');
  });
  it('cờ trùng tên', () => {
    expect(lineWarnings(base, true)).toContain('Trùng tên với dòng khác cùng hạng mục');
  });
});

describe('duplicateNames', () => {
  it('phát hiện trùng (không phân biệt hoa/thường, bỏ khoảng trắng)', () => {
    const items = [
      { ...base, id: 1, name: 'Xe 45 chỗ' },
      { ...base, id: 2, name: ' xe 45 CHỖ ' },
      { ...base, id: 3, name: 'HDV' },
      { ...base, id: 4, name: '' },
    ] as Item[];
    const dup = duplicateNames(items);
    expect(dup.has(nameKey('Xe 45 chỗ'))).toBe(true);
    expect(dup.has(nameKey('HDV'))).toBe(false);
  });
});
