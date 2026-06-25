import { describe, it, expect } from 'vitest';
import { calcVND, catTotal, subtotal, computeTotals, usedForeignCurrencies } from './calc';
import type { Item, QuoteDraft, CategoryId } from '@/types';
import { CATS } from './constants';

function item(over: Partial<Item> = {}): Item {
  return {
    id: 1,
    name: 'x',
    note: '',
    cur: 'VND',
    price: 100,
    times: 1,
    qtyMode: 'per_group',
    customQty: 1,
    unit: '/người',
    enabled: true,
    foc: false,
    ...over,
  };
}

function emptyDraft(over: Partial<QuoteDraft> = {}): QuoteDraft {
  const catEnabled = Object.fromEntries(
    CATS.map((c) => [c.id, false]),
  ) as Record<CategoryId, boolean>;
  return {
    template: 'domestic',
    info: { name: '', dest: '', days: 1, nights: 0, startDate: null },
    pax: 20,
    rates: { USD: 25_000 },
    margin: 0,
    vat: 0,
    svcBasis: 0,
    rounding: 1,
    items: {},
    catEnabled,
    currentQuoteId: null,
    ...over,
  };
}

describe('usedForeignCurrencies', () => {
  it('lists distinct non-VND currencies from enabled counting lines, USD/EUR first', () => {
    const items = {
      hotel: [item({ cur: 'EUR' }), item({ cur: 'VND' })],
      flight: [item({ cur: 'JPY' }), item({ cur: 'USD' })],
    } as Partial<Record<CategoryId, Item[]>>;
    expect(usedForeignCurrencies(items)).toEqual(['USD', 'EUR', 'JPY']);
  });

  it('ignores disabled / FOC / included lines and VND-only quotes', () => {
    const items = {
      hotel: [item({ cur: 'USD', enabled: false }), item({ cur: 'EUR', foc: true })],
      meal: [item({ cur: 'VND' })],
    } as Partial<Record<CategoryId, Item[]>>;
    expect(usedForeignCurrencies(items)).toEqual([]);
  });
});

describe('calcVND', () => {
  it('returns 0 when item is disabled (enabled === false)', () => {
    expect(calcVND(item({ enabled: false, price: 999 }), {}, 10)).toBe(0);
  });

  it('treats undefined enabled as enabled (legacy parity)', () => {
    const it = item();
    delete (it as Partial<Item>).enabled;
    expect(calcVND(it as Item, {}, 10)).toBe(100);
  });

  it('returns 0 for FOC items', () => {
    expect(calcVND(item({ foc: true, price: 999 }), {}, 10)).toBe(0);
  });

  it('treats VND with no rate as rate=1', () => {
    expect(calcVND(item({ cur: 'VND', price: 1000 }), {}, 10)).toBe(1000);
  });

  it('converts USD price using provided rate', () => {
    expect(calcVND(item({ cur: 'USD', price: 100, times: 1 }), { USD: 25_000 }, 10))
      .toBe(2_500_000);
  });

  it('multiplies by pax for per_pax mode', () => {
    expect(calcVND(item({ qtyMode: 'per_pax', price: 100 }), {}, 5)).toBe(500);
  });

  it('uses customQty for custom mode', () => {
    expect(calcVND(item({ qtyMode: 'custom', customQty: 7, price: 100 }), {}, 99)).toBe(700);
  });

  it('uses customQty (số phòng) for room mode', () => {
    expect(calcVND(item({ qtyMode: 'room', customQty: 12, price: 100 }), {}, 99)).toBe(1200);
  });

  it('uses 1 for per_group mode regardless of pax/customQty', () => {
    expect(calcVND(item({ qtyMode: 'per_group', customQty: 999, price: 100 }), {}, 99))
      .toBe(100);
  });

  it('multiplies by times', () => {
    expect(calcVND(item({ price: 100, times: 3 }), {}, 1)).toBe(300);
  });
});

describe('catTotal', () => {
  it('sums enabled items only', () => {
    const items = [
      item({ price: 100 }),
      item({ price: 200, enabled: false }),
      item({ price: 300 }),
    ];
    expect(catTotal(items, {}, 1)).toBe(400);
  });
});

describe('subtotal', () => {
  // Category IDs substituted: 'tour'→'flight', 'food'→'meal' (both exist in CATS,
  // neither is domesticOnly or dmcOnly).
  it('skips disabled categories', () => {
    const d = emptyDraft({
      items: { flight: [item({ price: 1000 })] } as QuoteDraft['items'],
      catEnabled: { ...emptyDraft().catEnabled, flight: false },
    });
    expect(subtotal(d)).toBe(0);
  });

  it('sums enabled categories', () => {
    const d = emptyDraft({
      items: {
        flight: [item({ price: 1000 })],
        meal: [item({ price: 500 })],
      } as QuoteDraft['items'],
      catEnabled: { ...emptyDraft().catEnabled, flight: true, meal: true },
    });
    expect(subtotal(d)).toBe(1500);
  });
});

describe('computeTotals — legacy semantics', () => {
  it('returns all zeros for an empty draft', () => {
    const t = computeTotals(emptyDraft());
    expect(t).toEqual({
      totalCost: 0,
      totalProfit: 0,
      totalVAT: 0,
      sellingPPax: 0,
      roundedPPax: 0,
      grandTotal: 0,
    });
  });

  it('applies svcBasis BEFORE margin (legacy order)', () => {
    const d = emptyDraft({ pax: 1, svcBasis: 1000, margin: 10, vat: 0, rounding: 1 });
    expect(computeTotals(d).totalProfit).toBe(100);
  });

  it('VAT applies to (cost + svcBasis + profit)', () => {
    const d = emptyDraft({ pax: 1, svcBasis: 1000, margin: 10, vat: 8, rounding: 1 });
    expect(computeTotals(d).totalVAT).toBe(88);
  });

  it('rounds per-pax selling price up (Math.ceil) to nearest rounding step', () => {
    const d = emptyDraft({
      pax: 1,
      rounding: 100,
      items: { flight: [item({ price: 10_001 })] } as QuoteDraft['items'],
      catEnabled: { ...emptyDraft().catEnabled, flight: true },
    });
    expect(computeTotals(d).roundedPPax).toBe(10_100);
  });

  it('grandTotal = roundedPPax × pax', () => {
    const d = emptyDraft({
      pax: 10,
      rounding: 100,
      items: { flight: [item({ price: 1_001 })] } as QuoteDraft['items'],
      catEnabled: { ...emptyDraft().catEnabled, flight: true },
    });
    expect(computeTotals(d).grandTotal).toBe(2000);
  });

  it('treats rounding=0 as 1 (no division by zero)', () => {
    const d = emptyDraft({ pax: 1, rounding: 0, items: {
      flight: [item({ price: 1234 })],
    } as QuoteDraft['items'], catEnabled: { ...emptyDraft().catEnabled, flight: true } });
    expect(computeTotals(d).roundedPPax).toBe(1234);
  });

  it('returns sellingPPax=0 when pax=0', () => {
    const d = emptyDraft({ pax: 0 });
    expect(computeTotals(d).sellingPPax).toBe(0);
  });
});
