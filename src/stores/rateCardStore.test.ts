import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));

import { useRateCardStore } from './rateCardStore';
import { useAuthStore } from './authStore';
import { snapshotInitial } from '@/test/storeReset';
import * as fb from '@/lib/supabase';
import type { User } from '@/types';

const resetRC = snapshotInitial(useRateCardStore);
const resetAuth = snapshotInitial(useAuthStore);

const u: User = { u: 'ceo', p: 'ceo123', role: 'CEO', name: 'Tony', color: '#000' };

beforeEach(() => {
  vi.useFakeTimers();
  resetRC();
  resetAuth();
  vi.clearAllMocks();
  useAuthStore.setState({ currentUser: u }, false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('rateCardStore', () => {
  it('starts with empty rate card and status idle', () => {
    const s = useRateCardStore.getState();
    expect(s.rates).toEqual({ hotels: {}, visaRates: {}, otherRates: {} });
    expect(s.status).toBe('idle');
  });

  it('init subscribes to sbSubscribeMasterRC', () => {
    useRateCardStore.getState().init();
    expect(fb.sbSubscribeMasterRC).toHaveBeenCalledTimes(1);
  });

  it('subscriber callback applies remote rates', () => {
    useRateCardStore.getState().init();
    const cb = vi.mocked(fb.sbSubscribeMasterRC).mock.calls[0][0];
    cb({
      hotels: { 'Hà Nội': [{ name: 'h1' }] },
      visaRates: { JP: { fee: 100 } },
      otherRates: {},
      _meta: { pushedAt: 'remote-time' },
    } as unknown as Parameters<typeof cb>[0]);
    const s = useRateCardStore.getState();
    expect(s.rates.hotels['Hà Nội']).toEqual([{ name: 'h1' }]);
    expect(s.rates.visaRates.JP).toEqual({ fee: 100 });
  });

  it('setRates flips status to syncing and debounces fb push by 2s', () => {
    useRateCardStore.getState().init(); // wire debouncer
    useRateCardStore.getState().setRates({
      hotels: { x: [] }, visaRates: {}, otherRates: {},
    });
    expect(useRateCardStore.getState().status).toBe('syncing');
    expect(fb.sbPushMasterRC).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(fb.sbPushMasterRC).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fb.sbPushMasterRC).mock.calls[0][1]).toBe('Tony (CEO)');
  });

  it('updateHotels merges a city into hotels without mutating prior state', () => {
    const before = useRateCardStore.getState().rates;
    useRateCardStore.getState().init();
    useRateCardStore.getState().updateHotels('Hà Nội', [{ name: 'h1' }]);
    const after = useRateCardStore.getState().rates;
    expect(after.hotels['Hà Nội']).toEqual([{ name: 'h1' }]);
    expect(before).not.toBe(after);
    expect(before.hotels).toEqual({}); // original snapshot unmutated
  });

  it('updateVisa replaces visaRates wholesale', () => {
    useRateCardStore.getState().init();
    useRateCardStore.getState().updateVisa({ JP: { fee: 1 } });
    expect(useRateCardStore.getState().rates.visaRates).toEqual({ JP: { fee: 1 } });
  });

  it('updateOtherRate sets a single key under otherRates', () => {
    useRateCardStore.getState().init();
    useRateCardStore.getState().updateOtherRate('hotel_dom', { foo: 1 });
    expect(useRateCardStore.getState().rates.otherRates.hotel_dom).toEqual({ foo: 1 });
  });

  it('setRates uses "unknown" as pushedBy when no user is signed in', () => {
    useAuthStore.setState({ currentUser: null }, false);
    useRateCardStore.getState().init();
    useRateCardStore.getState().setRates({
      hotels: {}, visaRates: {}, otherRates: { k: { v: 1 } },
    });
    vi.advanceTimersByTime(2000);
    const calls = vi.mocked(fb.sbPushMasterRC).mock.calls;
    expect(calls[calls.length - 1][1]).toBe('unknown');
  });
});
