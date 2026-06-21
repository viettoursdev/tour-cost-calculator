import { describe, it, expect } from 'vitest';
import { TEMPLATES, CATS, DMC_CAT_IDS, mkItem, QUOTE_STATUS_META, QUOTE_STATUS_ORDER } from './constants';

describe('TEMPLATES', () => {
  it('declares the documented templates', () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual(
      ['dmc', 'doctranslate', 'domestic', 'guideschedule', 'intl', 'itinerary', 'menu', 'visa'].sort(),
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

describe('QUOTE_STATUS', () => {
  it('order covers exactly the 6 statuses with meta (label + color)', () => {
    expect(QUOTE_STATUS_ORDER).toHaveLength(6);
    expect([...QUOTE_STATUS_ORDER].sort()).toEqual(Object.keys(QUOTE_STATUS_META).sort());
    for (const s of QUOTE_STATUS_ORDER) {
      expect(QUOTE_STATUS_META[s].label).toBeTruthy();
      expect(QUOTE_STATUS_META[s].color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('won maps to "Thành công"', () => {
    expect(QUOTE_STATUS_META.won.label).toBe('Thành công');
  });
});
