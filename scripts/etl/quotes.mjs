// scripts/etl/quotes.mjs — unify quote_history+quote_projects and DMC variants into quotes + children.
import { insert } from './db.mjs';
import { iso, dateOnly, nameFromActor } from './util.mjs';

// Map a QuoteDraft Item -> quote_line_items / quote_group_items row (shared shape).
function itemRow(quoteOrGroupKey, category, it, i) {
  return {
    ...quoteOrGroupKey, category, legacy_item_id: typeof it.id === 'number' ? it.id : null,
    name: it.name ?? '', note: it.note ?? '', cur: it.cur ?? 'VND', price: it.price ?? 0,
    times: it.times ?? 1, qty_mode: it.qtyMode ?? 'per_pax', custom_qty: it.customQty ?? 0,
    unit: it.unit ?? '', enabled: it.enabled ?? true, foc: it.foc ?? false,
    optional: it.optional ?? null, included: it.included ?? null, sort_order: i,
  };
}

async function loadOne(client, indexEntry, project, r, customerMap) {
  const draft = project?.currentState ?? {};
  const quoteRow = {
    cloud_id: indexEntry.cloudId, legacy_num_id: indexEntry.id ?? null, quote_code: indexEntry.quoteCode ?? null,
    name: indexEntry.name ?? draft.info?.name ?? '', template: indexEntry.template ?? draft.template,
    pax: indexEntry.pax ?? draft.pax ?? 0, total_cost: indexEntry.totalCost ?? 0,
    status: indexEntry.status ?? draft.status ?? null,
    customer_id: indexEntry.customerId ? customerMap.get(indexEntry.customerId) ?? null : null,
    customer_name: indexEntry.customerName ?? null, depart_date: dateOnly(indexEntry.departDate),
    info: draft.info ?? {}, rates: draft.rates ?? {}, rate_base: draft.rateBase ?? null,
    margin: draft.margin ?? 0, vat: draft.vat ?? 0, svc_basis: draft.svcBasis ?? 0, rounding: draft.rounding ?? 0,
    cat_enabled: draft.catEnabled ?? {}, pricing_options: draft.pricingOptions ?? null,
    inclusions: draft.inclusions ?? null, exclusions: draft.exclusions ?? null,
    output_currency: draft.outputCurrency ?? null, dmc_prices: draft.dmcPrices ?? null, dmc_margin: draft.dmcMargin ?? null,
    active_group_id: draft.activeGroupId ?? null, workflow_summary: indexEntry.workflowSummary ?? null,
    payment_summary: indexEntry.paymentSummary ?? null, loss_reason: indexEntry.lossReason ?? draft.lossReason ?? null,
    workflow_due: indexEntry.workflowDue ?? null,
    linked_quote_id: indexEntry.linkedQuoteId ?? null, linked_quote_name: indexEntry.linkedQuoteName ?? null,
    linked_quote_template: indexEntry.linkedQuoteTemplate ?? null,
    created_by: r.resolve(indexEntry.createdByUsername), created_by_username: indexEntry.createdByUsername ?? null,
    created_by_name: indexEntry.createdByName ?? null, created_at: iso(indexEntry.createdAt) ?? undefined,
    updated_at: iso(indexEntry.updatedAt), updated_by_name: nameFromActor(indexEntry.updatedBy) || null,
  };
  const [inserted] = await insert(client, 'quotes', [quoteRow], { select: 'id, cloud_id' });
  const qid = inserted.id;

  // Line items (draft.items: { category: Item[] }).
  const lineItems = [];
  for (const [category, arr] of Object.entries(draft.items ?? {})) {
    (arr ?? []).forEach((it, i) => lineItems.push(itemRow({ quote_id: qid }, category, it, i)));
  }
  await insert(client, 'quote_line_items', lineItems);

  // Groups + group items.
  const groups = draft.groups ?? [];
  const groupRows = groups.map((g, i) => ({
    quote_id: qid, legacy_group_id: g.id ?? null, label: g.label ?? '', pax: g.pax ?? 0,
    cat_enabled: g.catEnabled ?? {}, sort_order: i,
  }));
  const insertedGroups = await insert(client, 'quote_groups', groupRows, { select: 'id, legacy_group_id' });
  const gmap = new Map(insertedGroups.map((row) => [row.legacy_group_id, row.id]));
  const groupItems = [];
  for (const g of groups) {
    const gid = gmap.get(g.id);
    for (const [category, arr] of Object.entries(g.items ?? {})) {
      (arr ?? []).forEach((it, i) => groupItems.push(itemRow({ group_id: gid }, category, it, i)));
    }
  }
  await insert(client, 'quote_group_items', groupItems);

  // Payments, passengers.
  await insert(client, 'quote_payments', (draft.payments ?? []).map((p, i) => ({
    quote_id: qid, legacy_payment_id: p.id ?? null, label: p.label ?? '', amount: p.amount ?? 0,
    note: p.note ?? '', sort_order: i,
  })));
  await insert(client, 'quote_passengers', (draft.passengers ?? []).map((p, i) => ({
    quote_id: qid, legacy_passenger_id: p.id ?? null, sort_order: i, name: p.name ?? '',
    gender: p.gender ?? null, dob: p.dob ?? null, id_type: p.idType ?? null, id_no: p.idNo ?? null,
    nationality: p.nationality ?? null, room_type: p.roomType ?? null, room_no: p.roomNo ?? null,
    dietary: p.dietary ?? null, phone: p.phone ?? null, emergency: p.emergency ?? null, note: p.note ?? null,
  })));

  // Flights + segments + fares.
  const flights = draft.flights ?? [];
  const flightRows = flights.map((f, i) => ({ quote_id: qid, legacy_flight_id: f.id ?? null, note: f.note ?? null, sort_order: i }));
  const insertedFlights = await insert(client, 'quote_flights', flightRows, { select: 'id, legacy_flight_id' });
  const fmap = new Map(insertedFlights.map((row) => [row.legacy_flight_id, row.id]));
  const segs = [], fares = [];
  for (const f of flights) {
    const fid = fmap.get(f.id);
    (f.segments ?? []).forEach((s, i) => segs.push({
      flight_id: fid, date: s.date ?? null, flight_no: s.flightNo ?? null, airline_code: s.airlineCode ?? null,
      airline_name: s.airlineName ?? null, dep_airport: s.depAirport ?? null, arr_airport: s.arrAirport ?? null,
      dep_city: s.depCity ?? null, arr_city: s.arrCity ?? null, dep_time: s.depTime ?? null, arr_time: s.arrTime ?? null,
      dep_day_offset: s.depDayOffset ?? null, arr_day_offset: s.arrDayOffset ?? null, sort_order: i,
    }));
    (f.fares ?? []).forEach((fa, i) => fares.push({
      flight_id: fid, legacy_fare_id: fa.id ?? null, label: fa.label ?? '', amount: fa.amount ?? 0,
      cur: fa.cur ?? 'VND', sort_order: i,
    }));
  }
  await insert(client, 'quote_flight_segments', segs);
  await insert(client, 'quote_flight_fares', fares);

  // Workflow steps + logs.
  const workflow = draft.workflow ?? [];
  const stepRows = workflow.map((w, i) => ({
    quote_id: qid, legacy_step_id: w.id ?? null, label: w.label ?? '', status: w.status ?? 'todo',
    step_key: w.key ?? null, due_offset: w.dueOffset ?? null, start_date: dateOnly(w.startDate),
    due_date: dateOnly(w.dueDate), done_date: dateOnly(w.doneDate),
    assignee_user_id: r.resolve(w.assignee), assignee_username: w.assignee ?? null, note: w.note ?? null, sort_order: i,
  }));
  const insertedSteps = await insert(client, 'quote_workflow_steps', stepRows, { select: 'id, legacy_step_id' });
  const smap = new Map(insertedSteps.map((row) => [row.legacy_step_id, row.id]));
  const logs = [];
  for (const w of workflow) {
    const sid = smap.get(w.id);
    (w.log ?? []).forEach((l, i) => logs.push({
      step_id: sid, at: iso(l.at) ?? undefined, by_name: l.by ?? '', action: l.action ?? '', sort_order: i,
    }));
  }
  await insert(client, 'quote_workflow_logs', logs);

  // Collaborators (from index entry; fall back to project.collaborators).
  const collabs = indexEntry.collaborators ?? project?.collaborators ?? [];
  await insert(client, 'quote_collaborators', collabs.map((cb) => ({
    quote_id: qid, user_id: r.resolve(cb.u), username: cb.u ?? null, name: cb.name ?? '',
  })));

  // Versions.
  await insert(client, 'quote_versions', (project?.versions ?? []).map((v) => ({
    quote_id: qid, version_no: v.versionNo, saved_at: iso(v.savedAt) ?? undefined,
    saved_by: nameFromActor(v.savedBy) || '', note: v.note ?? '', state: v.state ?? {},
  })));
}

