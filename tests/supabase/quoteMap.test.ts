import { describe, it, expect } from 'vitest';
import { decomposeQuote, assembleQuote } from '../../src/lib/supabase/quoteMap';
import type { QuoteDraft } from '../../src/types/quote';

const draft = (): QuoteDraft => ({
  template: 'domestic',
  info: { name: 'Trip', dest: 'HN', days: 3, nights: 2, startDate: '2026-03-01' },
  pax: 10,
  rates: { USD: 25000 },
  margin: 10,
  vat: 8,
  svcBasis: 0,
  rounding: 1000,
  items: {
    hotel: [{ id: 1, name: 'Hotel A', note: '', cur: 'VND', price: 500, times: 1, qtyMode: 'per_pax', customQty: 0, unit: '', enabled: true, foc: false }],
    meal:  [{ id: 2, name: 'Lunch',   note: 'set menu', cur: 'VND', price: 150, times: 3, qtyMode: 'per_pax', customQty: 0, unit: '', enabled: true, foc: false }],
  },
  catEnabled: { hotel: true, meal: true } as QuoteDraft['catEnabled'],
  currentQuoteId: null,
  flights: [{
    id: 'f1',
    segments: [{ date: '20NOV', flightNo: 'QR977', depAirport: 'HAN', arrAirport: 'DOH', depTime: '01:00', arrTime: '05:00' }],
    fares:    [{ id: 'fa1', label: 'Y', amount: 100, cur: 'USD' }],
  }],
  workflow: [{
    id: 'w1',
    label: 'Đặt khách sạn',
    status: 'todo',
    key: 'book_hotel',
    log: [{ at: '2026-03-01T10:00:00Z', by: 'Tony', action: 'Created' }],
  }],
  groups: [{
    id: 'g1',
    label: '20 khách',
    pax: 20,
    catEnabled: { hotel: true } as QuoteDraft['catEnabled'],
    items: {
      hotel: [{ id: 3, name: 'Hotel B', note: '', cur: 'VND', price: 700, times: 1, qtyMode: 'per_pax', customQty: 0, unit: '', enabled: true, foc: false }],
    },
  }],
  payments: [{ id: 'p1', label: 'Đợt 1', amount: 5000000, note: 'deposit' }],
});

