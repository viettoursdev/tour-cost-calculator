import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  sbSignInWithPassword, sbSignOut, sbOnAuthChange, sbGetProfileById, sbGetAccessToken,
} from '@/lib/supabase';
import { adminCreateUser, adminDeleteUser } from './_setup';

const EMAIL = 'phase3-auth@viettours.com.vn';
const PASSWORD = 'Test1234!';
let uid = '';

beforeAll(async () => {
  uid = await adminCreateUser(EMAIL, PASSWORD); // service-role admin create; trigger provisions profile
});
afterAll(async () => { await sbSignOut(); await adminDeleteUser(uid); });

describe('supabase auth gateway', () => {
  it('signs in with password and exposes a fresh access token', async () => {
    await sbSignInWithPassword(EMAIL, PASSWORD);
    const token = await sbGetAccessToken();
    expect(token).toBeTruthy();
  });

  it('resolves the profile by uid', async () => {
    const u = await sbGetProfileById(uid);
    expect(u?.email).toBe(EMAIL);
  });

  it('onAuthChange reports null after signOut', async () => {
    await new Promise<void>((resolve) => {
      const unsub = sbOnAuthChange((s) => { if (s === null) { unsub(); resolve(); } });
      void sbSignOut();
    });
  });
});
