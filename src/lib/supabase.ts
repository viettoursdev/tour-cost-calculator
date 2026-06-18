import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { FileAttachment, User, Role, Customer, Ncc } from '@/types';
import type { VisaProduct, VisaProductsDoc, VisaProductVersion, VisaProcDoc, VisaProcIndexEntry, VisaProjectDoc } from '@/types/visa';
import type { PoiEntry, Itinerary, ItineraryIndexEntry, Day, Flight } from '@/types/itinerary';
import type { AuditEntry } from '@/types/audit';
import { subscribeTable, replaceChildren, usernamesToIds } from './supabase/helpers';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anon) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see .env.example).');
}

export const sb: SupabaseClient = createClient(url, anon);

export async function loadAttachments(
  client: SupabaseClient, parentType: string, parentId: string,
): Promise<FileAttachment[]> {
  const { data, error } = await client.from('attachments')
    .select('r2_key, name, uploaded_by_name, uploaded_at')
    .eq('parent_type', parentType).eq('parent_id', parentId)
    .order('uploaded_at', { ascending: true });
  if (error) throw new Error('loadAttachments: ' + error.message);
  return (data ?? []).map((r) => ({
    key: r.r2_key as string,
    name: r.name as string,
    uploadedBy: (r.uploaded_by_name as string) ?? undefined,
    uploadedAt: r.uploaded_at ? new Date(r.uploaded_at as string).toISOString() : undefined,
  }));
}

/** Batch-load attachments for many parents of one type. Returns parentId → FileAttachment[]. */
export async function loadAttachmentsForParents(
  client: SupabaseClient, parentType: string, parentIds: string[],
): Promise<Map<string, FileAttachment[]>> {
  const map = new Map<string, FileAttachment[]>();
  if (!parentIds.length) return map;
  const { data, error } = await client.from('attachments')
    .select('parent_id, r2_key, name, uploaded_by_name, uploaded_at')
    .eq('parent_type', parentType).in('parent_id', parentIds)
    .order('uploaded_at', { ascending: true });
  if (error) throw new Error('loadAttachmentsForParents: ' + error.message);
  for (const r of data ?? []) {
    const arr = map.get(r.parent_id as string) ?? [];
    arr.push({
      key: r.r2_key as string, name: r.name as string,
      uploadedBy: (r.uploaded_by_name as string) ?? undefined,
      uploadedAt: r.uploaded_at ? new Date(r.uploaded_at as string).toISOString() : undefined,
    });
    map.set(r.parent_id as string, arr);
  }
  return map;
}

export async function saveAttachments(
  client: SupabaseClient, parentType: string, parentId: string, atts: FileAttachment[],
): Promise<void> {
  // Delete scoped by (parent_type, parent_id) to avoid cross-type collisions on shared IDs.
  const del = await client.from('attachments').delete()
    .eq('parent_type', parentType).eq('parent_id', parentId);
  if (del.error) throw new Error('saveAttachments delete: ' + del.error.message);
  const rows = atts.map((a) => ({
    parent_type: parentType, parent_id: parentId,
    r2_key: a.key, name: a.name,
    uploaded_by_name: a.uploadedBy ?? null,
    uploaded_at: a.uploadedAt ?? null,
  }));
  if (rows.length) {
    const ins = await client.from('attachments').insert(rows);
    if (ins.error) throw new Error('saveAttachments insert: ' + ins.error.message);
  }
}

// ── Users / profiles gateway ──────────────────────────────────────────────────

const profileToUser = (r: Record<string, unknown>): User => ({
  u: (r.username as string) ?? '',
  email: (r.email as string) ?? undefined,
  phone: (r.phone as string) ?? undefined,
  role: r.role as Role,
  name: (r.name as string) ?? '',
  color: (r.color as string) ?? '#888888',
});

export async function sbPullUsers(client: SupabaseClient = sb): Promise<User[]> {
  const { data, error } = await client.from('profiles')
    .select('username, email, phone, role, name, color');
  if (error) throw new Error('sbPullUsers: ' + error.message);
  return (data ?? []).map(profileToUser);
}

/**
 * Upserts editable profile fields (username/email/phone/role/name/color) for
 * users whose email already has an auth.users + profile row. Does NOT create
 * auth users (admin API; Phase 3). Users with no matching profile row are
 * skipped and a warning is logged.
 */
export async function sbPushUsers(users: User[], client: SupabaseClient = sb): Promise<void> {
  const emails = users.map((u) => u.email).filter(Boolean) as string[];
  const { data: existing, error } = await client.from('profiles')
    .select('id, email').in('email', emails);
  if (error) throw new Error('sbPushUsers: ' + error.message);
  const idByEmail = new Map((existing ?? []).map((r) => [r.email as string, r.id as string]));
  const updates = users
    .filter((u) => u.email && idByEmail.has(u.email))
    .map((u) => ({
      id: idByEmail.get(u.email as string)!,
      username: u.u,
      email: u.email,
      phone: u.phone ?? null,
      role: u.role,
      name: u.name,
      color: u.color,
      updated_at: new Date().toISOString(),
    }));
  const skipped = users.filter((u) => !u.email || !idByEmail.has(u.email));
  if (skipped.length) {
    console.warn(
      `sbPushUsers: skipped ${skipped.length} user(s) with no auth account (create via admin in Phase 3).`,
    );
  }
  if (updates.length) {
    const { error: upErr } = await client.from('profiles').upsert(updates, { onConflict: 'id' });
    if (upErr) throw new Error('sbPushUsers upsert: ' + upErr.message);
  }
}

/** No-op in Supabase (no plaintext password column exists). Kept for signature parity with Firebase gateway. */
export async function sbPurgeLegacyPasswords(_client: SupabaseClient = sb): Promise<number> {
  return 0;
}

// ── FX rates ──────────────────────────────────────────────────────────────────

/** Identical shape to firebase.ts:FxRatesDoc — redeclared here to avoid importing firebase initialisation code. */
export type FxRatesDoc = {
  rates: Record<string, number>;
  _meta?: { pushedAt?: string; pushedBy?: string };
};

export function sbSubscribeFxRates(cb: (doc: FxRatesDoc) => void, client: SupabaseClient = sb): () => void {
  return subscribeTable(client, 'fx_rates', async (cl) => {
    const { data, error } = await cl.from('fx_rates').select('currency, rate_to_vnd, pushed_at, pushed_by');
    if (error) throw error;
    const rates: Record<string, number> = {};
    let meta: FxRatesDoc['_meta'];
    for (const r of data ?? []) {
      rates[r.currency as string] = r.rate_to_vnd as number;
      if (r.pushed_at) meta = { pushedAt: r.pushed_at as string, pushedBy: (r.pushed_by as string) ?? undefined };
    }
    return { rates, _meta: meta } satisfies FxRatesDoc;
  }, cb);
}

export async function sbPushFxRates(
  rates: Record<string, number>,
  pushedBy: string,
  client: SupabaseClient = sb,
): Promise<string> {
  const pushedAt = new Date().toISOString();
  const currencies = Object.keys(rates);
  // Full-overwrite: delete currencies absent from the new map, then upsert present ones.
  if (currencies.length > 0) {
    const del = await client.from('fx_rates').delete().not('currency', 'in', `(${currencies.join(',')})`);
    if (del.error) throw new Error('sbPushFxRates delete: ' + del.error.message);
  } else {
    // Empty map → wipe everything
    const del = await client.from('fx_rates').delete().not('currency', 'is', null);
    if (del.error) throw new Error('sbPushFxRates delete all: ' + del.error.message);
  }
  if (currencies.length > 0) {
    const rows = currencies.map((currency) => ({
      currency, rate_to_vnd: rates[currency], pushed_at: pushedAt, pushed_by: pushedBy,
    }));
    const up = await client.from('fx_rates').upsert(rows, { onConflict: 'currency' });
    if (up.error) throw new Error('sbPushFxRates upsert: ' + up.error.message);
  }
  return pushedAt;
}

// ── POIs ──────────────────────────────────────────────────────────────────────

const rowToPoi = (r: Record<string, unknown>): PoiEntry => ({
  id: r.legacy_id as string,
  place: r.place as string,
  destination: (r.destination as string) ?? undefined,
  commentary: (r.commentary as string) ?? '',
  createdBy: (r.created_by_name as string) ?? undefined,
  createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : undefined,
  updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : undefined,
  updatedBy: (r.updated_by_name as string) ?? undefined,
});

export function sbSubscribePois(cb: (list: PoiEntry[]) => void, client: SupabaseClient = sb): () => void {
  return subscribeTable(client, 'pois', async (cl) => {
    const { data, error } = await cl.from('pois').select('*').order('place');
    if (error) throw error;
    return (data ?? []).map(rowToPoi);
  }, cb);
}

