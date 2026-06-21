// scripts/etl/db.mjs — service-role client, table ordering, reset, insert helper.
import { createClient } from '@supabase/supabase-js';
import { chunk } from './util.mjs';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export function serviceClient() {
  return createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Children before parents; entities that FK other entities (quotes->customers) after them.
export const CHILD_FIRST_TABLES = [
  // quote children
  'quote_workflow_logs', 'quote_workflow_steps',
  'quote_flight_segments', 'quote_flight_fares', 'quote_flights',
  'quote_group_items', 'quote_groups',
  'quote_line_items', 'quote_collaborators', 'quote_payments', 'quote_passengers',
  'quote_versions',
  'quotes',
  // payments / approvals
  'payment_records', 'custom_cost_items', 'tour_payments',
  'payment_approval_stages', 'payment_approvals',
  // notifications / chat
  'notifications',
  'notification_comments', 'notification_thread_members', 'notification_threads',
  'chat_messages', 'chat_members', 'chats',
  // itineraries / menus
  'itinerary_days', 'itinerary_flights', 'itineraries',
  'menu_days', 'menus', 'restaurant_menus', 'restaurants',
  // visa
  'visa_product_fees', 'visa_products_meta', 'visa_products',
  'visa_procedures', 'visa_projects',
  // suppliers / products
  'ncc_product_prices', 'ncc_products', 'supplier_contacts', 'suppliers',
  // contracts
  'contract_payments', 'contract_cancels', 'contracts',
  // customers
  'customer_interactions', 'customer_contacts', 'customers',
  // rate card / misc
  'rate_card_hotels', 'rate_card_other', 'rate_card_visa', 'rate_card_meta',
  'fx_rates', 'pois', 'attachments', 'audit_log',
  // profiles last (everything FKs it)
  'profiles',
];

const PK_COL = {
  fx_rates: 'currency', rate_card_hotels: 'city', rate_card_other: 'rkey',
  rate_card_visa: 'one_row', rate_card_meta: 'one_row', visa_products_meta: 'one_row',
  tour_payments: 'id', payment_approvals: 'id',
  notification_thread_members: 'thread_id', notification_threads: 'id',
  chat_members: 'chat_id', chats: 'id',
};

/** Truncate every app table (children first) and delete all @viettours auth users. */
export async function resetAll(client) {
  for (const t of CHILD_FIRST_TABLES) {
    const col = PK_COL[t] ?? 'id';
    const { error } = await client.from(t).delete().not(col, 'is', null);
    if (error && !/no rows/i.test(error.message)) throw new Error(`reset ${t}: ${error.message}`);
  }
  // Delete auth users (their profiles cascade via profiles.id FK ON DELETE CASCADE).
  const { data, error } = await client.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error('reset listUsers: ' + error.message);
  for (const u of data.users) {
    if (u.email && u.email.endsWith('@viettours.com.vn')) {
      const { error: delErr } = await client.auth.admin.deleteUser(u.id);
      if (delErr) throw new Error(`reset deleteUser ${u.email}: ${delErr.message}`);
    }
  }
}

/**
 * Chunked insert. Drops keys whose value is `undefined` (Postgres rejects them).
 * Returns inserted rows selecting `opts.select` columns (for legacy-id maps).
 */
export async function insert(client, table, rows, opts = {}) {
  if (!rows.length) return [];
  const clean = rows.map((r) => {
    const o = {};
    for (const [k, v] of Object.entries(r)) if (v !== undefined) o[k] = v;
    return o;
  });
  const out = [];
  for (const part of chunk(clean, 500)) {
    let q = client.from(table).insert(part);
    if (opts.select) q = q.select(opts.select);
    const { data, error } = await q;
    if (error) throw new Error(`insert ${table}: ${error.message}`);
    if (data) out.push(...data);
  }
  return out;
}
