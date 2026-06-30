import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { FileAttachment, User, Role, Customer, CustomerInteraction, Ncc, GuideScheduleDoc, EmailLink, PublicQuoteDoc, PublicVisaListDoc, PublicVisaListRecord, PublicVisaListStatus, Todo, Department, ProcessTemplate, ProcessRun, ProcessRefKind, ProcessRunStatus, TrainingProgram, TrainingEnrollment, TrainingModule, ModuleProgress, GateState, TrainingPhase, EnrollmentStatus } from '@/types';
import type { WorkflowStep, QuoteValueRole } from '@/types/quote';
import type { VisaProduct, VisaProductsDoc, VisaProductVersion, VisaProcDoc, VisaProcIndexEntry, VisaProjectDoc } from '@/types/visa';
import type { PoiEntry, Itinerary, ItineraryIndexEntry, Day, Flight } from '@/types/itinerary';
import type { AuditEntry } from '@/types/audit';
import type { CloudQuoteEntry, Template, Collaborator } from '@/types/quote';
import type { TourProfile, TourKind, TourCategory } from '@/types/tour';
import type { ExportRequest, ExportScope } from '@/types/exportRequest';
import { subscribeTable, replaceChildren, usernamesToIds, serializeWrites } from './supabase/helpers';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anon) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see .env.example).');
}

export const sb: SupabaseClient = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

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
  department: (r.department as User['department']) ?? undefined,
});

export async function sbPullUsers(client: SupabaseClient = sb): Promise<User[]> {
  const { data, error } = await client.from('profiles')
    .select('username, email, phone, role, name, color, department');
  if (error) throw new Error('sbPullUsers: ' + error.message);
  return (data ?? []).map(profileToUser);
}

/**
 * Upserts editable profile fields (username/email/phone/role/name/color) for
 * users whose email already has an auth.users + profile row. Does NOT create
 * auth users (admin API; Phase 3) — a `profiles` row only exists after the
 * person first signs in via magic link (the `handle_new_user` trigger).
 *
 * Returns the users that could NOT be persisted because they have no matching
 * auth account yet, so the caller can tell the operator instead of silently
 * dropping them (they appear in the in-memory list but vanish on reload).
 */
export async function sbPushUsers(users: User[], client: SupabaseClient = sb): Promise<User[]> {
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
      department: u.department ?? null,
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
  return skipped;
}

/** No-op in Supabase (no plaintext password column exists). Kept for API compatibility. */
export async function sbPurgeLegacyPasswords(_client: SupabaseClient = sb): Promise<number> {
  return 0;
}

// ── Auth gateway (`sb*` auth fns) ────────────────────────────────────────────

export async function sbSendSignInLink(email: string, client: SupabaseClient = sb): Promise<void> {
  // Compute redirect lazily so module scope doesn't reference window (node env).
  const redirect = `${window.location.origin}${import.meta.env.BASE_URL}?mode=auth`;
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirect, shouldCreateUser: true },
  });
  if (error) throw new Error('sbSendSignInLink: ' + error.message);
}

export function sbIsSignInLink(url: string): boolean {
  // PKCE magic-link callback carries ?code=...; our redirect also sets ?mode=auth.
  try { return new URL(url).searchParams.has('code'); } catch { return false; }
}

export async function sbCompleteSignInLink(url: string, client: SupabaseClient = sb): Promise<void> {
  const code = new URL(url).searchParams.get('code');
  if (!code) throw new Error('sbCompleteSignInLink: no code in callback URL');
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) throw new Error('sbCompleteSignInLink: ' + error.message);
}

export async function sbSignInWithPassword(email: string, password: string, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error('sbSignInWithPassword: ' + error.message);
}

export async function sbSignOut(client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) throw new Error('sbSignOut: ' + error.message);
}

export function sbOnAuthChange(
  cb: (session: { uid: string; email: string } | null) => void,
  client: SupabaseClient = sb,
): () => void {
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    cb(session?.user ? { uid: session.user.id, email: (session.user.email ?? '').toLowerCase() } : null);
  });
  return () => data.subscription.unsubscribe();
}

export async function sbGetProfileById(uid: string, client: SupabaseClient = sb): Promise<User | null> {
  const { data, error } = await client.from('profiles')
    .select('username, email, phone, role, name, color, department').eq('id', uid).maybeSingle();
  if (error) throw new Error('sbGetProfileById: ' + error.message);
  return data ? profileToUser(data) : null;
}

