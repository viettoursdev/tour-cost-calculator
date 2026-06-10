import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));

import { usePaymentStore } from './paymentStore';
import { useAuthStore } from './authStore';
import { snapshotInitial } from '@/test/storeReset';
import * as fb from '@/lib/firebase';
import type { User } from '@/types';

const resetPay = snapshotInitial(usePaymentStore);
const resetAuth = snapshotInitial(useAuthStore);

const u: User = { u: 'ceo', p: 'ceo123', role: 'CEO', name: 'Tony', color: '#000' };

beforeEach(() => {
  vi.useFakeTimers();
  resetPay();
  resetAuth();
  vi.clearAllMocks();
  useAuthStore.setState({ currentUser: u }, false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('paymentStore', () => {
  it('starts with empty slots', () => {
    expect(usePaymentStore.getState().slots).toEqual({});
  });

  it('init hydrates payments and customItems from localStorage by tourKey', () => {
    localStorage.setItem('vte_payments_tourA', JSON.stringify({ k1: { supplier: 'A' } }));
    localStorage.setItem('vte_pay_custom_tourA', JSON.stringify([{ key: 'x', catId: 'hotel', catLabel: '', catIcon: '', catColor: '', name: 'n', amount: 1 }]));
    usePaymentStore.getState().init();
    const tour = usePaymentStore.getState().getTour('tourA');
    expect(tour.payments).toEqual({ k1: { supplier: 'A' } });
    expect(tour.customItems.length).toBe(1);
  });

  it('ensureSubscribed creates a slot and calls fbSubscribeTourPayments once per key', () => {
    usePaymentStore.getState().ensureSubscribed('tourA');
    usePaymentStore.getState().ensureSubscribed('tourA');
    expect(fb.fbSubscribeTourPayments).toHaveBeenCalledTimes(1);
    expect(usePaymentStore.getState().slots.tourA.refCount).toBe(2);
  });

  it('subscriber callback merges remote data and writes through to localStorage', () => {
    usePaymentStore.getState().ensureSubscribed('tourA');
    const cb = vi.mocked(fb.fbSubscribeTourPayments).mock.calls[0][1];
    cb({ payments: { k: { supplier: 'X' } }, customItems: [] });
    const tour = usePaymentStore.getState().getTour('tourA');
    expect(tour.payments).toEqual({ k: { supplier: 'X' } });
    expect(localStorage.getItem('vte_payments_tourA')).toBe(JSON.stringify({ k: { supplier: 'X' } }));
  });

  it('releaseSubscription decrements refCount and unsubscribes on zero', () => {
    const unsub = vi.fn();
    vi.mocked(fb.fbSubscribeTourPayments).mockReturnValueOnce(unsub);
    usePaymentStore.getState().ensureSubscribed('tourA');
    usePaymentStore.getState().ensureSubscribed('tourA');
    usePaymentStore.getState().releaseSubscription('tourA');
    expect(unsub).not.toHaveBeenCalled();
    usePaymentStore.getState().releaseSubscription('tourA');
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it('setPayments writes through to localStorage immediately and debounces fb push by 1s', () => {
    usePaymentStore.getState().setPayments('tourA', { k: { supplier: 'A' } });
    expect(localStorage.getItem('vte_payments_tourA')).toBe(JSON.stringify({ k: { supplier: 'A' } }));
    expect(fb.fbSaveTourPayments).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(fb.fbSaveTourPayments).toHaveBeenCalledTimes(1);
    const [tourKey, payments, customs, savedBy] = vi.mocked(fb.fbSaveTourPayments).mock.calls[0];
    expect(tourKey).toBe('tourA');
    expect(payments).toEqual({ k: { supplier: 'A' } });
    expect(customs).toEqual([]);
    expect(savedBy).toBe('Tony');
  });

  it('setCustomItems writes-through and debounces fb push by 1s', () => {
    usePaymentStore.getState().setCustomItems('tourA', [
      { key: 'x', catId: 'hotel', catLabel: '', catIcon: '', catColor: '', name: 'n', amount: 1 },
    ]);
    expect(localStorage.getItem('vte_pay_custom_tourA')).toBeTruthy();
    vi.advanceTimersByTime(1000);
    expect(fb.fbSaveTourPayments).toHaveBeenCalledTimes(1);
  });

  it('repeated setPayments calls within 1s coalesce to one push', () => {
    usePaymentStore.getState().setPayments('tourA', { k: { supplier: 'A' } });
    vi.advanceTimersByTime(500);
    usePaymentStore.getState().setPayments('tourA', { k: { supplier: 'B' } });
    vi.advanceTimersByTime(1000);
    expect(fb.fbSaveTourPayments).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fb.fbSaveTourPayments).mock.calls[0][1]).toEqual({ k: { supplier: 'B' } });
  });

  it('getTour returns EMPTY when key unknown', () => {
    expect(usePaymentStore.getState().getTour('absent')).toEqual({ payments: {}, customItems: [] });
  });
});
