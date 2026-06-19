import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));
import { extractArray, coerceQuoteLines } from './quoteFileParse';
import type { CategoryId } from '@/types';

const cats: CategoryId[] = ['flight', 'hotel', 'meal', 'transport'];

describe('extractArray', () => {
  it('bóc mảng kể cả có fence/chữ quanh', () => {
    expect(extractArray('Đây:\n```json\n[{"name":"A"}]\n```')).toEqual([{ name: 'A' }]);
  });
  it('null nếu không phải mảng', () => {
    expect(extractArray('{"a":1}')).toBeNull();
  });
  it('bọc trong object {"lines":[...]}', () => {
    expect(extractArray('{"lines":[{"name":"A"},{"name":"B"}]}')).toEqual([{ name: 'A' }, { name: 'B' }]);
  });
  it('kèm chữ giải thích quanh mảng (không over-match dấu ] khác)', () => {
    expect(extractArray('Kết quả: [{"name":"A"}] (xong) [ghi chú]')).toEqual([{ name: 'A' }]);
  });
  it('JSON bị cắt cụt → giữ các object hoàn chỉnh', () => {
    const r = extractArray('[{"name":"A","price":100},{"name":"B","price":200},{"name":"C","pri');
    expect(r).toEqual([{ name: 'A', price: 100 }, { name: 'B', price: 200 }]);
  });
});

describe('coerceQuoteLines', () => {
  it('chuẩn hoá giá kiểu tắt, đơn vị, số lần; bỏ dòng thiếu tên', () => {
    const out = coerceQuoteLines([
      { category: 'transport', name: 'Thuê xe 45 chỗ', price: '5.500.000', cur: 'vnd', unit: '/xe', times: '2', qtyMode: 'per_group' },
      { name: '' },
    ], cats);
    expect(out).toEqual([
      { category: 'transport', name: 'Thuê xe 45 chỗ', price: 5500000, cur: 'VND', unit: '/xe', times: 2, qtyMode: 'per_group', note: '' },
    ]);
  });
  it('qtyMode AI không hợp lệ → đoán theo tên (khách sạn → phòng đôi)', () => {
    const o = coerceQuoteLines([{ category: 'hotel', name: 'Khách sạn 4 sao', price: 1200000, qtyMode: 'xxx' }], cats)[0];
    expect(o.qtyMode).toBe('double_room');
    expect(o.unit).toBe('/phòng/đêm');     // đơn vị suy từ tên khi AI để trống
  });
  it('không đoán được → per_pax', () => {
    expect(coerceQuoteLines([{ category: 'meal', name: 'Phụ phí ABC', price: 100000 }], cats)[0].qtyMode).toBe('per_pax');
  });
  it('category không hợp lệ → hạng mục đầu tiên', () => {
    expect(coerceQuoteLines([{ category: 'xxx', name: 'A', price: 100 }], cats)[0].category).toBe('flight');
  });
  it('alias trường (item/amount/ghichu)', () => {
    const o = coerceQuoteLines([{ category: 'meal', item: 'Buffet trưa', amount: 200000, ghichu: 'trưa' }], cats)[0];
    expect(o).toMatchObject({ name: 'Buffet trưa', price: 200000, note: 'trưa', qtyMode: 'per_pax' });
  });
});
