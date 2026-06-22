import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));

import { useVisaProductsStore } from './visaProductsStore';
import { snapshotInitial } from '@/test/storeReset';
import * as sb from '@/lib/supabase';
import type { VisaProduct } from '@/types';

const reset = snapshotInitial(useVisaProductsStore);
beforeEach(() => { reset(); vi.clearAllMocks(); });

function product(over: Partial<VisaProduct> = {}): VisaProduct {
  return {
    id: 'p1',
    country: 'VN',
    visaType: 'tourist',
    validity: '30d',
    location: 'HN',
    fees: [],
    markupType: 'percent',
    markupValue: 0,
    markupCur: 'VND',
    note: '',
    active: true,
    ...over,
  };
}

describe('visaProductsStore', () => {
  it('starts empty with seeded rates and loaded=false', () => {
    const s = useVisaProductsStore.getState();
    expect(s.products).toEqual([]);
    expect(s.loaded).toBe(false);
    expect(Object.keys(s.rates).length).toBeGreaterThan(0);
  });

  it('init subscribes; null payload still flips loaded=true', () => {
    useVisaProductsStore.getState().init();
    expect(sb.sbSubscribeVisaProducts).toHaveBeenCalledTimes(1);
    const cb = vi.mocked(sb.sbSubscribeVisaProducts).mock.calls[0][0];
    cb(null);
    expect(useVisaProductsStore.getState().loaded).toBe(true);
    expect(useVisaProductsStore.getState().products).toEqual([]);
  });

  it('callback with payload populates products and merges rates', () => {
    const before = useVisaProductsStore.getState().rates;
    useVisaProductsStore.getState().init();
    const cb = vi.mocked(sb.sbSubscribeVisaProducts).mock.calls[0][0];
    cb({ products: [product()], rates: { USD: 99_000 } });
    const s = useVisaProductsStore.getState();
    expect(s.products).toEqual([product()]);
    expect(s.rates.USD).toBe(99_000);
    // Existing seeded keys still present
    for (const k of Object.keys(before)) {
      if (k !== 'USD') expect(s.rates[k]).toBe(before[k]);
    }
  });

  it('callback with empty rates keeps existing seeded rates', () => {
    const seeded = useVisaProductsStore.getState().rates;
    useVisaProductsStore.getState().init();
    const cb = vi.mocked(sb.sbSubscribeVisaProducts).mock.calls[0][0];
    cb({ products: [], rates: {} });
    expect(useVisaProductsStore.getState().rates).toEqual(seeded);
  });

  it('save updates state optimistically and forwards to fb', async () => {
    const data = { products: [product()], rates: { USD: 25_000 } };
    await useVisaProductsStore.getState().save(data, 'tester');
    const s = useVisaProductsStore.getState();
    expect(s.products).toEqual(data.products);
    expect(s.rates).toEqual(data.rates);
    expect(vi.mocked(sb.sbSaveVisaProducts).mock.calls[0]).toEqual([data, 'tester']);
  });

  it('save shows alert on supabase failure', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.mocked(sb.sbSaveVisaProducts).mockRejectedValueOnce(new Error('boom'));
    await useVisaProductsStore.getState().save(
      { products: [], rates: {} }, 'tester',
    );
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('boom'));
    alertSpy.mockRestore();
  });
});
