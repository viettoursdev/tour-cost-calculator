// scripts/etl/itineraries.mjs — itineraries (+days/flights) and menus (+days).
import { insert } from './db.mjs';
import { iso, dateOnly, nameFromActor } from './util.mjs';

export async function loadItineraries(client, dump, r) {
  const docs = Object.values(dump.collections.tour_itineraries ?? {});
  const rows = docs.map((x) => ({
    legacy_id: x.id, code: x.code ?? null, type: x.type ?? 'ND', continent: x.continent ?? null,
    country: x.country ?? null, seq: x.seq ?? 0, title: x.title ?? '', destination: x.destination ?? null,
    days: x.days ?? 0, nights: x.nights ?? 0, intro: x.intro ?? '', includes: x.includes ?? [], excludes: x.excludes ?? [],
    exec: x.exec ?? null, linked_quote_id: x.linkedQuoteId ?? null, linked_quote_name: x.linkedQuoteName ?? null,
    start_date: dateOnly(x.startDate),
    created_by: r.resolve(x.createdBy), created_by_name: nameFromActor(x.createdBy) || null,
    created_at: iso(x.createdAt) ?? undefined, updated_at: iso(x.updatedAt), updated_by_name: nameFromActor(x.updatedBy) || null,
  }));
  const inserted = await insert(client, 'itineraries', rows, { select: 'id, legacy_id' });
  const map = new Map(inserted.map((row) => [row.legacy_id, row.id]));
  const days = [], flights = [];
  for (const x of docs) {
    const iid = map.get(x.id);
    (x.schedule ?? []).forEach((d, i) => days.push({
      itinerary_id: iid, day_num: d.day ?? i + 1, date: d.date ?? null, title: d.title ?? '',
      meals: d.meals ?? { B: false, L: false, D: false }, meal_note: d.mealNote ?? '',
      segments: d.segments ?? [], sort_order: i,
    }));
    (x.flights ?? []).forEach((f, i) => flights.push({
      itinerary_id: iid, legacy_flight_id: f.id ?? null, group_text: f.group ?? null, leg: f.leg ?? null,
      flight_no: f.flightNo ?? null, dep: f.dep ?? null, arr: f.arr ?? null, dep_airport: f.depAirport ?? null,
      dep_time: f.depTime ?? null, arr_airport: f.arrAirport ?? null, arr_time: f.arrTime ?? null,
      dep_day_offset: f.depDayOffset ?? null, arr_day_offset: f.arrDayOffset ?? null, sort_order: i,
    }));
  }
  await insert(client, 'itinerary_days', days);
  await insert(client, 'itinerary_flights', flights);
}

export async function loadMenus(client, dump, r) {
  const docs = Object.values(dump.collections.tour_menus ?? {});
  const rows = docs.map((x) => ({
    legacy_id: x.id, code: x.code ?? null, type: x.type ?? 'ND', continent: x.continent ?? null,
    country: x.country ?? null, seq: x.seq ?? 0, title: x.title ?? '', destination: x.destination ?? null, days: x.days ?? 0,
    linked_itinerary_id: x.linkedItineraryId ?? null, linked_itinerary_name: x.linkedItineraryName ?? null,
    linked_quote_id: x.linkedQuoteId ?? null, linked_quote_name: x.linkedQuoteName ?? null,
    created_by: r.resolve(x.createdBy), created_by_name: nameFromActor(x.createdBy) || null,
    created_at: iso(x.createdAt) ?? undefined, updated_at: iso(x.updatedAt), updated_by_name: nameFromActor(x.updatedBy) || null,
  }));
  const inserted = await insert(client, 'menus', rows, { select: 'id, legacy_id' });
  const map = new Map(inserted.map((row) => [row.legacy_id, row.id]));
  const days = [];
  for (const x of docs) {
    const mid = map.get(x.id);
    (x.schedule ?? []).forEach((d, i) => days.push({
      menu_id: mid, day_num: d.day ?? i + 1, date: d.date ?? null, city: d.city ?? null,
      meals: d.meals ?? [], sort_order: i,
    }));
  }
  await insert(client, 'menu_days', days);
}
