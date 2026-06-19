import type {
  QuoteDraft, Item, CategoryId, QuoteFlight, WorkflowStep, QuoteGroup, QuotePayment,
} from '@/types/quote';

const itemRow = (it: Item, category: string, i: number) => ({
  category, legacy_item_id: it.id, name: it.name, note: it.note, cur: it.cur,
  price: it.price, times: it.times, qty_mode: it.qtyMode, custom_qty: it.customQty,
  unit: it.unit, enabled: it.enabled, foc: it.foc, optional: it.optional ?? null,
  included: it.included ?? null, sort_order: i,
});

const itemsToRows = (items: Partial<Record<CategoryId, Item[]>> | undefined) => {
  const rows: ReturnType<typeof itemRow>[] = [];
  let i = 0;
  for (const [cat, arr] of Object.entries(items ?? {})) {
    for (const it of (arr ?? [])) rows.push(itemRow(it, cat, i++));
  }
  return rows;
};

const flightRows = (flights: QuoteFlight[] | undefined) =>
  (flights ?? []).map((f, i) => ({
    legacy_flight_id: f.id, note: f.note ?? null, sort_order: i,
    segments: (f.segments ?? []).map((s, j) => ({
      date: s.date, flight_no: s.flightNo, airline_code: s.airlineCode ?? null,
      airline_name: s.airlineName ?? null, dep_airport: s.depAirport, arr_airport: s.arrAirport,
      dep_city: s.depCity ?? null, arr_city: s.arrCity ?? null, dep_time: s.depTime, arr_time: s.arrTime,
      dep_day_offset: s.depDayOffset ?? null, arr_day_offset: s.arrDayOffset ?? null, sort_order: j,
    })),
    fares: (f.fares ?? []).map((fa, j) => ({
      legacy_fare_id: fa.id, label: fa.label, amount: fa.amount, cur: fa.cur, sort_order: j,
    })),
  }));

const workflowRows = (steps: WorkflowStep[] | undefined) =>
  (steps ?? []).map((s, i) => ({
    legacy_step_id: s.id, label: s.label, status: s.status, step_key: s.key ?? null,
    due_offset: s.dueOffset ?? null, start_date: s.startDate ?? null, due_date: s.dueDate ?? null,
    done_date: s.doneDate ?? null, assignee_username: s.assignee ?? null, note: s.note ?? null, sort_order: i,
    logs: (s.log ?? []).map((l, j) => ({ at: l.at, by_name: l.by, action: l.action, sort_order: j })),
  }));

const groupRows = (groups: QuoteGroup[] | undefined) =>
  (groups ?? []).map((g, i) => ({
    legacy_group_id: g.id, label: g.label, pax: g.pax, cat_enabled: g.catEnabled, sort_order: i,
    items: itemsToRows(g.items),
  }));

const paymentRows = (payments: QuotePayment[] | undefined) =>
  (payments ?? []).map((p, i) => ({ legacy_payment_id: p.id, label: p.label, amount: p.amount, note: p.note, sort_order: i }));

// ─── AssembleInput ────────────────────────────────────────────────────────────

export type AssembleInput = {
  quote: Record<string, unknown>;
  lineItems: Record<string, unknown>[];
  flights: Record<string, unknown>[];
  segments: Record<string, unknown>[];
  fares: Record<string, unknown>[];
  workflow: Record<string, unknown>[];
  logs: Record<string, unknown>[];
  groups: Record<string, unknown>[];
  groupItems: Record<string, unknown>[];
  payments: Record<string, unknown>[];
};

const str = (v: unknown): string => (v == null ? '' : String(v));
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const bool = (v: unknown): boolean => Boolean(v);

