import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));
import { recordItem, suggestItems } from './itemSuggest';

describe('itemSuggest (từ điển tự học)', () => {
  beforeEach(() => localStorage.clear());

  it('ghi nhớ & gợi ý theo tên (khớp 1 phần)', () => {
    recordItem({ name: 'Xe 45 chỗ', price: 5500000, unit: '/xe', cur: 'VND' });
    const s = suggestItems('xe');
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ name: 'Xe 45 chỗ', price: 5500000, unit: '/xe', cur: 'VND' });
  });

  it('bỏ qua dòng thiếu tên hoặc giá', () => {
    recordItem({ name: '', price: 100, unit: '', cur: 'VND' });
    recordItem({ name: 'HDV', price: 0, unit: '/ngày', cur: 'VND' });
    expect(suggestItems('hdv')).toHaveLength(0);
  });

  it('cập nhật giá mới & ưu tiên mục dùng nhiều', () => {
    recordItem({ name: 'HDV', price: 1000000, unit: '/ngày', cur: 'VND' });
    recordItem({ name: 'HDV', price: 1200000, unit: '/ngày', cur: 'VND' });
    recordItem({ name: 'HDV tiếng Anh', price: 1800000, unit: '/ngày', cur: 'VND' });
    const s = suggestItems('hd');         // 'hd' khớp cả hai, không trùng khít
    expect(s[0].name).toBe('HDV');        // n=2 → xếp trước
    expect(s[0].price).toBe(1200000);     // giữ giá mới nhất
  });

  it('không gợi ý khi gõ trùng khít tên đã có', () => {
    recordItem({ name: 'HDV', price: 1000000, unit: '/ngày', cur: 'VND' });
    expect(suggestItems('HDV')).toHaveLength(0);
  });
});
