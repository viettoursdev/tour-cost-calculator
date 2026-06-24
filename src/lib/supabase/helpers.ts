import type { SupabaseClient } from '@supabase/supabase-js';

export type Unsubscribe = () => void;

/**
 * Initial load + live re-fetch. Mirrors the fb* onSnapshot subscribe contract:
 * calls `cb` once with the assembled value, then again whenever any row in
 * `table` changes. Returns an unsubscribe fn. Swallows transient errors quietly.
 */
export function subscribeTable<T>(
  client: SupabaseClient,
  table: string,
  assemble: (client: SupabaseClient) => Promise<T>,
  cb: (v: T) => void,
): Unsubscribe {
  let active = true;
  const load = () => assemble(client).then((v) => { if (active) cb(v); }).catch((e) => {
    console.warn(`Supabase ${table} load error:`, (e as Error).message);
  });
  load();
  const channel = client
    .channel(`tbl:${table}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, () => { load(); })
    .subscribe();
  return () => { active = false; client.removeChannel(channel); };
}

/**
 * Per-key write serializer. Chains calls so two pushes to the same logical
 * resource never overlap. Without this, a full-overwrite push (upsert rows →
 * insert children → delete-missing) can have its trailing delete run *between*
 * a concurrent push's parent upsert and that push's child insert, tripping the
 * child FK constraint (e.g. supplier_contacts_supplier_id_fkey). Errors in one
 * call don't break the chain for the next.
 */
const writeLocks = new Map<string, Promise<unknown>>();
export function serializeWrites<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeLocks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn); // run fn regardless of prior outcome
  // Keep the chain alive even if this call rejects.
  writeLocks.set(key, next.then(() => undefined, () => undefined));
  return next;
}

/** Delete all child rows for a parent, then insert the provided set. */
export async function replaceChildren(
  client: SupabaseClient,
  table: string,
  parentCol: string,
  parentId: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  const del = await client.from(table).delete().eq(parentCol, parentId);
  if (del.error) throw new Error(`replaceChildren delete ${table}: ${del.error.message}`);
  if (rows.length) {
    const ins = await client.from(table).insert(rows);
    if (ins.error) throw new Error(`replaceChildren insert ${table}: ${ins.error.message}`);
  }
}

/** Map usernames → profile UUIDs (unmapped usernames are absent from the result). */
export async function usernamesToIds(
  client: SupabaseClient, usernames: string[],
): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(usernames.filter(Boolean)));
  if (!uniq.length) return new Map();
  const { data, error } = await client.from('profiles').select('id, username').in('username', uniq);
  if (error) throw new Error('usernamesToIds: ' + error.message);
  return new Map((data ?? []).map((r) => [r.username as string, r.id as string]));
}

/** Map profile UUIDs → usernames. */
export async function idsToUsernames(
  client: SupabaseClient, ids: string[],
): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (!uniq.length) return new Map();
  const { data, error } = await client.from('profiles').select('id, username').in('id', uniq);
  if (error) throw new Error('idsToUsernames: ' + error.message);
  return new Map((data ?? []).map((r) => [r.id as string, r.username as string]));
}
