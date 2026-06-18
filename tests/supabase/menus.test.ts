import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import {
  sbSaveRestaurants, sbSubscribeRestaurants,
  sbSaveMenu, sbGetMenu, sbDeleteMenu, sbSubscribeMenus,
} from '../../src/lib/supabase';
import type { Restaurant, Menu, MenuIndexEntry } from '../../src/types/menu';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

const RESTAURANT: Restaurant = {
  id: 'rest-t15',
  name: 'Nhà hàng Ngon',
  continent: 'Asia',
  country: 'Vietnam',
  city: 'Hà Nội',
  website: 'https://ngon.vn',
  menuLink: '',
  contact: '024 1234 5678',
  note: 'Vị trí đẹp',
  rating: 4.5,
  review: 'Rất ngon',
  menus: [
    { id: 'rm1', name: 'Set A', dishes: 'Phở, Bún', price: 150000, cur: 'VND', rating: 4, review: 'OK' },
    { id: 'rm2', name: 'Set B', dishes: 'Cơm, Canh', price: 200000, cur: 'VND', rating: 5, review: 'Xuất sắc' },
  ],
};

const MENU: Menu = {
  id: 'menu-t15',
  code: 'M15',
  type: 'ND',
  continent: 'Asia',
  country: 'Vietnam',
  seq: 1,
  title: 'Thực đơn HN 2N',
  destination: 'Hà Nội',
  days: 2,
  linkedItineraryId: null,
  linkedItineraryName: '',
  linkedQuoteId: null,
  linkedQuoteName: '',
  schedule: [
    {
      id: 'md1', dayNum: 1, date: '2026-08-01', city: 'Hà Nội',
      meals: [
        {
          id: 'mm1', mealType: 'B', restaurantId: 'rest-t15', restaurantName: 'Nhà hàng Ngon',
          city: 'Hà Nội', restMenuId: 'rm1', suggestedDishes: 'Phở', suggestedPrice: 150000,
          suggestedCur: 'VND', adjustedDishes: 'Phở đặc biệt', adjustedPrice: 160000,
          adjustedCur: 'VND', cur: 'VND', note: '',
        },
      ],
    },
    {
      id: 'md2', dayNum: 2, date: '2026-08-02', city: 'Hà Nội',
      meals: [
        {
          id: 'mm2', mealType: 'L', restaurantId: 'rest-t15', restaurantName: 'Nhà hàng Ngon',
          city: 'Hà Nội', restMenuId: 'rm2', suggestedDishes: 'Cơm', suggestedPrice: 200000,
          suggestedCur: 'VND', adjustedDishes: 'Cơm tấm', adjustedPrice: 210000,
          adjustedCur: 'VND', cur: 'VND', note: 'Thêm rau',
        },
      ],
    },
  ],
  createdAt: '2026-08-01T00:00:00.000Z',
  createdBy: 'tester',
};

describe('restaurants gateway', () => {
  beforeEach(async () => {
    await truncate(['restaurant_menus', 'restaurants']);
  });

  it('round-trips a restaurant with menus', async () => {
    const c = await getViettoursClient();

    await sbSaveRestaurants([RESTAURANT], 'tester', c);

    const list = await once<Restaurant[]>((cb) => sbSubscribeRestaurants(cb, c));
    const r = list.find((x) => x.id === 'rest-t15');
    expect(r).toBeDefined();
    expect(r!.name).toBe('Nhà hàng Ngon');
    expect(r!.rating).toBe(4.5);
    expect(r!.menus).toHaveLength(2);
    expect(r!.menus[0].name).toBe('Set A');
    expect(r!.menus[1].price).toBe(200000);

    // full-overwrite: saving empty list removes the restaurant
    await sbSaveRestaurants([], 'tester', c);
    const listAfter = await once<Restaurant[]>((cb) => sbSubscribeRestaurants(cb, c));
    expect(listAfter.find((x) => x.id === 'rest-t15')).toBeUndefined();
  });
});

describe('menus gateway', () => {
  beforeEach(async () => {
    await truncate(['menu_days', 'menus']);
  });

  it('saves, gets, lists, and deletes a menu with 2 days', async () => {
    const c = await getViettoursClient();

    // save
    await sbSaveMenu(MENU, 'tester', c);

    // get reassembles schedule with meals
    const got = await sbGetMenu('menu-t15', c);
    expect(got).not.toBeNull();
    expect(got!.title).toBe('Thực đơn HN 2N');
    expect(got!.days).toBe(2);
    expect(got!.schedule).toHaveLength(2);
    expect(got!.schedule[0].dayNum).toBe(1);
    expect(got!.schedule[0].city).toBe('Hà Nội');
    expect(got!.schedule[0].meals).toHaveLength(1);
    expect(got!.schedule[0].meals[0].mealType).toBe('B');
    expect(got!.schedule[1].dayNum).toBe(2);
    expect(got!.schedule[1].meals[0].note).toBe('Thêm rau');

    // list returns index entry
    const list = await once<MenuIndexEntry[]>((cb) => sbSubscribeMenus(cb, c));
    const entry = list.find((x) => x.id === 'menu-t15');
    expect(entry).toBeDefined();
    expect(entry!.title).toBe('Thực đơn HN 2N');
    expect(entry!.days).toBe(2);
    expect(entry!.destination).toBe('Hà Nội');

    // delete removes parent (children cascade)
    await sbDeleteMenu('menu-t15', c);
    const after = await sbGetMenu('menu-t15', c);
    expect(after).toBeNull();
    const listAfter = await once<MenuIndexEntry[]>((cb) => sbSubscribeMenus(cb, c));
    expect(listAfter.find((x) => x.id === 'menu-t15')).toBeUndefined();
  });
});
