import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { supabaseBackend } from '@/auth/backends/supabaseBackend';
import { adminCreateUser, adminDeleteUser } from './_setup';

const EMAIL = 'phase3-be@viettours.com.vn';
const PASSWORD = 'Test1234!';
let uid = '';

beforeAll(async () => { uid = await adminCreateUser(EMAIL, PASSWORD); });
afterAll(async () => { await supabaseBackend.signOut(); await adminDeleteUser(uid); });

describe('supabaseBackend', () => {
  it('resolves a signed-in session to the app user + directory', async () => {
    await supabaseBackend.signInWithPassword(EMAIL, PASSWORD);
    const res = await supabaseBackend.resolve({ uid, email: EMAIL });
    expect(res.kind).toBe('ok');
    if (res.kind === 'ok') {
      expect(res.user.email).toBe(EMAIL);
      expect(Array.isArray(res.users)).toBe(true);
    }
  });

  it('rejects a session whose uid has no profile', async () => {
    const res = await supabaseBackend.resolve({ uid: '00000000-0000-0000-0000-000000000000', email: 'ghost@viettours.com.vn' });
    expect(res.kind).toBe('rejected');
  });

  it('exposes a fresh access token while signed in', async () => {
    await supabaseBackend.signInWithPassword(EMAIL, PASSWORD);
    expect(await supabaseBackend.getAccessToken()).toBeTruthy();
  });
});
