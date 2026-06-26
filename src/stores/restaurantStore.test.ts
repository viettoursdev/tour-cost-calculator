import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));

import { useRestaurantStore } from './restaurantStore';
import { snapshotInitial } from '@/test/storeReset';
import * as sb from '@/lib/supabase';
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
    expect(sb.sbSubscribeRestaurants).toHaveBeenCalledTimes(1);
    const cb = vi.mocked(sb.sbSubscribeRestaurants).mock.calls[0][0];
    cb([rest({ id: 'r1' }), rest({ id: 'r2' })]);
    const s = useRestaurantStore.getState();
    expect(s.list.length).toBe(2);
    expect(s.loading).toBe(false);
  });

  it('save updates state optimistically immediately, debounces the network push', async () => {
    const next = [rest({ id: 'r1', name: 'B' })];
    useRestaurantStore.getState().save(next, 'tester');
    // Optimistic state is applied synchronously...
    expect(useRestaurantStore.getState().list).toEqual(next);
    // ...but the (heavy, full-overwrite) write is deferred until flush.
    expect(sb.sbSaveRestaurants).not.toHaveBeenCalled();
    await useRestaurantStore.getState().flush();
    expect(sb.sbSaveRestaurants).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sb.sbSaveRestaurants).mock.calls[0]).toEqual([next, 'tester']);
  });

  it('rapid saves collapse to a single push of the latest snapshot', async () => {
    useRestaurantStore.getState().save([rest({ id: 'r1', name: 'A' })], 'tester');
    useRestaurantStore.getState().save([rest({ id: 'r1', name: 'AB' })], 'tester');
    const last = [rest({ id: 'r1', name: 'ABC' })];
    useRestaurantStore.getState().save(last, 'tester');
    await useRestaurantStore.getState().flush();
    expect(sb.sbSaveRestaurants).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sb.sbSaveRestaurants).mock.calls[0][0]).toEqual(last);
  });

  it('realtime echo keeps the existing local order (no DOM reorder → no focus loss)', () => {
    useRestaurantStore.getState().init();
    const cb = vi.mocked(sb.sbSubscribeRestaurants).mock.calls[vi.mocked(sb.sbSubscribeRestaurants).mock.calls.length - 1][0];
    // Local order: r2 before r1 (e.g. r2 just added on top).
    cb([rest({ id: 'r2', name: 'Z' }), rest({ id: 'r1', name: 'A' })]);
    // Echo comes back name-sorted (A before Z) — must NOT reorder existing cards.
    cb([rest({ id: 'r1', name: 'A' }), rest({ id: 'r2', name: 'Z' })]);
    expect(useRestaurantStore.getState().list.map((r) => r.id)).toEqual(['r2', 'r1']);
  });

  it('realtime echo appends genuinely new restaurants at the end', () => {
    useRestaurantStore.getState().init();
    const cb = vi.mocked(sb.sbSubscribeRestaurants).mock.calls[vi.mocked(sb.sbSubscribeRestaurants).mock.calls.length - 1][0];
    cb([rest({ id: 'r2' }), rest({ id: 'r1' })]);
    cb([rest({ id: 'r1' }), rest({ id: 'r3' }), rest({ id: 'r2' })]);
    expect(useRestaurantStore.getState().list.map((r) => r.id)).toEqual(['r2', 'r1', 'r3']);
  });

  it('save shows an alert when supabase rejects but keeps optimistic state', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.mocked(sb.sbSaveRestaurants).mockRejectedValueOnce(new Error('boom'));
    const next = [rest({ id: 'r1' })];
    useRestaurantStore.getState().save(next, 'tester');
    expect(useRestaurantStore.getState().list).toEqual(next);
    await useRestaurantStore.getState().flush();
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('boom'));
    alertSpy.mockRestore();
  });
});
