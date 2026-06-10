import { describe, it, expect } from 'vitest';
import { TEMPLATES, CATS, DMC_CAT_IDS, mkItem } from './constants';

describe('TEMPLATES', () => {
  it('declares the 7 documented templates', () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual(
      ['dmc', 'doctranslate', 'domestic', 'intl', 'itinerary', 'menu', 'visa'].sort(),
    );
  });

  it('each template has a kind of "standard" or "alt"', () => {
    for (const [key, tpl] of Object.entries(TEMPLATES)) {
      // kind defaults to "standard" if not specified
      const kind = tpl.kind ?? 'standard';
      expect(['standard', 'alt']).toContain(kind);
      if (kind === 'standard') expect(typeof tpl.init).toBe('function');
      expect(key.length).toBeGreaterThan(0);
    }
  });
});

describe('DMC_CAT_IDS', () => {
  it('is a subset of CATS', () => {
    const allIds = new Set(CATS.map((c) => c.id));
    for (const id of DMC_CAT_IDS) expect(allIds.has(id)).toBe(true);
  });

  it('is non-empty', () => {
    expect(DMC_CAT_IDS.length).toBeGreaterThan(0);
  });
});

describe('mkItem', () => {
  it('produces items with unique ids', () => {
    const a = mkItem();
    const b = mkItem();
    expect(a.id).not.toBe(b.id);
  });

  it('applies overrides', () => {
    const it = mkItem({ name: 'custom', price: 999 });
    expect(it.name).toBe('custom');
    expect(it.price).toBe(999);
  });

  it('defaults enabled=true and foc=false', () => {
    const it = mkItem();
    expect(it.enabled).toBe(true);
    expect(it.foc).toBe(false);
  });
});