describe('decomposeQuote', () => {
  it('maps draft → RPC payload with shredded children', () => {
    const p = decomposeQuote('q1', draft(), { createdByName: 'QA' });
    expect(p.cloud_id).toBe('q1');
    expect((p.quote as Record<string, unknown>).template).toBe('domestic');
    expect((p.line_items as unknown[]).length).toBe(2);
    expect((p.line_items as Record<string, unknown>[])[0]).toMatchObject({ category: 'hotel', name: 'Hotel A', legacy_item_id: 1, sort_order: 0 });
    expect((p.line_items as Record<string, unknown>[])[1]).toMatchObject({ category: 'meal', name: 'Lunch', legacy_item_id: 2, sort_order: 1 });
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

describe('assembleQuote', () => {
  it('assembleQuote reverses decomposeQuote — full round-trip fidelity', () => {
    const d = draft();
    const p = decomposeQuote('q1', d, {});

    // Simulate DB rows: assign synthetic UUIDs and flatten nested arrays.
    const flights = (p.flights as Record<string, unknown>[]).map((f, i) => ({
      id: `F${i}`,
      legacy_flight_id: f.legacy_flight_id,
      note: f.note,
      sort_order: f.sort_order,
    }));
    const segments = (p.flights as Record<string, unknown>[]).flatMap((f, i) =>
      (f.segments as Record<string, unknown>[]).map((s) => ({ ...s, flight_id: `F${i}` })),
    );
    const fares = (p.flights as Record<string, unknown>[]).flatMap((f, i) =>
      (f.fares as Record<string, unknown>[]).map((fa) => ({ ...fa, flight_id: `F${i}` })),
    );

    const workflowRaw = (p.workflow as Record<string, unknown>[]).map((s, i) => ({
      id: `W${i}`,
      legacy_step_id: s.legacy_step_id,
      label: s.label,
      status: s.status,
      step_key: s.step_key,
      due_offset: s.due_offset,
      start_date: s.start_date,
      due_date: s.due_date,
      done_date: s.done_date,
      assignee_username: s.assignee_username,
      note: s.note,
      sort_order: i,
    }));
    const logs = (p.workflow as Record<string, unknown>[]).flatMap((s, i) =>
      (s.logs as Record<string, unknown>[]).map((l, j) => ({ ...l, step_id: `W${i}`, sort_order: j })),
    );

    const groupsRaw = (p.groups as Record<string, unknown>[]).map((g, i) => ({
      id: `G${i}`,
      legacy_group_id: g.legacy_group_id,
      label: g.label,
      pax: g.pax,
      cat_enabled: g.cat_enabled,
      sort_order: i,
    }));
    const groupItems = (p.groups as Record<string, unknown>[]).flatMap((g, i) =>
      (g.items as Record<string, unknown>[]).map((it) => ({ ...it, group_id: `G${i}` })),
    );

    const asm = assembleQuote({
      quote: p.quote as Record<string, unknown>,
      lineItems: p.line_items as Record<string, unknown>[],
      flights,
      segments,
      fares,
      workflow: workflowRaw,
      logs,
      groups: groupsRaw,
      groupItems,
      payments: p.payments as Record<string, unknown>[],
      passengers: p.passengers as Record<string, unknown>[],
    });

    // ── Scalars ──────────────────────────────────────────────────────────────
    expect(asm.template).toBe('domestic');
    expect(asm.pax).toBe(10);
    expect(asm.rates).toEqual({ USD: 25000 });
    expect(asm.margin).toBe(10);
    expect(asm.vat).toBe(8);
    expect(asm.svcBasis).toBe(0);
    expect(asm.rounding).toBe(1000);
    expect(asm.catEnabled).toEqual({ hotel: true, meal: true });
    expect(asm.currentQuoteId).toBeNull();

    // ── Line items — full fidelity per item ─────────────────────────────────
    // Items must round-trip exactly (toEqual checks every field).
    expect(asm.items).toEqual(d.items);

    // Category grouping: hotel and meal must each be present with 1 item.
    expect(asm.items.hotel).toHaveLength(1);
    expect(asm.items.meal).toHaveLength(1);

    // Spot-check all Item fields on the hotel item.
    const hotelItem = asm.items.hotel![0];
    expect(hotelItem.id).toBe(1);
    expect(hotelItem.name).toBe('Hotel A');
    expect(hotelItem.price).toBe(500);
    expect(hotelItem.cur).toBe('VND');
    expect(hotelItem.times).toBe(1);
    expect(hotelItem.qtyMode).toBe('per_pax');
    expect(hotelItem.customQty).toBe(0);
    expect(hotelItem.unit).toBe('');
    expect(hotelItem.enabled).toBe(true);
    expect(hotelItem.foc).toBe(false);

    // ── Flights ──────────────────────────────────────────────────────────────
    expect(asm.flights).toHaveLength(1);

    // Fare id round-trips through legacy_fare_id.
    expect(asm.flights![0].fares[0].id).toBe('fa1');
    expect(asm.flights![0].fares[0].label).toBe('Y');
    expect(asm.flights![0].fares[0].amount).toBe(100);
    expect(asm.flights![0].fares[0].cur).toBe('USD');

    // Segment full fidelity.
    expect(asm.flights![0].segments[0]).toEqual({
      date: '20NOV',
      flightNo: 'QR977',
      depAirport: 'HAN',
      arrAirport: 'DOH',
      depTime: '01:00',
      arrTime: '05:00',
    });

    // Flight legacy id round-trips.
    expect(asm.flights![0].id).toBe('f1');

    // ── Workflow ─────────────────────────────────────────────────────────────
    expect(asm.workflow).toHaveLength(1);
    const step = asm.workflow![0];
    expect(step.id).toBe('w1');
    expect(step.label).toBe('Đặt khách sạn');
    expect(step.status).toBe('todo');
    expect(step.key).toBe('book_hotel');

    // Log entry fidelity.
    expect(step.log).toHaveLength(1);
    expect(step.log![0].by).toBe('Tony');
    expect(step.log![0].action).toBe('Created');
    expect(step.log![0].at).toBe('2026-03-01T10:00:00Z');

    // ── Groups ───────────────────────────────────────────────────────────────
    expect(asm.groups).toHaveLength(1);
    const group = asm.groups![0];
    expect(group.id).toBe('g1');
    expect(group.label).toBe('20 khách');
    expect(group.pax).toBe(20);
    expect(group.items).toEqual(d.groups![0].items);

    // Group items structured correctly.
    expect(group.items.hotel).toHaveLength(1);
    expect(group.items.hotel![0].id).toBe(3);
    expect(group.items.hotel![0].name).toBe('Hotel B');
    expect(group.items.hotel![0].price).toBe(700);

    // ── Payments ─────────────────────────────────────────────────────────────
    expect(asm.payments).toHaveLength(1);
    expect(asm.payments![0]).toEqual({ id: 'p1', label: 'Đợt 1', amount: 5000000, note: 'deposit' });

    // ── Passengers (Task 4) ───────────────────────────────────────────────────
    // The base draft() has no passengers; assembleQuote should omit the field.
    expect(asm.passengers).toBeUndefined();
  });

  it('assembleQuote: passengers round-trip (Task 4)', () => {
    const d = draft();
    d.passengers = [
      {
        id: 'pax-1',
        name: 'Nguyễn Thị Lan',
        gender: 'F',
        dob: '15/03/1990',
        idType: 'passport',
        idNo: 'B1234567',
        nationality: 'VN',
        roomType: 'double',
        roomNo: '101',
        dietary: 'vegetarian',
        phone: '0901234567',
        emergency: 'Anh Minh 0909',
        note: 'Window seat',
      },
      {
        id: 'pax-2',
        name: 'Trần Văn Nam',
        gender: 'M',
      },
    ];

    const p = decomposeQuote('q1', d, {});
    const passRows = p.passengers as Record<string, unknown>[];
    expect(passRows).toHaveLength(2);
    expect(passRows[0]).toMatchObject({
      legacy_passenger_id: 'pax-1',
      name: 'Nguyễn Thị Lan',
      gender: 'F',
      dob: '15/03/1990',
      id_type: 'passport',
      id_no: 'B1234567',
      nationality: 'VN',
      room_type: 'double',
      room_no: '101',
      dietary: 'vegetarian',
      phone: '0901234567',
      emergency: 'Anh Minh 0909',
      note: 'Window seat',
      sort_order: 0,
    });
    expect(passRows[1]).toMatchObject({ legacy_passenger_id: 'pax-2', name: 'Trần Văn Nam', gender: 'M', sort_order: 1 });

    // Simulate DB rows (add synthetic UUIDs)
    const passengerDbRows = passRows.map((r, i) => ({ ...r, id: `P${i}` }));

    const asm = assembleQuote({
      quote: p.quote as Record<string, unknown>,
      lineItems: p.line_items as Record<string, unknown>[],
      flights: [],
      segments: [],
      fares: [],
      workflow: [],
      logs: [],
      groups: [],
      groupItems: [],
      payments: [],
      passengers: passengerDbRows,
    });

    expect(asm.passengers).toHaveLength(2);
    expect(asm.passengers![0]).toMatchObject({
      id: 'pax-1',
      name: 'Nguyễn Thị Lan',
      gender: 'F',
      dob: '15/03/1990',
      idType: 'passport',
      idNo: 'B1234567',
      nationality: 'VN',
      roomType: 'double',
      roomNo: '101',
      dietary: 'vegetarian',
      phone: '0901234567',
      emergency: 'Anh Minh 0909',
      note: 'Window seat',
    });
    expect(asm.passengers![1]).toMatchObject({ id: 'pax-2', name: 'Trần Văn Nam', gender: 'M' });
  });
});
