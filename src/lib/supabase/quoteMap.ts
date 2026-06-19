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
