// scripts/etl/customers.mjs — customers (+contacts/interactions), suppliers (+contacts), ncc_products (+prices).
import { insert } from './db.mjs';
import { iso, nameFromActor } from './util.mjs';

export async function loadCustomers(client, dump, r) {
  const customers = dump.singles['viettours/customer_list']?.customers ?? [];
  const rows = customers.map((x) => ({
    legacy_id: x.id, name: x.name, type: x.type, address: x.address ?? null,
    tax_code: x.taxCode ?? null, note: x.note ?? '',
    source: x.source ?? null, tags: x.tags ?? [], next_follow_up: x.nextFollowUp ?? null,
    created_by: r.resolve(x.createdBy), created_by_name: nameFromActor(x.createdBy) || null,
    created_at: iso(x.createdAt) ?? undefined, updated_at: iso(x.updatedAt),
    updated_by_name: nameFromActor(x.updatedBy) || null,
  }));
  const inserted = await insert(client, 'customers', rows, { select: 'id, legacy_id' });
  const map = new Map(inserted.map((row) => [row.legacy_id, row.id]));

  const contacts = [], inter = [];
  for (const x of customers) {
    const cid = map.get(x.id);
    (x.contacts ?? []).forEach((ct, i) => contacts.push({
      customer_id: cid, name: ct.name ?? '', phone: ct.phone ?? '', email: ct.email ?? '',
      position: ct.position ?? '', sort_order: i,
    }));
    (x.interactions ?? []).forEach((it, i) => inter.push({
      customer_id: cid, legacy_id: it.id ?? null, at: iso(it.at) ?? undefined,
      by_username: it.byU ?? null, by_name: it.byName ?? '', type: it.type ?? '',
      text: it.text ?? '', sort_order: i,
    }));
  }
  await insert(client, 'customer_contacts', contacts);
  await insert(client, 'customer_interactions', inter);
  return map;
}

export async function loadSuppliers(client, dump, r) {
  const suppliers = dump.singles['viettours/ncc_master']?.suppliers ?? [];
  const rows = suppliers.map((x) => ({
    legacy_id: x.id, name: x.name, sectors: x.sectors ?? [], location: x.location ?? '',
    note: x.note ?? '', created_by: r.resolve(x.createdBy),
    created_by_name: nameFromActor(x.createdBy) || null,
    created_at: iso(x.createdAt) ?? undefined, updated_at: iso(x.updatedAt),
    updated_by_name: nameFromActor(x.updatedBy) || null,
  }));
  const inserted = await insert(client, 'suppliers', rows, { select: 'id, legacy_id' });
  const map = new Map(inserted.map((row) => [row.legacy_id, row.id]));
  const contacts = [];
  for (const x of suppliers) {
    const sid = map.get(x.id);
    (x.contacts ?? []).forEach((ct, i) => contacts.push({
      supplier_id: sid, name: ct.name ?? '', phone: ct.phone ?? '', email: ct.email ?? '',
      position: ct.position ?? '', sort_order: i,
    }));
  }
  await insert(client, 'supplier_contacts', contacts);
  return map;
}

export async function loadNccProducts(client, dump, r, supplierMap) {
  const products = dump.singles['viettours/ncc_products']?.products ?? [];
  const rows = products.map((x) => ({
    legacy_id: x.id, supplier_id: x.nccId ? supplierMap.get(x.nccId) ?? null : null,
    ncc_name: x.nccName ?? '', category: x.category, name: x.name,
    description: x.description ?? null, note: x.note ?? null,
    created_by: r.resolve(x.createdBy), created_by_name: nameFromActor(x.createdBy) || null,
    created_at: iso(x.createdAt) ?? undefined, updated_at: iso(x.updatedAt),
    updated_by_name: nameFromActor(x.updatedBy) || null,
  }));
  const inserted = await insert(client, 'ncc_products', rows, { select: 'id, legacy_id' });
  const map = new Map(inserted.map((row) => [row.legacy_id, row.id]));
  const prices = [];
  for (const x of products) {
    const pid = map.get(x.id);
    (x.prices ?? []).forEach((p, i) => prices.push({
      product_id: pid, label: p.label ?? '', amount: p.amount ?? 0, cur: p.cur ?? 'VND',
      unit: p.unit ?? '', note: p.note ?? null, sort_order: i,
    }));
  }
  await insert(client, 'ncc_product_prices', prices);
}