export async function sbGetAccessToken(client: SupabaseClient = sb): Promise<string | null> {
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

// ── FX rates ──────────────────────────────────────────────────────────────────

/** FX rates document shape. Redeclared here to avoid importing Supabase initialisation code in tests. */
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

// ── Lịch đi tour HDV (single-row, dùng chung) ──
export function sbSubscribeGuideSchedule(
  cb: (d: GuideScheduleDoc) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(client, 'guide_schedule', async (cl) => {
    const { data, error } = await cl
      .from('guide_schedule')
      .select('freelancers, assignments, updated_at, updated_by')
      .eq('one_row', true)
      .maybeSingle();
    if (error) throw new Error('sbSubscribeGuideSchedule: ' + error.message);
    return {
      freelancers: (data?.freelancers as GuideScheduleDoc['freelancers']) ?? [],
      assignments: (data?.assignments as GuideScheduleDoc['assignments']) ?? {},
      updatedAt: (data?.updated_at as string) ?? undefined,
      updatedBy: (data?.updated_by as string) ?? undefined,
    } as GuideScheduleDoc;
  }, cb);
}

export async function sbPushGuideSchedule(
  d: GuideScheduleDoc,
  pushedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('guide_schedule').upsert({
    one_row: true,
    freelancers: d.freelancers ?? [],
    assignments: d.assignments ?? {},
    updated_at: new Date().toISOString(),
    updated_by: `${pushedBy.name} (${pushedBy.role})`,
  }, { onConflict: 'one_row' });
  if (error) throw new Error('sbPushGuideSchedule: ' + error.message);
}

// ── Liên kết email Outlook (single-row, dùng chung) ──
export function sbSubscribeEmailLinks(
  cb: (list: EmailLink[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(client, 'email_links', async (cl) => {
    const { data, error } = await cl
      .from('email_links')
      .select('links')
      .eq('one_row', true)
      .maybeSingle();
    if (error) throw new Error('sbSubscribeEmailLinks: ' + error.message);
    return (data?.links as EmailLink[]) ?? [];
  }, cb);
}

export async function sbPushEmailLinks(
  list: EmailLink[],
  pushedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('email_links').upsert({
    one_row: true,
    links: list,
    updated_at: new Date().toISOString(),
    updated_by: `${pushedBy.name} (${pushedBy.role})`,
  }, { onConflict: 'one_row' });
  if (error) throw new Error('sbPushEmailLinks: ' + error.message);
}

// ── To-Do (row-per-task, xem 0036) ──
const iso = (v: unknown): string | undefined => (v ? new Date(v as string).toISOString() : undefined);

const rowToTodo = (r: Record<string, unknown>): Todo => ({
  id: r.id as string,
  title: (r.title as string) ?? '',
  note: (r.note as string) ?? undefined,
  status: (r.status as Todo['status']) ?? 'todo',
  priority: (r.priority as Todo['priority']) ?? 'normal',
  createdBy: (r.created_by as string) ?? '',
  createdByName: (r.created_by_name as string) ?? '',
  createdAt: iso(r.created_at) ?? new Date().toISOString(),
  assignees: (r.assignees as string[]) ?? [],
  dueDate: iso(r.due_date),
  remindAt: (r.remind_at as string[]) ?? undefined,
  remindLead: (r.remind_lead as number[]) ?? undefined,
  link: (r.link as Todo['link']) ?? undefined,
  checklist: (r.checklist as Todo['checklist']) ?? undefined,
  recurring: (r.recurring as Todo['recurring']) ?? 'none',
  tags: (r.tags as string[]) ?? undefined,
  auto: (r.auto as string) ?? undefined,
  responses: (r.responses as Todo['responses']) ?? undefined,
  completedAt: iso(r.completed_at),
  completedBy: (r.completed_by as string) ?? undefined,
  updatedAt: iso(r.updated_at),
  updatedBy: (r.updated_by as string) ?? undefined,
});

const todoToRow = (t: Todo): Record<string, unknown> => ({
  id: t.id,
  title: t.title,
  note: t.note ?? null,
  status: t.status,
  priority: t.priority,
  created_by: t.createdBy,
  created_by_name: t.createdByName,
  created_at: t.createdAt,
  assignees: t.assignees ?? [],
  due_date: t.dueDate ?? null,
  remind_at: t.remindAt ?? null,
  remind_lead: t.remindLead ?? null,
  link: t.link ?? null,
  checklist: t.checklist ?? null,
  recurring: t.recurring ?? 'none',
  tags: t.tags ?? [],
  auto: t.auto ?? null,
  responses: t.responses ?? null,
  completed_at: t.completedAt ?? null,
  completed_by: t.completedBy ?? null,
  updated_at: t.updatedAt ?? null,
  updated_by: t.updatedBy ?? null,
});

export function sbSubscribeTodos(
  cb: (list: Todo[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(client, 'todos', async (cl) => {
    const { data, error } = await cl
      .from('todos')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error('sbSubscribeTodos: ' + error.message);
    return (data ?? []).map(rowToTodo);
  }, cb);
}

/** Upsert một việc (tạo/sửa). Chỉ đụng đúng dòng đó → không ghi đè việc của người khác. */
export async function sbUpsertTodo(todo: Todo, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.from('todos').upsert(todoToRow(todo), { onConflict: 'id' });
  if (error) throw new Error('sbUpsertTodo: ' + error.message);
}

/** Upsert nhiều việc một lần (việc lặp sinh bản kế / thao tác hàng loạt / di trú). */
export async function sbUpsertTodos(list: Todo[], client: SupabaseClient = sb): Promise<void> {
  if (!list.length) return;
  const { error } = await client.from('todos').upsert(list.map(todoToRow), { onConflict: 'id' });
  if (error) throw new Error('sbUpsertTodos: ' + error.message);
}

export async function sbDeleteTodo(id: string, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.from('todos').delete().eq('id', id);
  if (error) throw new Error('sbDeleteTodo: ' + error.message);
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
  // UPSERT-ONLY — không xoá-diff (chống wipe khi sửa song song). Xoá đi qua
  // sbDeletePoi (targeted theo legacy_id). Xem ghi chú ở sbPushCustomers.
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

/** Xoá hẳn 1 điểm tham quan (POI) theo legacy_id. */
export async function sbDeletePoi(id: string, client: SupabaseClient = sb): Promise<void> {
  const del = await client.from('pois').delete().eq('legacy_id', id);
  if (del.error) throw new Error('sbDeletePoi: ' + del.error.message);
}

// ── Audit log ─────────────────────────────────────────────────────────────────

// Maximum rows retained in audit_log — mirrors fbLogAudit's AUDIT_CAP constant.
const AUDIT_CAP = 2000;

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

  // Trim table to AUDIT_CAP most-recent rows (matches fbLogAudit's slice-to-2000 behaviour).
  const { data: all } = await client.from('audit_log')
    .select('id')
    .order('at', { ascending: false });
  const toDelete = (all ?? []).slice(AUDIT_CAP).map((r) => r.id as string);
  if (toDelete.length > 0) {
    await client.from('audit_log').delete().in('id', toDelete);
  }
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

const rowToCustomer = (
  r: Record<string, unknown>,
  contacts: Customer['contacts'],
  interactions: Customer['interactions'],
): Customer => ({
  id: r.legacy_id as string, dbId: r.id as string, name: r.name as string, type: r.type as Customer['type'],
  address: (r.address as string) ?? undefined, taxCode: (r.tax_code as string) ?? undefined,
  contacts, note: (r.note as string) ?? '',
  source: (r.source as string) ?? undefined,
  tags: (r.tags as string[]) ?? [],
  interactions: interactions?.length ? interactions : undefined,
  nextFollowUp: (r.next_follow_up as Customer['nextFollowUp']) ?? undefined,
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
    const { data: interactionRows } = ids.length
      ? await cl.from('customer_interactions').select('*').in('customer_id', ids).order('sort_order')
      : { data: [] as Record<string, unknown>[] };
    const byParent = new Map<string, Customer['contacts']>();
    for (const ct of contacts ?? []) {
      const arr = byParent.get(ct.customer_id as string) ?? [];
      arr.push({ name: ct.name as string, phone: ct.phone as string, email: ct.email as string, position: ct.position as string });
      byParent.set(ct.customer_id as string, arr);
    }
    const interactionsByParent = new Map<string, CustomerInteraction[]>();
    for (const ia of interactionRows ?? []) {
      const arr = interactionsByParent.get(ia.customer_id as string) ?? [];
      arr.push({
        id: ia.legacy_id as string,
        at: new Date(ia.at as string).toISOString(),
        byU: (ia.by_username as string) ?? '',
        byName: (ia.by_name as string) ?? '',
        type: ia.type as CustomerInteraction['type'],
        text: (ia.text as string) ?? '',
      });
      interactionsByParent.set(ia.customer_id as string, arr);
    }
    return (rows ?? []).map((r) =>
      rowToCustomer(r, byParent.get(r.id as string) ?? [], interactionsByParent.get(r.id as string)),
    );
  }, cb);
}

export function sbPushCustomers(
  list: Customer[],
  pushedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  // Serialize: overlapping pushes race the trailing delete against each other's
  // contact/interaction inserts → customer_contacts_customer_id_fkey violation.
  return serializeWrites('customers', async () => {
  const stamp = { updated_at: new Date().toISOString(), updated_by_name: `${pushedBy.name} (${pushedBy.role})` };
  for (const cust of list) {
    const { data: up, error: upErr } = await client.from('customers').upsert({
      legacy_id: cust.id, name: cust.name, type: cust.type,
      address: cust.address ?? null, tax_code: cust.taxCode ?? null, note: cust.note ?? '',
      source: cust.source ?? null,
      tags: cust.tags ?? [],
      next_follow_up: cust.nextFollowUp ?? null,
      created_by_name: cust.createdBy, created_at: cust.createdAt, ...stamp,
    }, { onConflict: 'legacy_id' }).select('id').single();
    if (upErr) throw new Error('sbPushCustomers upsert: ' + upErr.message);
    await replaceChildren(client, 'customer_contacts', 'customer_id', up!.id, cust.contacts.map((ct, i) => ({
      customer_id: up!.id, name: ct.name, phone: ct.phone, email: ct.email, position: ct.position, sort_order: i,
    })));
    await replaceChildren(client, 'customer_interactions', 'customer_id', up!.id, (cust.interactions ?? []).map((ia, i) => ({
      customer_id: up!.id, legacy_id: ia.id, at: ia.at,
      by_username: ia.byU, by_name: ia.byName, type: ia.type, text: ia.text, sort_order: i,
    })));
  }
  // UPSERT-ONLY — KHÔNG xoá-diff. Trước đây hàm này xoá mọi khách không có trong
  // `list`; nhưng MỌI thao tác xoá thật đã đi qua sbDeleteCustomers (xoá theo
  // dbId/legacy_id, kể cả nhánh `merge`), nên xoá-diff ở đây THỪA và là nguồn mất
  // dữ liệu: khi 2 người sửa song song, người lưu với danh sách CŨ sẽ xoá nhầm
  // khách MỚI người kia vừa thêm (RLS `for all` không chặn xoá). Bỏ hẳn xoá-diff
  // → upsert-only an toàn tuyệt đối; xoá vẫn chính xác qua sbDeleteCustomers.
  });
}

/**
 * Xoá hẳn các khách hàng được chỉ định — bằng UUID khoá chính (`dbId`) khi có,
 * nếu không thì theo `legacy_id`. Tin cậy hơn nhánh delete-diff theo `legacy_id`
 * trong `sbPushCustomers` (bỏ qua mọi dòng có `legacy_id` null → không xoá được
 * dữ liệu cũ). Con (`customer_contacts`/`customer_interactions`) tự xoá theo cascade.
 */
export function sbDeleteCustomers(
  targets: { dbId?: string; id?: string }[],
  client: SupabaseClient = sb,
): Promise<void> {
  return serializeWrites('customers', async () => {
    const dbIds = targets.map((t) => t.dbId).filter(Boolean) as string[];
    const legacyIds = targets.filter((t) => !t.dbId).map((t) => t.id).filter(Boolean) as string[];
    if (dbIds.length) {
      const del = await client.from('customers').delete().in('id', dbIds);
      if (del.error) throw new Error('sbDeleteCustomers by id: ' + del.error.message);
    }
    if (legacyIds.length) {
      const del = await client.from('customers').delete().in('legacy_id', legacyIds);
      if (del.error) throw new Error('sbDeleteCustomers by legacy_id: ' + del.error.message);
    }
  });
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

/** Resolve app legacy_id(s) on suppliers → supplier uuid for the FK. */
async function resolveSupplierIds(
  client: SupabaseClient, nccLegacyIds: string[], ctx: string,
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(nccLegacyIds.filter(Boolean)));
  if (!ids.length) return new Map();
  const { data: sups, error } = await client
    .from('suppliers').select('id, legacy_id').in('legacy_id', ids);
  if (error) throw new Error(`${ctx} resolve suppliers: ` + error.message);
  return new Map((sups ?? []).map((s) => [s.legacy_id as string, s.id as string]));
}

/** Upsert MỘT sản phẩm + bảng giá + file đính kèm (KHÔNG đụng tới sản phẩm khác). */
async function upsertNccProductRow(
  client: SupabaseClient,
  prod: NccProduct,
  supplierIdMap: Map<string, string>,
  stamp: { updated_at: string; updated_by_name: string },
  ctx: string,
): Promise<void> {
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
  if (upErr) throw new Error(`${ctx} upsert: ` + upErr.message);
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

/**
 * Lưu MỘT sản phẩm NCC (an toàn dữ liệu — KHÔNG xoá sản phẩm nào khác).
 * Dùng cho thao tác thêm/sửa từng sản phẩm trong UI. Ném lỗi nếu thất bại để
 * store rollback + báo cho người dùng (tránh "lưu âm thầm thất bại").
 */
export async function sbUpsertNccProduct(
  product: NccProduct,
  pushedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  const stamp = {
    updated_at: new Date().toISOString(),
    updated_by_name: `${pushedBy.name} (${pushedBy.role})`,
  };
  const supplierIdMap = await resolveSupplierIds(
    client, product.nccId ? [product.nccId] : [], 'sbUpsertNccProduct',
  );
  await upsertNccProductRow(client, product, supplierIdMap, stamp, 'sbUpsertNccProduct');
}

/** Xoá MỘT sản phẩm NCC theo legacy_id + dọn file đính kèm của nó (prices cascade theo FK). */
export async function sbDeleteNccProduct(id: string, client: SupabaseClient = sb): Promise<void> {
  // Dọn attachments trước (không có FK cascade vì chung bảng attachments theo parent_type).
  await saveAttachments(client, 'ncc_product', id, []);
  const del = await client.from('ncc_products').delete().eq('legacy_id', id);
  if (del.error) throw new Error('sbDeleteNccProduct: ' + del.error.message);
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

  const supplierIdMap = await resolveSupplierIds(
    client, list.map((p) => p.nccId).filter(Boolean) as string[], 'sbPushNccProducts',
  );

  for (const prod of list) {
    await upsertNccProductRow(client, prod, supplierIdMap, stamp, 'sbPushNccProducts');
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
    acceptance: (r.acceptance_detail as Contract['acceptance']) ?? undefined,
    createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : '',
    createdBy: (r.created_by_name as string) ?? '',
    updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : undefined,
    updatedBy: (r.updated_by_name as string) ?? undefined,
    _tourKey: (r.tour_key as string) ?? undefined,
    linkedQuoteId: (r.linked_quote_id as string) ?? undefined,
    linkedQuoteName: (r.linked_quote_name as string) ?? undefined,
    tourProfileId: (r.tour_profile_id as string) ?? undefined,
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

/** Subscribe to the contract list. */
export function sbSubscribeContracts(
  cb: (list: Contract[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(client, 'contracts', assembleContracts, cb);
}

/** One-time pull. */
export async function sbGetContracts(client: SupabaseClient = sb): Promise<Contract[]> {
  return assembleContracts(client);
}

/** Full-overwrite push. */
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
          acceptance_detail: contract.acceptance ?? null,
          tour_key: contract._tourKey ?? null,
          linked_quote_id: contract.linkedQuoteId ?? null,
          linked_quote_name: contract.linkedQuoteName ?? null,
          tour_profile_id: contract.tourProfileId ?? null,
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

  // UPSERT-ONLY — không xoá-diff (chống wipe khi sửa song song). Xoá đi qua
  // sbDeleteContract (targeted theo legacy_id). Xem ghi chú ở sbPushCustomers.
}

/** Xoá hẳn 1 hợp đồng theo legacy_id (con contract_payments/contract_cancels cascade). */
export async function sbDeleteContract(id: string, client: SupabaseClient = sb): Promise<void> {
  const del = await client.from('contracts').delete().eq('legacy_id', id);
  if (del.error) throw new Error('sbDeleteContract: ' + del.error.message);
}

// ── Rate Card ─────────────────────────────────────────────────────────────────

import type { RateCard, RateCardDoc, RateCardMeta } from '@/types/rates';

// Strip the vte_visa_rates mirror that sbPushMasterRC writes into rate_card_other.
// The canonical source for visa rates is the top-level visaRates field; the mirror
// is for legacy _applyRC() compatibility only and must not leak into the store.
// See stripVisaMirror below.
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

/** One-time pull. */
export async function sbPullMasterRC(client: SupabaseClient = sb): Promise<RateCardDoc | null> {
  return assembleRC(client);
}

/** Full-overwrite push. Returns pushedAt ISO string. */
export async function sbPushMasterRC(
  rc: RateCard,
  pushedBy: string,
  client: SupabaseClient = sb,
): Promise<string> {
  const pushedAt = new Date().toISOString();

  // Mirror vte_visa_rates into otherRates for legacy _applyRC() compatibility,
  // Mirror vte_visa_rates into otherRates so legacy _applyRC() works.
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

/** Realtime subscribe. */
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

export function sbPushNcc(
  list: Ncc[],
  pushedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  // UPSERT-ONLY — KHÔNG xoá-diff. App đã chuyển hẳn sang per-row sbUpsertNcc/sbDeleteNcc;
  // hàm này chỉ còn cho bulk-import/restore. Bỏ xoá-diff để dù có nối lại cũng KHÔNG
  // wipe nhà cung cấp khi sửa song song (bất biến: không sbPush* nào tự xoá). Xoá đi qua
  // sbDeleteNcc. Xem ghi chú ở sbPushCustomers.
  return serializeWrites('suppliers', async () => {
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
  });
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

  // Read current meta to build next version snapshot
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

const visaProductRow = (p: VisaProduct): Record<string, unknown> => ({
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
});

/**
 * Lưu MỘT sản phẩm visa (an toàn đồng thời — KHÔNG xoá/đụng sản phẩm khác). Thay cho
 * `sbSaveVisaProducts` (full-overwrite) ở đường sửa từng dòng. Ném lỗi để store rollback.
 */
export async function sbUpsertVisaProduct(p: VisaProduct, client: SupabaseClient = sb): Promise<void> {
  const { data: row, error } = await client
    .from('visa_products')
    .upsert(visaProductRow(p), { onConflict: 'legacy_id' })
    .select('id')
    .single();
  if (error) throw new Error('sbUpsertVisaProduct: ' + error.message);
  await replaceChildren(client, 'visa_product_fees', 'product_id', row!.id, (p.fees ?? []).map((f, i) => ({
    product_id: row!.id,
    legacy_fee_id: f.id,
    name: f.name,
    amount: f.amount,
    cur: f.cur,
    per_pax: f.perPax,
    sort_order: i,
  })));
}

/** Xoá MỘT sản phẩm visa theo legacy_id (fees cascade theo FK). */
export async function sbDeleteVisaProduct(id: string, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.from('visa_products').delete().eq('legacy_id', id);
  if (error) throw new Error('sbDeleteVisaProduct: ' + error.message);
}

/**
 * Ghi meta visa (tỷ giá + 1 mốc lịch sử) mà KHÔNG đụng bảng products — products đã được
 * ghi per-row trước đó. Tách khỏi sửa từng dòng nên KHÔNG còn churn version mỗi keystroke;
 * người gọi debounce để mỗi đợt sửa chỉ tạo 1 mốc khôi phục. Báo lỗi nhưng không chặn UI.
 */
export async function sbSnapshotVisaProducts(
  products: VisaProduct[],
  rates: Record<string, number>,
  savedBy: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const now = new Date().toISOString();
  const { data: prevMeta } = await client.from('visa_products_meta').select('versions').maybeSingle();
  const prevVersions: VisaProductVersion[] = (prevMeta?.versions as VisaProductVersion[]) ?? [];
  const versionNo = (prevVersions[0]?.versionNo ?? 0) + 1;
  const versions = [{ versionNo, savedAt: now, savedBy: savedBy || '', products }, ...prevVersions].slice(0, 20);
  const { error } = await client.from('visa_products_meta').upsert({
    one_row: true, rates, versions, updated_at: now, updated_by: savedBy || '',
  }, { onConflict: 'one_row' });
  if (error) throw new Error('sbSnapshotVisaProducts: ' + error.message);
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

// ── process_templates (Quy trình phòng ban) ─────────────────────────────────

const rowToProcessTemplate = (r: Record<string, unknown>): ProcessTemplate => ({
  id: (r.legacy_id as string) ?? '',
  department: (r.department as Department),
  name: (r.name as string) ?? '',
  description: (r.description as string) || undefined,
  icon: (r.icon as string) || undefined,
  color: (r.color as string) || undefined,
  steps: (r.steps as WorkflowStep[]) ?? [],
  version: (r.version as number) ?? 1,
  isPublished: (r.is_published as boolean) ?? true,
  createdByUsername: (r.created_by_username as string) || undefined,
  createdByName: (r.created_by_name as string) || undefined,
  createdAt: (r.created_at as string) || undefined,
  updatedAt: (r.updated_at as string) || undefined,
  updatedBy: (r.updated_by_name as string) || undefined,
});

export function sbSubscribeProcessTemplates(
  cb: (list: ProcessTemplate[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(client, 'process_templates', async (cl) => {
    const { data, error } = await cl
      .from('process_templates')
      .select('*')
      .order('updated_at', { ascending: false, nullsFirst: false });
    if (error) throw new Error('sbSubscribeProcessTemplates: ' + error.message);
    return (data ?? []).map(rowToProcessTemplate);
  }, cb);
}

export async function sbSaveProcessTemplate(
  t: ProcessTemplate,
  savedBy: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await client.from('process_templates').upsert({
    legacy_id: t.id,
    department: t.department,
    name: t.name ?? '',
    description: t.description ?? '',
    icon: t.icon ?? '',
    color: t.color ?? '',
    steps: t.steps ?? [],
    version: t.version ?? 1,
    is_published: t.isPublished ?? true,
    created_by_username: t.createdByUsername ?? '',
    created_by_name: t.createdByName ?? '',
    created_at: t.createdAt,
    updated_at: now,
    updated_by_name: savedBy || '',
  }, { onConflict: 'legacy_id' });
  if (error) throw new Error('sbSaveProcessTemplate: ' + error.message);
}

export async function sbDeleteProcessTemplate(
  id: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('process_templates').delete().eq('legacy_id', id);
  if (error) throw new Error('sbDeleteProcessTemplate: ' + error.message);
}

// ── process_runs (Phiên chạy quy trình) ─────────────────────────────────────

const rowToProcessRun = (r: Record<string, unknown>): ProcessRun => ({
  id: (r.legacy_id as string) ?? '',
  templateId: (r.template_id as string) || undefined,
  department: (r.department as Department),
  title: (r.title as string) ?? '',
  ref: r.ref_kind
    ? { kind: r.ref_kind as ProcessRefKind, id: (r.ref_id as string) ?? '', label: (r.ref_label as string) ?? '' }
    : undefined,
  steps: (r.steps as WorkflowStep[]) ?? [],
  status: (r.status as ProcessRunStatus) ?? 'active',
  assignee: (r.assignee as string) || undefined,
  startDate: (r.start_date as string) || undefined,
  dueDate: (r.due_date as string) || undefined,
  createdByUsername: (r.created_by_username as string) || undefined,
  createdByName: (r.created_by_name as string) || undefined,
  createdAt: (r.created_at as string) || undefined,
  updatedAt: (r.updated_at as string) || undefined,
  updatedBy: (r.updated_by_name as string) || undefined,
});

export function sbSubscribeProcessRuns(
  cb: (list: ProcessRun[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(client, 'process_runs', async (cl) => {
    const { data, error } = await cl
      .from('process_runs')
      .select('*')
      .order('updated_at', { ascending: false, nullsFirst: false });
    if (error) throw new Error('sbSubscribeProcessRuns: ' + error.message);
    return (data ?? []).map(rowToProcessRun);
  }, cb);
}

export async function sbSaveProcessRun(
  run: ProcessRun,
  savedBy: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await client.from('process_runs').upsert({
    legacy_id: run.id,
    template_id: run.templateId ?? null,
    department: run.department,
    title: run.title ?? '',
    ref_kind: run.ref?.kind ?? null,
    ref_id: run.ref?.id ?? null,
    ref_label: run.ref?.label ?? null,
    steps: run.steps ?? [],
    status: run.status ?? 'active',
    assignee: run.assignee ?? null,
    start_date: run.startDate ?? null,
    due_date: run.dueDate ?? null,
    created_by_username: run.createdByUsername ?? '',
    created_by_name: run.createdByName ?? '',
    created_at: run.createdAt,
    updated_at: now,
    updated_by_name: savedBy || '',
  }, { onConflict: 'legacy_id' });
  if (error) throw new Error('sbSaveProcessRun: ' + error.message);
}

export async function sbDeleteProcessRun(
  id: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('process_runs').delete().eq('legacy_id', id);
  if (error) throw new Error('sbDeleteProcessRun: ' + error.message);
}

// ── training_programs (Curriculum đào tạo) ──────────────────────────────────

const rowToTrainingProgram = (r: Record<string, unknown>): TrainingProgram => ({
  id: (r.legacy_id as string) ?? '',
  department: (r.department as Department),
  roleTarget: (r.role_target as string) || undefined,
  name: (r.name as string) ?? '',
  description: (r.description as string) || undefined,
  certTitle: (r.cert_title as string) || undefined,
  icon: (r.icon as string) || undefined,
  color: (r.color as string) || undefined,
  modules: (r.modules as TrainingModule[]) ?? [],
  version: (r.version as number) ?? 1,
  isPublished: (r.is_published as boolean) ?? false,
  createdByUsername: (r.created_by_username as string) || undefined,
  createdByName: (r.created_by_name as string) || undefined,
  createdAt: (r.created_at as string) || undefined,
  updatedAt: (r.updated_at as string) || undefined,
  updatedBy: (r.updated_by_name as string) || undefined,
});

export function sbSubscribeTrainingPrograms(
  cb: (list: TrainingProgram[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(client, 'training_programs', async (cl) => {
    const { data, error } = await cl
      .from('training_programs')
      .select('*')
      .order('updated_at', { ascending: false, nullsFirst: false });
    if (error) throw new Error('sbSubscribeTrainingPrograms: ' + error.message);
    return (data ?? []).map(rowToTrainingProgram);
  }, cb);
}

export async function sbSaveTrainingProgram(
  p: TrainingProgram,
  savedBy: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await client.from('training_programs').upsert({
    legacy_id: p.id,
    department: p.department,
    role_target: p.roleTarget ?? 'L2',
    name: p.name ?? '',
    description: p.description ?? '',
    cert_title: p.certTitle ?? '',
    icon: p.icon ?? '',
    color: p.color ?? '',
    modules: p.modules ?? [],
    version: p.version ?? 1,
    is_published: p.isPublished ?? false,
    created_by_username: p.createdByUsername ?? '',
    created_by_name: p.createdByName ?? '',
    created_at: p.createdAt,
    updated_at: now,
    updated_by_name: savedBy || '',
  }, { onConflict: 'legacy_id' });
  if (error) throw new Error('sbSaveTrainingProgram: ' + error.message);
}

export async function sbDeleteTrainingProgram(
  id: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('training_programs').delete().eq('legacy_id', id);
  if (error) throw new Error('sbDeleteTrainingProgram: ' + error.message);
}

// ── training_enrollments (Ghi danh học viên) ────────────────────────────────

const rowToTrainingEnrollment = (r: Record<string, unknown>): TrainingEnrollment => ({
  id: (r.legacy_id as string) ?? '',
  programId: (r.program_id as string) || undefined,
  employeeId: (r.employee_id as string) || undefined,
  learnerUsername: (r.learner_username as string) ?? '',
  learnerName: (r.learner_name as string) || undefined,
  mentorUsername: (r.mentor_username as string) || undefined,
  department: (r.department as Department),
  status: (r.status as EnrollmentStatus) ?? 'active',
  startDate: (r.start_date as string) || undefined,
  progress: (r.progress as Record<string, ModuleProgress>) ?? {},
  gates: (r.gates as Partial<Record<TrainingPhase, GateState>>) ?? {},
  certifiedAt: (r.certified_at as string) || undefined,
  certCode: (r.cert_code as string) || undefined,
  createdByUsername: (r.created_by_username as string) || undefined,
  createdByName: (r.created_by_name as string) || undefined,
  createdAt: (r.created_at as string) || undefined,
  updatedAt: (r.updated_at as string) || undefined,
  updatedBy: (r.updated_by_name as string) || undefined,
});

export function sbSubscribeTrainingEnrollments(
  cb: (list: TrainingEnrollment[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(client, 'training_enrollments', async (cl) => {
    const { data, error } = await cl
      .from('training_enrollments')
      .select('*')
      .order('updated_at', { ascending: false, nullsFirst: false });
    if (error) throw new Error('sbSubscribeTrainingEnrollments: ' + error.message);
    return (data ?? []).map(rowToTrainingEnrollment);
  }, cb);
}

export async function sbSaveTrainingEnrollment(
  e: TrainingEnrollment,
  savedBy: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await client.from('training_enrollments').upsert({
    legacy_id: e.id,
    program_id: e.programId ?? null,
    employee_id: e.employeeId ?? null,
    learner_username: e.learnerUsername ?? '',
    learner_name: e.learnerName ?? '',
    mentor_username: e.mentorUsername ?? '',
    department: e.department,
    status: e.status ?? 'active',
    start_date: e.startDate ?? null,
    progress: e.progress ?? {},
    gates: e.gates ?? {},
    certified_at: e.certifiedAt ?? null,
    cert_code: e.certCode ?? null,
    created_by_username: e.createdByUsername ?? '',
    created_by_name: e.createdByName ?? '',
    created_at: e.createdAt,
    updated_at: now,
    updated_by_name: savedBy || '',
  }, { onConflict: 'legacy_id' });
  if (error) throw new Error('sbSaveTrainingEnrollment: ' + error.message);
}

export async function sbDeleteTrainingEnrollment(
  id: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('training_enrollments').delete().eq('legacy_id', id);
  if (error) throw new Error('sbDeleteTrainingEnrollment: ' + error.message);
}

/** Sinh mã chứng nhận ATOMIC ở DB (advisory lock theo năm → VTC.YY.NNNN). */
export async function sbNextCertCode(client: SupabaseClient = sb): Promise<string> {
  const { data, error } = await client.rpc('next_cert_code');
  if (error) throw new Error('sbNextCertCode: ' + error.message);
  return data as string;
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
      tourProfileId: (r.tour_profile_id as string) ?? null,
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
      costing: (r.costing as VisaProjectDoc['costing']) ?? undefined,
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
      tour_profile_id: p.tourProfileId ?? null,
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
      costing: p.costing ?? null,
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

  // UPSERT-ONLY — không xoá-diff (chống wipe khi sửa song song). Xoá đi qua
  // sbDeleteVisaProject (targeted theo legacy_id). Xem ghi chú ở sbPushCustomers.
}

/** Xoá hẳn 1 dự án visa theo legacy_id. */
export async function sbDeleteVisaProject(id: string, client: SupabaseClient = sb): Promise<void> {
  const del = await client.from('visa_projects').delete().eq('legacy_id', id);
  if (del.error) throw new Error('sbDeleteVisaProject: ' + del.error.message);
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
  tourProfileId: (r.tour_profile_id as string) ?? null,
  createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : undefined,
  createdBy: (r.created_by_name as string) ?? undefined,
  updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : '',
  updatedBy: (r.updated_by_name as string) ?? '',
});

/**
 * Subscribe to the itinerary metadata index (lightweight list).
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
        .select('id, legacy_id, code, title, destination, days, nights, linked_quote_id, linked_quote_name, tour_profile_id, created_at, created_by_name, updated_at, updated_by_name')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToItineraryIndex);
    },
    cb,
  );
}

/**
 * One-time fetch of a full itinerary, reassembling schedule + flights from child tables.
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
    startDate: (row.start_date as string) ?? undefined,
    intro: (row.intro as string) ?? '',
    includes: (row.includes as string[]) ?? [],
    excludes: (row.excludes as string[]) ?? [],
    exec: (row.exec as Itinerary['exec']) ?? undefined,
    linkedQuoteId: (row.linked_quote_id as string) ?? null,
    linkedQuoteName: (row.linked_quote_name as string) ?? '',
    tourProfileId: (row.tour_profile_id as string) ?? null,
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
        start_date: itin.startDate ?? null,
        linked_quote_id: itin.linkedQuoteId ?? null,
        linked_quote_name: itin.linkedQuoteName ?? '',
        tour_profile_id: itin.tourProfileId ?? null,
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
 */
export async function sbDeleteItinerary(
  id: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('itineraries').delete().eq('legacy_id', id);
  if (error) throw new Error('sbDeleteItinerary: ' + error.message);
}

// ─── Restaurants + Menus ─────────────────────────────────────────────────────

import type { Restaurant, RestaurantMenu, Menu, MenuDay, MenuIndexEntry, RestaurantTourLink } from '@/types/menu';

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
  tourProfileId: (r.tour_profile_id as string) ?? null,
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
        address: (r.address as string) ?? undefined,
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
          address: rest.address ?? null,
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
          'id, legacy_id, code, title, destination, days, linked_itinerary_id, linked_itinerary_name, linked_quote_id, linked_quote_name, tour_profile_id, created_at, created_by_name, updated_at, updated_by_name',
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
    tourProfileId: (row.tour_profile_id as string) ?? null,
    schedule: (days ?? []).map(rowToMenuDay),
    createdAt: row.created_at ? new Date(row.created_at as string).toISOString() : undefined,
    createdBy: (row.created_by_name as string) ?? undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : undefined,
    updatedBy: (row.updated_by_name as string) ?? undefined,
  };
}

/**
 * Save menu: upsert parent by legacy_id, replace menu_days children.
 * Preserves createdAt on re-save.
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
        tour_profile_id: m.tourProfileId ?? null,
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
 */
export async function sbDeleteMenu(
  id: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('menus').delete().eq('legacy_id', id);
  if (error) throw new Error('sbDeleteMenu: ' + error.message);
}

/**
 * Bản đồ ngược restaurantId → các tour (menu) đang dùng nhà hàng đó.
 * Hai truy vấn: `menus` (tên/điểm đến) + `menu_days` (meals JSONB chứa restaurantId).
 */
export async function sbGetRestaurantTourLinks(
  client: SupabaseClient = sb,
): Promise<Record<string, RestaurantTourLink[]>> {
  const { data: menus, error: mErr } = await client
    .from('menus')
    .select('id, legacy_id, title, destination, linked_quote_name');
  if (mErr) throw new Error('sbGetRestaurantTourLinks menus: ' + mErr.message);
  const { data: days, error: dErr } = await client
    .from('menu_days')
    .select('menu_id, meals');
  if (dErr) throw new Error('sbGetRestaurantTourLinks days: ' + dErr.message);

  const menuByUuid = new Map<string, RestaurantTourLink>();
  for (const r of menus ?? []) {
    menuByUuid.set(r.id as string, {
      menuId: (r.legacy_id as string) ?? (r.id as string),
      title: (r.title as string) || (r.linked_quote_name as string) || '(menu chưa đặt tên)',
      destination: (r.destination as string) ?? '',
    });
  }

  const out: Record<string, RestaurantTourLink[]> = {};
  const seen = new Set<string>(); // restaurantId|menuUuid — gộp nhiều bữa cùng 1 tour
  for (const d of days ?? []) {
    const menu = menuByUuid.get(d.menu_id as string);
    if (!menu) continue;
    const meals = (d.meals as { restaurantId?: string }[] | null) ?? [];
    for (const meal of meals) {
      const rid = meal?.restaurantId;
      if (!rid) continue;
      const key = rid + '|' + (d.menu_id as string);
      if (seen.has(key)) continue;
      seen.add(key);
      (out[rid] ??= []).push(menu);
    }
  }
  return out;
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

const rowToNotif = (r: Record<string, unknown>, attachments?: FileAttachment[]): Notification => ({
  id: (r.legacy_id as string) ?? (r.id as string),
  type: r.type as Notification['type'],
  title: r.title as string,
  message: r.message as string,
  createdBy: (r.created_by_name as string) ?? '',
  createdAt: r.created_at as string,
  read: (r.read as boolean) ?? false,
  link: (r.link as Notification['link']) ?? undefined,
  threadId: (r.thread_id as string) ?? undefined,
  priority: (r.priority as Notification['priority']) ?? undefined,
  reminder: (r.reminder as Notification['reminder']) ?? undefined,
  attachments: attachments && attachments.length ? attachments : undefined,
  data: (r.data as Record<string, unknown>) ?? undefined,
});

// ── Notifications ──

/**
 * Send a notification to a target user. Resolves username → user_id; inserts
 * one row; caps the user's notification list at 100 by deleting oldest excess.
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
    priority: notif.priority ?? null,
    reminder: notif.reminder ?? null,
    data: notif.data ?? null,
  });
  if (error) throw new Error('sbSendNotification: ' + error.message);
  if (notif.attachments?.length) {
    await saveAttachments(client, 'notification', legacyId, notif.attachments);
  }
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
    const rows = data ?? [];
    const legacyIds = rows.map((r) => (r.legacy_id as string) ?? (r.id as string)).filter(Boolean);
    const attMap = legacyIds.length
      ? await loadAttachmentsForParents(cl, 'notification', legacyIds)
      : new Map<string, FileAttachment[]>();
    return rows.map((r) => {
      const legacyId = (r.legacy_id as string) ?? (r.id as string);
      return rowToNotif(r, attMap.get(legacyId));
    });
  }, cb);
}

/**
 * Full-overwrite push of a user's notification list (used for mark-read).
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
    priority: n.priority ?? null,
    reminder: n.reminder ?? null,
    data: n.data ?? null,
  }));
  const ins = await client.from('notifications').insert(rows);
  if (ins.error) throw new Error('sbPushNotifications insert: ' + ins.error.message);
  // Re-save attachments unconditionally so that notifications previously pushed
  // WITH attachments but now pushed WITHOUT them correctly clear any orphaned rows
  // (attachments live in a separate table with no FK cascade from the delete-reinsert above).
  await Promise.all(
    notifications.map((n) => saveAttachments(client, 'notification', n.id, n.attachments ?? [])),
  );
}

/**
 * Send the same notification to multiple recipients (deduplicated).
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
    // merge: preserve existing link when caller doesn't supply one; update title like fb (thread.title || existing.title)
    const newLink = thread.link ?? (existing.link as string | null | undefined) ?? null;
    const newTitle = thread.title || (existing.title as string) || '';
    const linkChanged = newLink !== (existing.link ?? null);
    const titleChanged = newTitle !== (existing.title as string);
    if (linkChanged || titleChanged) {
      await client.from('notification_threads')
        .update({ link: newLink, title: newTitle })
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
 */
export async function sbAddThreadComment(
  id: string,
  comment: NotifComment,
  client: SupabaseClient = sb,
): Promise<void> {
  // Guard: no-op if thread doesn't exist (matches fbAddThreadComment: if (!snap.exists()) return)
  const { data: threadRow } = await client.from('notification_threads')
    .select('id').eq('id', id).maybeSingle();
  if (!threadRow) return;

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
    .select('id, settlement').eq('tour_key', tourKey).maybeSingle();
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

  return {
    payments,
    customItems,
    settlement: (parent.settlement as TourPayments['settlement']) ?? undefined,
  };
};

/**
 * Full-overwrite push of a tour's payments + customItems (+ settlement meta).
 */
export async function sbSaveTourPayments(
  tourKey: string,
  payments: Record<string, PaymentRecord>,
  customItems: CustomCostItem[],
  savedBy: string,
  settlement?: TourPayments['settlement'] | null,
  client: SupabaseClient = sb,
): Promise<void> {
  const now = new Date().toISOString();
  // `settlement === undefined` → KHÔNG đụng cột (giữ nguyên bản đã chốt khi chỉ lưu
  // payments). Chỉ ghi khi truyền tường minh (kể cả null để xoá khi mở khoá).
  const parentRow: Record<string, unknown> = { tour_key: tourKey, updated_at: now, updated_by: savedBy || 'unknown' };
  if (settlement !== undefined) parentRow.settlement = (settlement as unknown as Record<string, unknown>) ?? null;
  const { data: parent, error: upErr } = await client.from('tour_payments')
    .upsert(parentRow, { onConflict: 'tour_key' })
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
 */
export async function sbGetTourPayments(
  tourKey: string,
  client: SupabaseClient = sb,
): Promise<TourPayments | null> {
  return assembleTourPayments(client, tourKey);
}

/**
 * Subscribe to a tour's payment doc.
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
 * Final status rules:
 *   rejected at any stage  → 'rejected'
 *   approved at stage 2    → 'approved'
 *   approved at stage 1    → 'pending_stage2'
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
 */
export function sbSubscribePaymentApprovals(
  cb: (doc: PaymentApprovalDoc) => void,
  client: SupabaseClient = sb,
): Unsubscribe {
  return subscribeTable(client, 'payment_approvals', (cl) => assembleApprovals(cl), cb);
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Quote History Index
// Functions: generateQuoteCode, sbSaveQuote/sbSaveDMCQuote,
//            sbSubscribeQuoteHistory/sbSubscribeDMCQuoteHistory
// ─────────────────────────────────────────────────────────────────────────────

// ── Types (local) ──────────────────────────────────────────────────────────────

type SaveEntry = {
  id: number;
  cloudId: string;
  quoteCode?: string;
  name: string;
  template: Template;
  pax: number;
  totalCost: number;
  customerId?: string;
  customerName?: string;
  status?: string;
  valueRole?: QuoteValueRole;
  profit?: number;
  lossReason?: string;
  departDate?: string;
  workflowDue?: { label: string; dueDate: string; assignee?: string }[];
  workflowSummary?: { current?: string; currentAssignee?: string; donePct: number; total: number; overdue: number };
  collaborators?: Collaborator[];
  attachment?: FileAttachment;
  attachments?: FileAttachment[];
  linkedQuoteId?: string;
  linkedQuoteName?: string;
  linkedQuoteTemplate?: Template;
  tourProfileId?: string;
  tourCode?: string;
};

type SavedBy = { u: string; name: string; role: string };

// ── generateQuoteCode ───────────────────────────────────────────────────────────

/**
 * Generate a quote code like "NĐ.01.31.05.26" / "NN.01.31.05.26" / "DMC.01.31.05.26".
 * Seq is per-day-per-prefix count from `existing`.
 * Source: public/legacy.html:235-248.
 */
export function generateQuoteCode(template: Template, existing: CloudQuoteEntry[]): string {
  const prefix = template === 'intl' ? 'NN' : template === 'dmc' ? 'DMC' : 'NĐ';
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const dateStr = `${dd}.${mm}.${yy}`;
  const todaySameType = existing.filter(
    (q) => q.quoteCode?.startsWith(prefix + '.') && q.quoteCode.endsWith('.' + dateStr),
  ).length;
  const seq = String(todaySameType + 1).padStart(2, '0');
  return `${prefix}.${seq}.${dateStr}`;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Assemble a CloudQuoteEntry from a quotes row + collaborator rows.
 *  Note: quotes table stores `created_by_name` (display name). `createdByUsername`
 *  is set from the same column for the subscribe/load path; the save path overrides
 *  it from the call-context savedBy.u (see saveSingleQuoteEntry). */
function rowToCloudQuoteEntry(
  r: Record<string, unknown>,
  collabs: Record<string, unknown>[],
): CloudQuoteEntry {
  return {
    id: (r.legacy_num_id as number) ?? 0,
    cloudId: r.cloud_id as string,
    quoteCode: (r.quote_code as string) ?? '',
    name: (r.name as string) ?? '',
    template: r.template as Template,
    pax: (r.pax as number) ?? 0,
    totalCost: (r.total_cost as number) ?? 0,
    status: (r.status as CloudQuoteEntry['status']) ?? undefined,
    valueRole: (r.quote_value_role as CloudQuoteEntry['valueRole']) ?? undefined,
    profit: (r.quote_profit as number | null) ?? undefined,
    lossReason: (r.loss_reason as string) ?? undefined,
    // quotes.customer_id lưu UUID (FK), nhưng cả app khớp khách theo Customer.id =
    // legacy_id. Đọc legacy_id qua embed FK (cust_ref) để customerId LUÔN là legacy,
    // khớp custById/customers.find. KHÔNG trả uuid thô (sẽ trượt mọi lookup).
    customerId: (r.cust_ref as { legacy_id?: string } | null)?.legacy_id ?? undefined,
    customerName: (r.customer_name as string) ?? undefined,
    departDate: r.depart_date ? new Date(r.depart_date as string).toISOString().slice(0, 10) : undefined,
    workflowDue: (r.workflow_due as CloudQuoteEntry['workflowDue']) ?? undefined,
    workflowSummary: (r.workflow_summary as CloudQuoteEntry['workflowSummary']) ?? undefined,
    paymentSummary: (r.payment_summary as CloudQuoteEntry['paymentSummary']) ?? undefined,
    settlementSummary: (r.settlement_summary as CloudQuoteEntry['settlementSummary']) ?? undefined,
    nccDue: (r.ncc_due as CloudQuoteEntry['nccDue']) ?? undefined,
    share: (r.share as CloudQuoteEntry['share']) ?? undefined,
    linkedQuoteId: (r.linked_quote_id as string) ?? undefined,
    linkedQuoteName: (r.linked_quote_name as string) ?? undefined,
    linkedQuoteTemplate: (r.linked_quote_template as Template) ?? undefined,
    tourProfileId: (r.tour_profile_id as string) ?? undefined,
    tourCode: (r.tour_code as string) ?? undefined,
    createdByUsername: (r.created_by_username as string) ?? '',
    createdByName: (r.created_by_name as string) ?? '',
    collaborators: collabs.map((c) => ({ u: (c.username as string) ?? '', name: (c.name as string) ?? '' })),
    createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : new Date().toISOString(),
    updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : new Date().toISOString(),
    updatedBy: (r.updated_by_name as string) ?? '',
    attachment: undefined,
    attachments: undefined,
  };
}

/** Shared upsert logic for both regular and DMC save. isDmc controls which
 *  existing rows are counted when auto-generating a quote_code. */
async function saveSingleQuoteEntry(
  entry: SaveEntry,
  savedBy: SavedBy,
  isDmc: boolean,
  client: SupabaseClient,
): Promise<CloudQuoteEntry> {
  const nowIso = new Date().toISOString();
  const savedByLabel = `${savedBy.name} (${savedBy.role})`;

  // 1. Fetch the existing row for this cloud_id (to preserve code/createdAt on update)
  const { data: existing, error: fetchErr } = await client
    .from('quotes')
    .select('id, quote_code, template, created_at, created_by_name, created_by_username')
    .eq('cloud_id', entry.cloudId)
    .maybeSingle();
  if (fetchErr) throw new Error('sbSaveQuote fetch: ' + fetchErr.message);

  let quoteCode: string;
  let createdAt: string;
  let createdByName: string;
  let createdByUsername: string;
  // Phân loại (Báo giá vs DMC) là BẤT BIẾN sau khi tạo: khi cập nhật một báo giá đã
  // tồn tại, GIỮ template trong DB thay vì lấy từ draft. Nếu draft mang template khác
  // (ví dụ điều hướng thoát màn DMC đặt tạm template='intl' mà còn currentQuoteId trỏ
  // về DMC) thì lần Lưu kế tiếp KHÔNG còn dời báo giá sang sheet khác — "lưu nhầm qua
  // nhau". Chốt chặn này song hành với save_quote_state (migration 0083).
  let resolvedTemplate: string = entry.template;
  if (existing) {
    const storedTemplate = existing.template as string | null;
    if (storedTemplate) {
      if (storedTemplate !== entry.template) {
        console.warn(
          `sbSaveQuote: bỏ qua đổi template ${storedTemplate} → ${entry.template} ` +
          `cho cloud_id=${entry.cloudId} (giữ phân loại gốc để tránh dời sheet Báo giá↔DMC).`,
        );
      }
      resolvedTemplate = storedTemplate;
    }
  }

  if (existing) {
    // update: preserve code + createdAt + creator info
    quoteCode = (existing.quote_code as string) ?? entry.quoteCode ?? '';
    createdAt = existing.created_at as string;
    createdByName = (existing.created_by_name as string) || savedBy.name;
    createdByUsername = (existing.created_by_username as string) || savedBy.u;
  } else {
    // insert: auto-generate code from existing same-family rows
    if (entry.quoteCode) {
      quoteCode = entry.quoteCode;
    } else {
      // count existing rows of the same template family to seed generateQuoteCode
      let countQ = client.from('quotes').select('quote_code');
      if (isDmc) {
        countQ = countQ.eq('template', 'dmc');
      } else {
        countQ = countQ.neq('template', 'dmc');
      }
      const { data: existingRows, error: cntErr } = await countQ;
      if (cntErr) throw new Error('sbSaveQuote count: ' + cntErr.message);
      // Build a minimal CloudQuoteEntry[] sufficient for generateQuoteCode's filter
      const existingEntries: CloudQuoteEntry[] = (existingRows ?? []).map(
        (r) => ({ quoteCode: r.quote_code as string } as CloudQuoteEntry),
      );
      quoteCode = generateQuoteCode(entry.template, existingEntries);
    }
    createdAt = nowIso;
    createdByName = savedBy.name;
    createdByUsername = savedBy.u;
  }

  // 2. Build the index row
  const row: Record<string, unknown> = {
    cloud_id: entry.cloudId,
    legacy_num_id: entry.id,
    quote_code: quoteCode,
    name: entry.name,
    template: resolvedTemplate,
    pax: entry.pax,
    total_cost: entry.totalCost,
    created_at: createdAt,
    created_by_name: createdByName,
    created_by_username: createdByUsername,
    updated_at: nowIso,
    updated_by_name: savedByLabel,
  };

  // optional fields: only write when defined
  if (entry.status !== undefined)           row.status = entry.status;
  if (entry.valueRole !== undefined)        row.quote_value_role = entry.valueRole;
  if (entry.profit !== undefined)           row.quote_profit = entry.profit;
  if (entry.lossReason !== undefined)       row.loss_reason = entry.lossReason;
  if (entry.customerName !== undefined)     row.customer_name = entry.customerName;
  if (entry.departDate !== undefined)       row.depart_date = entry.departDate || null;
  if (entry.workflowDue !== undefined)      row.workflow_due = entry.workflowDue;
  if (entry.workflowSummary !== undefined)  row.workflow_summary = entry.workflowSummary;
  if (entry.linkedQuoteId !== undefined)    row.linked_quote_id = entry.linkedQuoteId;
  if (entry.linkedQuoteName !== undefined)  row.linked_quote_name = entry.linkedQuoteName;
  if (entry.linkedQuoteTemplate !== undefined) row.linked_quote_template = entry.linkedQuoteTemplate;
  if (entry.tourProfileId !== undefined)    row.tour_profile_id = entry.tourProfileId;
  if (entry.tourCode !== undefined)         row.tour_code = entry.tourCode;

  // resolve customerId (legacy string) → uuid FK
  if (entry.customerId !== undefined) {
    const { data: cust } = await client
      .from('customers')
      .select('id')
      .eq('legacy_id', entry.customerId)
      .maybeSingle();
    row.customer_id = cust?.id ?? null;
  }

  // resolve created_by uuid on insert
  if (!existing) {
    const idMap = await usernamesToIds(client, [savedBy.u]);
    row.created_by = idMap.get(savedBy.u) ?? null;
  }

  // 3. Upsert the quotes index row
  const { data: upserted, error: upErr } = await client
    .from('quotes')
    .upsert(row, { onConflict: 'cloud_id' })
    .select('id, cloud_id, legacy_num_id, quote_code, name, template, pax, total_cost, status, quote_value_role, quote_profit, loss_reason, ' +
            'customer_id, cust_ref:customers(legacy_id), customer_name, depart_date, workflow_due, workflow_summary, payment_summary, settlement_summary, ' +
            'linked_quote_id, linked_quote_name, linked_quote_template, tour_profile_id, tour_code, ' +
            'created_by_name, created_by_username, created_at, updated_at, updated_by_name')
    .single();
  if (upErr) throw new Error('sbSaveQuote upsert: ' + upErr.message);

  const upsertedRow = upserted as unknown as Record<string, unknown>;
  const quoteUuid = upsertedRow.id as string;

  // 4. Upsert quote_collaborators (full replace for this quote)
  if (entry.collaborators !== undefined) {
    const collaborators = entry.collaborators ?? [];
    const collabIdMap = await usernamesToIds(client, collaborators.map((c) => c.u));
    const collabRows = collaborators.map((col) => ({
      quote_id: quoteUuid,
      user_id: collabIdMap.get(col.u) ?? null,
      username: col.u,
      name: col.name,
    }));
    await replaceChildren(client, 'quote_collaborators', 'quote_id', quoteUuid, collabRows);
  }

  // 5. Save quote-level attachments (parent_type='quote', parent_id=cloud_id)
  const atts = entry.attachments ?? (entry.attachment ? [entry.attachment] : undefined);
  if (atts !== undefined) {
    await saveAttachments(client, 'quote', entry.cloudId, atts);
  }

  // 6. Load the saved collaborators for the return value
  const { data: collabData } = await client
    .from('quote_collaborators')
    .select('username, name')
    .eq('quote_id', quoteUuid)
    .order('name');

  const savedEntry = rowToCloudQuoteEntry(upsertedRow, collabData ?? []);
  // Override creator fields from call context — DB only stores created_by_name (display name)
  savedEntry.createdByUsername = createdByUsername;
  savedEntry.createdByName = createdByName;
  return savedEntry;
}

// ── Assemble history list (shared between regular and DMC subscribe) ──────────

async function loadQuoteHistory(
  client: SupabaseClient,
  isDmc: boolean,
): Promise<CloudQuoteEntry[]> {
  let q = client
    .from('quotes')
    .select('id, cloud_id, legacy_num_id, quote_code, name, template, pax, total_cost, status, quote_value_role, quote_profit, loss_reason, ' +
            'customer_id, cust_ref:customers(legacy_id), customer_name, depart_date, workflow_due, workflow_summary, payment_summary, settlement_summary, ncc_due, ' +
            'linked_quote_id, linked_quote_name, linked_quote_template, tour_profile_id, tour_code, share, ' +
            'created_by_name, created_by_username, created_at, updated_at, updated_by_name')
    .order('created_at', { ascending: false });

  q = isDmc ? q.eq('template', 'dmc') : q.neq('template', 'dmc');

  const { data: rawRows, error } = await q;
  if (error) throw new Error('loadQuoteHistory: ' + error.message);

  if (!rawRows || rawRows.length === 0) return [];

  const rows = rawRows as unknown as Record<string, unknown>[];
  const quoteIds = rows.map((r) => r.id as string);
  const cloudIds = rows.map((r) => r.cloud_id as string);

  const [
    { data: collabRows, error: collabErr },
    attMap,
  ] = await Promise.all([
    client
      .from('quote_collaborators')
      .select('quote_id, username, name')
      .in('quote_id', quoteIds)
      .order('name'),
    loadAttachmentsForParents(client, 'quote', cloudIds),
  ]);
  if (collabErr) throw new Error('loadQuoteHistory collabs: ' + collabErr.message);

  const collabsByQuote = new Map<string, Record<string, unknown>[]>();
  for (const c of collabRows ?? []) {
    const arr = collabsByQuote.get(c.quote_id as string) ?? [];
    arr.push(c as Record<string, unknown>);
    collabsByQuote.set(c.quote_id as string, arr);
  }

  return rows.map((r) => {
    const entry = rowToCloudQuoteEntry(r, collabsByQuote.get(r.id as string) ?? []);
    const atts = attMap.get(r.cloud_id as string);
    if (atts && atts.length > 0) entry.attachments = atts;
    return entry;
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save (insert or update) a regular quote's index metadata.
 * On insert: auto-generates quote_code (counting non-dmc rows) via generateQuoteCode.
 * On update: preserves existing quote_code and createdAt.
 */
export async function sbSaveQuote(
  entry: SaveEntry,
  savedBy: SavedBy,
  client: SupabaseClient = sb,
): Promise<CloudQuoteEntry> {
  return saveSingleQuoteEntry(entry, savedBy, false, client);
}

/**
 * Save (insert or update) a DMC quote's index metadata.

 * On insert: auto-generates quote_code counting only template='dmc' rows.
 */
export async function sbSaveDMCQuote(
  entry: SaveEntry,
  savedBy: SavedBy,
  client: SupabaseClient = sb,
): Promise<CloudQuoteEntry> {
  return saveSingleQuoteEntry(entry, savedBy, true, client);
}

/**
 * Subscribe to the regular quote history index (template <> 'dmc'), newest first.
 */
export function sbSubscribeQuoteHistory(
  cb: (quotes: CloudQuoteEntry[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(
    client,
    'quotes',
    (cl) => loadQuoteHistory(cl, false),
    cb,
  );
}

/**
 * Subscribe to the DMC quote history index (template = 'dmc'), newest first.
 */
export function sbSubscribeDMCQuoteHistory(
  cb: (quotes: CloudQuoteEntry[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(
    client,
    'quotes',
    (cl) => loadQuoteHistory(cl, true),
    cb,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hồ sơ tour (Tour Profile) — aggregate root MỎNG. Row-per-profile (xem 0043).
// Functions: sbNextTourCode, sbSubscribe/Upsert/Delete TourProfile.
// ─────────────────────────────────────────────────────────────────────────────

const rowToTourProfile = (r: Record<string, unknown>): TourProfile => ({
  id: r.id as string,
  code: (r.code as string) ?? '',
  kind: (r.kind as TourKind) ?? 'domestic',
  // Đọc kép: category mới; nếu thiếu (dữ liệu cũ) suy từ kind ở tầng helper.
  category: (r.category as TourProfile['category']) ?? undefined,
  name: (r.name as string) ?? '',
  customerId: (r.customer_id as string) ?? undefined,
  customerName: (r.customer_name as string) ?? undefined,
  dest: (r.dest as string) ?? undefined,
  departRegion: (r.depart_region as string) ?? undefined,
  startDate: r.start_date ? new Date(r.start_date as string).toISOString().slice(0, 10) : null,
  pax: (r.pax as number) ?? 0,
  days: (r.days as number) ?? undefined,
  nights: (r.nights as number) ?? undefined,
  priority: (r.priority as TourProfile['priority']) ?? undefined,
  leadSource: (r.lead_source as string) ?? undefined,
  plannedContractValue: (r.planned_contract_value as number | null) ?? undefined,
  plannedSettlementValue: (r.planned_settlement_value as number | null) ?? undefined,
  primaryQuoteId: (r.primary_quote_id as string) ?? undefined,
  manualStage: (r.manual_stage as TourProfile['manualStage']) ?? undefined,
  status: (r.status as TourProfile['status']) ?? 'open',
  note: (r.note as string) ?? undefined,
  collaborators: (r.collaborators as Collaborator[]) ?? [],
  followers: (r.followers as Collaborator[]) ?? [],
  eventStaff: (r.event_staff as Collaborator[]) ?? [],
  documents: (r.documents as TourProfile['documents']) ?? [],
  tags: (r.tags as string[]) ?? [],
  marginApproval: (r.margin_approval as TourProfile['marginApproval']) ?? null,
  deleteRequest: (r.delete_request as TourProfile['deleteRequest']) ?? null,
  createdByU: (r.created_by_username as string) ?? undefined,
  createdBy: (r.created_by_name as string) ?? undefined,
  createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : new Date().toISOString(),
  updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : undefined,
  updatedBy: (r.updated_by_name as string) ?? undefined,
});

const tourProfileToRow = (p: TourProfile): Record<string, unknown> => ({
  id: p.id,
  code: p.code,
  kind: p.kind,
  category: p.category ?? null,
  name: p.name,
  customer_id: p.customerId ?? null,
  customer_name: p.customerName ?? null,
  dest: p.dest ?? null,
  depart_region: p.departRegion ?? null,
  start_date: p.startDate ?? null,
  pax: p.pax ?? 0,
  days: p.days ?? null,
  nights: p.nights ?? null,
  priority: p.priority ?? null,
  lead_source: p.leadSource ?? null,
  planned_contract_value: p.plannedContractValue ?? null,
  planned_settlement_value: p.plannedSettlementValue ?? null,
  info_locked: false, // cột cũ (NOT NULL) — tính năng khoá hồ sơ đã bỏ; luôn ghi false.
  primary_quote_id: p.primaryQuoteId ?? null,
  manual_stage: p.manualStage ?? null,
  status: p.status ?? 'open',
  note: p.note ?? '',
  collaborators: p.collaborators ?? [],
  followers: p.followers ?? [],
  event_staff: p.eventStaff ?? [],
  documents: p.documents ?? [],
  tags: p.tags ?? [],
  margin_approval: p.marginApproval ?? null,
  delete_request: p.deleteRequest ?? null,
  created_by_username: p.createdByU ?? '',
  created_by_name: p.createdBy ?? '',
  created_at: p.createdAt,
  updated_at: p.updatedAt ?? null,
  updated_by_name: p.updatedBy ?? null,
});

/** Sinh mã hồ sơ tour ATOMIC ở DB (advisory lock theo ngày → chống trùng STT). */
export async function sbNextTourCode(
  kindOrCategory: TourKind | TourCategory,
  client: SupabaseClient = sb,
): Promise<string> {
  // RPC nhận cả kind cũ (domestic/intl) lẫn category mới (visa/event/other…).
  const { data, error } = await client.rpc('next_tour_code', { p_kind: kindOrCategory });
  if (error) throw new Error('sbNextTourCode: ' + error.message);
  return data as string;
}

/** Đặt / đổi mật khẩu xuất danh sách khách visa (chỉ Trưởng Phòng+ — DB chặn). */
export async function sbSetVisaExportPassword(pw: string, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.rpc('set_visa_export_password', { new_pw: pw });
  if (error) throw new Error(error.message);
}

/** Kiểm tra mật khẩu xuất (DB so bcrypt, không lộ hash). */
export async function sbVerifyVisaExportPassword(pw: string, client: SupabaseClient = sb): Promise<boolean> {
  const { data, error } = await client.rpc('verify_visa_export_password', { pw });
  if (error) throw new Error(error.message);
  return data === true;
}

/** Đã có người đặt mật khẩu xuất hay chưa. */
export async function sbVisaExportPasswordIsSet(client: SupabaseClient = sb): Promise<boolean> {
  const { data, error } = await client.rpc('visa_export_password_is_set');
  if (error) throw new Error(error.message);
  return data === true;
}

export function sbSubscribeTourProfiles(
  cb: (list: TourProfile[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(client, 'tour_profiles', async (cl) => {
    const { data, error } = await cl
      .from('tour_profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error('sbSubscribeTourProfiles: ' + error.message);
    return (data ?? []).map(rowToTourProfile);
  }, cb);
}

/** Upsert một hồ sơ (tạo/sửa). Chỉ đụng đúng dòng đó → không ghi đè hồ sơ khác. */
export async function sbUpsertTourProfile(p: TourProfile, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.from('tour_profiles').upsert(tourProfileToRow(p), { onConflict: 'id' });
  if (error) throw new Error('sbUpsertTourProfile: ' + error.message);
}

export async function sbDeleteTourProfile(id: string, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.from('tour_profiles').delete().eq('id', id);
  if (error) throw new Error('sbDeleteTourProfile: ' + error.message);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Yêu cầu duyệt XUẤT FILE (Excel) — cần Trưởng Phòng trở lên (migration 0065).
// ─────────────────────────────────────────────────────────────────────────────

const rowToExportRequest = (r: Record<string, unknown>): ExportRequest => ({
  id: r.id as string,
  scope: ((r.scope as ExportScope) ?? 'tour_profiles'),
  detail: (r.detail as string) ?? undefined,
  status: (r.status as ExportRequest['status']) ?? 'pending',
  requestedByU: (r.requested_by_username as string) ?? undefined,
  requestedByName: (r.requested_by_name as string) ?? undefined,
  requestedAt: r.requested_at ? new Date(r.requested_at as string).toISOString() : new Date().toISOString(),
  decidedByName: (r.decided_by_name as string) ?? undefined,
  decidedAt: r.decided_at ? new Date(r.decided_at as string).toISOString() : undefined,
  rejectReason: (r.reject_reason as string) ?? undefined,
});

export function sbSubscribeExportRequests(
  cb: (list: ExportRequest[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(client, 'export_requests', async (cl) => {
    const { data, error } = await cl
      .from('export_requests')
      .select('*')
      .order('requested_at', { ascending: false });
    if (error) throw new Error('sbSubscribeExportRequests: ' + error.message);
    return (data ?? []).map(rowToExportRequest);
  }, cb);
}

/** Người gửi tạo yêu cầu xuất (status='pending'). `requested_by` lấy từ phiên đăng nhập. */
export async function sbCreateExportRequest(
  input: { id: string; scope: ExportScope; detail?: string; requestedByUsername?: string; requestedByName?: string },
  client: SupabaseClient = sb,
): Promise<void> {
  const { data: auth } = await client.auth.getUser();
  const { error } = await client.from('export_requests').insert({
    id: input.id,
    scope: input.scope,
    detail: input.detail ?? null,
    status: 'pending',
    requested_by: auth.user?.id ?? null,
    requested_by_username: input.requestedByUsername ?? null,
    requested_by_name: input.requestedByName ?? null,
  });
  if (error) throw new Error('sbCreateExportRequest: ' + error.message);
}

/** DUYỆT yêu cầu xuất (DB chặn: chỉ Trưởng Phòng+). */
export async function sbApproveExportRequest(id: string, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.rpc('approve_export_request', { p_id: id });
  if (error) throw new Error(error.message);
}

/** TỪ CHỐI yêu cầu xuất (DB chặn: chỉ Trưởng Phòng+). */
export async function sbRejectExportRequest(id: string, reason: string, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.rpc('reject_export_request', { p_id: id, p_reason: reason });
  if (error) throw new Error(error.message);
}

/** Xoá yêu cầu (người gửi tiêu thụ sau khi tải, hoặc dọn yêu cầu bị từ chối). */
export async function sbDeleteExportRequest(id: string, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.from('export_requests').delete().eq('id', id);
  if (error) throw new Error('sbDeleteExportRequest: ' + error.message);
}

// ── Phase 2 Task 5 — Quote Project State ────────────────────────────────────
// Functions: sbSaveQuoteState/sbSaveDMCQuoteState, sbGetQuoteProject/sbGetDMCQuoteProject

import type { QuoteDraft, QuoteVersion, CloudQuoteProject, QuoteFlight } from '@/types/quote';
import { decomposeQuote, assembleQuote, assembleFlights } from './supabase/quoteMap';

// ── shared save implementation ────────────────────────────────────────────────

async function saveQuoteStateImpl(
  cloudId: string,
  state: QuoteDraft,
  note: string | undefined,
  savedBy: { name: string; role: string },
  client: SupabaseClient,
): Promise<void> {
  // 1. Look up the quotes row uuid by cloud_id to derive max(version_no)
  const { data: qRow, error: qErr } = await client
    .from('quotes')
    .select('id, created_at, created_by_name')
    .eq('cloud_id', cloudId)
    .maybeSingle();
  if (qErr) throw new Error('sbSaveQuoteState fetch quote: ' + qErr.message);

  const quoteUuid = qRow?.id as string | undefined;

  // 2. Derive next version_no from current max (handles concurrent trims correctly)
  let versionNo = 1;
  if (quoteUuid) {
    const { data: maxRow } = await client
      .from('quote_versions')
      .select('version_no')
      .eq('quote_id', quoteUuid)
      .order('version_no', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxRow) versionNo = (maxRow.version_no as number) + 1;
  }

  // 3. Build RPC payload — decomposeQuote omits total_cost so the RPC's CASE WHEN
  //    q ? 'total_cost' clause preserves the index-owned value on conflict.
  const payload = decomposeQuote(cloudId, state, {
    createdAt: qRow?.created_at as string | undefined,
    createdByName: qRow?.created_by_name as string | undefined,
    updatedByName: savedBy.name,
  });

  // 4. Attach version snapshot
  const savedByLabel = `${savedBy.name} (${savedBy.role})`;
  (payload as Record<string, unknown>).version = {
    version_no: versionNo,
    saved_at: new Date().toISOString(),
    saved_by: savedByLabel,
    note: note?.trim() || `Phiên bản ${versionNo}`,
    state,
  };

  // 5. Resolve workflow assignee usernames → UUIDs (cosmetic #9: populate assignee_user_id FK).
  const assigneeUsernames = (state.workflow ?? []).map((s) => s.assignee).filter(Boolean) as string[];
  const assigneeIdMap = assigneeUsernames.length
    ? await usernamesToIds(client, assigneeUsernames)
    : new Map<string, string>();

  // 6. Call the atomic RPC
  const { error } = await client.rpc('save_quote_state', { p: payload });
  if (error) throw new Error('sbSaveQuoteState: ' + error.message);

  // 7. After RPC: save step attachments and populate assignee_user_id (no new migration needed).
  const workflowSteps = state.workflow ?? [];

  // a) Save per-step attachments — keyed by cloudId::stepId, so no quote uuid needed.
  //    Run unconditionally: empty array clears stale rows.
  await Promise.all(
    workflowSteps.map((s) =>
      saveAttachments(client, 'quote_workflow_step', `${cloudId}::${s.id}`, s.attachments ?? []),
    ),
  );

  // b) Fetch the quote uuid to scope assignee_user_id UPDATE to the correct rows.
  //    The RPC must have created/updated the row; null here is a real anomaly.
  const { data: freshRow } = await client
    .from('quotes')
    .select('id')
    .eq('cloud_id', cloudId)
    .maybeSingle();
  const quoteUuidForPost = freshRow?.id as string | undefined;
  if (!quoteUuidForPost) {
    throw new Error('saveQuoteStateImpl: quote row not found after RPC for ' + cloudId);
  }

  // c) Populate assignee_user_id for steps that have a resolvable assignee
  const stepsWithAssignee = workflowSteps.filter(
    (s) => s.assignee && assigneeIdMap.has(s.assignee),
  );
  if (stepsWithAssignee.length) {
    await Promise.all(
      stepsWithAssignee.map((s) =>
        client
          .from('quote_workflow_steps')
          .update({ assignee_user_id: assigneeIdMap.get(s.assignee!) })
          .eq('quote_id', quoteUuidForPost)
          .eq('legacy_step_id', s.id),
      ),
    );
  }
}

// ── shared get implementation ─────────────────────────────────────────────────

async function getQuoteProjectImpl(
  cloudId: string,
  client: SupabaseClient,
): Promise<CloudQuoteProject | null> {
  // 1. Fetch the quotes row (full row for assembleQuote)
  const { data: qRow, error: qErr } = await client
    .from('quotes')
    .select('*')
    .eq('cloud_id', cloudId)
    .maybeSingle();
  if (qErr) throw new Error('sbGetQuoteProject quotes: ' + qErr.message);
  if (!qRow) return null;

  const quoteId = (qRow as unknown as Record<string, unknown>).id as string;
  const row = qRow as unknown as Record<string, unknown>;

  // 2. Fetch all child rows + versions + collaborators in parallel
  const [
    { data: lineItems, error: liErr },
    { data: flights, error: flErr },
    { data: workflow, error: wfErr },
    { data: groups, error: grErr },
    { data: payments, error: pyErr },
    { data: passengerRows, error: paxErr },
    { data: versions, error: vErr },
    { data: collabRows, error: cErr },
  ] = await Promise.all([
    client.from('quote_line_items').select('*').eq('quote_id', quoteId).order('sort_order'),
    client.from('quote_flights').select('*').eq('quote_id', quoteId).order('sort_order'),
    client.from('quote_workflow_steps').select('*').eq('quote_id', quoteId).order('sort_order'),
    client.from('quote_groups').select('*').eq('quote_id', quoteId).order('sort_order'),
    client.from('quote_payments').select('*').eq('quote_id', quoteId).order('sort_order'),
    client.from('quote_passengers').select('*').eq('quote_id', quoteId).order('sort_order'),
    client.from('quote_versions').select('*').eq('quote_id', quoteId).order('version_no', { ascending: false }),
    client.from('quote_collaborators').select('*').eq('quote_id', quoteId),
  ]);

  for (const e of [liErr, flErr, wfErr, grErr, pyErr, paxErr, vErr, cErr]) {
    if (e) throw new Error('sbGetQuoteProject fetch: ' + e.message);
  }

  // 3. Resolve child ids for nested children (segments, fares, logs, group items)
  const flightIds = (flights ?? []).map((f) => (f as unknown as Record<string, unknown>).id as string);
  const stepIds = (workflow ?? []).map((s) => (s as unknown as Record<string, unknown>).id as string);
  const groupIds = (groups ?? []).map((g) => (g as unknown as Record<string, unknown>).id as string);

  const [
    { data: segments, error: segErr },
    { data: fares, error: farErr },
    { data: logs, error: logErr },
    { data: groupItems, error: giErr },
  ] = await Promise.all([
    flightIds.length
      ? client.from('quote_flight_segments').select('*').in('flight_id', flightIds).order('sort_order')
      : Promise.resolve({ data: [] as unknown[], error: null }),
    flightIds.length
      ? client.from('quote_flight_fares').select('*').in('flight_id', flightIds).order('sort_order')
      : Promise.resolve({ data: [] as unknown[], error: null }),
    stepIds.length
      ? client.from('quote_workflow_logs').select('*').in('step_id', stepIds).order('sort_order')
      : Promise.resolve({ data: [] as unknown[], error: null }),
    groupIds.length
      ? client.from('quote_group_items').select('*').in('group_id', groupIds).order('sort_order')
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);

  for (const e of [segErr, farErr, logErr, giErr]) {
    if (e) throw new Error('sbGetQuoteProject children: ' + (e as { message: string }).message);
  }

  // 4. Assemble fresh state from shredded rows (items/flights/workflow/groups/…)
  const assembled = assembleQuote({
    quote: row,
    lineItems: (lineItems ?? []) as unknown as Record<string, unknown>[],
    flights: (flights ?? []) as unknown as Record<string, unknown>[],
    segments: (segments ?? []) as unknown as Record<string, unknown>[],
    fares: (fares ?? []) as unknown as Record<string, unknown>[],
    workflow: (workflow ?? []) as unknown as Record<string, unknown>[],
    logs: (logs ?? []) as unknown as Record<string, unknown>[],
    groups: (groups ?? []) as unknown as Record<string, unknown>[],
    groupItems: (groupItems ?? []) as unknown as Record<string, unknown>[],
    payments: (payments ?? []) as unknown as Record<string, unknown>[],
    passengers: (passengerRows ?? []) as unknown as Record<string, unknown>[],
  });

  // 4b. Batch-load per-step attachments using composite parent_id = `${cloudId}::${step.id}`
  if (assembled.workflow && assembled.workflow.length > 0) {
    const compositeIds = assembled.workflow.map((s) => `${cloudId}::${s.id}`);
    const attMap = await loadAttachmentsForParents(client, 'quote_workflow_step', compositeIds);
    for (const step of assembled.workflow) {
      const atts = attMap.get(`${cloudId}::${step.id}`);
      if (atts && atts.length > 0) step.attachments = atts;
    }
  }

  // 5. Map quote_versions rows → QuoteVersion[] (already ordered newest-first by version_no desc)
  const mappedVersions: QuoteVersion[] = (versions ?? []).map((v) => {
    const vr = v as unknown as Record<string, unknown>;
    return {
      versionNo: vr.version_no as number,
      savedAt: new Date(vr.saved_at as string).toISOString(),
      savedBy: vr.saved_by as string,
      note: vr.note as string,
      state: vr.state as QuoteDraft,
    };
  });

  // 4c. currentState = full snapshot của version mới nhất (NỀN) phủ field tươi từ
  // shredded/index (assembled) lên trên. Vì assembleQuote chỉ tái dựng một số field,
  // nền version giữ lại các field nó KHÔNG xử lý: validUntil/rateDate/cancellation/
  // advance/catOrder/deadline/request… (chống mất khi lưu cloud → mở lại). Field
  // index-owned (status/valueRole/rates/tourProfileId) được loadCloud override tiếp.
  const latestState = mappedVersions[0]?.state as QuoteDraft | undefined;
  const currentState: QuoteDraft = latestState ? { ...latestState, ...assembled } : assembled;

  // 6. Map collaborators (username → Collaborator)
  const collaborators: Collaborator[] = (collabRows ?? []).map((r) => {
    const cr = r as unknown as Record<string, unknown>;
    return { u: (cr.username as string) ?? '', name: (cr.name as string) ?? '' };
  });

  return {
    versions: mappedVersions,
    currentState,
    collaborators,
    updatedAt: new Date(row.updated_at as string).toISOString(),
    updatedBy: (row.updated_by_name as string) ?? '',
  };
}

// ── public exports ────────────────────────────────────────────────────────────

/** Save quote state to Supabase. Computes next version_no via
 *  max(version_no)+1, builds decomposeQuote payload with version snapshot, calls
 *  save_quote_state(p jsonb) RPC atomically. decomposeQuote omits total_cost so the
 *  RPC's CASE WHEN q ? 'total_cost' clause preserves the index-owned value. */
export async function sbSaveQuoteState(
  cloudId: string,
  state: QuoteDraft,
  note: string | undefined,
  savedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  return saveQuoteStateImpl(cloudId, state, note, savedBy, client);
}

/** DMC variant of sbSaveQuoteState. The draft's template field already equals 'dmc';
 *  this function is a thin alias kept for API parity with fbSaveDMCQuoteState. */
export async function sbSaveDMCQuoteState(
  cloudId: string,
  state: QuoteDraft,
  note: string | undefined,
  savedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  return saveQuoteStateImpl(cloudId, state, note, savedBy, client);
}

/** Fetch a quote project from Supabase. SELECTs the quotes row + all
 *  child tables + quote_versions + quote_collaborators; reassembles currentState via
 *  assembleQuote; returns QuoteVersion[] newest-first. Returns null if absent. */
export async function sbGetQuoteProject(
  cloudId: string,
  client: SupabaseClient = sb,
): Promise<CloudQuoteProject | null> {
  return getQuoteProjectImpl(cloudId, client);
}

/** DMC variant of sbGetQuoteProject. Behaviour is identical — the quotes.template
 *  discriminator ('dmc') is already in the row; this alias preserves API parity with
 *  fbGetDMCQuoteProject. */
export async function sbGetDMCQuoteProject(
  cloudId: string,
  client: SupabaseClient = sb,
): Promise<CloudQuoteProject | null> {
  return getQuoteProjectImpl(cloudId, client);
}

/** Tra uuid của báo giá theo cloud_id; ném nếu không tìm thấy. Dùng cho các thao
 *  tác trên phiên bản (xoá / đổi tên) — quote_versions khoá theo quote_id (uuid). */
async function quoteUuidByCloudId(
  cloudId: string,
  fn: string,
  client: SupabaseClient,
): Promise<string> {
  const { data: qRow, error } = await client
    .from('quotes').select('id').eq('cloud_id', cloudId).maybeSingle();
  if (error) throw new Error(`${fn} fetch quote: ` + error.message);
  const quoteId = (qRow as Record<string, unknown> | null)?.id as string | undefined;
  if (!quoteId) throw new Error(`${fn}: không tìm thấy báo giá`);
  return quoteId;
}

/** Xoá MỘT phiên bản của báo giá (theo cloudId + versionNo) — KHÔNG xoá báo giá.
 *  RLS `qv_write` (for all) cho phép viettours-user xoá trực tiếp quote_versions.
 *  Dùng chung cho cả báo giá thường lẫn DMC (cùng bảng, cloud_id là duy nhất). */
export async function sbDeleteQuoteVersion(
  cloudId: string,
  versionNo: number,
  client: SupabaseClient = sb,
): Promise<void> {
  const quoteId = await quoteUuidByCloudId(cloudId, 'sbDeleteQuoteVersion', client);
  const { error } = await client
    .from('quote_versions').delete().eq('quote_id', quoteId).eq('version_no', versionNo);
  if (error) throw new Error('sbDeleteQuoteVersion: ' + error.message);
}

/** Đổi ghi chú/tên hiển thị của một phiên bản (theo cloudId + versionNo). */
export async function sbRenameQuoteVersion(
  cloudId: string,
  versionNo: number,
  note: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const quoteId = await quoteUuidByCloudId(cloudId, 'sbRenameQuoteVersion', client);
  const { error } = await client
    .from('quote_versions').update({ note: note.trim() }).eq('quote_id', quoteId).eq('version_no', versionNo);
  if (error) throw new Error('sbRenameQuoteVersion: ' + error.message);
}

/**
 * Nạp LƯỜI chỉ thông tin chuyến bay của một báo giá (theo cloudId) — dùng cho
 * khung "✈️ Chuyến bay" trong Hồ sơ tour mà không tải cả dự án. Trả [] nếu
 * báo giá không tồn tại / không có chuyến bay.
 */
export async function sbGetQuoteFlights(
  cloudId: string,
  client: SupabaseClient = sb,
): Promise<QuoteFlight[]> {
  // CHỐNG LỖI: hàm này nuôi khung "Chuyến bay (báo giá chính)" ở Hồ sơ tour. Khung
  // đó render lỗi SAU nhánh loading nên nếu ta NÉM thì panel kẹt "Đang tải…" mãi +
  // lặp fetch. Vì vậy mọi lỗi truy vấn ở đây chỉ cảnh báo & trả [] / fallback, KHÔNG ném.
  const { data: qRow, error: qErr } = await client
    .from('quotes').select('id').eq('cloud_id', cloudId).maybeSingle();
  if (qErr) { console.warn('sbGetQuoteFlights quotes:', qErr.message); return []; }
  if (!qRow) return [];
  const quoteId = (qRow as Record<string, unknown>).id as string;

  // NGUỒN CHÍNH XÁC: bản nháp đầy đủ của phiên bản MỚI NHẤT (quote_versions.state.flights)
  // — đúng y như tab "✈️ Chuyến bay" đang hiển thị, kể cả flight shape CŨ/phẳng chưa
  // chuẩn hoá (FlightSummary tự gọi migrateFlight khi render). Bảng con đã shred chỉ giữ
  // segments/fares nên làm mất các booking shape cũ → chỉ dùng làm fallback bên dưới.
  const { data: vRow, error: vErr } = await client
    .from('quote_versions')
    .select('state')
    .eq('quote_id', quoteId)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (vErr) console.warn('sbGetQuoteFlights version (fallback bảng con):', vErr.message);
  const state = (vRow as { state?: QuoteDraft } | null)?.state ?? null;
  if (state && Array.isArray(state.flights)) return state.flights;

  // Fallback (báo giá cũ chưa có version snapshot): ráp lại từ bảng con đã shred.
  const { data: flights, error: flErr } = await client
    .from('quote_flights').select('*').eq('quote_id', quoteId).order('sort_order');
  if (flErr) { console.warn('sbGetQuoteFlights flights:', flErr.message); return []; }
  const flightIds = (flights ?? []).map((f) => (f as Record<string, unknown>).id as string);
  if (flightIds.length === 0) return [];

  const [{ data: segments, error: segErr }, { data: fares, error: farErr }] = await Promise.all([
    client.from('quote_flight_segments').select('*').in('flight_id', flightIds).order('sort_order'),
    client.from('quote_flight_fares').select('*').in('flight_id', flightIds).order('sort_order'),
  ]);
  if (segErr || farErr) {
    console.warn('sbGetQuoteFlights children:', (segErr ?? farErr)!.message);
    return [];
  }

  return assembleFlights(
    (flights ?? []) as Record<string, unknown>[],
    (segments ?? []) as Record<string, unknown>[],
    (fares ?? []) as Record<string, unknown>[],
  );
}

// ── Phase 2 Task 6 — Quote delete + collaborators ────────────────────────────
// Functions: sbDeleteQuote/sbDeleteDMCQuote, sbUpdateCollaborators/sbUpdateDMCCollaborators

/**
 * Delete a quote (regular or DMC) by cloud_id.
 * Children (line_items, flights, workflow, groups, payments, versions,
 * collaborators) cascade via ON DELETE CASCADE.
 * `_id` (numeric legacy id) is accepted for API compatibility but is not used — delete is by cloud_id.
 */
export async function sbDeleteQuote(
  _id: number,
  cloudId: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('quotes').delete().eq('cloud_id', cloudId);
  if (error) throw new Error('sbDeleteQuote: ' + error.message);
}

/** Thin DMC variant — same logic; template discriminator is irrelevant for
 *  delete (cloud_id is globally unique in the quotes table). */
export async function sbDeleteDMCQuote(
  id: number,
  cloudId: string,
  client: SupabaseClient = sb,
): Promise<void> {
  return sbDeleteQuote(id, cloudId, client);
}

/**
 * Replace the collaborator set for a quote.
 * 1. Resolve the quotes UUID from cloud_id (required as FK parent for quote_collaborators).
 * 2. Map Collaborator.u (username) → profile UUID via usernamesToIds (unmapped
 *    users get user_id = null, but username + name are still stored).
 * 3. replaceChildren clears old rows then re-inserts the new set atomically.
 *
 * Both project state and history entry live in the same quotes row /
 * quote_collaborators child table, so one replaceChildren suffices.
 */
export async function sbUpdateCollaborators(
  _id: number,
  cloudId: string,
  collaborators: Collaborator[],
  client: SupabaseClient = sb,
): Promise<void> {
  // Resolve the quotes UUID.
  const { data: qRow, error: qErr } = await client
    .from('quotes')
    .select('id')
    .eq('cloud_id', cloudId)
    .single();
  if (qErr || !qRow) throw new Error('sbUpdateCollaborators: quote not found for cloud_id ' + cloudId);
  const quoteUuid = qRow.id as string;

  // Resolve usernames → profile UUIDs (best-effort; unmapped → null).
  const usernames = collaborators.map((c) => c.u).filter(Boolean);
  const idMap = await usernamesToIds(client, usernames);

  const rows = collaborators.map((col) => ({
    quote_id: quoteUuid,
    user_id: idMap.get(col.u) ?? null,
    username: col.u,
    name: col.name,
  }));

  await replaceChildren(client, 'quote_collaborators', 'quote_id', quoteUuid, rows);
}

/** Thin DMC variant — same logic (template discriminator not needed; cloud_id
 *  is unique across both regular and DMC quotes). */
export async function sbUpdateDMCCollaborators(
  id: number,
  cloudId: string,
  collaborators: Collaborator[],
  client: SupabaseClient = sb,
): Promise<void> {
  return sbUpdateCollaborators(id, cloudId, collaborators, client);
}

// ── Chat gateway (Phase 1.5 Task 7) ──────────────────────────────────────────
// Chat functions: sbSubscribeChats/sbSubscribeChat/sbEnsureChat/sbSendChatMessage
// Tables: chats (text PK), chat_members (chat_id, username), chat_messages (uuid PK)

import type { Chat, ChatMessage } from '@/types/chat';

const CHAT_MSG_CAP = 500;

/** ID for a 1-1 DM (stable, sorted). */
export const dmChatId = (a: string, b: string): string => 'dm_' + [a, b].sort().join('__');

// Assemble a Chat value from db rows (used by both subscribe fns).
function rowToChat(
  chatRow: Record<string, unknown>,
  members: string[],
  reads: Record<string, string>,
  messages: ChatMessage[],
): Chat {
  return {
    id: chatRow.id as string,
    isGroup: (chatRow.is_group as boolean) ?? false,
    title: (chatRow.title as string) ?? undefined,
    createdBy: (chatRow.created_by_name as string) ?? '',
    createdAt: chatRow.created_at ? new Date(chatRow.created_at as string).toISOString() : '',
    lastAt: chatRow.last_at ? new Date(chatRow.last_at as string).toISOString() : undefined,
    lastText: (chatRow.last_text as string) ?? undefined,
    lastByName: (chatRow.last_by_name as string) ?? undefined,
    members,
    reads: Object.keys(reads).length ? reads : undefined,
    messages,
  };
}

// Assemble a ChatMessage from a chat_messages row.
function rowToChatMessage(r: Record<string, unknown>): ChatMessage {
  return {
    id: (r.legacy_id as string) || (r.id as string),
    by: r.by_username as string,
    byName: r.by_name as string,
    at: r.at ? new Date(r.at as string).toISOString() : '',
    text: (r.text as string) ?? undefined,
    file: (r.file as ChatMessage['file']) ?? undefined,
    replyTo: (r.reply_to as ChatMessage['replyTo']) ?? undefined,
    editedAt: r.edited_at ? new Date(r.edited_at as string).toISOString() : undefined,
    deleted: (r.deleted as boolean) ?? undefined,
    reactions: (r.reactions as ChatMessage['reactions']) ?? undefined,
  };
}

/**
 * Assemble a single chat with its messages from the DB.
 * Used by sbSubscribeChat and internally.
 */
async function assembleChat(
  client: SupabaseClient,
  chatId: string,
): Promise<Chat | null> {
  const { data: chatRow, error: cErr } = await client
    .from('chats')
    .select('*')
    .eq('id', chatId)
    .maybeSingle();
  if (cErr) throw new Error('assembleChat chats: ' + cErr.message);
  if (!chatRow) return null;

  const [
    { data: memberRows, error: mErr },
    { data: msgRows, error: msgErr },
  ] = await Promise.all([
    client.from('chat_members').select('username, last_read').eq('chat_id', chatId),
    client.from('chat_messages')
      .select('id, legacy_id, by_username, by_name, at, text, file, reply_to, edited_at, deleted, reactions')
      .eq('chat_id', chatId)
      .order('sort_order', { ascending: true }),
  ]);
  if (mErr) throw new Error('assembleChat members: ' + mErr.message);
  if (msgErr) throw new Error('assembleChat messages: ' + msgErr.message);

  const members = (memberRows ?? []).map((r) => r.username as string).filter(Boolean);
  const reads: Record<string, string> = {};
  for (const r of memberRows ?? []) {
    if (r.last_read) reads[r.username as string] = new Date(r.last_read as string).toISOString();
  }
  const messages = (msgRows ?? []).map((r) => rowToChatMessage(r as unknown as Record<string, unknown>));

  return rowToChat(chatRow as unknown as Record<string, unknown>, members, reads, messages);
}

/**
 * Assemble the chat list for a user.
 * Used by sbSubscribeChats.
 * Returns chats where the user is a member, newest-active first, messages=[].
 */
async function assembleChats(
  client: SupabaseClient,
  username: string,
): Promise<Chat[]> {
  // Find chats this user belongs to
  const { data: memberOf, error: mErr } = await client
    .from('chat_members')
    .select('chat_id')
    .eq('username', username);
  if (mErr) throw new Error('assembleChats members: ' + mErr.message);

  const chatIds = (memberOf ?? []).map((r) => r.chat_id as string).filter(Boolean);
  if (!chatIds.length) return [];

  const [
    { data: chatRows, error: cErr },
    { data: allMembers, error: amErr },
  ] = await Promise.all([
    client.from('chats').select('*').in('id', chatIds),
    client.from('chat_members').select('chat_id, username, last_read').in('chat_id', chatIds),
  ]);
  if (cErr) throw new Error('assembleChats chats: ' + cErr.message);
  if (amErr) throw new Error('assembleChats allMembers: ' + amErr.message);

  // Group members and reads by chat_id
  const membersByChat = new Map<string, string[]>();
  const readsByChat = new Map<string, Record<string, string>>();
  for (const r of allMembers ?? []) {
    const cid = r.chat_id as string;
    const arr = membersByChat.get(cid) ?? [];
    arr.push(r.username as string);
    membersByChat.set(cid, arr);
    if (r.last_read) {
      const reads = readsByChat.get(cid) ?? {};
      reads[r.username as string] = new Date(r.last_read as string).toISOString();
      readsByChat.set(cid, reads);
    }
  }

  const chats = (chatRows ?? []).map((r) => {
    const row = r as unknown as Record<string, unknown>;
    return rowToChat(
      row,
      membersByChat.get(row.id as string) ?? [],
      readsByChat.get(row.id as string) ?? {},
      [], // messages not loaded in list view
    );
  });

  // Sort newest-active first by lastAt ?? createdAt
  chats.sort((a, b) =>
    (b.lastAt ?? b.createdAt).localeCompare(a.lastAt ?? a.createdAt),
  );
  return chats;
}

/**
 * Realtime subscribe to all chats where `username` is a member.

 * Messages are empty in the list view (only loaded in sbSubscribeChat).
 */
export function sbSubscribeChats(
  username: string,
  cb: (list: Chat[]) => void,
  client: SupabaseClient = sb,
): () => void {
  let active = true;
  const reload = () =>
    assembleChats(client, username)
      .then((v) => { if (active) cb(v); })
      .catch((e) => { console.warn('sbSubscribeChats load error:', (e as Error).message); });

  reload();

  const channelId = `chat_list:${username}:${Math.random().toString(36).slice(2)}`;
  const channel = client
    .channel(channelId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => reload())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_members' }, () => reload())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => reload())
    .subscribe();

  return () => { active = false; client.removeChannel(channel); };
}

/**
 * Realtime subscribe to a single chat (with its messages).
 */
export function sbSubscribeChat(
  id: string,
  cb: (chat: Chat | null) => void,
  client: SupabaseClient = sb,
): () => void {
  let active = true;
  const reload = () =>
    assembleChat(client, id)
      .then((v) => { if (active) cb(v); })
      .catch((e) => { console.warn('sbSubscribeChat load error:', (e as Error).message); });

  reload();

  const channelId = `chat:${id}:${Math.random().toString(36).slice(2)}`;
  const channel = client
    .channel(channelId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chats', filter: `id=eq.${id}` }, () => reload())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_members', filter: `chat_id=eq.${id}` }, () => reload())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages', filter: `chat_id=eq.${id}` }, () => reload())
    .subscribe();

  return () => { active = false; client.removeChannel(channel); };
}

/**
 * Create a chat if not yet present, or merge members for group chats.

 * - DM (isGroup=false): if exists, no-op (members are fixed by PK).
 * - Group (isGroup=true): if exists, merge in new members; preserve existing title.
 * Resolves username → user_id for created_by and each member.
 */
export async function sbEnsureChat(chat: Chat, client: SupabaseClient = sb): Promise<void> {
  // Check existing
  const { data: existing } = await client.from('chats').select('id, title, is_group').eq('id', chat.id).maybeSingle();

  if (!existing) {
    // Insert the chats row
    const allUsernames = [chat.createdBy, ...chat.members];
    const idMap = await usernamesToIds(client, allUsernames);
    const { error: insErr } = await client.from('chats').insert({
      id: chat.id,
      is_group: chat.isGroup ?? false,
      title: chat.title ?? null,
      created_by: idMap.get(chat.createdBy) ?? null,
      created_by_name: chat.createdBy,
      created_at: chat.createdAt,
    });
    if (insErr) throw new Error('sbEnsureChat insert: ' + insErr.message);

    // Insert all members
    const memberRows = chat.members.map((uname) => ({
      chat_id: chat.id,
      user_id: idMap.get(uname) ?? null,
      username: uname,
    }));
    if (memberRows.length) {
      const { error: memErr } = await client.from('chat_members').insert(memberRows);
      if (memErr) throw new Error('sbEnsureChat members: ' + memErr.message);
    }
  } else if (chat.isGroup) {
    // Group re-ensure: merge new members; update title only when it actually changes
    const newTitle = chat.title || (existing.title as string) || null;
    if (newTitle !== (existing.title ?? null)) {
      const { error: upErr } = await client.from('chats')
        .update({ title: newTitle })
        .eq('id', chat.id);
      if (upErr) throw new Error('sbEnsureChat update title: ' + upErr.message);
    }

    // Merge members (upsert by PK (chat_id, username); preserve last_read for existing members)
    const idMap = await usernamesToIds(client, chat.members);
    const memberRows = chat.members.map((uname) => ({
      chat_id: chat.id,
      user_id: idMap.get(uname) ?? null,
      username: uname,
    }));
    if (memberRows.length) {
      const { error: memErr } = await client.from('chat_members')
        .upsert(memberRows, { onConflict: 'chat_id,username', ignoreDuplicates: true });
      if (memErr) throw new Error('sbEnsureChat merge members: ' + memErr.message);
    }
  }
  // DM already exists → no-op
}

/**
 * Send a message to a chat.
 * - Inserts into chat_messages (legacy_id=msg.id, by_username, file/reply_to jsonb, reactions)
 * - Updates chats.last_at/last_text/last_by_name
 * - Updates sender's chat_members.last_read = msg.at
 * - Enforces CHAT_MSG_CAP (500) by deleting oldest messages when exceeded
 */
export async function sbSendChatMessage(
  id: string,
  msg: ChatMessage,
  client: SupabaseClient = sb,
): Promise<void> {
  // Guard: chat must exist
  const { data: chatExists } = await client.from('chats').select('id').eq('id', id).maybeSingle();
  if (!chatExists) return;

  // Resolve sender username → user_id
  const idMap = await usernamesToIds(client, [msg.by]);

  // Insert the message
  const lastText = msg.text || (msg.file ? `📎 ${msg.file.name}` : '');
  const { error: insErr } = await client.from('chat_messages').insert({
    chat_id: id,
    legacy_id: msg.id,
    by_user_id: idMap.get(msg.by) ?? null,
    by_username: msg.by,
    by_name: msg.byName,
    at: msg.at,
    text: msg.text ?? null,
    file: msg.file ?? null,
    reply_to: msg.replyTo ?? null,
    edited_at: msg.editedAt ?? null,
    deleted: msg.deleted ?? false,
    reactions: msg.reactions ?? {},
  });
  if (insErr) throw new Error('sbSendChatMessage insert: ' + insErr.message);

  // Update chats.last_at/last_text/last_by_name
  const { error: upErr } = await client.from('chats').update({
    last_at: msg.at,
    last_text: lastText,
    last_by_name: msg.byName,
  }).eq('id', id);
  if (upErr) throw new Error('sbSendChatMessage update chats: ' + upErr.message);

  // Update sender's chat_members.last_read
  const { error: readErr } = await client.from('chat_members')
    .update({ last_read: msg.at })
    .eq('chat_id', id)
    .eq('username', msg.by);
  if (readErr) throw new Error('sbSendChatMessage update last_read: ' + readErr.message);

  // Enforce 500-message cap: delete oldest messages beyond the cap
  const { data: countData } = await client
    .from('chat_messages')
    .select('id')
    .eq('chat_id', id)
    .order('sort_order', { ascending: false })
    .range(CHAT_MSG_CAP, CHAT_MSG_CAP + 999);
  const toDelete = (countData ?? []).map((r) => (r as unknown as Record<string, unknown>).id as string);
  if (toDelete.length) {
    await client.from('chat_messages').delete().in('id', toDelete);
  }
}

/**
 * Edit the text of an existing message.
 * - Sets text and edited_at on the row matching (chat_id, legacy_id).
 * - Note: lastText in chats is not updated on edit here; the subscriber
 *   assembles it from messages.
 */
export async function sbEditChatMessage(
  id: string,
  msgId: string,
  text: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('chat_messages')
    .update({ text, edited_at: new Date().toISOString() })
    .eq('chat_id', id)
    .eq('legacy_id', msgId);
  if (error) throw new Error('sbEditChatMessage: ' + error.message);
}

/**
 * Soft-delete a message (revoke / thu hồi).
 * - Sets deleted=true, clears text and file on the row.
 * - Keeps id/by/byName/at intact so the UI can render a tombstone.
 */
export async function sbDeleteChatMessage(
  id: string,
  msgId: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('chat_messages')
    .update({ deleted: true, text: null, file: null })
    .eq('chat_id', id)
    .eq('legacy_id', msgId);
  if (error) throw new Error('sbDeleteChatMessage: ' + error.message);
}

/**
 * Toggle a reaction emoji for a user on a message.
 * - Reads the current reactions jsonb for the row.
 * - Adds username to reactions[emoji] if absent; removes if present.
 * - Drops the emoji key entirely when its array becomes empty.
 * - Writes the updated reactions back.
 */
export async function sbToggleChatReaction(
  id: string,
  msgId: string,
  emoji: string,
  username: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const { data, error: selErr } = await client.from('chat_messages')
    .select('reactions')
    .eq('chat_id', id)
    .eq('legacy_id', msgId)
    .maybeSingle();
  if (selErr) throw new Error('sbToggleChatReaction select: ' + selErr.message);
  if (!data) return;

  const reactions: Record<string, string[]> = { ...((data as unknown as Record<string, unknown>).reactions as Record<string, string[]> ?? {}) };
  const arr = reactions[emoji] ?? [];
  const next = arr.includes(username) ? arr.filter((u) => u !== username) : [...arr, username];
  if (next.length) {
    reactions[emoji] = next;
  } else {
    delete reactions[emoji];
  }

  const { error: upErr } = await client.from('chat_messages')
    .update({ reactions: reactions as unknown as Record<string, unknown> })
    .eq('chat_id', id)
    .eq('legacy_id', msgId);
  if (upErr) throw new Error('sbToggleChatReaction update: ' + upErr.message);
}

/**
 * Mark a user as having read a chat up to the current moment.
 * - Updates chat_members.last_read = now() for (chat_id, username).
 */
export async function sbMarkChatRead(
  id: string,
  username: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('chat_members')
    .update({ last_read: new Date().toISOString() })
    .eq('chat_id', id)
    .eq('username', username);
  if (error) throw new Error('sbMarkChatRead: ' + error.message);
}

// ── Phase 2 Task 7 — Quote cross-links + status ──────────────────────────────
// Functions: sbSetRegularEntryLink/sbSetDMCEntryLink, sbSetQuoteStatus/sbSetDMCQuoteStatus

import type { QuoteStatus } from '@/types/quote';

type EntryLink = {
  linkedQuoteId?: string;
  linkedQuoteName?: string;
  linkedQuoteTemplate?: Template;
};

/**
 * Update the cross-link fields on a regular quote's index row.
 * Updates the cross-link fields on the quotes row directly by cloud_id.
 * Only fields present in `link` are written; absent fields are set to null.
 */
export async function sbSetRegularEntryLink(
  cloudId: string,
  link: EntryLink,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('quotes').update({
    linked_quote_id: link.linkedQuoteId ?? null,
    linked_quote_name: link.linkedQuoteName ?? null,
    linked_quote_template: link.linkedQuoteTemplate ?? null,
    updated_at: new Date().toISOString(),
  }).eq('cloud_id', cloudId);
  if (error) throw new Error('sbSetRegularEntryLink: ' + error.message);
}

/** Đổi hồ sơ tour của một báo giá (chuyển báo giá sang hồ sơ khác). */
export async function sbSetQuoteTourProfile(
  cloudId: string,
  tourProfileId: string | null,
  tourCode: string | null,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('quotes').update({
    tour_profile_id: tourProfileId,
    tour_code: tourCode,
    updated_at: new Date().toISOString(),
  }).eq('cloud_id', cloudId);
  if (error) throw new Error('sbSetQuoteTourProfile: ' + error.message);
}

/**
 * Same as sbSetRegularEntryLink for DMC quotes.

 * cloud_id is globally unique in quotes (regular and DMC share the table),
 * so the implementation is identical — the template discriminator is not needed.
 */
export async function sbSetDMCEntryLink(
  cloudId: string,
  link: EntryLink,
  client: SupabaseClient = sb,
): Promise<void> {
  return sbSetRegularEntryLink(cloudId, link, client);
}

/**
 * Update status (and optional lossReason) on a regular quote.
 * - Loss states ('not_selected' | 'cancelled'): set loss_reason to provided value;
 *   if lossReason is undefined, READ existing loss_reason and preserve it.
 * - Non-loss states: clear loss_reason (set to null).
 * The optional `lossReason` parameter is only applied when `status` is a loss state;
 * otherwise it is ignored and loss_reason is cleared.
 */
export async function sbSetQuoteStatus(
  cloudId: string,
  status: QuoteStatus,
  lossReason?: string,
  client: SupabaseClient = sb,
): Promise<void> {
  const isLoss = status === 'not_selected' || status === 'cancelled';
  let resolvedLossReason: string | null = null;
  if (isLoss) {
    if (lossReason !== undefined) {
      resolvedLossReason = lossReason;
    } else {
      const { data } = await client.from('quotes').select('loss_reason').eq('cloud_id', cloudId).single();
      resolvedLossReason = ((data as { loss_reason?: string | null } | null)?.loss_reason) ?? null;
    }
  }
  const { error } = await client.from('quotes')
    .update({ status, loss_reason: resolvedLossReason, updated_at: new Date().toISOString() })
    .eq('cloud_id', cloudId);
  if (error) throw new Error('sbSetQuoteStatus: ' + error.message);
}

/**
 * Update status on a DMC quote.

 * Delegates to sbSetQuoteStatus (cloud_id unique across both flavours).
 */
export async function sbSetDMCQuoteStatus(
  cloudId: string,
  status: QuoteStatus,
  lossReason?: string,
  client: SupabaseClient = sb,
): Promise<void> {
  return sbSetQuoteStatus(cloudId, status, lossReason, client);
}

// ── Quote: backfill helpers ───────────────────────────────────────────────────

/**
 * Batch-update workflow index columns for many quotes.
 * Each cloud_id requires its own UPDATE (Supabase JS client has no bulk conditional
 * update with per-row values), but the pattern is sequential and the total row
 * count is bounded by the number of active quotes in the system.
 *
 * Returns the number of quotes actually updated (cloud_ids that exist in the DB).
 *
 * Fields written:
 *  - workflow_due jsonb    ← CloudQuoteEntry.workflowDue
 *  - workflow_summary jsonb ← CloudQuoteEntry.workflowSummary
 *  - depart_date date      ← CloudQuoteEntry.departDate (ISO yyyy-mm-dd string or undefined)
 */
export async function sbBackfillWorkflowIndex(
  updates: Record<string, Pick<CloudQuoteEntry, 'workflowDue' | 'workflowSummary' | 'departDate'>>,
  client: SupabaseClient = sb,
): Promise<number> {
  const cloudIds = Object.keys(updates);
  if (!cloudIds.length) return 0;

  let count = 0;
  for (const cloudId of cloudIds) {
    const u = updates[cloudId];
    const { data, error } = await client.from('quotes').update({
      workflow_due: u.workflowDue ?? null,
      workflow_summary: (u.workflowSummary as unknown as Record<string, unknown>) ?? null,
      depart_date: u.departDate ?? null,
      updated_at: new Date().toISOString(),
    }).eq('cloud_id', cloudId).select('id');
    if (error) throw new Error('sbBackfillWorkflowIndex: ' + error.message);
    if ((data as unknown[]).length > 0) count++;
  }
  return count;
}

/**
 * Update payment_summary (and the NCC payment-due index) for a single quote by cloud_id.
 */
export async function sbSetQuotePaymentSummary(
  cloudId: string,
  paymentSummary: CloudQuoteEntry['paymentSummary'],
  nccDue?: CloudQuoteEntry['nccDue'],
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('quotes').update({
    payment_summary: (paymentSummary as unknown as Record<string, unknown>) ?? null,
    ncc_due: (nccDue as unknown as Record<string, unknown>[]) ?? null,
    updated_at: new Date().toISOString(),
  }).eq('cloud_id', cloudId);
  if (error) throw new Error('sbSetQuotePaymentSummary: ' + error.message);
}

/**
 * Index biên lợi THẬT (quyết toán) cho 1 báo giá theo cloud_id — để ExecBoard &
 * bảng điều hành đọc nhanh. Ghi riêng, KHÔNG qua save_quote_state RPC.
 */
export async function sbSetQuoteSettlementSummary(
  cloudId: string,
  settlementSummary: CloudQuoteEntry['settlementSummary'],
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('quotes').update({
    settlement_summary: (settlementSummary as unknown as Record<string, unknown>) ?? null,
    updated_at: new Date().toISOString(),
  }).eq('cloud_id', cloudId);
  if (error) throw new Error('sbSetQuoteSettlementSummary: ' + error.message);
}

/**
 * Batch-update payment_summary for many quotes.

 * Returns count of quotes actually updated.
 *
 * Design note: Supabase rows are independent so we issue N sequential UPDATEs.
 * For the expected scale (hundreds of active quotes) this is acceptable;
 * if N grows large, consider a PL/pgSQL RPC.
 */
export async function sbBackfillPaymentIndex(
  updates: Record<string, CloudQuoteEntry['paymentSummary']>,
  client: SupabaseClient = sb,
): Promise<number> {
  const cloudIds = Object.keys(updates);
  if (!cloudIds.length) return 0;

  let count = 0;
  for (const cloudId of cloudIds) {
    const { data, error } = await client.from('quotes').update({
      payment_summary: (updates[cloudId] as unknown as Record<string, unknown>) ?? null,
      updated_at: new Date().toISOString(),
    }).eq('cloud_id', cloudId).select('id');
    if (error) throw new Error('sbBackfillPaymentIndex: ' + error.message);
    if ((data as unknown[]).length > 0) count++;
  }
  return count;
}

// ── Báo giá chia sẻ công khai cho khách (public_quotes/{token}) ──
export async function sbPublishQuote(d: PublicQuoteDoc, client: SupabaseClient = sb): Promise<void> {
  const { acceptance, ...rest } = d;
  const { error } = await client.from('public_quotes').upsert({
    token: d.token,
    payload: rest,
    acceptance: acceptance ?? null,
  }, { onConflict: 'token' });
  if (error) throw new Error('sbPublishQuote: ' + error.message);
}

export async function sbGetPublicQuote(token: string, client: SupabaseClient = sb): Promise<PublicQuoteDoc | null> {
  const { data, error } = await client.rpc('get_public_quote', { p_token: token });
  if (error) throw new Error('sbGetPublicQuote: ' + error.message);
  const row = (data as { payload: unknown; acceptance: unknown }[] | null)?.[0];
  if (!row) return null;
  return {
    ...(row.payload as Omit<PublicQuoteDoc, 'acceptance'>),
    acceptance: (row.acceptance as PublicQuoteDoc['acceptance']) ?? undefined,
  };
}

export async function sbAcceptPublicQuote(
  token: string,
  acceptance: PublicQuoteDoc['acceptance'],
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.rpc('accept_public_quote', { p_token: token, p_acceptance: acceptance });
  if (error) throw new Error('sbAcceptPublicQuote: ' + error.message);
}

export async function sbUnpublishQuote(token: string, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.from('public_quotes').delete().eq('token', token);
  if (error) throw new Error('sbUnpublishQuote: ' + error.message);
}

export async function sbSetQuoteShare(
  cloudId: string,
  share: CloudQuoteEntry['share'] | null,
  client: SupabaseClient = sb,
): Promise<void> {
  const { error } = await client.from('quotes').update({ share: share ?? null }).eq('cloud_id', cloudId);
  if (error) throw new Error('sbSetQuoteShare: ' + error.message);
}

// ── Link khách xem danh sách visa (public_visa_lists/{token}) ──
// Nhân viên GỬI YÊU CẦU (status='pending'); Trưởng phòng Visa (RPC định danh)
// duyệt → status='approved' → anon mới đọc được. Mỗi dự án giữ 1 link (token cố
// định) — gửi lại chỉ cập nhật payload/cột và đưa về 'pending'.

function rowToVisaListRecord(r: Record<string, unknown>): PublicVisaListRecord {
  return {
    token: r.token as string,
    projectId: r.project_id as string,
    payload: r.payload as PublicVisaListDoc,
    columns: (r.columns as string[]) ?? [],
    note: (r.note as string) ?? undefined,
    status: r.status as PublicVisaListStatus,
    requestedByUsername: (r.requested_by_username as string) ?? undefined,
    requestedByName: (r.requested_by_name as string) ?? undefined,
    requestedAt: (r.requested_at as string) ?? undefined,
    approvedByName: (r.approved_by_name as string) ?? undefined,
    approvedAt: (r.approved_at as string) ?? undefined,
    rejectReason: (r.reject_reason as string) ?? undefined,
  };
}

/** Lấy link (kèm trạng thái) của một dự án visa — null nếu chưa từng tạo. */
export async function sbGetVisaListForProject(
  projectId: string,
  client: SupabaseClient = sb,
): Promise<PublicVisaListRecord | null> {
  const { data, error } = await client.from('public_visa_lists').select('*').eq('project_id', projectId).maybeSingle();
  if (error) throw new Error('sbGetVisaListForProject: ' + error.message);
  return data ? rowToVisaListRecord(data as Record<string, unknown>) : null;
}

/** Gửi/cập nhật YÊU CẦU tạo link (đưa về 'pending', xoá dấu duyệt cũ). */
export async function sbRequestVisaList(
  opts: { token: string; doc: PublicVisaListDoc; columns: string[]; note?: string; requestedByUsername: string; requestedByName: string },
  client: SupabaseClient = sb,
): Promise<void> {
  const { data: me } = await client.auth.getUser();
  const { error } = await client.from('public_visa_lists').upsert({
    token: opts.token,
    project_id: opts.doc.projectId,
    payload: opts.doc,
    columns: opts.columns,
    note: opts.note ?? null,
    status: 'pending',
    requested_by: me.user?.id ?? null,
    requested_by_username: opts.requestedByUsername,
    requested_by_name: opts.requestedByName,
    requested_at: new Date().toISOString(),
    approved_by: null,
    approved_by_name: null,
    approved_at: null,
    reject_reason: null,
  }, { onConflict: 'project_id' });
  if (error) throw new Error('sbRequestVisaList: ' + error.message);
}

/** Duyệt link (chỉ Trưởng phòng Visa / CEO / BGĐ — server kiểm). */
export async function sbApproveVisaList(token: string, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.rpc('approve_visa_list', { p_token: token });
  if (error) throw new Error('sbApproveVisaList: ' + error.message);
}

/** Từ chối link (chỉ Trưởng phòng Visa / CEO / BGĐ — server kiểm). */
export async function sbRejectVisaList(token: string, reason: string, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.rpc('reject_visa_list', { p_token: token, p_reason: reason });
  if (error) throw new Error('sbRejectVisaList: ' + error.message);
}

/** Làm mới SỐ LIỆU của link đã duyệt (giữ nguyên cột & trạng thái). Dùng để cập
 *  nhật tình trạng mới nhất mà KHÔNG cần duyệt lại (không lộ thêm trường mới). */
export async function sbRefreshVisaListPayload(token: string, doc: PublicVisaListDoc, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.from('public_visa_lists').update({ payload: doc }).eq('token', token);
  if (error) throw new Error('sbRefreshVisaListPayload: ' + error.message);
}

/** Gỡ link đang chia sẻ (đưa về 'revoked' — khách không xem được nữa). */
export async function sbRevokeVisaList(token: string, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.from('public_visa_lists').update({ status: 'revoked' }).eq('token', token);
  if (error) throw new Error('sbRevokeVisaList: ' + error.message);
}

/** Anon đọc danh sách visa qua token — CHỈ khi đã được duyệt. */
export async function sbGetPublicVisaList(token: string, client: SupabaseClient = sb): Promise<PublicVisaListDoc | null> {
  const { data, error } = await client.rpc('get_public_visa_list', { p_token: token });
  if (error) throw new Error('sbGetPublicVisaList: ' + error.message);
  const row = (data as { payload: unknown }[] | null)?.[0];
  return row ? (row.payload as PublicVisaListDoc) : null;
}

// ── HR (Nhân sự) ──────────────────────────────────────────────────────────────

import type { HrEmployee, HrDocument, EmploymentStatus } from '@/types/hr';

const rowToHrDocument = (r: Record<string, unknown>): HrDocument => ({
  id: (r.legacy_id as string) ?? (r.id as string),
  kind: (r.kind as string) ?? '',
  name: (r.name as string) ?? '',
  fileUrl: (r.file_url as string) ?? undefined,
  issuedAt: (r.issued_at as string) ?? undefined,
  expiresAt: (r.expires_at as string) ?? undefined,
  notes: (r.notes as string) ?? undefined,
});

const rowToHrEmployee = (
  r: Record<string, unknown>,
  documents: HrDocument[],
): HrEmployee => ({
  id: r.legacy_id as string,
  employeeCode: (r.employee_code as string) ?? '',
  fullName: (r.full_name as string) ?? '',
  email: (r.email as string) ?? '',
  phone: (r.phone as string) ?? '',
  dob: (r.dob as string) ?? undefined,
  gender: (r.gender as HrEmployee['gender']) ?? '',
  avatarUrl: (r.avatar_url as string) ?? undefined,
  department: (r.department as HrEmployee['department']) ?? '',
  title: (r.title as string) ?? '',
  level: (r.level as string) ?? '',
  managerId: (r.manager_legacy_id as string) ?? undefined,
  status: (r.status as EmploymentStatus) ?? 'probation',
  joinDate: (r.join_date as string) ?? undefined,
  resignDate: (r.resign_date as string) ?? undefined,
  emergencyContact: (r.emergency_contact as HrEmployee['emergencyContact']) ?? undefined,
  careerPathId: (r.career_path_id as string) ?? undefined,
  profileEmail: (r.profile_email as string) ?? undefined,
  notes: (r.notes as string) ?? '',
  documents,
  createdAt: r.created_at as string,
  createdBy: (r.created_by_name as string) ?? '',
  updatedAt: (r.updated_at as string) ?? undefined,
  updatedBy: (r.updated_by_name as string) ?? undefined,
});

export function sbSubscribeHrEmployees(cb: (list: HrEmployee[]) => void, client: SupabaseClient = sb): () => void {
  return subscribeTable(client, 'hr_employees', async (cl) => {
    const { data: rows, error } = await cl.from('hr_employees').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    const ids = (rows ?? []).map((r) => r.id as string);
    const { data: docs } = ids.length
      ? await cl.from('hr_documents').select('*').in('employee_id', ids).order('sort_order')
      : { data: [] as Record<string, unknown>[] };
    const byEmp = new Map<string, HrDocument[]>();
    for (const d of docs ?? []) {
      const arr = byEmp.get(d.employee_id as string) ?? [];
      arr.push(rowToHrDocument(d));
      byEmp.set(d.employee_id as string, arr);
    }
    return (rows ?? []).map((r) => rowToHrEmployee(r, byEmp.get(r.id as string) ?? []));
  }, cb);
}

export async function sbPushHrEmployees(
  list: HrEmployee[],
  pushedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  const stamp = { updated_at: new Date().toISOString(), updated_by_name: `${pushedBy.name} (${pushedBy.role})` };
  for (const emp of list) {
    const { data: up, error: upErr } = await client.from('hr_employees').upsert({
      legacy_id: emp.id,
      employee_code: emp.employeeCode ?? '',
      full_name: emp.fullName ?? '',
      email: emp.email ?? '',
      phone: emp.phone ?? '',
      dob: emp.dob || null,
      gender: emp.gender || null,
      avatar_url: emp.avatarUrl ?? null,
      department: emp.department ?? '',
      title: emp.title ?? '',
      level: emp.level ?? '',
      manager_legacy_id: emp.managerId || null,
      status: emp.status ?? 'probation',
      join_date: emp.joinDate || null,
      resign_date: emp.resignDate || null,
      emergency_contact: emp.emergencyContact ?? {},
      career_path_id: emp.careerPathId ?? null,
      profile_email: emp.profileEmail ?? null,
      notes: emp.notes ?? '',
      created_by_name: emp.createdBy, created_at: emp.createdAt, ...stamp,
    }, { onConflict: 'legacy_id' }).select('id').single();
    if (upErr) throw new Error('sbPushHrEmployees upsert: ' + upErr.message);
    await replaceChildren(client, 'hr_documents', 'employee_id', up!.id, (emp.documents ?? []).map((d, i) => ({
      employee_id: up!.id, legacy_id: d.id, kind: d.kind, name: d.name,
      file_url: d.fileUrl ?? null, issued_at: d.issuedAt || null, expires_at: d.expiresAt || null,
      notes: d.notes ?? '', sort_order: i,
    })));
  }
  // Full-overwrite: xoá nhân viên đã bị loại khỏi danh sách (fetch-then-delete an toàn).
  const keepIds = list.map((e) => e.id);
  if (keepIds.length > 0) {
    const { data: existing, error: fetchErr } = await client.from('hr_employees').select('legacy_id');
    if (fetchErr) throw new Error('sbPushHrEmployees fetch: ' + fetchErr.message);
    const toDelete = (existing ?? [])
      .map((r) => r.legacy_id as string)
      .filter((lid) => lid && !keepIds.includes(lid));
    if (toDelete.length > 0) {
      const del = await client.from('hr_employees').delete().in('legacy_id', toDelete);
      if (del.error) throw new Error('sbPushHrEmployees delete: ' + del.error.message);
    }
  } else {
    const del = await client.from('hr_employees').delete().not('legacy_id', 'is', null);
    if (del.error) throw new Error('sbPushHrEmployees delete all: ' + del.error.message);
  }
}

// ── HR Guides (Pool HDV cộng tác viên) ────────────────────────────────────────

import type { HrGuide, GuideStatus } from '@/types/hr';

const rowToHrGuide = (r: Record<string, unknown>): HrGuide => ({
  id: r.legacy_id as string,
  fullName: (r.full_name as string) ?? '',
  phone: (r.phone as string) ?? '',
  email: (r.email as string) ?? '',
  guideCardNo: (r.guide_card_no as string) ?? '',
  guideCardExpires: (r.guide_card_expires as string) ?? undefined,
  languages: (r.languages as string[]) ?? [],
  regions: (r.regions as string[]) ?? [],
  rating: (r.rating as number) ?? undefined,
  status: (r.status as GuideStatus) ?? 'active',
  dayRate: (r.day_rate as number) ?? undefined,
  notes: (r.notes as string) ?? '',
  createdAt: r.created_at as string,
  createdBy: (r.created_by_name as string) ?? '',
  updatedAt: (r.updated_at as string) ?? undefined,
  updatedBy: (r.updated_by_name as string) ?? undefined,
});

export function sbSubscribeHrGuides(cb: (list: HrGuide[]) => void, client: SupabaseClient = sb): () => void {
  return subscribeTable(client, 'hr_guides', async (cl) => {
    const { data: rows, error } = await cl.from('hr_guides').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (rows ?? []).map(rowToHrGuide);
  }, cb);
}

export async function sbPushHrGuides(
  list: HrGuide[],
  pushedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  const stamp = { updated_at: new Date().toISOString(), updated_by_name: `${pushedBy.name} (${pushedBy.role})` };
  for (const g of list) {
    const { error: upErr } = await client.from('hr_guides').upsert({
      legacy_id: g.id,
      full_name: g.fullName ?? '',
      phone: g.phone ?? '',
      email: g.email ?? '',
      guide_card_no: g.guideCardNo ?? '',
      guide_card_expires: g.guideCardExpires || null,
      languages: g.languages ?? [],
      regions: g.regions ?? [],
      rating: g.rating ?? null,
      status: g.status ?? 'active',
      day_rate: g.dayRate ?? null,
      notes: g.notes ?? '',
      created_by_name: g.createdBy, created_at: g.createdAt, ...stamp,
    }, { onConflict: 'legacy_id' });
    if (upErr) throw new Error('sbPushHrGuides upsert: ' + upErr.message);
  }
  // Full-overwrite: xoá HDV đã bị loại khỏi danh sách (fetch-then-delete an toàn).
  const keepIds = list.map((g) => g.id);
  if (keepIds.length > 0) {
    const { data: existing, error: fetchErr } = await client.from('hr_guides').select('legacy_id');
    if (fetchErr) throw new Error('sbPushHrGuides fetch: ' + fetchErr.message);
    const toDelete = (existing ?? [])
      .map((r) => r.legacy_id as string)
      .filter((lid) => lid && !keepIds.includes(lid));
    if (toDelete.length > 0) {
      const del = await client.from('hr_guides').delete().in('legacy_id', toDelete);
      if (del.error) throw new Error('sbPushHrGuides delete: ' + del.error.message);
    }
  } else {
    const del = await client.from('hr_guides').delete().not('legacy_id', 'is', null);
    if (del.error) throw new Error('sbPushHrGuides delete all: ' + del.error.message);
  }
}

// ── HR Attendance (Chấm công / bảng công, row-per NV×tháng, xem 0084) ─────────

import type {
  HrAttendance, AttendanceDays, AttendanceSummary, AttendanceStatus,
  AttendanceConfirmation, AttendanceFeedback, AttendanceSource,
} from '@/types/attendance';

const rowToHrAttendance = (r: Record<string, unknown>): HrAttendance => ({
  id: r.legacy_id as string,
  employeeLegacyId: (r.employee_legacy_id as string) ?? '',
  employeeCode: (r.employee_code as string) ?? '',
  fullName: (r.full_name as string) ?? '',
  department: (r.department as string) ?? '',
  period: (r.period as string) ?? '',
  days: (r.days as AttendanceDays) ?? {},
  summary: (r.summary as AttendanceSummary) ?? ({} as AttendanceSummary),
  status: (r.status as AttendanceStatus) ?? 'draft',
  confirmation: (r.confirmation as AttendanceConfirmation) ?? { status: 'pending' },
  feedback: (r.feedback as AttendanceFeedback[]) ?? [],
  source: (r.source as AttendanceSource) ?? 'manual',
  createdAt: (r.created_at as string) ?? new Date().toISOString(),
  createdBy: (r.created_by_name as string) ?? '',
  updatedAt: (r.updated_at as string) ?? undefined,
  updatedBy: (r.updated_by_name as string) ?? undefined,
});

const hrAttendanceToRow = (a: HrAttendance): Record<string, unknown> => ({
  legacy_id: a.id,
  employee_legacy_id: a.employeeLegacyId,
  employee_code: a.employeeCode,
  full_name: a.fullName,
  department: a.department,
  period: a.period,
  days: a.days ?? {},
  summary: a.summary ?? {},
  status: a.status,
  confirmation: a.confirmation ?? { status: 'pending' },
  feedback: a.feedback ?? [],
  source: a.source,
  created_by_name: a.createdBy,
  created_at: a.createdAt,
  updated_at: a.updatedAt ?? null,
  updated_by_name: a.updatedBy ?? null,
});

export function sbSubscribeHrAttendance(
  cb: (list: HrAttendance[]) => void,
  client: SupabaseClient = sb,
): () => void {
  return subscribeTable(client, 'hr_attendance', async (cl) => {
    const { data, error } = await cl
      .from('hr_attendance')
      .select('*')
      .order('period', { ascending: false });
    if (error) throw new Error('sbSubscribeHrAttendance: ' + error.message);
    return (data ?? []).map(rowToHrAttendance);
  }, cb);
}

/** Upsert một bảng công (đụng đúng dòng theo legacy_id → không ghi đè người khác). */
export async function sbUpsertHrAttendance(a: HrAttendance, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.from('hr_attendance').upsert(hrAttendanceToRow(a), { onConflict: 'legacy_id' });
  if (error) throw new Error('sbUpsertHrAttendance: ' + error.message);
}

/** Upsert nhiều bảng công (import cả tháng). */
export async function sbUpsertHrAttendances(list: HrAttendance[], client: SupabaseClient = sb): Promise<void> {
  if (!list.length) return;
  const { error } = await client.from('hr_attendance').upsert(list.map(hrAttendanceToRow), { onConflict: 'legacy_id' });
  if (error) throw new Error('sbUpsertHrAttendances: ' + error.message);
}

export async function sbDeleteHrAttendance(id: string, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.from('hr_attendance').delete().eq('legacy_id', id);
  if (error) throw new Error('sbDeleteHrAttendance: ' + error.message);
}

// ── HR Evaluations (Đánh giá / KPI) ───────────────────────────────────────────

import type { HrEvaluation, EvalStatus, EvalCompetency, EvalKpi } from '@/types/hr';

const rowToHrEvaluation = (r: Record<string, unknown>): HrEvaluation => ({
  id: r.legacy_id as string,
  employeeId: (r.employee_legacy_id as string) ?? '',
  period: (r.period as string) ?? '',
  reviewDate: (r.review_date as string) ?? undefined,
  reviewerName: (r.reviewer_name as string) ?? '',
  competencies: (r.competencies as EvalCompetency[]) ?? [],
  kpis: (r.kpis as EvalKpi[]) ?? [],
  overallScore: (r.overall_score as number) ?? undefined,
  strengths: (r.strengths as string) ?? '',
  improvements: (r.improvements as string) ?? '',
  nextGoals: (r.next_goals as string) ?? '',
  promotion: (r.promotion as string) ?? '',
  status: (r.status as EvalStatus) ?? 'draft',
  createdAt: r.created_at as string,
  createdBy: (r.created_by_name as string) ?? '',
  updatedAt: (r.updated_at as string) ?? undefined,
  updatedBy: (r.updated_by_name as string) ?? undefined,
});

export function sbSubscribeHrEvaluations(cb: (list: HrEvaluation[]) => void, client: SupabaseClient = sb): () => void {
  return subscribeTable(client, 'hr_evaluations', async (cl) => {
    const { data, error } = await cl.from('hr_evaluations').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToHrEvaluation);
  }, cb);
}

export async function sbPushHrEvaluations(
  list: HrEvaluation[], pushedBy: { name: string; role: string }, client: SupabaseClient = sb,
): Promise<void> {
  const stamp = { updated_at: new Date().toISOString(), updated_by_name: `${pushedBy.name} (${pushedBy.role})` };
  for (const e of list) {
    const { error } = await client.from('hr_evaluations').upsert({
      legacy_id: e.id, employee_legacy_id: e.employeeId, period: e.period,
      review_date: e.reviewDate || null, reviewer_name: e.reviewerName,
      competencies: e.competencies ?? [], kpis: e.kpis ?? [],
      overall_score: e.overallScore ?? null, strengths: e.strengths ?? '',
      improvements: e.improvements ?? '', next_goals: e.nextGoals ?? '',
      promotion: e.promotion ?? '', status: e.status ?? 'draft',
      created_by_name: e.createdBy, created_at: e.createdAt, ...stamp,
    }, { onConflict: 'legacy_id' });
    if (error) throw new Error('sbPushHrEvaluations upsert: ' + error.message);
  }
  const keepIds = list.map((e) => e.id);
  if (keepIds.length > 0) {
    const { data: existing, error: fetchErr } = await client.from('hr_evaluations').select('legacy_id');
    if (fetchErr) throw new Error('sbPushHrEvaluations fetch: ' + fetchErr.message);
    const toDelete = (existing ?? []).map((r) => r.legacy_id as string).filter((lid) => lid && !keepIds.includes(lid));
    if (toDelete.length > 0) {
      const del = await client.from('hr_evaluations').delete().in('legacy_id', toDelete);
      if (del.error) throw new Error('sbPushHrEvaluations delete: ' + del.error.message);
    }
  } else {
    const del = await client.from('hr_evaluations').delete().not('legacy_id', 'is', null);
    if (del.error) throw new Error('sbPushHrEvaluations delete all: ' + del.error.message);
  }
}

// ── HR Recruitment (ATS: tin tuyển dụng + ứng viên) ───────────────────────────

import type { HrJobPosting, JobStatus, HrCandidate, CandidateStage, CandidateNote } from '@/types/hr';

const rowToHrJobPosting = (r: Record<string, unknown>): HrJobPosting => ({
  id: r.legacy_id as string,
  title: (r.title as string) ?? '',
  department: (r.department as HrJobPosting['department']) ?? '',
  level: (r.level as string) ?? '',
  headcount: (r.headcount as number) ?? 1,
  salaryRange: (r.salary_range as string) ?? '',
  status: (r.status as JobStatus) ?? 'open',
  description: (r.description as string) ?? '',
  createdAt: r.created_at as string,
  createdBy: (r.created_by_name as string) ?? '',
  updatedAt: (r.updated_at as string) ?? undefined,
  updatedBy: (r.updated_by_name as string) ?? undefined,
});

export function sbSubscribeHrJobPostings(cb: (list: HrJobPosting[]) => void, client: SupabaseClient = sb): () => void {
  return subscribeTable(client, 'hr_job_postings', async (cl) => {
    const { data, error } = await cl.from('hr_job_postings').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToHrJobPosting);
  }, cb);
}

export async function sbPushHrJobPostings(
  list: HrJobPosting[], pushedBy: { name: string; role: string }, client: SupabaseClient = sb,
): Promise<void> {
  const stamp = { updated_at: new Date().toISOString(), updated_by_name: `${pushedBy.name} (${pushedBy.role})` };
  for (const p of list) {
    const { error } = await client.from('hr_job_postings').upsert({
      legacy_id: p.id, title: p.title, department: p.department ?? '', level: p.level ?? '',
      headcount: p.headcount ?? 1, salary_range: p.salaryRange ?? '', status: p.status ?? 'open',
      description: p.description ?? '', created_by_name: p.createdBy, created_at: p.createdAt, ...stamp,
    }, { onConflict: 'legacy_id' });
    if (error) throw new Error('sbPushHrJobPostings upsert: ' + error.message);
  }
  const keepIds = list.map((p) => p.id);
  if (keepIds.length > 0) {
    const { data: existing, error: fetchErr } = await client.from('hr_job_postings').select('legacy_id');
    if (fetchErr) throw new Error('sbPushHrJobPostings fetch: ' + fetchErr.message);
    const toDelete = (existing ?? []).map((r) => r.legacy_id as string).filter((lid) => lid && !keepIds.includes(lid));
    if (toDelete.length > 0) {
      const del = await client.from('hr_job_postings').delete().in('legacy_id', toDelete);
      if (del.error) throw new Error('sbPushHrJobPostings delete: ' + del.error.message);
    }
  } else {
    const del = await client.from('hr_job_postings').delete().not('legacy_id', 'is', null);
    if (del.error) throw new Error('sbPushHrJobPostings delete all: ' + del.error.message);
  }
}

const rowToHrCandidate = (r: Record<string, unknown>): HrCandidate => ({
  id: r.legacy_id as string,
  postingId: (r.posting_legacy_id as string) ?? undefined,
  fullName: (r.full_name as string) ?? '',
  phone: (r.phone as string) ?? '',
  email: (r.email as string) ?? '',
  source: (r.source as string) ?? '',
  position: (r.position as string) ?? '',
  department: (r.department as HrCandidate['department']) ?? '',
  cvUrl: (r.cv_url as string) ?? undefined,
  stage: (r.stage as CandidateStage) ?? 'new',
  rating: (r.rating as number) ?? undefined,
  appliedDate: (r.applied_date as string) ?? undefined,
  notes: (r.notes as string) ?? '',
  interviewNotes: (r.interview_notes as CandidateNote[]) ?? [],
  convertedEmployeeId: (r.converted_employee_id as string) ?? undefined,
  createdAt: r.created_at as string,
  createdBy: (r.created_by_name as string) ?? '',
  updatedAt: (r.updated_at as string) ?? undefined,
  updatedBy: (r.updated_by_name as string) ?? undefined,
});

export function sbSubscribeHrCandidates(cb: (list: HrCandidate[]) => void, client: SupabaseClient = sb): () => void {
  return subscribeTable(client, 'hr_candidates', async (cl) => {
    const { data, error } = await cl.from('hr_candidates').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToHrCandidate);
  }, cb);
}

export async function sbPushHrCandidates(
  list: HrCandidate[], pushedBy: { name: string; role: string }, client: SupabaseClient = sb,
): Promise<void> {
  const stamp = { updated_at: new Date().toISOString(), updated_by_name: `${pushedBy.name} (${pushedBy.role})` };
  for (const c of list) {
    const { error } = await client.from('hr_candidates').upsert({
      legacy_id: c.id, posting_legacy_id: c.postingId || null, full_name: c.fullName,
      phone: c.phone ?? '', email: c.email ?? '', source: c.source ?? '', position: c.position ?? '',
      department: c.department ?? '', cv_url: c.cvUrl ?? null, stage: c.stage ?? 'new',
      rating: c.rating ?? null, applied_date: c.appliedDate || null, notes: c.notes ?? '',
      interview_notes: c.interviewNotes ?? [], converted_employee_id: c.convertedEmployeeId || null,
      created_by_name: c.createdBy, created_at: c.createdAt, ...stamp,
    }, { onConflict: 'legacy_id' });
    if (error) throw new Error('sbPushHrCandidates upsert: ' + error.message);
  }
  const keepIds = list.map((c) => c.id);
  if (keepIds.length > 0) {
    const { data: existing, error: fetchErr } = await client.from('hr_candidates').select('legacy_id');
    if (fetchErr) throw new Error('sbPushHrCandidates fetch: ' + fetchErr.message);
    const toDelete = (existing ?? []).map((r) => r.legacy_id as string).filter((lid) => lid && !keepIds.includes(lid));
    if (toDelete.length > 0) {
      const del = await client.from('hr_candidates').delete().in('legacy_id', toDelete);
      if (del.error) throw new Error('sbPushHrCandidates delete: ' + del.error.message);
    }
  } else {
    const del = await client.from('hr_candidates').delete().not('legacy_id', 'is', null);
    if (del.error) throw new Error('sbPushHrCandidates delete all: ' + del.error.message);
  }
}

// ── HR Leaves (Nghỉ phép) ─────────────────────────────────────────────────────

import type { HrLeave, LeaveType, LeaveStatus } from '@/types/hr';

const rowToHrLeave = (r: Record<string, unknown>): HrLeave => ({
  id: r.legacy_id as string,
  employeeId: (r.employee_legacy_id as string) ?? '',
  type: (r.type as LeaveType) ?? 'annual',
  startDate: (r.start_date as string) ?? undefined,
  endDate: (r.end_date as string) ?? undefined,
  days: (r.days as number) ?? 0,
  reason: (r.reason as string) ?? '',
  status: (r.status as LeaveStatus) ?? 'pending',
  approverName: (r.approver_name as string) ?? '',
  decidedAt: (r.decided_at as string) ?? undefined,
  decisionNote: (r.decision_note as string) ?? '',
  createdAt: r.created_at as string,
  createdBy: (r.created_by_name as string) ?? '',
  updatedAt: (r.updated_at as string) ?? undefined,
  updatedBy: (r.updated_by_name as string) ?? undefined,
});

export function sbSubscribeHrLeaves(cb: (list: HrLeave[]) => void, client: SupabaseClient = sb): () => void {
  return subscribeTable(client, 'hr_leaves', async (cl) => {
    const { data, error } = await cl.from('hr_leaves').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToHrLeave);
  }, cb);
}

export async function sbPushHrLeaves(
  list: HrLeave[], pushedBy: { name: string; role: string }, client: SupabaseClient = sb,
): Promise<void> {
  const stamp = { updated_at: new Date().toISOString(), updated_by_name: `${pushedBy.name} (${pushedBy.role})` };
  for (const lv of list) {
    const { error } = await client.from('hr_leaves').upsert({
      legacy_id: lv.id, employee_legacy_id: lv.employeeId, type: lv.type,
      start_date: lv.startDate || null, end_date: lv.endDate || null, days: lv.days ?? 0,
      reason: lv.reason ?? '', status: lv.status ?? 'pending', approver_name: lv.approverName ?? '',
      decided_at: lv.decidedAt || null, decision_note: lv.decisionNote ?? '',
      created_by_name: lv.createdBy, created_at: lv.createdAt, ...stamp,
    }, { onConflict: 'legacy_id' });
    if (error) throw new Error('sbPushHrLeaves upsert: ' + error.message);
  }
  const keepIds = list.map((l) => l.id);
  if (keepIds.length > 0) {
    const { data: existing, error: fetchErr } = await client.from('hr_leaves').select('legacy_id');
    if (fetchErr) throw new Error('sbPushHrLeaves fetch: ' + fetchErr.message);
    const toDelete = (existing ?? []).map((r) => r.legacy_id as string).filter((lid) => lid && !keepIds.includes(lid));
    if (toDelete.length > 0) {
      const del = await client.from('hr_leaves').delete().in('legacy_id', toDelete);
      if (del.error) throw new Error('sbPushHrLeaves delete: ' + del.error.message);
    }
  } else {
    const del = await client.from('hr_leaves').delete().not('legacy_id', 'is', null);
    if (del.error) throw new Error('sbPushHrLeaves delete all: ' + del.error.message);
  }
}

// ── NCC upsert/delete (khôi phục từ work concurrent NCC concurrency-safe) ──
const nccToRow = (ncc: Ncc, stamp: Record<string, unknown>) => ({
  legacy_id: ncc.id, name: ncc.name, sectors: ncc.sectors,
  continent: ncc.continent ?? null, country: ncc.country ?? null,
  location: ncc.location, address: ncc.address ?? null,
  website: ncc.website ?? null, tax_code: ncc.taxCode ?? null,
  status: ncc.status ?? null, bank: ncc.bank ?? null,
  payment_terms: ncc.paymentTerms ?? null, commission: ncc.commission ?? null,
  credit_limit: ncc.creditLimit ?? null, files: ncc.files ?? [],
  tours: ncc.tours ?? [], note: ncc.note ?? '',
  ai_analysis: ncc.aiAnalysis ?? null, ratings: ncc.ratings ?? [],
  created_by_name: ncc.createdBy, created_by_u: ncc.createdByU ?? null,
  collaborators: ncc.collaborators ?? [], created_at: ncc.createdAt, ...stamp,
});

/** Upsert/Delete MỘT NCC (serialize, không đua push toàn-danh-sách). */
export function sbUpsertNcc(
  ncc: Ncc,
  pushedBy: { name: string; role: string },
  client: SupabaseClient = sb,
): Promise<void> {
  return serializeWrites('suppliers', async () => {
    const stamp = { updated_at: new Date().toISOString(), updated_by_name: `${pushedBy.name} (${pushedBy.role})` };
    const { data: up, error: upErr } = await client.from('suppliers')
      .upsert(nccToRow(ncc, stamp), { onConflict: 'legacy_id' }).select('id').single();
    if (upErr) throw new Error('sbUpsertNcc upsert: ' + upErr.message);
    await replaceChildren(client, 'supplier_contacts', 'supplier_id', up!.id, ncc.contacts.map((ct, i) => ({
      supplier_id: up!.id, name: ct.name, phone: ct.phone, email: ct.email, position: ct.position, sort_order: i,
    })));
  });
}

/** Xoá đúng MỘT NCC theo legacy_id (supplier_contacts cascade theo FK). */
export function sbDeleteNcc(id: string, client: SupabaseClient = sb): Promise<void> {
  return serializeWrites('suppliers', async () => {
    const del = await client.from('suppliers').delete().eq('legacy_id', id);
    if (del.error) throw new Error('sbDeleteNcc: ' + del.error.message);
  });
}

// ── Quản lý kho (Inventory) ────────────────────────────────────────────────────
import type {
  InventoryCategory, InventoryItem, InventoryLot, InventoryLotLine,
  InventoryMovement, InventoryKind, MovementType, ReceiveLine,
  InventoryAsset, InventoryAssetLog, AssetStatus, AssetAction,
} from '@/types/inventory';

export interface InventorySnapshot {
  categories: InventoryCategory[];
  items: InventoryItem[];
  lots: InventoryLot[];        // mỗi lô đã gắn sẵn `lines`
  movements: InventoryMovement[];
  assets: InventoryAsset[];
  assetLogs: InventoryAssetLog[];
}

const rowToInvCategory = (r: Record<string, unknown>): InventoryCategory => ({
  id: r.id as string,
  code: (r.code as string) ?? '',
  name: (r.name as string) ?? '',
  kind: ((r.kind as string) ?? 'consumable') as InventoryKind,
  seq: (r.seq as number) ?? 0,
  note: (r.note as string) ?? '',
  createdBy: (r.created_by_name as string) ?? '',
  createdAt: r.created_at as string,
});

const rowToInvItem = (r: Record<string, unknown>): InventoryItem => ({
  id: r.id as string,
  code: (r.code as string) ?? '',
  categoryId: (r.category_id as string) ?? '',
  name: (r.name as string) ?? '',
  unit: (r.unit as string) ?? 'cái',
  sizes: (r.sizes as string[]) ?? [],
  minStock: (r.min_stock as number) ?? 0,
  imageUrl: (r.image_url as string) ?? undefined,
  note: (r.note as string) ?? '',
  active: (r.active as boolean) ?? true,
  createdBy: (r.created_by_name as string) ?? '',
  createdAt: r.created_at as string,
  updatedBy: (r.updated_by_name as string) ?? undefined,
  updatedAt: (r.updated_at as string) ?? undefined,
});

const rowToInvLotLine = (r: Record<string, unknown>): InventoryLotLine => ({
  id: r.id as string,
  lotId: (r.lot_id as string) ?? '',
  size: (r.size as string) ?? '',
  qtyIn: (r.qty_in as number) ?? 0,
  qtyRemaining: (r.qty_remaining as number) ?? 0,
});

const rowToInvMovement = (r: Record<string, unknown>): InventoryMovement => ({
  id: r.id as string,
  itemId: (r.item_id as string) ?? '',
  lotId: (r.lot_id as string) ?? undefined,
  lotLineId: (r.lot_line_id as string) ?? undefined,
  color: (r.color as string) ?? '',
  size: (r.size as string) ?? '',
  type: ((r.type as string) ?? 'in') as MovementType,
  qty: (r.qty as number) ?? 0,
  unitCost: (r.unit_cost as number) ?? 0,
  reason: (r.reason as string) ?? '',
  ref: (r.ref as string) ?? '',
  occurredAt: r.occurred_at as string,
  createdBy: (r.created_by_name as string) ?? '',
  createdAt: r.created_at as string,
  tourProfileId: (r.tour_profile_id as string) ?? undefined,
  tourCode: (r.tour_code as string) ?? undefined,
});

const rowToAsset = (r: Record<string, unknown>): InventoryAsset => ({
  id: r.id as string,
  code: (r.code as string) ?? '',
  itemId: (r.item_id as string) ?? '',
  name: (r.name as string) ?? '',
  serial: (r.serial as string) ?? '',
  purchaseCost: (r.purchase_cost as number) ?? 0,
  purchasedAt: (r.purchased_at as string) ?? undefined,
  status: ((r.status as string) ?? 'available') as AssetStatus,
  holder: (r.holder as string) ?? '',
  location: (r.location as string) ?? '',
  condition: (r.condition as string) ?? '',
  note: (r.note as string) ?? '',
  createdBy: (r.created_by_name as string) ?? '',
  createdAt: r.created_at as string,
  updatedBy: (r.updated_by_name as string) ?? undefined,
  updatedAt: (r.updated_at as string) ?? undefined,
});

const rowToAssetLog = (r: Record<string, unknown>): InventoryAssetLog => ({
  id: r.id as string,
  assetId: (r.asset_id as string) ?? '',
  action: ((r.action as string) ?? 'status') as AssetAction,
  fromStatus: (r.from_status as string) ?? '',
  toStatus: (r.to_status as string) ?? '',
  holder: (r.holder as string) ?? '',
  reason: (r.reason as string) ?? '',
  ref: (r.ref as string) ?? '',
  occurredAt: r.occurred_at as string,
  createdBy: (r.created_by_name as string) ?? '',
  createdAt: r.created_at as string,
  tourProfileId: (r.tour_profile_id as string) ?? undefined,
  tourCode: (r.tour_code as string) ?? undefined,
});

async function loadInventory(cl: SupabaseClient): Promise<InventorySnapshot> {
  const [cats, items, lots, lines, moves, assets, alogs] = await Promise.all([
    cl.from('inventory_categories').select('*').order('created_at', { ascending: true }),
    cl.from('inventory_items').select('*').order('code', { ascending: true }),
    cl.from('inventory_lots').select('*').order('received_at', { ascending: true }),
    cl.from('inventory_lot_lines').select('*'),
    cl.from('inventory_movements').select('*').order('occurred_at', { ascending: false }).limit(1000),
    cl.from('inventory_assets').select('*').order('code', { ascending: true }),
    cl.from('inventory_asset_logs').select('*').order('occurred_at', { ascending: false }).limit(1000),
  ]);
  for (const res of [cats, items, lots, lines, moves, assets, alogs]) if (res.error) throw res.error;
  const linesByLot = new Map<string, InventoryLotLine[]>();
  for (const row of lines.data ?? []) {
    const ll = rowToInvLotLine(row);
    (linesByLot.get(ll.lotId) ?? linesByLot.set(ll.lotId, []).get(ll.lotId)!).push(ll);
  }
  const lotList: InventoryLot[] = (lots.data ?? []).map((r) => ({
    id: r.id as string,
    code: (r.code as string) ?? '',
    itemId: (r.item_id as string) ?? '',
    color: (r.color as string) ?? '',
    colorCode: (r.color_code as string) ?? '',
    unitCost: (r.unit_cost as number) ?? 0,
    supplier: (r.supplier as string) ?? '',
    receivedAt: r.received_at as string,
    note: (r.note as string) ?? '',
    createdBy: (r.created_by_name as string) ?? '',
    createdAt: r.created_at as string,
    lines: linesByLot.get(r.id as string) ?? [],
  }));
  return {
    categories: (cats.data ?? []).map(rowToInvCategory),
    items: (items.data ?? []).map(rowToInvItem),
    lots: lotList,
    movements: (moves.data ?? []).map(rowToInvMovement),
    assets: (assets.data ?? []).map(rowToAsset),
    assetLogs: (alogs.data ?? []).map(rowToAssetLog),
  };
}

/** Đăng ký realtime cho toàn bộ kho: bất kỳ bảng nào đổi → nạp lại cả snapshot. */
export function sbSubscribeInventory(cb: (snap: InventorySnapshot) => void, client: SupabaseClient = sb): () => void {
  let active = true;
  const load = () => loadInventory(client).then((v) => { if (active) cb(v); })
    .catch((e) => console.warn('Supabase inventory load error:', (e as Error).message));
  load();
  const tables = ['inventory_categories', 'inventory_items', 'inventory_lots', 'inventory_lot_lines', 'inventory_movements', 'inventory_assets', 'inventory_asset_logs'];
  const ch = client.channel('inv:' + Math.random().toString(36).slice(2));
  for (const t of tables) ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => { load(); });
  ch.subscribe();
  return () => { active = false; client.removeChannel(ch); };
}

export async function sbUpsertInventoryCategory(c: InventoryCategory, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.from('inventory_categories').upsert({
    id: c.id, code: c.code, name: c.name ?? '', kind: c.kind ?? 'consumable',
    seq: c.seq ?? 0, note: c.note ?? '', created_by_name: c.createdBy ?? '', created_at: c.createdAt,
  }, { onConflict: 'id' });
  if (error) throw new Error('sbUpsertInventoryCategory: ' + error.message);
}

export async function sbDeleteInventoryCategory(id: string, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.from('inventory_categories').delete().eq('id', id);
  if (error) throw new Error('sbDeleteInventoryCategory: ' + error.message);
}

/** Sinh mã sản phẩm kế tiếp theo loại (atomic). */
export async function sbNextItemCode(categoryId: string, client: SupabaseClient = sb): Promise<string> {
  const { data, error } = await client.rpc('inventory_next_item_code', { p_category_id: categoryId });
  if (error) throw new Error('sbNextItemCode: ' + error.message);
  return data as string;
}

export async function sbUpsertInventoryItem(it: InventoryItem, by: { name: string; role: string }, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.from('inventory_items').upsert({
    id: it.id, code: it.code, category_id: it.categoryId, name: it.name ?? '', unit: it.unit ?? 'cái',
    sizes: it.sizes ?? [], min_stock: it.minStock ?? 0, image_url: it.imageUrl || null, note: it.note ?? '',
    active: it.active ?? true, created_by_name: it.createdBy ?? '', created_at: it.createdAt,
    updated_at: new Date().toISOString(), updated_by_name: `${by.name} (${by.role})`,
  }, { onConflict: 'id' });
  if (error) throw new Error('sbUpsertInventoryItem: ' + error.message);
}

export async function sbDeleteInventoryItem(id: string, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.from('inventory_items').delete().eq('id', id);
  if (error) throw new Error('sbDeleteInventoryItem: ' + error.message);
}

/** Nhập một lô (theo màu, nhiều size). Trả về { lotId, lotCode }. */
export async function sbReceiveLot(args: {
  itemId: string; color: string; colorCode: string; unitCost: number; supplier: string;
  receivedAt: string; note: string; lines: ReceiveLine[]; by: string;
}, client: SupabaseClient = sb): Promise<{ lotId: string; lotCode: string }> {
  const { data, error } = await client.rpc('inventory_receive_lot', {
    p_item_id: args.itemId, p_color: args.color, p_color_code: args.colorCode,
    p_unit_cost: args.unitCost, p_supplier: args.supplier, p_received_at: args.receivedAt,
    p_note: args.note, p_lines: args.lines, p_by: args.by,
  });
  if (error) throw new Error('sbReceiveLot: ' + error.message);
  const d = data as { lot_id: string; lot_code: string };
  return { lotId: d.lot_id, lotCode: d.lot_code };
}

/** Xuất kho FIFO. */
export async function sbIssueStock(args: {
  itemId: string; color: string; size: string; qty: number;
  reason: string; ref: string; occurredAt: string; by: string;
  tourProfileId?: string; tourCode?: string;
}, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.rpc('inventory_issue', {
    p_item_id: args.itemId, p_color: args.color, p_size: args.size, p_qty: args.qty,
    p_reason: args.reason, p_ref: args.ref, p_occurred_at: args.occurredAt, p_by: args.by,
    p_tour_profile_id: args.tourProfileId ?? null, p_tour_code: args.tourCode ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Điều chỉnh tồn một dòng lô (kiểm kê). */
export async function sbAdjustStock(lotLineId: string, newQty: number, reason: string, by: string, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.rpc('inventory_adjust', {
    p_lot_line_id: lotLineId, p_new_qty: newQty, p_reason: reason, p_by: by,
  });
  if (error) throw new Error(error.message);
}

// ── Tài sản (Đợt 2) ────────────────────────────────────────────────────────────
export async function sbNextAssetCode(itemId: string, client: SupabaseClient = sb): Promise<string> {
  const { data, error } = await client.rpc('inventory_next_asset_code', { p_item_id: itemId });
  if (error) throw new Error('sbNextAssetCode: ' + error.message);
  return data as string;
}

export async function sbUpsertAsset(a: InventoryAsset, by: { name: string; role: string }, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.from('inventory_assets').upsert({
    id: a.id, code: a.code, item_id: a.itemId, name: a.name ?? '', serial: a.serial ?? '',
    purchase_cost: a.purchaseCost ?? 0, purchased_at: a.purchasedAt || null, status: a.status ?? 'available',
    holder: a.holder ?? '', location: a.location ?? '', condition: a.condition ?? '', note: a.note ?? '',
    created_by_name: a.createdBy ?? '', created_at: a.createdAt,
    updated_at: new Date().toISOString(), updated_by_name: `${by.name} (${by.role})`,
  }, { onConflict: 'id' });
  if (error) throw new Error('sbUpsertAsset: ' + error.message);
}

export async function sbDeleteAsset(id: string, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.from('inventory_assets').delete().eq('id', id);
  if (error) throw new Error('sbDeleteAsset: ' + error.message);
}

/** Cấp phát / thu hồi / bảo trì / thanh lý — đổi trạng thái + ghi log atomic. */
export async function sbAssetAction(args: {
  assetId: string; action: AssetAction; toStatus: AssetStatus; holder: string;
  reason: string; ref: string; occurredAt: string; by: string;
  tourProfileId?: string; tourCode?: string;
}, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.rpc('inventory_asset_action', {
    p_asset_id: args.assetId, p_action: args.action, p_to_status: args.toStatus, p_holder: args.holder,
    p_reason: args.reason, p_ref: args.ref, p_occurred_at: args.occurredAt, p_by: args.by,
    p_tour_profile_id: args.tourProfileId ?? null, p_tour_code: args.tourCode ?? null,
  });
  if (error) throw new Error(error.message);
}
