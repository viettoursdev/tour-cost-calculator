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

/** Delete all rows from the given tables (service role bypasses RLS). Children first. */
export async function truncate(tables: string[]): Promise<void> {
  const admin = getServiceClient();
  for (const t of tables) {
    const { error } = await admin.from(t).delete().not('id', 'is', null);
    if (error && !/no rows/i.test(error.message)) throw new Error(`truncate ${t}: ${error.message}`);
  }
}
