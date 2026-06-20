import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));
vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));

import { authBackend } from './backend';
import { firebaseBackend } from './backends/firebaseBackend';
import * as fb from '@/lib/firebase';
import type { User } from '@/types';

const user = (o: Partial<User> = {}): User => ({
  u: 'ceo', email: 'ceo@viettours.com.vn', role: 'CEO', name: 'Tony', color: '#dc3250', ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authBackend selector', () => {
  it('defaults to the firebase backend', () => {
    // VITE_AUTH_BACKEND is unset in the unit env → firebase.
    expect(authBackend).toBe(firebaseBackend);
  });
});

describe('firebaseBackend.resolve', () => {
  it('matches a user by email (case-insensitive) and returns ok', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([user()]);
    const res = await firebaseBackend.resolve({ uid: 'x', email: 'CEO@Viettours.COM.VN' });
    expect(res.kind).toBe('ok');
    if (res.kind === 'ok') expect(res.user.u).toBe('ceo');
  });

  it('rejects an email absent from the directory', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([user()]);
    const res = await firebaseBackend.resolve({ uid: 'x', email: 'stranger@viettours.com.vn' });
    expect(res.kind).toBe('rejected');
    expect(fb.fbPushUsers).not.toHaveBeenCalled();
  });

  it('bootstraps developer@viettours.com.vn as CEO when absent', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([]);
    const res = await firebaseBackend.resolve({ uid: 'x', email: 'developer@viettours.com.vn' });
    expect(res.kind).toBe('ok');
    if (res.kind === 'ok') { expect(res.user.u).toBe('developer'); expect(res.user.role).toBe('CEO'); }
    expect(fb.fbPushUsers).toHaveBeenCalledTimes(1);
  });
});