export function assembleQuote(rows: AssembleInput): QuoteDraft {
  const q = rows.quote;

  // ── line items → Partial<Record<CategoryId, Item[]>> ──
  const sortedLineItems = [...rows.lineItems].sort((a, b) => num(a.sort_order) - num(b.sort_order));
  const items: Partial<Record<CategoryId, Item[]>> = {};
  for (const r of sortedLineItems) {
    const cat = str(r.category) as CategoryId;
    if (!items[cat]) items[cat] = [];
    (items[cat] as Item[]).push({
      id: num(r.legacy_item_id),
      name: str(r.name),
      note: str(r.note),
      cur: str(r.cur),
      price: num(r.price),
      times: num(r.times),
      qtyMode: str(r.qty_mode) as Item['qtyMode'],
      customQty: num(r.custom_qty),
      unit: str(r.unit),
      enabled: bool(r.enabled),
      foc: bool(r.foc),
      ...(r.optional != null ? { optional: bool(r.optional) } : {}),
      ...(r.included != null ? { included: bool(r.included) } : {}),
    });
  }

  // ── flights — nest segments and fares by flight id ──
  const segsByFlight = new Map<string, Record<string, unknown>[]>();
  for (const s of rows.segments) {
    const fid = str(s.flight_id);
    if (!segsByFlight.has(fid)) segsByFlight.set(fid, []);
    segsByFlight.get(fid)!.push(s);
  }
  const faresByFlight = new Map<string, Record<string, unknown>[]>();
  for (const fa of rows.fares) {
    const fid = str(fa.flight_id);
    if (!faresByFlight.has(fid)) faresByFlight.set(fid, []);
    faresByFlight.get(fid)!.push(fa);
  }

  const flights: QuoteFlight[] = [...rows.flights]
    .sort((a, b) => num(a.sort_order) - num(b.sort_order))
    .map((f) => {
      const fid = str(f.id);
      const segs = [...(segsByFlight.get(fid) ?? [])].sort((a, b) => num(a.sort_order) - num(b.sort_order));
      const frs = [...(faresByFlight.get(fid) ?? [])].sort((a, b) => num(a.sort_order) - num(b.sort_order));
      return {
        id: str(f.legacy_flight_id),
        note: f.note != null ? str(f.note) : undefined,
        segments: segs.map((s) => ({
          date: str(s.date),
          flightNo: str(s.flight_no),
          ...(s.airline_code != null ? { airlineCode: str(s.airline_code) } : {}),
          ...(s.airline_name != null ? { airlineName: str(s.airline_name) } : {}),
          depAirport: str(s.dep_airport),
          arrAirport: str(s.arr_airport),
          ...(s.dep_city != null ? { depCity: str(s.dep_city) } : {}),
          ...(s.arr_city != null ? { arrCity: str(s.arr_city) } : {}),
          depTime: str(s.dep_time),
          arrTime: str(s.arr_time),
          ...(s.dep_day_offset != null ? { depDayOffset: num(s.dep_day_offset) } : {}),
          ...(s.arr_day_offset != null ? { arrDayOffset: num(s.arr_day_offset) } : {}),
        })),
        fares: frs.map((fa) => ({
          id: str(fa.legacy_fare_id),
          label: str(fa.label),
          amount: num(fa.amount),
          cur: str(fa.cur),
        })),
      };
    });

  // ── workflow — nest logs by step id ──
  const logsByStep = new Map<string, Record<string, unknown>[]>();
  for (const l of rows.logs) {
    const sid = str(l.step_id);
    if (!logsByStep.has(sid)) logsByStep.set(sid, []);
    logsByStep.get(sid)!.push(l);
  }

  const workflow: WorkflowStep[] = [...rows.workflow]
    .sort((a, b) => num(a.sort_order) - num(b.sort_order))
    .map((s) => {
      const sid = str(s.id);
      const stepLogs = [...(logsByStep.get(sid) ?? [])].sort((a, b) => num(a.sort_order) - num(b.sort_order));
      return {
        id: str(s.legacy_step_id),
        label: str(s.label),
        status: str(s.status) as WorkflowStep['status'],
        ...(s.step_key != null ? { key: str(s.step_key) } : {}),
        ...(s.due_offset != null ? { dueOffset: num(s.due_offset) } : {}),
        ...(s.start_date != null ? { startDate: str(s.start_date) } : {}),
        ...(s.due_date != null ? { dueDate: str(s.due_date) } : {}),
        ...(s.done_date != null ? { doneDate: str(s.done_date) } : {}),
        ...(s.assignee_username != null ? { assignee: str(s.assignee_username) } : {}),
        ...(s.note != null ? { note: str(s.note) } : {}),
        log: stepLogs.map((l) => ({ at: str(l.at), by: str(l.by_name), action: str(l.action) })),
      };
    });

  // ── groups — nest group items by group id ──
  const gItemsByGroup = new Map<string, Record<string, unknown>[]>();
  for (const gi of rows.groupItems) {
    const gid = str(gi.group_id);
    if (!gItemsByGroup.has(gid)) gItemsByGroup.set(gid, []);
    gItemsByGroup.get(gid)!.push(gi);
  }

  const groups: QuoteGroup[] = [...rows.groups]
    .sort((a, b) => num(a.sort_order) - num(b.sort_order))
    .map((g) => {
      const gid = str(g.id);
      const gItems = [...(gItemsByGroup.get(gid) ?? [])].sort((a, b) => num(a.sort_order) - num(b.sort_order));
      const groupItemsMap: Partial<Record<CategoryId, Item[]>> = {};
      for (const r of gItems) {
        const cat = str(r.category) as CategoryId;
        if (!groupItemsMap[cat]) groupItemsMap[cat] = [];
        (groupItemsMap[cat] as Item[]).push({
          id: num(r.legacy_item_id),
          name: str(r.name),
          note: str(r.note),
          cur: str(r.cur),
          price: num(r.price),
          times: num(r.times),
          qtyMode: str(r.qty_mode) as Item['qtyMode'],
          customQty: num(r.custom_qty),
          unit: str(r.unit),
          enabled: bool(r.enabled),
          foc: bool(r.foc),
          ...(r.optional != null ? { optional: bool(r.optional) } : {}),
          ...(r.included != null ? { included: bool(r.included) } : {}),
        });
      }
      return {
        id: str(g.legacy_group_id),
        label: str(g.label),
        pax: num(g.pax),
        catEnabled: (g.cat_enabled ?? {}) as Record<CategoryId, boolean>,
        items: groupItemsMap,
      };
    });

  // ── payments ──
  const payments: QuotePayment[] = [...rows.payments]
    .sort((a, b) => num(a.sort_order) - num(b.sort_order))
    .map((p) => ({
      id: str(p.legacy_payment_id),
      label: str(p.label),
      amount: num(p.amount),
      note: str(p.note),
    }));

  return {
    template: (q.template as QuoteDraft['template']) ?? null,
    info: (q.info ?? {}) as QuoteDraft['info'],
    pax: num(q.pax),
    rates: (q.rates ?? {}) as Record<string, number>,
    ...(q.rate_base != null ? { rateBase: str(q.rate_base) } : {}),
    margin: num(q.margin),
    vat: num(q.vat),
    svcBasis: num(q.svc_basis),
    rounding: num(q.rounding),
    items,
    catEnabled: (q.cat_enabled ?? {}) as Record<CategoryId, boolean>,
    currentQuoteId: null,
    ...(q.status != null ? { status: q.status as QuoteDraft['status'] } : {}),
    ...(q.loss_reason != null ? { lossReason: str(q.loss_reason) } : {}),
    ...(flights.length > 0 ? { flights } : {}),
    ...(workflow.length > 0 ? { workflow } : {}),
    ...(q.inclusions != null ? { inclusions: q.inclusions as string[] } : {}),
    ...(q.exclusions != null ? { exclusions: q.exclusions as string[] } : {}),
    ...(payments.length > 0 ? { payments } : {}),
    ...(q.pricing_options != null ? { pricingOptions: q.pricing_options as QuoteDraft['pricingOptions'] } : {}),
    ...(groups.length > 0 ? { groups } : {}),
    ...(q.active_group_id != null ? { activeGroupId: str(q.active_group_id) } : {}),
    ...(q.output_currency != null ? { outputCurrency: q.output_currency as QuoteDraft['outputCurrency'] } : {}),
    ...(q.dmc_prices != null ? { dmcPrices: q.dmc_prices as QuoteDraft['dmcPrices'] } : {}),
    ...(q.dmc_margin != null ? { dmcMargin: q.dmc_margin as QuoteDraft['dmcMargin'] } : {}),
  };
}

