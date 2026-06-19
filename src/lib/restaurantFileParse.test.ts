import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));
import { mapRestaurant, parsedToRestaurant } from './restaurantFileParse';

describe('mapRestaurant', () => {
  it('chuẩn hoá thông tin + menus (dishes mảng → xuống dòng, giá kiểu tắt)', () => {
    const p = mapRestaurant({
      name: 'Nhà hàng Sen', diachi: '12 Lê Lợi', city: 'Đà Nẵng', country: 'Việt Nam', rating: '4',
      menus: [{ name: 'Set 1', items: ['Gỏi cuốn', 'Cá kho'], price: '350k', cur: 'vnd' }],
    });
    expect(p).toMatchObject({ name: 'Nhà hàng Sen', address: '12 Lê Lợi', city: 'Đà Nẵng', country: 'Việt Nam', rating: 4 });
    expect(p.menus[0]).toMatchObject({ name: 'Set 1', dishes: 'Gỏi cuốn\nCá kho', price: 350000, cur: 'VND' });
  });
  it('rating ngoài 1-5 → 0; menus rỗng', () => {
    const p = mapRestaurant({ name: 'X', rating: 9 });
    expect(p.rating).toBe(0);
    expect(p.menus).toEqual([]);
  });
});

describe('parsedToRestaurant', () => {
  it('tạo Restaurant id mới, set id mới cho từng menu', () => {
    const r = parsedToRestaurant({
      name: 'A', address: 'đc', city: 'HN', country: 'VN', continent: 'Châu Á', contact: '', note: '', rating: 5,
      menus: [{ name: 'Set', dishes: 'Phở', price: 100000, cur: 'VND', review: '' }],
    });
    expect(r.id).toMatch(/^r/);
    expect(r.name).toBe('A');
    expect(r.address).toBe('đc');
    expect(r.rating).toBe(5);
    expect(r.menus).toHaveLength(1);
    expect(r.menus[0].dishes).toBe('Phở');
    expect(r.menus[0].id).toMatch(/^rm/);
  });
});