export async function sbPushPois(
  list: PoiEntry[],
  pushedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  const legacyIds = list.map((p) => p.id);
  // Full-overwrite: fetch existing legacy_ids, delete the set-difference, then upsert.
  if (legacyIds.length > 0) {
    const { data: existing, error: fetchErr } = await client.from('pois').select('legacy_id');
    if (fetchErr) throw new Error('sbPushPois fetch: ' + fetchErr.message);
    const toDelete = (existing ?? [])
      .map((r) => r.legacy_id as string)
      .filter((lid) => lid && !legacyIds.includes(lid));
    if (toDelete.length > 0) {
      const del = await client.from('pois').delete().in('legacy_id', toDelete);
      if (del.error) throw new Error('sbPushPois delete: ' + del.error.message);
    }
  } else {
    const del = await client.from('pois').delete().not('legacy_id', 'is', null);
    if (del.error) throw new Error('sbPushPois delete all: ' + del.error.message);
  }
  if (list.length > 0) {
    const now = new Date().toISOString();
    const rows = list.map((p) => ({
      legacy_id: p.id,
      place: p.place,
      destination: p.destination ?? null,
      commentary: p.commentary ?? '',
      created_by_name: p.createdBy ?? pushedBy.name,
      updated_at: now,
      updated_by_name: `${pushedBy.name} (${pushedBy.role})`,
    }));
    const up = await client.from('pois').upsert(rows, { onConflict: 'legacy_id' });
    if (up.error) throw new Error('sbPushPois upsert: ' + up.error.message);
  }
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export async function sbLogAudit(entry: AuditEntry, client: SupabaseClient = sb): Promise<void> {
  const idMap = await usernamesToIds(client, [entry.byU]);
  const { error } = await client.from('audit_log').insert({
    at: entry.at,
    created_by: idMap.get(entry.byU) ?? null,
    actor_name: entry.byName,
    action: entry.action,
    entity: entry.entity,
    name: entry.name,
    note: entry.note ?? null,
  });
  if (error) throw new Error('sbLogAudit: ' + error.message);
}

export function sbSubscribeAuditLog(cb: (entries: AuditEntry[]) => void, client: SupabaseClient = sb): () => void {
  return subscribeTable(client, 'audit_log', async (cl) => {
    const { data, error } = await cl.from('audit_log')
      .select('*')
      .order('at', { ascending: false })
      .limit(2000);
    if (error) throw error;
    return (data ?? []).map((r): AuditEntry => ({
      id: r.id as string,
      at: r.at as string,
      byU: '',            // UUID→username reverse map not performed on read; app renders byName
      byName: (r.actor_name as string) ?? '',
      action: r.action as AuditEntry['action'],
      entity: r.entity as string,
      name: r.name as string,
      note: (r.note as string) ?? undefined,
    }));
  }, cb);
}

// ── Customers ─────────────────────────────────────────────────────────────────

const rowToCustomer = (r: Record<string, unknown>, contacts: Customer['contacts']): Customer => ({
  id: r.legacy_id as string, name: r.name as string, type: r.type as Customer['type'],
  address: (r.address as string) ?? undefined, taxCode: (r.tax_code as string) ?? undefined,
  contacts, note: (r.note as string) ?? '',
  createdAt: r.created_at as string, createdBy: (r.created_by_name as string) ?? '',
  updatedAt: (r.updated_at as string) ?? undefined, updatedBy: (r.updated_by_name as string) ?? undefined,
});

export function sbSubscribeCustomers(cb: (list: Customer[]) => void, client: SupabaseClient = sb): () => void {
  return subscribeTable(client, 'customers', async (cl) => {
    const { data: rows, error } = await cl.from('customers').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    const ids = (rows ?? []).map((r) => r.id as string);
    const { data: contacts } = ids.length
      ? await cl.from('customer_contacts').select('*').in('customer_id', ids).order('sort_order')
      : { data: [] as Record<string, unknown>[] };
    const byParent = new Map<string, Customer['contacts']>();
    for (const ct of contacts ?? []) {
      const arr = byParent.get(ct.customer_id as string) ?? [];
      arr.push({ name: ct.name as string, phone: ct.phone as string, email: ct.email as string, position: ct.position as string });
      byParent.set(ct.customer_id as string, arr);
    }
    return (rows ?? []).map((r) => rowToCustomer(r, byParent.get(r.id as string) ?? []));
  }, cb);
}

export async function sbPushCustomers(
  list: Customer[],
  pushedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  const stamp = { updated_at: new Date().toISOString(), updated_by_name: `${pushedBy.name} (${pushedBy.role})` };
  for (const cust of list) {
    const { data: up, error: upErr } = await client.from('customers').upsert({
      legacy_id: cust.id, name: cust.name, type: cust.type,
      address: cust.address ?? null, tax_code: cust.taxCode ?? null, note: cust.note ?? '',
      created_by_name: cust.createdBy, created_at: cust.createdAt, ...stamp,
    }, { onConflict: 'legacy_id' }).select('id').single();
    if (upErr) throw new Error('sbPushCustomers upsert: ' + upErr.message);
    await replaceChildren(client, 'customer_contacts', 'customer_id', up!.id, cust.contacts.map((ct, i) => ({
      customer_id: up!.id, name: ct.name, phone: ct.phone, email: ct.email, position: ct.position, sort_order: i,
    })));
  }
  // Full-overwrite: delete customers removed from the list using safe fetch-then-delete pattern.
  const keepIds = list.map((c) => c.id);
  if (keepIds.length > 0) {
    const { data: existing, error: fetchErr } = await client.from('customers').select('legacy_id');
    if (fetchErr) throw new Error('sbPushCustomers fetch: ' + fetchErr.message);
    const toDelete = (existing ?? [])
      .map((r) => r.legacy_id as string)
      .filter((lid) => lid && !keepIds.includes(lid));
    if (toDelete.length > 0) {
      const del = await client.from('customers').delete().in('legacy_id', toDelete);
      if (del.error) throw new Error('sbPushCustomers delete: ' + del.error.message);
    }
  } else {
    // Empty push = wipe all (full-overwrite parity with fbPushCustomers).
    const del = await client.from('customers').delete().not('legacy_id', 'is', null);
    if (del.error) throw new Error('sbPushCustomers delete all: ' + del.error.message);
  }
}

// ── NCC Products ──────────────────────────────────────────────────────────────

import type { NccProduct, NccPrice } from '@/types/ncc';

const rowToNccPrice = (r: Record<string, unknown>): NccPrice => ({
  id: r.id as string,
  label: r.label as string,
  amount: r.amount as number,
  cur: r.cur as string,
  unit: r.unit as string,
  note: (r.note as string) ?? undefined,
});

const rowToNccProduct = (
  r: Record<string, unknown>,
  prices: NccPrice[],
  files: FileAttachment[],
  nccIdLegacy: string | null,
): NccProduct => ({
  id: r.legacy_id as string,
  nccId: nccIdLegacy,
  nccName: (r.ncc_name as string) ?? '',
  category: r.category as NccProduct['category'],
  name: r.name as string,
  description: (r.description as string) ?? undefined,
  prices,
  files,
  note: (r.note as string) ?? undefined,
  createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : (r.created_at as string),
  createdBy: (r.created_by_name as string) ?? '',
  updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : undefined,
  updatedBy: (r.updated_by_name as string) ?? undefined,
});

export function sbSubscribeNccProducts(
  cb: (list: NccProduct[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(client, 'ncc_products', async (cl) => {
    const { data: rows, error } = await cl
      .from('ncc_products')
      .select('*, suppliers!ncc_products_supplier_id_fkey(legacy_id)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const productUuids = (rows ?? []).map((r) => r.id as string);
    const { data: priceRows } = productUuids.length
      ? await cl
          .from('ncc_product_prices')
          .select('*')
          .in('product_id', productUuids)
          .order('sort_order')
      : { data: [] as Record<string, unknown>[] };
    const pricesByProduct = new Map<string, NccPrice[]>();
    for (const pr of priceRows ?? []) {
      const arr = pricesByProduct.get(pr.product_id as string) ?? [];
      arr.push(rowToNccPrice(pr));
      pricesByProduct.set(pr.product_id as string, arr);
    }
    const legacyIds = (rows ?? []).map((r) => r.legacy_id as string);
    const filesByProduct = await loadAttachmentsForParents(cl, 'ncc_product', legacyIds);
    return (rows ?? []).map((r) => {
      const legacyId = r.legacy_id as string;
      const supplierRow = r.suppliers as { legacy_id: string } | null;
      const nccIdLegacy: string | null = supplierRow?.legacy_id ?? null;
      return rowToNccProduct(r, pricesByProduct.get(r.id as string) ?? [], filesByProduct.get(legacyId) ?? [], nccIdLegacy);
    });
  }, cb);
}

export async function sbPushNccProducts(
  list: NccProduct[],
  pushedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  const stamp = {
    updated_at: new Date().toISOString(),
    updated_by_name: `${pushedBy.name} (${pushedBy.role})`,
  };

  // Resolve nccId (app legacy_id on suppliers) → supplier uuid for FK
  const nccLegacyIds = Array.from(
    new Set(list.map((p) => p.nccId).filter(Boolean) as string[]),
  );
  let supplierIdMap = new Map<string, string>();
  if (nccLegacyIds.length) {
    const { data: sups, error: supErr } = await client
      .from('suppliers')
      .select('id, legacy_id')
      .in('legacy_id', nccLegacyIds);
    if (supErr) throw new Error('sbPushNccProducts resolve suppliers: ' + supErr.message);
    supplierIdMap = new Map((sups ?? []).map((s) => [s.legacy_id as string, s.id as string]));
  }

  for (const prod of list) {
    const { data: up, error: upErr } = await client
      .from('ncc_products')
      .upsert(
        {
          legacy_id: prod.id,
          supplier_id: prod.nccId ? (supplierIdMap.get(prod.nccId) ?? null) : null,
          ncc_name: prod.nccName,
          category: prod.category,
          name: prod.name,
          description: prod.description ?? null,
          note: prod.note ?? null,
          created_by_name: prod.createdBy,
          created_at: prod.createdAt,
          ...stamp,
        },
        { onConflict: 'legacy_id' },
      )
      .select('id')
      .single();
    if (upErr) throw new Error('sbPushNccProducts upsert: ' + upErr.message);
    await replaceChildren(
      client,
      'ncc_product_prices',
      'product_id',
      up!.id,
      prod.prices.map((pr, i) => ({
        product_id: up!.id,
        label: pr.label,
        amount: pr.amount,
        cur: pr.cur,
        unit: pr.unit,
        note: pr.note ?? null,
        sort_order: i,
      })),
    );
    await saveAttachments(client, 'ncc_product', prod.id, prod.files);
  }

  // Full-overwrite: delete products removed from the list using safe fetch-then-delete pattern.
  const keepIds = list.map((p) => p.id);
  if (keepIds.length > 0) {
    const { data: existing, error: fetchErr } = await client.from('ncc_products').select('legacy_id');
    if (fetchErr) throw new Error('sbPushNccProducts fetch: ' + fetchErr.message);
    const toDelete = (existing ?? [])
      .map((r) => r.legacy_id as string)
      .filter((lid) => lid && !keepIds.includes(lid));
    if (toDelete.length > 0) {
      const del = await client.from('ncc_products').delete().in('legacy_id', toDelete);
      if (del.error) throw new Error('sbPushNccProducts delete: ' + del.error.message);
    }
  } else {
    // Empty push = wipe all.
    const del = await client.from('ncc_products').delete().not('legacy_id', 'is', null);
    if (del.error) throw new Error('sbPushNccProducts delete all: ' + del.error.message);
  }
}

// ── Contracts ─────────────────────────────────────────────────────────────────

import type { Contract, ContractPayment, ContractCancel } from '@/types/contract';

function rowToPayment(r: Record<string, unknown>): ContractPayment {
  return {
    id: (r.legacy_id as string) ?? (r.id as string),
    label: (r.label as string) ?? '',
    mode: (r.mode as ContractPayment['mode']) ?? 'percent',
    percent: (r.percent as number) ?? undefined,
    amount: (r.amount as number) ?? 0,
    dueDate: (r.due_date as string) ?? '',
    note: (r.note as string) ?? '',
    status: (r.status as ContractPayment['status']) ?? 'pending',
    paidDate: (r.paid_date as string) ?? undefined,
    receivedAmount: (r.received_amount as number) ?? undefined,
    approvalRequested: (r.approval_requested as boolean) ?? undefined,
  };
}

function rowToCancel(r: Record<string, unknown>): ContractCancel {
  return {
    when: (r.when_text as string) ?? '',
    penalty: (r.penalty as number) ?? 0,
  };
}

function rowToContract(
  r: Record<string, unknown>,
  payments: ContractPayment[],
  cancels: ContractCancel[],
): Contract {
  return {
    id: (r.legacy_id as string) ?? (r.id as string),
    contractNo: (r.contract_no as string) ?? '',
    contractDate: (r.contract_date as string) ?? '',
    contractStatus: (r.contract_status as Contract['contractStatus']) ?? 'draft',
    tourName: (r.tour_name as string) ?? '',
    tourDest: (r.tour_dest as string) ?? '',
    tourDays: (r.tour_days as number) ?? 0,
    tourNights: (r.tour_nights as number) ?? 0,
    tourStartDate: (r.tour_start_date as string) ?? undefined,
    departure: (r.departure as string) ?? '',
    contractPax: (r.contract_pax as number) ?? 0,
    pricePerPax: (r.price_per_pax as number) ?? 0,
    partyB: (r.party_b as Contract['partyB']) ?? { name: '', address: '', tel: '', rep: '', title: '', taxCode: '', email: '' },
    includes: (r.includes as string[]) ?? [],
    excludes: (r.excludes as string[]) ?? [],
    payments,
    cancels,
    bondPercent: (r.bond_percent as number) ?? 0,
    hasAcceptance: (r.has_acceptance as boolean) ?? false,
    acceptanceDate: (r.acceptance_date as string) ?? undefined,
    acceptanceNote: (r.acceptance_note as string) ?? undefined,
    createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : '',
    createdBy: (r.created_by_name as string) ?? '',
    updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : undefined,
    updatedBy: (r.updated_by_name as string) ?? undefined,
    _tourKey: (r.tour_key as string) ?? undefined,
    linkedQuoteId: (r.linked_quote_id as string) ?? undefined,
    linkedQuoteName: (r.linked_quote_name as string) ?? undefined,
  };
}

async function assembleContracts(client: SupabaseClient): Promise<Contract[]> {
  const { data: rows, error } = await client
    .from('contracts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error('assembleContracts: ' + error.message);
  if (!rows || rows.length === 0) return [];

  const ids = rows.map((r) => r.id as string);
  const [{ data: payments, error: pErr }, { data: cancels, error: cErr }] = await Promise.all([
    client.from('contract_payments').select('*').in('contract_id', ids).order('sort_order'),
    client.from('contract_cancels').select('*').in('contract_id', ids).order('sort_order'),
  ]);
  if (pErr) throw new Error('assembleContracts payments: ' + pErr.message);
  if (cErr) throw new Error('assembleContracts cancels: ' + cErr.message);

  const paysByContract = new Map<string, ContractPayment[]>();
  for (const p of payments ?? []) {
    const arr = paysByContract.get(p.contract_id as string) ?? [];
    arr.push(rowToPayment(p as Record<string, unknown>));
    paysByContract.set(p.contract_id as string, arr);
  }
  const cancelsByContract = new Map<string, ContractCancel[]>();
  for (const cc of cancels ?? []) {
    const arr = cancelsByContract.get(cc.contract_id as string) ?? [];
    arr.push(rowToCancel(cc as Record<string, unknown>));
    cancelsByContract.set(cc.contract_id as string, arr);
  }

  return rows.map((r) =>
    rowToContract(
      r as Record<string, unknown>,
      paysByContract.get(r.id as string) ?? [],
      cancelsByContract.get(r.id as string) ?? [],
    ),
  );
}

/** Subscribe to the contract list. Mirrors fbSubscribeContracts (firebase.ts:562). */
export function sbSubscribeContracts(
  cb: (list: Contract[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(client, 'contracts', assembleContracts, cb);
}

/** One-time pull. Mirrors fbGetContracts (firebase.ts:572). */
export async function sbGetContracts(client: SupabaseClient = sb): Promise<Contract[]> {
  return assembleContracts(client);
}

/** Full-overwrite push. Mirrors fbPushContracts (firebase.ts:581). */
export async function sbPushContracts(
  list: Contract[],
  pushedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  const stamp = {
    updated_at: new Date().toISOString(),
    updated_by_name: `${pushedBy.name} (${pushedBy.role})`,
  };

  for (const contract of list) {
    const { data: up, error: upErr } = await client
      .from('contracts')
      .upsert(
        {
          legacy_id: contract.id,
          contract_no: contract.contractNo,
          contract_date: contract.contractDate,
          contract_status: contract.contractStatus,
          tour_name: contract.tourName,
          tour_dest: contract.tourDest ?? null,
          tour_days: contract.tourDays,
          tour_nights: contract.tourNights,
          tour_start_date: contract.tourStartDate ?? null,
          departure: contract.departure ?? null,
          contract_pax: contract.contractPax,
          price_per_pax: contract.pricePerPax,
          party_b: contract.partyB,
          includes: contract.includes,
          excludes: contract.excludes,
          bond_percent: contract.bondPercent,
          has_acceptance: contract.hasAcceptance,
          acceptance_date: contract.acceptanceDate ?? null,
          acceptance_note: contract.acceptanceNote ?? null,
          tour_key: contract._tourKey ?? null,
          linked_quote_id: contract.linkedQuoteId ?? null,
          linked_quote_name: contract.linkedQuoteName ?? null,
          created_by_name: contract.createdBy,
          created_at: contract.createdAt,
          ...stamp,
        },
        { onConflict: 'legacy_id' },
      )
      .select('id')
      .single();
    if (upErr) throw new Error('sbPushContracts upsert: ' + upErr.message);

    const parentId = up!.id as string;

    await replaceChildren(
      client,
      'contract_payments',
      'contract_id',
      parentId,
      contract.payments.map((p, i) => ({
        contract_id: parentId,
        label: p.label,
        mode: p.mode ?? 'percent',
        percent: p.percent ?? null,
        amount: p.amount,
        due_date: p.dueDate,
        note: p.note,
        status: p.status,
        paid_date: p.paidDate ?? null,
        received_amount: p.receivedAmount ?? null,
        approval_requested: p.approvalRequested ?? false,
        sort_order: i,
      })),
    );

    await replaceChildren(
      client,
      'contract_cancels',
      'contract_id',
      parentId,
      contract.cancels.map((cc, i) => ({
        contract_id: parentId,
        when_text: cc.when,
        penalty: cc.penalty,
        sort_order: i,
      })),
    );
  }

  // Full-overwrite: delete contracts no longer in the list using safe fetch-then-delete.
  const keepIds = list.map((c) => c.id);
  if (keepIds.length > 0) {
    const { data: existing, error: fetchErr } = await client.from('contracts').select('legacy_id');
    if (fetchErr) throw new Error('sbPushContracts fetch: ' + fetchErr.message);
    const toDelete = (existing ?? [])
      .map((r) => r.legacy_id as string)
      .filter((lid) => lid && !keepIds.includes(lid));
    if (toDelete.length > 0) {
      const del = await client.from('contracts').delete().in('legacy_id', toDelete);
      if (del.error) throw new Error('sbPushContracts delete: ' + del.error.message);
    }
  } else {
    const del = await client.from('contracts').delete().not('legacy_id', 'is', null);
    if (del.error) throw new Error('sbPushContracts delete all: ' + del.error.message);
  }
}

// ── Rate Card ─────────────────────────────────────────────────────────────────

import type { RateCard, RateCardDoc, RateCardMeta } from '@/types/rates';

// Strip the vte_visa_rates mirror that sbPushMasterRC writes into rate_card_other.
// The canonical source for visa rates is the top-level visaRates field; the mirror
// is for legacy _applyRC() compatibility only and must not leak into the store.
// Mirrors stripVisaMirror (firebase.ts:146-153).
function stripVisaMirror(doc: RateCardDoc): RateCardDoc {
  if (!doc.otherRates || !('vte_visa_rates' in doc.otherRates)) return doc;
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.otherRates)) {
    if (k !== 'vte_visa_rates') cleaned[k] = v;
  }
  return { ...doc, otherRates: cleaned as RateCardDoc['otherRates'] };
}

async function assembleRC(client: SupabaseClient): Promise<RateCardDoc | null> {
  const [
    { data: hotelRows, error: hErr },
    { data: otherRows, error: oErr },
    { data: visaRow, error: vErr },
    { data: metaRow, error: mErr },
  ] = await Promise.all([
    client.from('rate_card_hotels').select('city, entries'),
    client.from('rate_card_other').select('rkey, entry'),
    client.from('rate_card_visa').select('data').eq('one_row', true).maybeSingle(),
    client.from('rate_card_meta').select('*').eq('one_row', true).maybeSingle(),
  ]);
  if (hErr) throw new Error('assembleRC hotels: ' + hErr.message);
  if (oErr) throw new Error('assembleRC other: ' + oErr.message);
  if (vErr) throw new Error('assembleRC visa: ' + vErr.message);
  if (mErr) throw new Error('assembleRC meta: ' + mErr.message);

  // If all tables are empty, return null (mirrors fbPullMasterRC returning null when doc doesn't exist).
  if (!hotelRows?.length && !otherRows?.length && !visaRow && !metaRow) return null;

  const hotels: RateCard['hotels'] = {};
  for (const r of hotelRows ?? []) {
    hotels[r.city as string] = r.entries as RateCardDoc['hotels'][string];
  }
  const otherRates: RateCard['otherRates'] = {};
  for (const r of otherRows ?? []) {
    otherRates[r.rkey as string] = r.entry as RateCardDoc['otherRates'][string];
  }
  const visaRates: RateCard['visaRates'] = (visaRow?.data as RateCard['visaRates']) ?? {};

  let _meta: RateCardMeta | undefined;
  if (metaRow) {
    _meta = {
      version: (metaRow.version as string) ?? '2.0',
      type: (metaRow.type as string) ?? 'viettours_ratecard_master',
      pushedAt: metaRow.pushed_at ? new Date(metaRow.pushed_at as string).toISOString() : '',
      pushedBy: (metaRow.pushed_by as string) ?? '',
      app: (metaRow.app as string) ?? 'Viettours Tour Cost Calculator',
      autoSync: (metaRow.auto_sync as boolean) ?? true,
    };
  }

  return stripVisaMirror({ hotels, visaRates, otherRates, _meta });
}

/** One-time pull. Mirrors fbPullMasterRC (firebase.ts:155). */
export async function sbPullMasterRC(client: SupabaseClient = sb): Promise<RateCardDoc | null> {
  return assembleRC(client);
}

/** Full-overwrite push. Mirrors fbPushMasterRC (firebase.ts:161). Returns pushedAt ISO string. */
export async function sbPushMasterRC(
  rc: RateCard,
  pushedBy: string,
  client: SupabaseClient = sb,
): Promise<string> {
  const pushedAt = new Date().toISOString();

  // Mirror vte_visa_rates into otherRates for legacy _applyRC() compatibility,
  // exactly as fbPushMasterRC does (firebase.ts:168-171).
  const otherRatesWithVisaMirror: RateCard['otherRates'] = {
    ...rc.otherRates,
    vte_visa_rates: rc.visaRates as unknown as RateCardDoc['otherRates'][string],
  };

  // ── Hotels: full overwrite (fetch existing cities, delete absent ones, upsert present ones) ──
  const newCities = Object.keys(rc.hotels);
  if (newCities.length === 0) {
    const del = await client.from('rate_card_hotels').delete().not('city', 'is', null);
    if (del.error) throw new Error('sbPushMasterRC hotels delete-all: ' + del.error.message);
  } else {
    const { data: existingH, error: fetchHErr } = await client.from('rate_card_hotels').select('city');
    if (fetchHErr) throw new Error('sbPushMasterRC hotels fetch: ' + fetchHErr.message);
    const toDeleteCities = (existingH ?? [])
      .map((r) => r.city as string)
      .filter((city) => !newCities.includes(city));
    if (toDeleteCities.length > 0) {
      const del = await client.from('rate_card_hotels').delete().in('city', toDeleteCities);
      if (del.error) throw new Error('sbPushMasterRC hotels delete: ' + del.error.message);
    }
  }
  if (newCities.length > 0) {
    const hotelRows = newCities.map((city) => ({ city, entries: rc.hotels[city] }));
    const upH = await client.from('rate_card_hotels').upsert(hotelRows, { onConflict: 'city' });
    if (upH.error) throw new Error('sbPushMasterRC hotels upsert: ' + upH.error.message);
  }

  // ── OtherRates (including visa mirror): full overwrite ──
  const newRkeys = Object.keys(otherRatesWithVisaMirror);
  if (newRkeys.length === 0) {
    const del = await client.from('rate_card_other').delete().not('rkey', 'is', null);
    if (del.error) throw new Error('sbPushMasterRC other delete-all: ' + del.error.message);
  } else {
    const { data: existingO, error: fetchOErr } = await client.from('rate_card_other').select('rkey');
    if (fetchOErr) throw new Error('sbPushMasterRC other fetch: ' + fetchOErr.message);
    const toDeleteRkeys = (existingO ?? [])
      .map((r) => r.rkey as string)
      .filter((rkey) => !newRkeys.includes(rkey));
    if (toDeleteRkeys.length > 0) {
      const del = await client.from('rate_card_other').delete().in('rkey', toDeleteRkeys);
      if (del.error) throw new Error('sbPushMasterRC other delete: ' + del.error.message);
    }
  }
  if (newRkeys.length > 0) {
    const otherRows = newRkeys.map((rkey) => ({ rkey, entry: otherRatesWithVisaMirror[rkey] }));
    const upO = await client.from('rate_card_other').upsert(otherRows, { onConflict: 'rkey' });
    if (upO.error) throw new Error('sbPushMasterRC other upsert: ' + upO.error.message);
  }

  // ── Visa singleton ──
  const upV = await client
    .from('rate_card_visa')
    .upsert({ one_row: true, data: rc.visaRates }, { onConflict: 'one_row' });
  if (upV.error) throw new Error('sbPushMasterRC visa upsert: ' + upV.error.message);

  // ── Meta singleton ──
  const upM = await client.from('rate_card_meta').upsert(
    {
      one_row: true,
      version: '2.0',
      type: 'viettours_ratecard_master',
      pushed_at: pushedAt,
      pushed_by: pushedBy,
      app: 'Viettours Tour Cost Calculator',
      auto_sync: true,
    },
    { onConflict: 'one_row' },
  );
  if (upM.error) throw new Error('sbPushMasterRC meta upsert: ' + upM.error.message);

  return pushedAt;
}

/** Realtime subscribe. Mirrors fbSubscribeMasterRC (firebase.ts:191). */
export function sbSubscribeMasterRC(
  cb: (rc: RateCardDoc) => void,
  client: SupabaseClient = sb,
): () => void {
  // Subscribe on rate_card_hotels as the trigger table; assembleRC reads all four tables.
  return subscribeTable(
    client,
    'rate_card_hotels',
    async (cl) => {
      const doc = await assembleRC(cl);
      // If tables are empty after a truncate (rare in prod), emit an empty doc rather than null.
      return doc ?? { hotels: {}, visaRates: {}, otherRates: {} };
    },
    cb as (v: RateCardDoc) => void,
  );
}

// ── Suppliers (NCC) ───────────────────────────────────────────────────────────

const rowToNcc = (r: Record<string, unknown>, contacts: Ncc['contacts']): Ncc => ({
  id: r.legacy_id as string,
  name: r.name as string,
  sectors: (r.sectors as string[]) ?? [],
  location: (r.location as string) ?? '',
  contacts,
  note: (r.note as string) ?? '',
  createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : (r.created_at as string),
  createdBy: (r.created_by_name as string) ?? '',
  updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : undefined,
  updatedBy: (r.updated_by_name as string) ?? undefined,
});

export function sbSubscribeNcc(cb: (list: Ncc[]) => void, client: SupabaseClient = sb): () => void {
  return subscribeTable(client, 'suppliers', async (cl) => {
    const { data: rows, error } = await cl.from('suppliers').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    const ids = (rows ?? []).map((r) => r.id as string);
    const { data: contacts } = ids.length
      ? await cl.from('supplier_contacts').select('*').in('supplier_id', ids).order('sort_order')
      : { data: [] as Record<string, unknown>[] };
    const byParent = new Map<string, Ncc['contacts']>();
    for (const ct of contacts ?? []) {
      const arr = byParent.get(ct.supplier_id as string) ?? [];
      arr.push({ name: ct.name as string, phone: ct.phone as string, email: ct.email as string, position: ct.position as string });
      byParent.set(ct.supplier_id as string, arr);
    }
    return (rows ?? []).map((r) => rowToNcc(r, byParent.get(r.id as string) ?? []));
  }, cb);
}

export async function sbPushNcc(
  list: Ncc[],
  pushedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  const stamp = { updated_at: new Date().toISOString(), updated_by_name: `${pushedBy.name} (${pushedBy.role})` };
  for (const ncc of list) {
    const { data: up, error: upErr } = await client.from('suppliers').upsert({
      legacy_id: ncc.id, name: ncc.name, sectors: ncc.sectors,
      location: ncc.location, note: ncc.note ?? '',
      created_by_name: ncc.createdBy, created_at: ncc.createdAt, ...stamp,
    }, { onConflict: 'legacy_id' }).select('id').single();
    if (upErr) throw new Error('sbPushNcc upsert: ' + upErr.message);
    await replaceChildren(client, 'supplier_contacts', 'supplier_id', up!.id, ncc.contacts.map((ct, i) => ({
      supplier_id: up!.id, name: ct.name, phone: ct.phone, email: ct.email, position: ct.position, sort_order: i,
    })));
  }
  // Full-overwrite: delete suppliers removed from the list using safe fetch-then-delete pattern.
  const keepIds = list.map((n) => n.id);
  if (keepIds.length > 0) {
    const { data: existing, error: fetchErr } = await client.from('suppliers').select('legacy_id');
    if (fetchErr) throw new Error('sbPushNcc fetch: ' + fetchErr.message);
    const toDelete = (existing ?? [])
      .map((r) => r.legacy_id as string)
      .filter((lid) => lid && !keepIds.includes(lid));
    if (toDelete.length > 0) {
      const del = await client.from('suppliers').delete().in('legacy_id', toDelete);
      if (del.error) throw new Error('sbPushNcc delete: ' + del.error.message);
    }
  } else {
    // Empty push = wipe all (full-overwrite parity with fbPushNcc).
    const del = await client.from('suppliers').delete().not('legacy_id', 'is', null);
    if (del.error) throw new Error('sbPushNcc delete all: ' + del.error.message);
  }
}

// ── visa_products ──

async function assembleVisaProducts(client: SupabaseClient): Promise<VisaProductsDoc | null> {
  const { data: products, error: pe } = await client
    .from('visa_products')
    .select('id, legacy_id, country, visa_type, validity, location, markup_type, markup_value, markup_cur, note, active')
    .order('country');
  if (pe) throw new Error('assembleVisaProducts products: ' + pe.message);

  if (!products || products.length === 0) {
    const { data: meta } = await client.from('visa_products_meta').select('rates, versions, updated_at, updated_by').maybeSingle();
    if (!meta) return null;
    return {
      products: [],
      rates: (meta.rates as Record<string, number>) ?? {},
      versions: (meta.versions as VisaProductVersion[]) ?? [],
      updatedAt: meta.updated_at ? new Date(meta.updated_at as string).toISOString() : undefined,
      updatedBy: (meta.updated_by as string) ?? undefined,
    };
  }

  const ids = products.map((r) => r.id as string);
  const { data: fees, error: fe } = await client
    .from('visa_product_fees')
    .select('product_id, legacy_fee_id, name, amount, cur, per_pax, sort_order')
    .in('product_id', ids)
    .order('sort_order');
  if (fe) throw new Error('assembleVisaProducts fees: ' + fe.message);

  const feesByProduct = new Map<string, typeof fees>();
  for (const f of fees ?? []) {
    const arr = feesByProduct.get(f.product_id as string) ?? [];
    arr.push(f);
    feesByProduct.set(f.product_id as string, arr);
  }

  const { data: meta } = await client.from('visa_products_meta').select('rates, versions, updated_at, updated_by').maybeSingle();

  const assembled: VisaProduct[] = products.map((r) => ({
    id: (r.legacy_id as string) ?? (r.id as string),
    country: r.country as string,
    visaType: r.visa_type as string,
    validity: (r.validity as string) ?? '',
    location: (r.location as string) ?? '',
    markupType: r.markup_type as VisaProduct['markupType'],
    markupValue: r.markup_value as number,
    markupCur: r.markup_cur as string,
    note: (r.note as string) ?? '',
    active: r.active as boolean,
    fees: (feesByProduct.get(r.id as string) ?? []).map((f) => ({
      // visa_product_fees has no legacy_id for fees — id regenerates on each save (accepted)
      id: (f.legacy_fee_id as string) ?? '',
      name: f.name as string,
      amount: f.amount as number,
      cur: f.cur as string,
      perPax: f.per_pax as boolean,
    })),
  }));

  return {
    products: assembled,
    rates: (meta?.rates as Record<string, number>) ?? {},
    versions: (meta?.versions as VisaProductVersion[]) ?? [],
    updatedAt: meta?.updated_at ? new Date(meta.updated_at as string).toISOString() : undefined,
    updatedBy: (meta?.updated_by as string) ?? undefined,
  };
}

export function sbSubscribeVisaProducts(
  cb: (doc: VisaProductsDoc | null) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(client, 'visa_products', assembleVisaProducts, cb);
}

export async function sbSaveVisaProducts(
  data: { products: VisaProduct[]; rates: Record<string, number> },
  savedBy: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const now = new Date().toISOString();

  // Read current meta to build next version snapshot (mirrors firebase.ts:1078-1085)
  const { data: prevMeta } = await client.from('visa_products_meta').select('versions').maybeSingle();
  const prevVersions: VisaProductVersion[] = (prevMeta?.versions as VisaProductVersion[]) ?? [];
  const versionNo = (prevVersions[0]?.versionNo ?? 0) + 1;
  const versions: VisaProductVersion[] = [
    { versionNo, savedAt: now, savedBy: savedBy || '', products: data.products },
    ...prevVersions,
  ].slice(0, 20);

  // Full-overwrite: delete all existing products (fees cascade-delete), then insert new set
  const { error: delErr } = await client.from('visa_products').delete().not('id', 'is', null);
  if (delErr) throw new Error('sbSaveVisaProducts delete: ' + delErr.message);

  for (const p of data.products) {
    const { data: row, error: insErr } = await client
      .from('visa_products')
      .insert({
        legacy_id: p.id,
        country: p.country,
        visa_type: p.visaType,
        validity: p.validity ?? null,
        location: p.location ?? null,
        markup_type: p.markupType,
        markup_value: p.markupValue,
        markup_cur: p.markupCur,
        note: p.note ?? '',
        active: p.active,
      })
      .select('id')
      .single();
    if (insErr) throw new Error('sbSaveVisaProducts insert product: ' + insErr.message);
    if (p.fees.length) {
      await replaceChildren(client, 'visa_product_fees', 'product_id', row!.id, p.fees.map((f, i) => ({
        product_id: row!.id,
        legacy_fee_id: f.id,
        name: f.name,
        amount: f.amount,
        cur: f.cur,
        per_pax: f.perPax,
        sort_order: i,
      })));
    }
  }

  // Upsert visa_products_meta singleton
  const { error: metaErr } = await client.from('visa_products_meta').upsert({
    one_row: true,
    rates: data.rates,
    versions,
    updated_at: now,
    updated_by: savedBy || '',
  }, { onConflict: 'one_row' });
  if (metaErr) throw new Error('sbSaveVisaProducts meta upsert: ' + metaErr.message);
}

// ── visa_procedures ──────────────────────────────────────────────────────────

export function sbSubscribeVisaProcs(
  cb: (list: VisaProcIndexEntry[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(client, 'visa_procedures', async (cl) => {
    const { data, error } = await cl
      .from('visa_procedures')
      .select('*')
      .order('updated_at', { ascending: false, nullsFirst: false });
    if (error) throw new Error('sbSubscribeVisaProcs: ' + error.message);
    return (data ?? []).map((r): VisaProcIndexEntry => ({
      id: (r.legacy_id as string) ?? '',
      code: (r.code as string) ?? '',
      title: (r.title as string) ?? '',
      country: (r.country as string) ?? '',
      visaType: (r.visa_type as string) ?? undefined,
      isTemplate: (r.is_template as boolean) ?? false,
      linkedQuoteName: (r.linked_quote_name as string) ?? '',
      collaborators: (r.collaborator_usernames as string[]) ?? [],
      createdByUsername: (r.created_by_username as string) ?? '',
      createdByName: (r.created_by_name as string) ?? '',
      createdAt: (r.created_at as string) ?? undefined,
      updatedAt: (r.updated_at as string) ?? '',
      updatedBy: (r.updated_by_name as string) ?? '',
    }));
  }, cb);
}

export async function sbGetVisaProc(
  id: string,
  client: SupabaseClient = sb,
): Promise<VisaProcDoc | null> {
  const { data, error } = await client
    .from('visa_procedures')
    .select('*')
    .eq('legacy_id', id)
    .maybeSingle();
  if (error) throw new Error('sbGetVisaProc: ' + error.message);
  if (!data) return null;
  const attachments = await loadAttachments(client, 'visa_proc', id);
  return {
    id: (data.legacy_id as string) ?? id,
    code: (data.code as string) ?? '',
    title: (data.title as string) ?? '',
    country: (data.country as string) ?? '',
    visaType: (data.visa_type as string) ?? undefined,
    isTemplate: (data.is_template as boolean) ?? false,
    linkedQuoteId: (data.linked_quote_id as string) ?? null,
    linkedQuoteName: (data.linked_quote_name as string) ?? '',
    createdByUsername: (data.created_by_username as string) ?? '',
    createdByName: (data.created_by_name as string) ?? '',
    collaborators: (data.collaborator_usernames as string[]) ?? [],
    sections: (data.sections as VisaProcDoc['sections']) ?? [],
    versions: (data.versions as VisaProcDoc['versions']) ?? [],
    attachments,
    createdAt: (data.created_at as string) ?? undefined,
    updatedAt: (data.updated_at as string) ?? undefined,
    updatedBy: (data.updated_by_name as string) ?? undefined,
  };
}

export async function sbSaveVisaProc(
  d: VisaProcDoc,
  savedBy: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const now = new Date().toISOString();
  const idMap = await usernamesToIds(client, d.collaborators ?? []);
  const collaboratorIds = (d.collaborators ?? []).map((u) => idMap.get(u)).filter(Boolean) as string[];

  const { error } = await client.from('visa_procedures').upsert({
    legacy_id: d.id,
    code: d.code ?? '',
    title: d.title ?? '',
    country: d.country ?? '',
    visa_type: d.visaType ?? null,
    is_template: d.isTemplate ?? false,
    sections: d.sections ?? [],
    versions: d.versions ?? [],
    collaborators: collaboratorIds,
    collaborator_usernames: d.collaborators ?? [],
    linked_quote_id: d.linkedQuoteId ?? null,
    linked_quote_name: d.linkedQuoteName ?? '',
    created_by_username: d.createdByUsername ?? '',
    created_by_name: d.createdByName ?? '',
    created_at: d.createdAt,
    updated_at: now,
    updated_by_name: savedBy || '',
  }, { onConflict: 'legacy_id' });
  if (error) throw new Error('sbSaveVisaProc: ' + error.message);

  await saveAttachments(client, 'visa_proc', d.id, d.attachments ?? []);
}

export async function sbDeleteVisaProc(
  id: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error: attErr } = await client
    .from('attachments')
    .delete()
    .eq('parent_type', 'visa_proc')
    .eq('parent_id', id);
  if (attErr) throw new Error('sbDeleteVisaProc attachments: ' + attErr.message);
  const { error } = await client.from('visa_procedures').delete().eq('legacy_id', id);
  if (error) throw new Error('sbDeleteVisaProc: ' + error.message);
}

// ── visa_projects ─────────────────────────────────────────────────────────────

async function assembleVisaProjects(client: SupabaseClient): Promise<VisaProjectDoc[]> {
  const { data, error } = await client
    .from('visa_projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error('assembleVisaProjects: ' + error.message);
  const rows = data ?? [];
  if (!rows.length) return [];
  const legacyIds = rows.map((r) => (r.legacy_id as string) ?? (r.id as string));
  const attMap = await loadAttachmentsForParents(client, 'visa_project', legacyIds);
  return rows.map((r): VisaProjectDoc => {
    const legacyId = (r.legacy_id as string) ?? (r.id as string);
    return {
      id: legacyId,
      code: (r.code as string) ?? '',
      name: (r.name as string) ?? '',
      country: (r.country as string) ?? '',
      status: r.status as VisaProjectDoc['status'],
      mainStaff: (r.main_staff_usernames as string[]) ?? [],
      supportStaff: (r.support_staff_usernames as string[]) ?? [],
      documentsSummary: (r.documents_summary as string) ?? '',
      linkedQuoteId: (r.linked_quote_id as string) ?? null,
      linkedQuoteName: (r.linked_quote_name as string) ?? '',
      linkedProcIds: (r.linked_proc_ids as string[]) ?? [],
      attachments: attMap.get(legacyId) ?? [],
      applyCount: (r.apply_count as number) ?? 0,
      passedCount: (r.passed_count as number) ?? 0,
      failedCount: (r.failed_count as number) ?? 0,
      haveVisaCount: (r.have_visa_count as number) ?? 0,
      pendingCount: (r.pending_count as number) ?? 0,
      startDate: (r.start_date as string) ?? null,
      departureDate: (r.departure_date as string) ?? null,
      endDate: (r.end_date as string) ?? null,
      milestones: (r.milestones as VisaProjectDoc['milestones']) ?? [],
      applicants: (r.applicants as VisaProjectDoc['applicants']) ?? [],
      collaborators: (r.collaborator_usernames as string[]) ?? [],
      createdByUsername: (r.created_by_username as string) ?? '',
      createdByName: (r.created_by_name as string) ?? '',
      createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : undefined,
      updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : undefined,
      updatedBy: (r.updated_by_name as string) ?? undefined,
    };
  });
}

export function sbSubscribeVisaProjects(
  cb: (list: VisaProjectDoc[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(client, 'visa_projects', assembleVisaProjects, cb);
}

export async function sbPushVisaProjects(
  list: VisaProjectDoc[],
  pushedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  const now = new Date().toISOString();

  for (const p of list) {
    const allUsernames = [...(p.mainStaff ?? []), ...(p.supportStaff ?? []), ...(p.collaborators ?? [])];
    const idMap = await usernamesToIds(client, allUsernames);
    const toIds = (names: string[]) => names.map((u) => idMap.get(u)).filter(Boolean) as string[];

    const { error } = await client.from('visa_projects').upsert({
      legacy_id: p.id,
      code: p.code ?? '',
      name: p.name ?? '',
      country: p.country ?? '',
      status: p.status ?? 'planning',
      main_staff: toIds(p.mainStaff ?? []),
      main_staff_usernames: p.mainStaff ?? [],
      support_staff: toIds(p.supportStaff ?? []),
      support_staff_usernames: p.supportStaff ?? [],
      documents_summary: p.documentsSummary ?? '',
      linked_quote_id: p.linkedQuoteId ?? null,
      linked_quote_name: p.linkedQuoteName ?? '',
      linked_proc_ids: p.linkedProcIds ?? [],
      apply_count: p.applyCount ?? 0,
      passed_count: p.passedCount ?? 0,
      failed_count: p.failedCount ?? 0,
      have_visa_count: p.haveVisaCount ?? 0,
      pending_count: p.pendingCount ?? 0,
      start_date: p.startDate ?? null,
      departure_date: p.departureDate ?? null,
      end_date: p.endDate ?? null,
      milestones: p.milestones ?? [],
      applicants: p.applicants ?? [],
      collaborators: toIds(p.collaborators ?? []),
      collaborator_usernames: p.collaborators ?? [],
      created_by_username: p.createdByUsername ?? '',
      created_by_name: p.createdByName ?? '',
      created_at: p.createdAt,
      updated_at: now,
      updated_by_name: `${pushedBy.name} (${pushedBy.role})`,
    }, { onConflict: 'legacy_id' });
    if (error) throw new Error('sbPushVisaProjects upsert: ' + error.message);

    await saveAttachments(client, 'visa_project', p.id, p.attachments ?? []);
  }

  // Full-overwrite: delete projects removed from the list (safe fetch-then-delete).
  const keepIds = list.map((p) => p.id);
  if (keepIds.length > 0) {
    const { data: existing, error: fetchErr } = await client.from('visa_projects').select('legacy_id');
    if (fetchErr) throw new Error('sbPushVisaProjects fetch: ' + fetchErr.message);
    const toDelete = (existing ?? [])
      .map((r) => r.legacy_id as string)
      .filter((lid) => lid && !keepIds.includes(lid));
    if (toDelete.length > 0) {
      const del = await client.from('visa_projects').delete().in('legacy_id', toDelete);
      if (del.error) throw new Error('sbPushVisaProjects delete stale: ' + del.error.message);
    }
  } else {
    // Empty push = wipe all (full-overwrite parity with fbPushVisaProjects).
    const del = await client.from('visa_projects').delete().not('legacy_id', 'is', null);
    if (del.error) throw new Error('sbPushVisaProjects delete all: ' + del.error.message);
  }
}

// ── Itineraries ───────────────────────────────────────────────────────────────

const rowToDay = (r: Record<string, unknown>): Day => ({
  id: r.id as string,
  dayNum: r.day_num as number,
  date: (r.date as string) ?? '',
  title: (r.title as string) ?? '',
  meals: r.meals as Day['meals'],
  mealNote: (r.meal_note as string) ?? '',
  segments: r.segments as Day['segments'],
});

const rowToFlight = (r: Record<string, unknown>): Flight => ({
  id: (r.legacy_flight_id as string) ?? (r.id as string),
  group: (r.group_text as string) ?? '',
  leg: (r.leg as string) ?? '',
  flightNo: (r.flight_no as string) ?? '',
  dep: (r.dep as string) ?? '',
  arr: (r.arr as string) ?? '',
  depAirport: (r.dep_airport as string) ?? undefined,
  depTime: (r.dep_time as string) ?? undefined,
  arrAirport: (r.arr_airport as string) ?? undefined,
  arrTime: (r.arr_time as string) ?? undefined,
  depDayOffset: (r.dep_day_offset as number) ?? undefined,
  arrDayOffset: (r.arr_day_offset as number) ?? undefined,
});

const rowToItineraryIndex = (r: Record<string, unknown>): ItineraryIndexEntry => ({
  id: (r.legacy_id as string) ?? (r.id as string),
  code: (r.code as string) ?? '',
  title: (r.title as string) ?? '',
  destination: (r.destination as string) ?? '',
  days: r.days as number,
  nights: r.nights as number,
  linkedQuoteId: (r.linked_quote_id as string) ?? null,
  linkedQuoteName: (r.linked_quote_name as string) ?? '',
  createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : undefined,
  createdBy: (r.created_by_name as string) ?? undefined,
  updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : '',
  updatedBy: (r.updated_by_name as string) ?? '',
});

/**
 * Subscribe to the itinerary metadata index (lightweight list).
 * Mirrors fbSubscribeItineraries (firebase.ts:960-965).
 */
export function sbSubscribeItineraries(
  cb: (list: ItineraryIndexEntry[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(
    client,
    'itineraries',
    async (cl) => {
      const { data, error } = await cl
        .from('itineraries')
        .select('id, legacy_id, code, title, destination, days, nights, linked_quote_id, linked_quote_name, created_at, created_by_name, updated_at, updated_by_name')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToItineraryIndex);
    },
    cb,
  );
}

/**
 * One-time fetch of a full itinerary, reassembling schedule + flights from child tables.
 * Mirrors fbGetItinerary (firebase.ts:933-935).
 */
export async function sbGetItinerary(
  id: string,
  client: SupabaseClient = sb,
): Promise<Itinerary | null> {
  const { data: row, error } = await client
    .from('itineraries')
    .select('*')
    .eq('legacy_id', id)
    .maybeSingle();
  if (error) throw new Error('sbGetItinerary: ' + error.message);
  if (!row) return null;

  const { data: days, error: dErr } = await client
    .from('itinerary_days')
    .select('*')
    .eq('itinerary_id', row.id as string)
    .order('sort_order', { ascending: true });
  if (dErr) throw new Error('sbGetItinerary days: ' + dErr.message);

  const { data: flights, error: fErr } = await client
    .from('itinerary_flights')
    .select('*')
    .eq('itinerary_id', row.id as string)
    .order('sort_order', { ascending: true });
  if (fErr) throw new Error('sbGetItinerary flights: ' + fErr.message);

  return {
    id: (row.legacy_id as string) ?? (row.id as string),
    code: (row.code as string) ?? undefined,
    type: row.type as Itinerary['type'],
    continent: (row.continent as string) ?? '',
    country: (row.country as string) ?? '',
    seq: (row.seq as number) ?? 0,
    title: (row.title as string) ?? '',
    destination: (row.destination as string) ?? '',
    days: row.days as number,
    nights: row.nights as number,
    intro: (row.intro as string) ?? '',
    includes: (row.includes as string[]) ?? [],
    excludes: (row.excludes as string[]) ?? [],
    exec: (row.exec as Itinerary['exec']) ?? undefined,
    linkedQuoteId: (row.linked_quote_id as string) ?? null,
    linkedQuoteName: (row.linked_quote_name as string) ?? '',
    schedule: (days ?? []).map(rowToDay),
    flights: (flights ?? []).map(rowToFlight),
    createdAt: row.created_at ? new Date(row.created_at as string).toISOString() : undefined,
    createdBy: (row.created_by_name as string) ?? undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : undefined,
    updatedBy: (row.updated_by_name as string) ?? undefined,
  };
}

/**
 * Save itinerary: upsert parent by legacy_id, replace days and flights children.
 * Mirrors fbSaveItinerary (firebase.ts:905-926).
 */
export async function sbSaveItinerary(
  itin: Itinerary,
  savedBy: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const now = new Date().toISOString();
  const { data: up, error: upErr } = await client
    .from('itineraries')
    .upsert(
      {
        legacy_id: itin.id,
        code: itin.code ?? null,
        type: itin.type,
        continent: itin.continent,
        country: itin.country,
        seq: itin.seq ?? 0,
        title: itin.title,
        destination: itin.destination ?? null,
        days: itin.days,
        nights: itin.nights,
        intro: itin.intro ?? '',
        includes: itin.includes ?? [],
        excludes: itin.excludes ?? [],
        exec: itin.exec ?? null,
        linked_quote_id: itin.linkedQuoteId ?? null,
        linked_quote_name: itin.linkedQuoteName ?? '',
        created_by_name: itin.createdBy ?? savedBy,
        created_at: itin.createdAt,
        updated_at: now,
        updated_by_name: savedBy,
      },
      { onConflict: 'legacy_id' },
    )
    .select('id')
    .single();
  if (upErr) throw new Error('sbSaveItinerary upsert: ' + upErr.message);

  const parentUuid = up!.id as string;

  await replaceChildren(
    client,
    'itinerary_days',
    'itinerary_id',
    parentUuid,
    itin.schedule.map((day, i) => ({
      itinerary_id: parentUuid,
      day_num: day.dayNum,
      date: day.date ?? null,
      title: day.title ?? '',
      meals: day.meals,
      meal_note: day.mealNote ?? '',
      segments: day.segments,
      sort_order: i,
    })),
  );

  await replaceChildren(
    client,
    'itinerary_flights',
    'itinerary_id',
    parentUuid,
    itin.flights.map((f, i) => ({
      itinerary_id: parentUuid,
      legacy_flight_id: f.id,
      group_text: f.group ?? '',
      leg: f.leg ?? '',
      flight_no: f.flightNo ?? '',
      dep: f.dep ?? '',
      arr: f.arr ?? '',
      dep_airport: f.depAirport ?? null,
      dep_time: f.depTime ?? null,
      arr_airport: f.arrAirport ?? null,
      arr_time: f.arrTime ?? null,
      dep_day_offset: f.depDayOffset ?? null,
      arr_day_offset: f.arrDayOffset ?? null,
      sort_order: i,
    })),
  );
}

/**
 * Delete itinerary by legacy_id. Cascade rules drop days + flights automatically.
 * Mirrors fbDeleteItinerary (firebase.ts:943-953).
 */
export async function sbDeleteItinerary(
  id: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('itineraries').delete().eq('legacy_id', id);
  if (error) throw new Error('sbDeleteItinerary: ' + error.message);
}

// ─── Restaurants + Menus ─────────────────────────────────────────────────────

import type { Restaurant, RestaurantMenu, Menu, MenuDay, MenuIndexEntry } from '@/types/menu';

// ── row assemblers ──

const rowToRestaurantMenu = (r: Record<string, unknown>): RestaurantMenu => ({
  id: (r.legacy_menu_id as string) ?? (r.id as string),
  name: (r.name as string) ?? '',
  dishes: (r.dishes as string) ?? '',
  price: (r.price as number) ?? 0,
  cur: (r.cur as string) ?? 'VND',
  rating: (r.rating as number) ?? 0,
  review: (r.review as string) ?? '',
});

const rowToMenuIndex = (r: Record<string, unknown>): MenuIndexEntry => ({
  id: (r.legacy_id as string) ?? (r.id as string),
  code: (r.code as string) ?? '',
  title: (r.title as string) ?? '',
  destination: (r.destination as string) ?? '',
  days: r.days as number,
  linkedItineraryId: (r.linked_itinerary_id as string) ?? null,
  linkedItineraryName: (r.linked_itinerary_name as string) ?? '',
  linkedQuoteId: (r.linked_quote_id as string) ?? null,
  linkedQuoteName: (r.linked_quote_name as string) ?? '',
  createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : undefined,
  createdBy: (r.created_by_name as string) ?? undefined,
  updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : '',
  updatedBy: (r.updated_by_name as string) ?? '',
});

const rowToMenuDay = (r: Record<string, unknown>): MenuDay => ({
  id: (r.id as string),
  dayNum: r.day_num as number,
  date: (r.date as string) ?? '',
  city: (r.city as string) ?? '',
  meals: r.meals as MenuDay['meals'],
});

// ── restaurants ──

/**
 * Subscribe to the shared restaurant library (parent + restaurant_menus children).
 * Mirrors fbSubscribeRestaurants (firebase.ts:976-979).
 */
export function sbSubscribeRestaurants(
  cb: (list: Restaurant[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(
    client,
    'restaurants',
    async (cl) => {
      const { data: rows, error } = await cl
        .from('restaurants')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;

      const ids = (rows ?? []).map((r) => r.id as string);
      const { data: rmRows, error: rmErr } = ids.length
        ? await cl
            .from('restaurant_menus')
            .select('*')
            .in('restaurant_id', ids)
            .order('sort_order', { ascending: true })
        : { data: [] as Record<string, unknown>[], error: null };
      if (rmErr) throw rmErr;

      const byParent = new Map<string, RestaurantMenu[]>();
      for (const rm of rmRows ?? []) {
        const arr = byParent.get(rm.restaurant_id as string) ?? [];
        arr.push(rowToRestaurantMenu(rm as Record<string, unknown>));
        byParent.set(rm.restaurant_id as string, arr);
      }

      return (rows ?? []).map((r) => ({
        id: (r.legacy_id as string) ?? (r.id as string),
        name: (r.name as string) ?? '',
        continent: (r.continent as string) ?? '',
        country: (r.country as string) ?? '',
        city: (r.city as string) ?? '',
        website: (r.website as string) ?? undefined,
        menuLink: (r.menu_link as string) ?? undefined,
        contact: (r.contact as string) ?? undefined,
        note: (r.note as string) ?? undefined,
        rating: (r.rating as number) ?? 0,
        review: (r.review as string) ?? '',
        menus: byParent.get(r.id as string) ?? [],
      })) as Restaurant[];
    },
    cb,
  );
}

/**
 * Full-overwrite push of the restaurant library.
 * Mirrors fbSaveRestaurants (firebase.ts:986-992).
 */
export async function sbSaveRestaurants(
  list: Restaurant[],
  savedBy: string,
  client: SupabaseClient = sb,
): Promise<void> {
  // Safe full-overwrite delete: fetch existing legacy_ids, then delete those not in new list
  const keepIds = list.map((r) => r.id);
  const { data: existing, error: fetchErr } = await client
    .from('restaurants')
    .select('id, legacy_id');
  if (fetchErr) throw new Error('sbSaveRestaurants fetch: ' + fetchErr.message);

  const toDelete = (existing ?? [])
    .filter((row) => !keepIds.includes(row.legacy_id as string))
    .map((row) => row.id as string);

  if (toDelete.length > 0) {
    const { error: delErr } = await client
      .from('restaurants')
      .delete()
      .in('id', toDelete);
    if (delErr) throw new Error('sbSaveRestaurants delete: ' + delErr.message);
  }

  for (const rest of list) {
    const { data: up, error: upErr } = await client
      .from('restaurants')
      .upsert(
        {
          legacy_id: rest.id,
          name: rest.name,
          continent: rest.continent ?? null,
          country: rest.country ?? null,
          city: rest.city ?? null,
          website: rest.website ?? null,
          menu_link: rest.menuLink ?? null,
          contact: rest.contact ?? null,
          note: rest.note ?? null,
          rating: rest.rating ?? 0,
          review: rest.review ?? '',
        },
        { onConflict: 'legacy_id' },
      )
      .select('id')
      .single();
    if (upErr) throw new Error('sbSaveRestaurants upsert: ' + upErr.message);

    await replaceChildren(
      client,
      'restaurant_menus',
      'restaurant_id',
      up!.id as string,
      rest.menus.map((m, i) => ({
        restaurant_id: up!.id,
        legacy_menu_id: m.id,
        name: m.name,
        dishes: m.dishes ?? null,
        price: m.price ?? 0,
        cur: m.cur ?? 'VND',
        rating: m.rating ?? 0,
        review: m.review ?? null,
        sort_order: i,
      })),
    );
  }

  void savedBy; // unused but kept for API symmetry
}

// ── menus ──

/**
 * Subscribe to the menu metadata index (lightweight list).
 * Mirrors fbSubscribeMenus (firebase.ts:1046-1049).
 */
export function sbSubscribeMenus(
  cb: (list: MenuIndexEntry[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(
    client,
    'menus',
    async (cl) => {
      const { data, error } = await cl
        .from('menus')
        .select(
          'id, legacy_id, code, title, destination, days, linked_itinerary_id, linked_itinerary_name, linked_quote_id, linked_quote_name, created_at, created_by_name, updated_at, updated_by_name',
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToMenuIndex);
    },
    cb,
  );
}

/**
 * One-time fetch of a full menu, reassembling schedule from menu_days.
 * Mirrors fbGetMenu (firebase.ts:1028-1030).
 */
export async function sbGetMenu(
  id: string,
  client: SupabaseClient = sb,
): Promise<Menu | null> {
  const { data: row, error } = await client
    .from('menus')
    .select('*')
    .eq('legacy_id', id)
    .maybeSingle();
  if (error) throw new Error('sbGetMenu: ' + error.message);
  if (!row) return null;

  const { data: days, error: dErr } = await client
    .from('menu_days')
    .select('*')
    .eq('menu_id', row.id as string)
    .order('sort_order', { ascending: true });
  if (dErr) throw new Error('sbGetMenu days: ' + dErr.message);

  return {
    id: (row.legacy_id as string) ?? (row.id as string),
    code: (row.code as string) ?? undefined,
    type: row.type as Menu['type'],
    continent: (row.continent as string) ?? '',
    country: (row.country as string) ?? '',
    seq: (row.seq as number) ?? 0,
    title: (row.title as string) ?? '',
    destination: (row.destination as string) ?? '',
    days: row.days as number,
    linkedItineraryId: (row.linked_itinerary_id as string) ?? null,
    linkedItineraryName: (row.linked_itinerary_name as string) ?? '',
    linkedQuoteId: (row.linked_quote_id as string) ?? null,
    linkedQuoteName: (row.linked_quote_name as string) ?? '',
    schedule: (days ?? []).map(rowToMenuDay),
    createdAt: row.created_at ? new Date(row.created_at as string).toISOString() : undefined,
    createdBy: (row.created_by_name as string) ?? undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : undefined,
    updatedBy: (row.updated_by_name as string) ?? undefined,
  };
}

/**
 * Save menu: upsert parent by legacy_id, replace menu_days children.
 * Preserves createdAt on re-save. Mirrors fbSaveMenu (firebase.ts:1003-1025).
 */
export async function sbSaveMenu(
  m: Menu,
  savedBy: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const now = new Date().toISOString();
  const { data: up, error: upErr } = await client
    .from('menus')
    .upsert(
      {
        legacy_id: m.id,
        code: m.code ?? null,
        type: m.type,
        continent: m.continent,
        country: m.country,
        seq: m.seq ?? 0,
        title: m.title,
        destination: m.destination ?? null,
        days: m.days,
        linked_itinerary_id: m.linkedItineraryId ?? null,
        linked_itinerary_name: m.linkedItineraryName ?? '',
        linked_quote_id: m.linkedQuoteId ?? null,
        linked_quote_name: m.linkedQuoteName ?? '',
        created_at: m.createdAt ?? now,
        created_by_name: m.createdBy ?? savedBy,
        updated_at: now,
        updated_by_name: savedBy,
      },
      { onConflict: 'legacy_id' },
    )
    .select('id')
    .single();
  if (upErr) throw new Error('sbSaveMenu upsert: ' + upErr.message);

  const parentUuid = up!.id as string;

  await replaceChildren(
    client,
    'menu_days',
    'menu_id',
    parentUuid,
    m.schedule.map((day, i) => ({
      menu_id: parentUuid,
      day_num: day.dayNum,
      date: day.date ?? null,
      city: day.city ?? null,
      meals: day.meals,
      sort_order: i,
    })),
  );
}

/**
 * Delete menu by legacy_id. Cascade drops menu_days automatically.
 * Mirrors fbDeleteMenu (firebase.ts:1033-1043).
 */
export async function sbDeleteMenu(
  id: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('menus').delete().eq('legacy_id', id);
  if (error) throw new Error('sbDeleteMenu: ' + error.message);
}

// ── Notifications + Threads ───────────────────────────────────────────────────

import type { Notification, NotifThread, NotifComment, ActivityStatus } from '@/types';
import type { Unsubscribe } from './supabase/helpers';

// ── helpers ──

/** Resolve username → user_id; returns null if not found. */
async function resolveUserId(client: SupabaseClient, username: string): Promise<string | null> {
  const map = await usernamesToIds(client, [username]);
  return map.get(username) ?? null;
}

const rowToNotif = (r: Record<string, unknown>): Notification => ({
  id: (r.legacy_id as string) ?? (r.id as string),
  type: r.type as Notification['type'],
  title: r.title as string,
  message: r.message as string,
  createdBy: (r.created_by_name as string) ?? '',
  createdAt: r.created_at as string,
  read: (r.read as boolean) ?? false,
  link: (r.link as Notification['link']) ?? undefined,
  threadId: (r.thread_id as string) ?? undefined,
  data: (r.data as Record<string, unknown>) ?? undefined,
});

// ── Notifications ──

/**
 * Send a notification to a target user. Resolves username → user_id; inserts
 * one row; caps the user's notification list at 100 by deleting oldest excess.
 * Mirrors fbSendNotification (firebase.ts:598-615).
 */
export async function sbSendNotification(
  targetUsername: string,
  notif: Omit<Notification, 'id' | 'read' | 'createdAt'>,
  client: SupabaseClient = sb,
): Promise<void> {
  const userId = await resolveUserId(client, targetUsername);
  if (!userId) {
    console.warn(`sbSendNotification: no profile for "${targetUsername}", skipped`);
    return;
  }
  const legacyId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const { error } = await client.from('notifications').insert({
    legacy_id: legacyId,
    user_id: userId,
    type: notif.type,
    title: notif.title,
    message: notif.message,
    created_by_name: notif.createdBy,
    read: false,
    link: notif.link ?? null,
    thread_id: notif.threadId ?? null,
    data: notif.data ?? null,
  });
  if (error) throw new Error('sbSendNotification: ' + error.message);
  // cap at 100: delete oldest beyond limit
  const { data: all } = await client.from('notifications')
    .select('id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  const excess = (all ?? []).slice(100);
  if (excess.length) {
    await client.from('notifications').delete().in('id', excess.map((r) => r.id as string));
  }
}

/**
 * Subscribe to a user's notifications (newest-first).
 * Mirrors fbSubscribeNotifications (firebase.ts:621-628).
 */
export function sbSubscribeNotifications(
  username: string,
  cb: (list: Notification[]) => void,
  client: SupabaseClient = sb,
): Unsubscribe {
  return subscribeTable(client, 'notifications', async (cl) => {
    const map = await usernamesToIds(cl, [username]);
    const userId = map.get(username);
    if (!userId) return [];
    const { data, error } = await cl.from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToNotif);
  }, cb);
}

/**
 * Full-overwrite push of a user's notification list (used for mark-read).
 * Mirrors fbPushNotifications (firebase.ts:633-638).
 */
export async function sbPushNotifications(
  username: string,
  notifications: Notification[],
  client: SupabaseClient = sb,
): Promise<void> {
  const userId = await resolveUserId(client, username);
  if (!userId) throw new Error(`sbPushNotifications: no profile for "${username}"`);
  // delete all existing
  const del = await client.from('notifications').delete().eq('user_id', userId);
  if (del.error) throw new Error('sbPushNotifications delete: ' + del.error.message);
  if (!notifications.length) return;
  const rows = notifications.map((n) => ({
    legacy_id: n.id,
    user_id: userId,
    type: n.type,
    title: n.title,
    message: n.message,
    created_by_name: n.createdBy,
    created_at: n.createdAt,
    read: n.read,
    link: n.link ?? null,
    thread_id: n.threadId ?? null,
    data: n.data ?? null,
  }));
  const ins = await client.from('notifications').insert(rows);
  if (ins.error) throw new Error('sbPushNotifications insert: ' + ins.error.message);
}

/**
 * Send the same notification to multiple recipients (deduplicated).
 * Mirrors fbSendNotificationMany (firebase.ts:763-768).
 */
export async function sbSendNotificationMany(
  targets: string[],
  notif: Omit<Notification, 'id' | 'read' | 'createdAt'>,
  client: SupabaseClient = sb,
): Promise<void> {
  await Promise.all(Array.from(new Set(targets)).map((u) => sbSendNotification(u, notif, client)));
}

// ── Notification threads ──

/**
 * Create the thread if missing; else merge in newly-added members and update link/title.
 * Mirrors fbEnsureNotifThread (firebase.ts:719-730).
 */
export async function sbEnsureNotifThread(
  thread: NotifThread,
  client: SupabaseClient = sb,
): Promise<void> {
  // upsert the thread row (text PK — on conflict, keep existing title/created_at)
  const { data: existing } = await client.from('notification_threads')
    .select('id, title, link')
    .eq('id', thread.id)
    .maybeSingle();

  if (existing) {
    // merge: preserve existing link when caller doesn't supply one; never overwrite title
    const newLink = thread.link ?? (existing.link as string | null | undefined) ?? null;
    const linkChanged = newLink !== (existing.link ?? null);
    if (linkChanged) {
      await client.from('notification_threads')
        .update({ link: newLink })
        .eq('id', thread.id);
    }
  } else {
    const creatorMap = await usernamesToIds(client, [thread.createdBy]);
    const { error } = await client.from('notification_threads').insert({
      id: thread.id,
      title: thread.title,
      link: thread.link ?? null,
      act_type: thread.actType ?? null,
      status: thread.status ?? null,
      created_by: creatorMap.get(thread.createdBy) ?? null,
      created_by_name: thread.createdBy,
      created_at: thread.createdAt,
      data: thread.data ?? null,
    });
    if (error) throw new Error('sbEnsureNotifThread insert: ' + error.message);
  }
  // merge members (upsert by PK (thread_id, username))
  if (thread.members.length) {
    const memberMap = await usernamesToIds(client, thread.members);
    const memberRows = thread.members.map((uname) => ({
      thread_id: thread.id,
      user_id: memberMap.get(uname) ?? null,
      username: uname,
    }));
    const up = await client.from('notification_thread_members')
      .upsert(memberRows, { onConflict: 'thread_id,username' });
    if (up.error) throw new Error('sbEnsureNotifThread members: ' + up.error.message);
  }
}

const assembleThread = async (cl: SupabaseClient, id: string): Promise<NotifThread | null> => {
  const { data: row } = await cl.from('notification_threads')
    .select('*').eq('id', id).maybeSingle();
  if (!row) return null;
  const { data: memberRows } = await cl.from('notification_thread_members')
    .select('username').eq('thread_id', id);
  const { data: commentRows } = await cl.from('notification_comments')
    .select('*').eq('thread_id', id).order('sort_order', { ascending: true });
  const members = (memberRows ?? []).map((r) => r.username as string).filter(Boolean);
  const comments: NotifComment[] = (commentRows ?? []).map((r) => ({
    id: (r.legacy_id as string) || (r.id as string),
    by: (r.by_username as string) ?? '',
    byName: r.by_name as string,
    text: r.text as string,
    at: r.at as string,
  }));
  return {
    id: row.id as string,
    title: row.title as string,
    members,
    link: (row.link as NotifThread['link']) ?? undefined,
    comments,
    createdAt: row.created_at as string,
    createdBy: (row.created_by_name as string) ?? '',
    actType: (row.act_type as NotifThread['actType']) ?? undefined,
    status: (row.status as NotifThread['status']) ?? undefined,
    updatedAt: (row.updated_at as string) ?? undefined,
    updatedByName: (row.updated_by_name as string) ?? undefined,
    data: (row.data as Record<string, unknown>) ?? undefined,
  };
};

/**
 * Subscribe to a shared thread (members + comments reassembled).
 * Listens to ALL THREE tables so a new comment fires the subscriber.
 * Mirrors fbSubscribeNotifThread (firebase.ts:732-734).
 */
export function sbSubscribeNotifThread(
  id: string,
  cb: (t: NotifThread | null) => void,
  client: SupabaseClient = sb,
): Unsubscribe {
  let active = true;
  const reload = () =>
    assembleThread(client, id)
      .then((v) => { if (active) cb(v); })
      .catch((e) => { console.warn('sbSubscribeNotifThread load error:', (e as Error).message); });

  reload();

  const channelId = `notif_thread:${id}:${Math.random().toString(36).slice(2)}`;
  const channel = client
    .channel(channelId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_threads', filter: `id=eq.${id}` }, () => reload())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_comments', filter: `thread_id=eq.${id}` }, () => reload())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_thread_members', filter: `thread_id=eq.${id}` }, () => reload())
    .subscribe();

  return () => { active = false; client.removeChannel(channel); };
}

/**
 * Append a comment to a thread. sort_order = current max + 1.
 * Mirrors fbAddThreadComment (firebase.ts:737-742).
 */
export async function sbAddThreadComment(
  id: string,
  comment: NotifComment,
  client: SupabaseClient = sb,
): Promise<void> {
  const { data: maxRow } = await client.from('notification_comments')
    .select('sort_order')
    .eq('thread_id', id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = maxRow ? ((maxRow.sort_order as number) + 1) : 0;
  const byMap = await usernamesToIds(client, [comment.by]);
  const { error } = await client.from('notification_comments').insert({
    thread_id: id,
    legacy_id: comment.id,
    by_user_id: byMap.get(comment.by) ?? null,
    by_username: comment.by,
    by_name: comment.byName,
    text: comment.text,
    at: comment.at,
    sort_order: sortOrder,
  });
  if (error) throw new Error('sbAddThreadComment: ' + error.message);
}

/**
 * Update the live status of a shared thread.
 * Mirrors fbSetThreadStatus (firebase.ts:749-760).
 */
export async function sbSetThreadStatus(
  id: string,
  status: ActivityStatus,
  updatedByName: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('notification_threads')
    .update({ status, updated_at: new Date().toISOString(), updated_by_name: updatedByName })
    .eq('id', id);
  if (error) throw new Error('sbSetThreadStatus: ' + error.message);
}

// ── Tour Payments ─────────────────────────────────────────────────────────────

import type {
  PaymentRecord, CustomCostItem, TourPayments,
  PaymentApprovalStage, PaymentApprovalEntry, PaymentApprovalDoc,
} from '@/types';

const assembleTourPayments = async (
  cl: SupabaseClient,
  tourKey: string,
): Promise<TourPayments | null> => {
  const { data: parent } = await cl.from('tour_payments')
    .select('id').eq('tour_key', tourKey).maybeSingle();
  if (!parent) return null;
  const parentId = parent.id as string;

  const { data: recRows, error: recErr } = await cl.from('payment_records')
    .select('*').eq('tour_payment_id', parentId);
  if (recErr) throw recErr;

  const { data: ciRows, error: ciErr } = await cl.from('custom_cost_items')
    .select('*').eq('tour_payment_id', parentId).order('sort_order', { ascending: true });
  if (ciErr) throw ciErr;

  const payments: Record<string, PaymentRecord> = {};
  for (const r of recRows ?? []) {
    payments[r.record_key as string] = {
      supplier: (r.supplier as string) ?? undefined,
      tracked: (r.tracked as boolean) ?? undefined,
      customAmount: (r.custom_amount as number) ?? undefined,
      installments: (r.installments as PaymentRecord['installments']) ?? undefined,
      note: (r.note as string) ?? undefined,
    };
  }

  const customItems: CustomCostItem[] = (ciRows ?? []).map((r) => ({
    key: r.item_key as string,
    catId: r.cat_id as CustomCostItem['catId'],
    catLabel: (r.cat_label as string) ?? '',
    catIcon: (r.cat_icon as string) ?? '',
    catColor: (r.cat_color as string) ?? '',
    name: r.name as string,
    amount: r.amount as number,
  }));

  return { payments, customItems };
};

/**
 * Full-overwrite push of a tour's payments + customItems.
 * Mirrors fbSaveTourPayments (firebase.ts:794-806).
 */
export async function sbSaveTourPayments(
  tourKey: string,
  payments: Record<string, PaymentRecord>,
  customItems: CustomCostItem[],
  savedBy: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const now = new Date().toISOString();
  const { data: parent, error: upErr } = await client.from('tour_payments')
    .upsert({ tour_key: tourKey, updated_at: now, updated_by: savedBy || 'unknown' }, { onConflict: 'tour_key' })
    .select('id').single();
  if (upErr) throw new Error('sbSaveTourPayments upsert parent: ' + upErr.message);
  const parentId = parent!.id as string;

  await replaceChildren(client, 'payment_records', 'tour_payment_id', parentId,
    Object.entries(payments).map(([key, rec]) => ({
      tour_payment_id: parentId,
      record_key: key,
      supplier: rec.supplier ?? null,
      tracked: rec.tracked ?? null,
      custom_amount: rec.customAmount ?? null,
      installments: rec.installments ?? [],
      note: rec.note ?? null,
    })),
  );

  await replaceChildren(client, 'custom_cost_items', 'tour_payment_id', parentId,
    customItems.map((ci, i) => ({
      tour_payment_id: parentId,
      item_key: ci.key,
      cat_id: ci.catId,
      cat_label: ci.catLabel,
      cat_icon: ci.catIcon,
      cat_color: ci.catColor,
      name: ci.name,
      amount: ci.amount,
      sort_order: i,
    })),
  );
}

/**
 * One-time fetch of a tour's payment doc.
 * Mirrors fbGetTourPayments (firebase.ts:809-817).
 */
export async function sbGetTourPayments(
  tourKey: string,
  client: SupabaseClient = sb,
): Promise<TourPayments | null> {
  return assembleTourPayments(client, tourKey);
}

/**
 * Subscribe to a tour's payment doc.
 * Mirrors fbSubscribeTourPayments (firebase.ts:823-835).
 */
export function sbSubscribeTourPayments(
  tourKey: string,
  cb: (data: TourPayments | null) => void,
  client: SupabaseClient = sb,
): Unsubscribe {
  return subscribeTable(client, 'tour_payments', (cl) => assembleTourPayments(cl, tourKey), cb);
}

// ── Payment Approvals ─────────────────────────────────────────────────────────

const assembleApprovals = async (cl: SupabaseClient): Promise<PaymentApprovalDoc> => {
  const { data: approvals, error } = await cl.from('payment_approvals').select('*');
  if (error) throw error;
  if (!approvals?.length) return {};

  const ids = approvals.map((a) => a.id as string);
  const { data: stageRows, error: stErr } = await cl.from('payment_approval_stages')
    .select('*').in('approval_id', ids);
  if (stErr) throw stErr;

  const stagesByApproval = new Map<string, typeof stageRows>();
  for (const s of stageRows ?? []) {
    const arr = stagesByApproval.get(s.approval_id as string) ?? [];
    arr.push(s);
    stagesByApproval.set(s.approval_id as string, arr);
  }

  const doc: PaymentApprovalDoc = {};
  for (const a of approvals) {
    const stages = stagesByApproval.get(a.id as string) ?? [];
    const entry: PaymentApprovalEntry = {
      currentStage: (a.current_stage as 1 | 2) ?? undefined,
      finalStatus: (a.final_status as PaymentApprovalEntry['finalStatus']) ?? undefined,
      intendedApprover1Name: (a.intended_approver1_name as string) ?? undefined,
      intendedApprover2Name: (a.intended_approver2_name as string) ?? undefined,
    };
    for (const s of stages) {
      const stageKey = `stage${s.stage as number}` as 'stage1' | 'stage2';
      entry[stageKey] = {
        status: s.status as PaymentApprovalStage['status'],
        approverUsername: (s.approver_username as string) ?? '',
        approverName: (s.approver_name as string) ?? '',
        note: (s.note as string) ?? '',
        updatedAt: s.updated_at as string,
      };
    }
    doc[a.approval_key as string] = entry;
  }
  return doc;
};

/**
 * Write a single stage of an approval (1 or 2).
 * Final status rules (firebase.ts:869-870):
 *   rejected at any stage  → 'rejected'
 *   approved at stage 2    → 'approved'
 *   approved at stage 1    → 'pending_stage2'
 * Mirrors fbSetApprovalStage (firebase.ts:850-882).
 */
export async function sbSetApprovalStage(
  key: string,
  stage: 1 | 2,
  status: 'approved' | 'rejected',
  approverUsername: string,
  approverName: string,
  note: string,
  intended: { intendedApprover1Name?: string; intendedApprover2Name?: string } = {},
  client: SupabaseClient = sb,
): Promise<void> {
  const finalStatus: PaymentApprovalEntry['finalStatus'] =
    status === 'rejected' ? 'rejected' : stage === 2 ? 'approved' : 'pending_stage2';

  const { data: approval, error: upErr } = await client.from('payment_approvals')
    .upsert({
      approval_key: key,
      current_stage: stage,
      final_status: finalStatus,
      // Only include intended_* when provided. Supabase upsert(onConflict) updates only the columns
      // present in the payload, so omitting these on a later stage call PRESERVES the names set
      // earlier — do not change to always-write or it will null them.
      ...(intended.intendedApprover1Name
        ? { intended_approver1_name: intended.intendedApprover1Name } : {}),
      ...(intended.intendedApprover2Name
        ? { intended_approver2_name: intended.intendedApprover2Name } : {}),
    }, { onConflict: 'approval_key' })
    .select('id').single();
  if (upErr) throw new Error('sbSetApprovalStage upsert approval: ' + upErr.message);
  const approvalId = approval!.id as string;

  const approverMap = await usernamesToIds(client, [approverUsername]);

  const { error: stErr } = await client.from('payment_approval_stages')
    .upsert({
      approval_id: approvalId,
      stage,
      status,
      approver_user_id: approverMap.get(approverUsername) ?? null,
      approver_username: approverUsername || '',
      approver_name: approverName || '',
      note: note || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'approval_id,stage' });
  if (stErr) throw new Error('sbSetApprovalStage upsert stage: ' + stErr.message);
}

/**
 * Subscribe to the full payment-approvals document (key → entry map).
 * Mirrors fbSubscribePaymentApprovals (firebase.ts:888-894).
 */
export function sbSubscribePaymentApprovals(
  cb: (doc: PaymentApprovalDoc) => void,
  client: SupabaseClient = sb,
): Unsubscribe {
  return subscribeTable(client, 'payment_approvals', (cl) => assembleApprovals(cl), cb);
}
