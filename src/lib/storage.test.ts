import { describe, it, expect, afterEach } from 'vitest';
import {
  readJSON,
  writeJSON,
  remove,
  readSavedQuotes,
  writeSavedQuotes,
  readUserSnapshots,
  migrateLegacyRateCard,
} from './storage';

afterEach(() => localStorage.clear());

describe('readJSON / writeJSON / remove', () => {
  it('writeJSON+readJSON round-trip', () => {
    writeJSON('k', { a: 1 });
    expect(readJSON('k', null)).toEqual({ a: 1 });
  });

  it('readJSON returns fallback when key missing', () => {
    expect(readJSON('missing', { default: true })).toEqual({ default: true });
  });

  it('readJSON returns fallback on malformed JSON', () => {
    localStorage.setItem('bad', '{not json');
    expect(readJSON('bad', [])).toEqual([]);
  });

  it('remove deletes a key', () => {
    writeJSON('k', 1);
    remove('k');
    expect(readJSON('k', null)).toBeNull();
  });
});

describe('readSavedQuotes / writeSavedQuotes', () => {
  it('returns empty object when key absent', () => {
    expect(readSavedQuotes()).toEqual({});
  });

  it('round-trips a saved map', () => {
    const m = { ceo: [{ id: 1, name: 'q1' } as never] } as Parameters<typeof writeSavedQuotes>[0];
    writeSavedQuotes(m);
    expect(readSavedQuotes()).toEqual(m);
  });

  it('returns empty object on malformed JSON', () => {
    localStorage.setItem('vte_q', '{not json');
    expect(readSavedQuotes()).toEqual({});
  });
});

describe('readUserSnapshots', () => {
  it('returns empty array for an unknown user', () => {
    expect(readUserSnapshots('nobody')).toEqual([]);
  });

  it('returns the per-user list when present', () => {
    const m = { ceo: [{ id: 1, name: 'q1' } as never] } as Parameters<typeof writeSavedQuotes>[0];
    writeSavedQuotes(m);
    expect(readUserSnapshots('ceo')).toEqual(m.ceo);
  });
});

describe('migrateLegacyRateCard', () => {
  it('returns null when no legacy keys present', () => {
    expect(migrateLegacyRateCard()).toBeNull();
  });

  it('drains vte_hotels_v2_*, vte_visa_rates, vte_rate_* and removes them', () => {
    localStorage.setItem('vte_hotels_v2_Hà Nội', JSON.stringify({ a: 1 }));
    localStorage.setItem('vte_visa_rates', JSON.stringify({ JP: 100 }));
    localStorage.setItem('vte_rate_dmc_hotel_default', JSON.stringify({ rate: 2 }));
    const rc = migrateLegacyRateCard();
    expect(rc).not.toBeNull();
    expect(rc?.hotels?.['Hà Nội']).toEqual({ a: 1 });
    expect(rc?.visaRates).toEqual({ JP: 100 });
    expect(rc?.otherRates?.['vte_rate_dmc_hotel_default']).toEqual({ rate: 2 });
    // drained keys removed
    expect(localStorage.getItem('vte_hotels_v2_Hà Nội')).toBeNull();
    expect(localStorage.getItem('vte_visa_rates')).toBeNull();
    expect(localStorage.getItem('vte_rate_dmc_hotel_default')).toBeNull();
  });
});