export async function loadQuotes(client, dump, r, customerMap) {
  const pairs = [
    ['viettours/quote_history', dump.collections.quote_projects ?? {}],
    ['viettours/dmc_quote_history', dump.collections.dmc_quote_projects ?? {}],
  ];
  // quotes.cloud_id is globally unique, but prod history can hold >1 entry per
  // cloudId when a cloudId was reused (the older entry's project doc was
  // overwritten). Dedupe by cloudId keeping the most recent (max numeric id);
  // log each dropped stub so the loss is visible, never silent.
  const byCloudId = new Map(); // cloudId -> { entry, projects }
  for (const [indexKey, projects] of pairs) {
    const entries = dump.singles[indexKey]?.quotes ?? [];
    for (const entry of entries) {
      const prev = byCloudId.get(entry.cloudId);
      if (!prev) { byCloudId.set(entry.cloudId, { entry, projects }); continue; }
      const keep = (entry.id ?? 0) >= (prev.entry.id ?? 0) ? entry : prev.entry;
      const drop = keep === entry ? prev.entry : entry;
      console.warn(`[quotes] duplicate cloudId ${entry.cloudId}: keeping id=${keep.id} (${keep.quoteCode ?? keep.name ?? '?'}), dropping id=${drop.id} (${drop.quoteCode ?? drop.name ?? '?'})`);
      byCloudId.set(entry.cloudId, keep === entry ? { entry, projects } : prev);
    }
  }
  for (const { entry, projects } of byCloudId.values()) {
    await loadOne(client, entry, projects[entry.cloudId], r, customerMap);
  }
}
