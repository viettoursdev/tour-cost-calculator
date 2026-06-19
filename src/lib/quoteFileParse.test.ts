import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));
import { extractArray, coerceQuoteLines } from './quoteFileParse';
import type { CategoryId } from '@/types';

const cats: CategoryId[] = ['flight', 'hotel', 'meal'];

describe('extractArray', () => {
  it('bóc mảng kể cả có fence/chữ quanh', () => {
    expect(extractArray('Đây:\n```json\n[{"name":"A"}]\n```')).toEqual([{ name: 'A' }]);
  });
  it('null nếu không phải mảng', () => {
    expect(extractArray('{"a":1}')).toBeNull();
  });
});

describe('coerceQuoteLines', () => {
  it('chuẩn hoá giá kiểu tắt, đơn vị, số lần; bỏ dòng thiếu tên', () => {
    const out = coerceQuoteLines([
      { category: 'hotel', name: 'KS 4★', price: '1.500.000', cur: 'vnd', unit: '/đêm', times: '2' },
      { category: 'flight', name: 'Vé', price: '2tr5' },
      { name: '' },
    ], cats);
    expect(out).toEqual([
      { category: 'hotel', name: 'KS 4★', price: 1500000, cur: 'VND', unit: '/đêm', times: 2, note: '' },
      { category: 'flight', name: 'Vé', price: 2500000, cur: 'VND', unit: '', times: 1, note: '' },
    ]);
  });
  it('category không hợp lệ → hạng mục đầu tiên', () => {
    expect(coerceQuoteLines([{ category: 'xxx', name: 'A', price: 100 }], cats)[0].category).toBe('flight');
  });
  it('alias trường (item/amount/qty/ghichu)', () => {
    const o = coerceQuoteLines([{ category: 'meal', item: 'Buffet', amount: 200000, qty: 3, ghichu: 'trưa' }], cats)[0];
    expect(o).toMatchObject({ name: 'Buffet', price: 200000, times: 3, note: 'trưa' });
  });
});
