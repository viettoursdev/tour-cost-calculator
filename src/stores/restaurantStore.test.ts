import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));

import { useRestaurantStore } from './restaurantStore';
import { snapshotInitial } from '@/test/storeReset';
import * as fb from '@/lib/firebase';
import type { Restaurant } from '@/types';

const reset = snapshotInitial(useRestaurantStore);
beforeEach(() => { reset(); vi.clearAllMocks(); });

function rest(over: Partial<Restaurant> = {}): Restaurant {
  return {
    id: 'r1',
    name: 'Nhà hàng A',
    continent: 'Asia',
    country: 'VN',
    city: 'Hà Nội',
    rating: 0,
    review: '',
    menus: [],
    ...over,
  };
}

describe('restaurantStore', () => {
  it('starts with empty list and loading=true', () => {
    const s = useRestaurantStore.getState();
    expect(s.list).toEqual([]);
    expect(s.loading).toBe(true);
  });

  it('init subscribes and populates list when callback fires', () => {
    useRestaurantStore.getState().init();
    expect(fb.fbSubscribeRestaurants).toHaveBeenCalledTimes(1);
    const cb = vi.mocked(fb.fbSubscribeRestaurants).mock.calls[0][0];
    cb([rest({ id: 'r1' }), rest({ id: 'r2' })]);
    const s = useRestaurantStore.getState();
    expect(s.list.length).toBe(2);
    expect(s.loading).toBe(false);
  });

  it('save updates state optimistically and forwards to firebase', async () => {
    const next = [rest({ id: 'r1', name: 'B' })];
    await useRestaurantStore.getState().save(next, 'tester');
    expect(useRestaurantStore.getState().list).toEqual(next);
    expect(fb.fbSaveRestaurants).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fb.fbSaveRestaurants).mock.calls[0]).toEqual([next, 'tester']);
  });

  it('save shows an alert when firebase rejects but keeps optimistic state', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.mocked(fb.fbSaveRestaurants).mockRejectedValueOnce(new Error('boom'));
    const next = [rest({ id: 'r1' })];
    await useRestaurantStore.getState().save(next, 'tester');
    expect(useRestaurantStore.getState().list).toEqual(next);
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('boom'));
    alertSpy.mockRestore();
  });
});
