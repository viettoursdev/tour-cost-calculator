// scripts/etl/misc.mjs — contracts, rate card, fx, restaurants, pois, visa products.
import { insert } from './db.mjs';
import { iso, nameFromActor } from './util.mjs';

export async function loadContracts(client, dump, r) {
  const contracts = dump.singles['viettours/contracts_master']?.contracts ?? [];
  const rows = contracts.map((x) => ({
    legacy_id: x.id, contract_no: x.contractNo ?? '', contract_date: x.contractDate ?? null,
    contract_status: x.contractStatus ?? 'draft', tour_name: x.tourName ?? '', tour_dest: x.tourDest ?? null,
    tour_days: x.tourDays ?? 0, tour_nights: x.tourNights ?? 0, tour_start_date: x.tourStartDate ?? null,
    departure: x.departure ?? null, contract_pax: x.contractPax ?? 0, price_per_pax: x.pricePerPax ?? 0,
    party_b: x.partyB ?? {}, includes: x.includes ?? [], excludes: x.excludes ?? [],
    bond_percent: x.bondPercent ?? 0, has_acceptance: x.hasAcceptance ?? false,
    acceptance_date: x.acceptanceDate ?? null, acceptance_note: x.acceptanceNote ?? null,
    tour_key: x._tourKey ?? null, linked_quote_id: x.linkedQuoteId ?? null, linked_quote_name: x.linkedQuoteName ?? null,
    created_by: r.resolve(x.createdBy), created_by_name: nameFromActor(x.createdBy) || null,
    created_at: iso(x.createdAt) ?? undefined, updated_at: iso(x.updatedAt),
    updated_by_name: nameFromActor(x.updatedBy) || null,
  }));
  const inserted = await insert(client, 'contracts', rows, { select: 'id, legacy_id' });
  const map = new Map(inserted.map((row) => [row.legacy_id, row.id]));
  const pays = [], cancels = [];
  for (const x of contracts) {
    const kid = map.get(x.id);
    (x.payments ?? []).forEach((p, i) => pays.push({
      contract_id: kid, label: p.label ?? '', mode: p.mode ?? 'percent', percent: p.percent ?? null,
      amount: p.amount ?? 0, due_date: p.dueDate ?? null, note: p.note ?? '', status: p.status ?? 'pending',
      paid_date: p.paidDate ?? null, received_amount: p.receivedAmount ?? null,
      approval_requested: p.approvalRequested ?? false, sort_order: i,
    }));
    (x.cancels ?? []).forEach((cn, i) => cancels.push({
      contract_id: kid, when_text: cn.when ?? '', penalty: cn.penalty ?? 0, sort_order: i,
    }));
  }
  await insert(client, 'contract_payments', pays);
  await insert(client, 'contract_cancels', cancels);
}

export async function loadRateCard(client, dump) {
  const rc = dump.singles['viettours/master_rate_card'];
  if (!rc) return;
  const hotels = Object.entries(rc.hotels ?? {}).map(([city, entries]) => ({ city, entries }));
  const other = Object.entries(rc.otherRates ?? {}).map(([rkey, entry]) => ({ rkey, entry }));
  await insert(client, 'rate_card_hotels', hotels);
  await insert(client, 'rate_card_other', other);
  await insert(client, 'rate_card_visa', [{ one_row: true, data: rc.visaRates ?? {} }]);
  const m = rc._meta ?? {};
  await insert(client, 'rate_card_meta', [{
    one_row: true, version: m.version ?? null, type: m.type ?? null,
    pushed_at: iso(m.pushedAt), pushed_by: nameFromActor(m.pushedBy) || null,
    app: m.app ?? null, auto_sync: m.autoSync ?? null,
  }]);
}

export async function loadFxRates(client, dump) {
  const doc = dump.singles['viettours/fx_rates'];
  if (!doc) return;
  const by = nameFromActor(doc._meta?.pushedBy) || null;
  const rows = Object.entries(doc.rates ?? {}).map(([currency, rate]) => ({
    currency, rate_to_vnd: rate, pushed_at: iso(doc._meta?.pushedAt), pushed_by: by,
  }));
  await insert(client, 'fx_rates', rows);
}

export async function loadRestaurants(client, dump) {
  const restaurants = dump.singles['viettours/restaurant_list']?.restaurants ?? [];
  const rows = restaurants.map((x) => ({
    legacy_id: x.id, name: x.name ?? '', continent: x.continent ?? null, country: x.country ?? null,
    city: x.city ?? null, website: x.website ?? null, menu_link: x.menuLink ?? null,
    contact: x.contact ?? null, note: x.note ?? null, rating: x.rating ?? 0, review: x.review ?? '',
  }));
  const inserted = await insert(client, 'restaurants', rows, { select: 'id, legacy_id' });
  const map = new Map(inserted.map((row) => [row.legacy_id, row.id]));
  const menus = [];
  for (const x of restaurants) {
    const rid = map.get(x.id);
    (x.menus ?? []).forEach((m, i) => menus.push({
      restaurant_id: rid, legacy_menu_id: m.id ?? null, name: m.name ?? '', dishes: m.dishes ?? null,
      price: m.price ?? 0, cur: m.cur ?? 'VND', rating: m.rating ?? 0, review: m.review ?? null, sort_order: i,
    }));
  }
  await insert(client, 'restaurant_menus', menus);
}

export async function loadPois(client, dump, r) {
  const pois = dump.singles['viettours/poi_library']?.pois ?? [];
  const rows = pois.map((x) => ({
    place: x.place, destination: x.destination ?? null, commentary: x.commentary ?? '',
    created_by: r.resolve(x.createdBy), created_by_name: nameFromActor(x.createdBy) || null,
    created_at: iso(x.createdAt) ?? undefined, updated_at: iso(x.updatedAt),
    updated_by_name: nameFromActor(x.updatedBy) || null, legacy_id: x.id,
  }));
  await insert(client, 'pois', rows);
}

export async function loadVisaProducts(client, dump) {
  const doc = dump.singles['viettours/visa_products'];
  if (!doc) return;
  const products = doc.products ?? [];
  const rows = products.map((x) => ({
    legacy_id: x.id, country: x.country ?? '', visa_type: x.visaType ?? '', validity: x.validity ?? null,
    location: x.location ?? null, markup_type: x.markupType ?? 'percent', markup_value: x.markupValue ?? 0,
    markup_cur: x.markupCur ?? 'VND', note: x.note ?? '', active: x.active ?? true,
  }));
  const inserted = await insert(client, 'visa_products', rows, { select: 'id, legacy_id' });
  const map = new Map(inserted.map((row) => [row.legacy_id, row.id]));
  const fees = [];
  for (const x of products) {
    const pid = map.get(x.id);
    (x.fees ?? []).forEach((f, i) => fees.push({
      product_id: pid, legacy_fee_id: f.id ?? null, name: f.name ?? '', amount: f.amount ?? 0,
      cur: f.cur ?? 'VND', per_pax: f.perPax ?? true, sort_order: i,
    }));
  }
  await insert(client, 'visa_product_fees', fees);
  await insert(client, 'visa_products_meta', [{
    one_row: true, rates: doc.rates ?? {}, versions: doc.versions ?? [],
    updated_at: iso(doc.updatedAt), updated_by: nameFromActor(doc.updatedBy) || null,
  }]);
}
