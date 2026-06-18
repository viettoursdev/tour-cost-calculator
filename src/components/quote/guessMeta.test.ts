import { describe, it, expect } from 'vitest';
import { guessItemMeta } from './guessMeta';

describe('guessItemMeta', () => {
  it('khách sạn / phòng → phòng đôi, /phòng/đêm', () => {
    expect(guessItemMeta('Khách sạn 4★')).toEqual({ unit: '/phòng/đêm', qtyMode: 'double_room' });
    expect(guessItemMeta('Phòng đôi Standard')).toEqual({ unit: '/phòng/đêm', qtyMode: 'double_room' });
  });
  it('HDV → đoàn, /ngày', () => {
    expect(guessItemMeta('HDV tiếng Anh')).toEqual({ unit: '/ngày', qtyMode: 'per_group' });
  });
  it('xe → đoàn, /xe', () => {
    expect(guessItemMeta('Thuê xe 45 chỗ')).toEqual({ unit: '/xe', qtyMode: 'per_group' });
  });
  it('ăn / tiệc → ×pax, /suất', () => {
    expect(guessItemMeta('Buffet trưa')).toEqual({ unit: '/suất', qtyMode: 'per_pax' });
  });
  it('vé / tham quan → ×pax, /khách', () => {
    expect(guessItemMeta('Vé tham quan Bà Nà')).toEqual({ unit: '/khách', qtyMode: 'per_pax' });
  });
  it('không khớp → null', () => {
    expect(guessItemMeta('Khoản phụ thu ABC')).toBeNull();
    expect(guessItemMeta('')).toBeNull();
  });
});
