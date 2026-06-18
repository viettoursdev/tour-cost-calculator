import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbPullMasterRC, sbPushMasterRC, sbSubscribeMasterRC } from '../../src/lib/supabase';
import type { RateCard, RateCardDoc } from '../../src/types/rates';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

const SAMPLE_RC: RateCard = {
  hotels: {
    'ha-noi': [{ name: 'Lotte', stars: 5, price: 2_500_000 }],
    'da-nang': [{ name: 'Furama', stars: 4, price: 1_800_000 }],
  },
  visaRates: { vietnam_30d_single: 50, china_15d: 120 },
  otherRates: {
    'vte_rate_transport_hcm': { label: 'Xe 45 chỗ HCM', price: 3_000_000 },
  },
};

describe('rate card gateway', () => {
  beforeEach(async () => {
    await truncate(['rate_card_hotels', 'rate_card_other', 'rate_card_visa', 'rate_card_meta']);
  });

  it('returns null when no data exists', async () => {
    const c = await getViettoursClient();
    const result = await sbPullMasterRC(c);
    expect(result).toBeNull();
  });

  it('round-trips hotels for 2 cities + visaRates + otherRates via push/pull', async () => {
    const c = await getViettoursClient();
    const pushedAt = await sbPushMasterRC(SAMPLE_RC, 'Tony', c);
    expect(typeof pushedAt).toBe('string');

    const doc = await sbPullMasterRC(c);
    expect(doc).not.toBeNull();

    // hotels — both cities preserved
    expect(doc!.hotels['ha-noi']).toEqual([{ name: 'Lotte', stars: 5, price: 2_500_000 }]);
    expect(doc!.hotels['da-nang']).toEqual([{ name: 'Furama', stars: 4, price: 1_800_000 }]);

    // visaRates round-trip
    expect(doc!.visaRates).toEqual({ vietnam_30d_single: 50, china_15d: 120 });

    // otherRates — user-defined keys preserved
    expect(doc!.otherRates['vte_rate_transport_hcm']).toEqual({ label: 'Xe 45 chỗ HCM', price: 3_000_000 });

    // visa mirror is stripped — must NOT appear in otherRates
    expect('vte_visa_rates' in (doc!.otherRates ?? {})).toBe(false);

    // meta written
    expect(doc!._meta?.pushedBy).toBe('Tony');
    expect(doc!._meta?.pushedAt).toBe(pushedAt);
  });

  it('full-overwrite removes cities not in the new push', async () => {
    const c = await getViettoursClient();
    await sbPushMasterRC(SAMPLE_RC, 'Tony', c);
    // push again with only one city
    await sbPushMasterRC(
      { ...SAMPLE_RC, hotels: { 'ha-noi': SAMPLE_RC.hotels['ha-noi'] } },
      'Tony', c,
    );
    const doc = await sbPullMasterRC(c);
    expect('da-nang' in doc!.hotels).toBe(false);
  });

  it('subscribe assembles RateCardDoc and strips the visa mirror', async () => {
    const c = await getViettoursClient();
    await sbPushMasterRC(SAMPLE_RC, 'Tony', c);
    const doc = await once<RateCardDoc>((cb) => sbSubscribeMasterRC(cb, c));
    expect(doc.hotels['ha-noi']).toBeDefined();
    expect(doc.visaRates).toEqual({ vietnam_30d_single: 50, china_15d: 120 });
    expect('vte_visa_rates' in (doc.otherRates ?? {})).toBe(false);
  });
});
