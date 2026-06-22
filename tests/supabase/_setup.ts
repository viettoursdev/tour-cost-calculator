import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Well-known Supabase-CLI local dev values (identical across all local installs; not secret).
const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const TEST_EMAIL = 'tester@viettours.com.vn';
const TEST_PASSWORD = 'test-password-12345';

export function getServiceClient(): SupabaseClient {
  return createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
}

let viettoursClient: SupabaseClient | null = null;

/** A client signed in as a @viettours.com.vn user, so RLS (auth + domain) passes. */
export async function getViettoursClient(): Promise<SupabaseClient> {
  if (viettoursClient) return viettoursClient;
  const admin = getServiceClient();
  // Idempotent: create the test auth user if absent (trigger auto-makes its profile).
  await admin.auth.admin.createUser({
    email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true,
  }).catch(() => {/* already exists */});
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  if (error) throw new Error('test sign-in failed: ' + error.message);
  viettoursClient = c;
  return c;
}

/**
 * Idempotent: creates an auth user (email_confirm: true) and returns its UID.
 * If the user already exists, looks it up via listUsers and returns its existing UID.
 */
export async function adminCreateUser(email: string, password: string): Promise<string> {
  const admin = getServiceClient();
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (!error) return data.user.id;
  // Already exists — look up by listing and filtering
  const { data: list, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) throw new Error('adminCreateUser listUsers: ' + listErr.message);
  const found = list.users.find((u) => u.email === email);
  if (!found) throw new Error('adminCreateUser: user not found after create failed: ' + error.message);
  return found.id;
}

export async function adminDeleteUser(uid: string): Promise<void> {
  const admin = getServiceClient();
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) throw new Error('adminDeleteUser: ' + error.message);
}

const PK_COL: Record<string, string> = {
  fx_rates: 'currency',
  rate_card_hotels: 'city',
  rate_card_other: 'rkey',
  rate_card_visa: 'one_row',
  rate_card_meta: 'one_row',
  visa_products_meta: 'one_row',
  guide_schedule: 'one_row',
  notification_thread_members: 'thread_id',
  chat_members: 'chat_id',  // composite PK (chat_id, username) — no id column
};

/** Delete all rows from the given tables (service role bypasses RLS). Children first. */
export async function truncate(tables: string[]): Promise<void> {
  const admin = getServiceClient();
  for (const t of tables) {
    const col = PK_COL[t] ?? 'id';
    const { error } = await admin.from(t).delete().not(col, 'is', null);
    if (error && !/no rows/i.test(error.message)) throw new Error(`truncate ${t}: ${error.message}`);
  }
}
