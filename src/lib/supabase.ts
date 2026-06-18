import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { FileAttachment, User, Role, Customer, Ncc } from '@/types';
import type { PoiEntry } from '@/types/itinerary';
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