export function decomposeQuote(
  cloudId: string, d: QuoteDraft,
  meta: { createdAt?: string; createdByName?: string; updatedByName?: string } = {},
): Record<string, unknown> {
  return {
    cloud_id: cloudId,
    quote: {
      template: d.template ?? '', name: d.info?.name ?? '', pax: d.pax ?? 0,
      // total_cost intentionally omitted — the RPC uses CASE WHEN q ? 'total_cost' to
      // preserve the index-owned value; Task 5 (sbSaveQuote) must inject it when available.
      status: d.status ?? null, info: d.info ?? {}, rates: d.rates ?? {}, rate_base: d.rateBase ?? null,
      margin: d.margin ?? 0, vat: d.vat ?? 0, svc_basis: d.svcBasis ?? 0, rounding: d.rounding ?? 0,
      cat_enabled: d.catEnabled ?? {}, pricing_options: d.pricingOptions ?? null,
      inclusions: d.inclusions ?? null, exclusions: d.exclusions ?? null,
      output_currency: d.outputCurrency ?? null, dmc_prices: d.dmcPrices ?? null, dmc_margin: d.dmcMargin ?? null,
      active_group_id: d.activeGroupId ?? null,
      depart_date: d.info?.startDate ?? null,
      created_at: meta.createdAt ?? null, created_by_name: meta.createdByName ?? null,
      updated_by_name: meta.updatedByName ?? null,
    },
    line_items: itemsToRows(d.items),
    flights: flightRows(d.flights),
    workflow: workflowRows(d.workflow),
    groups: groupRows(d.groups),
    payments: paymentRows(d.payments),
  };
}
