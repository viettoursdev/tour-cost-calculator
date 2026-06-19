import { describe, it, expect } from 'vitest';
import { decomposeQuote } from '../../src/lib/supabase/quoteMap';
import type { QuoteDraft } from '../../src/types/quote';

const draft = (): QuoteDraft => ({
  template: 'domestic', info: { name: 'Trip', dest: 'HN', days: 3, nights: 2, startDate: '2026-03-01' },
  pax: 10, rates: { USD: 25000 }, margin: 10, vat: 8, svcBasis: 0, rounding: 1000,
  items: { hotel: [{ id: 1, name: 'Hotel', note: '', cur: 'VND', price: 500, times: 1, qtyMode: 'per_pax', customQty: 0, unit: '', enabled: true, foc: false }] },
  catEnabled: { hotel: true } as QuoteDraft['catEnabled'], currentQuoteId: null,
  flights: [{ id: 'f1', segments: [{ date: '20NOV', flightNo: 'QR1', depAirport: 'HAN', arrAirport: 'DOH', depTime: '01:00', arrTime: '05:00' }], fares: [{ id: 'fa1', label: 'Y', amount: 100, cur: 'USD' }] }],
  payments: [{ id: 'p1', label: 'Đợt 1', amount: 5000000, note: 'deposit' }],
});

describe('decomposeQuote', () => {
  it('maps draft → RPC payload with shredded children', () => {
    const p = decomposeQuote('q1', draft(), { createdByName: 'QA' });
    expect(p.cloud_id).toBe('q1');
    expect((p.quote as Record<string, unknown>).template).toBe('domestic');
    expect((p.line_items as unknown[]).length).toBe(1);
    expect((p.line_items as Record<string, unknown>[])[0]).toMatchObject({ category: 'hotel', name: 'Hotel', legacy_item_id: 1, sort_order: 0 });
    expect((p.flights as Record<string, unknown>[])[0].legacy_flight_id).toBe('f1');
    expect(((p.flights as Record<string, unknown>[])[0].segments as unknown[]).length).toBe(1);
    expect(((p.flights as Record<string, unknown>[])[0].fares as Record<string, unknown>[])[0].label).toBe('Y');
    expect((p.payments as Record<string, unknown>[])[0].legacy_payment_id).toBe('p1');
  });

  it('omits total_cost from quote object', () => {
    const p = decomposeQuote('q1', draft(), {});
    expect('total_cost' in (p.quote as Record<string, unknown>)).toBe(false);
  });
});
