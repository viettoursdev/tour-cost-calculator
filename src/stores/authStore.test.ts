import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));

import { useAuthStore } from './authStore';
import { snapshotInitial } from '@/test/storeReset';
import * as fb from '@/lib/firebase';
import type { User } from '@/types';

const reset = snapshotInitial(useAuthStore);

beforeEach(() => {
  reset();
  vi.clearAllMocks();
  sessionStorage.clear();
});

afterEach(() => sessionStorage.clear());

function user(over: Partial<User> = {}): User {
  return { u: 'ceo', p: 'ceo123', role: 'CEO', name: 'Tony', color: '#dc3250', ...over };
}

describe('authStore.init', () => {
  it('seeds defaults to firebase when cloud is empty', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([]);
    await useAuthStore.getState().init();
    expect(fb.fbPushUsers).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().hasHydrated).toBe(true);
  });

  it('replaces local users with cloud when cloud non-empty (cloud wins)', async () => {
    const cloud = [user({ u: 'cloud-only', name: 'C' })];
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce(cloud);
    await useAuthStore.getState().init();
    // Default seed CEO is intentionally dropped if missing from cloud
    expect(useAuthStore.getState().users.some((u) => u.u === 'cloud-only')).toBe(true);
    expect(useAuthStore.getState().users.some((u) => u.u === 'ceo')).toBe(false);
  });

  it('keeps non-seed local-only users when merging with cloud', async () => {
    // Seed a local-only non-default user
    useAuthStore.setState({
      users: [
        user({ u: 'ceo' }),
        user({ u: 'local-only', name: 'L' }),
      ],
    }, false);
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([user({ u: 'cloud1', name: 'C' })]);
    await useAuthStore.getState().init();
    const us = useAuthStore.getState().users;
    expect(us.some((u) => u.u === 'cloud1')).toBe(true);
    expect(us.some((u) => u.u === 'local-only')).toBe(true);
    expect(fb.fbPushUsers).toHaveBeenCalled();
  });

  it('still flips hasHydrated even when fbPullUsers throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(fb.fbPullUsers).mockRejectedValueOnce(new Error('network'));
    await useAuthStore.getState().init();
    expect(useAuthStore.getState().hasHydrated).toBe(true);
    warnSpy.mockRestore();
  });
});

describe('authStore.login', () => {
  it('returns ok:false on unknown user', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([user()]);
    const out = await useAuthStore.getState().login('nobody', 'x');
    expect(out.ok).toBe(false);
    expect(useAuthStore.getState().currentUser).toBeNull();
  });

  it('returns ok:false on wrong password', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([user()]);
    const out = await useAuthStore.getState().login('ceo', 'wrong');
    expect(out.ok).toBe(false);
    expect(useAuthStore.getState().currentUser).toBeNull();
  });

  it('returns ok:true and sets currentUser on correct creds', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([user()]);
    const out = await useAuthStore.getState().login('ceo', 'ceo123');
    expect(out.ok).toBe(true);
    expect(useAuthStore.getState().currentUser?.u).toBe('ceo');
  });

  it('persists session to sessionStorage on success', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([user()]);
    await useAuthStore.getState().login('ceo', 'ceo123');
    const raw = sessionStorage.getItem('vte_s');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).u).toBe('ceo');
  });

  it('calls fbPullUsers before validating credentials', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([user()]);
    await useAuthStore.getState().login('ceo', 'ceo123');
    expect(fb.fbPullUsers).toHaveBeenCalled();
  });
});

describe('authStore.logout', () => {
  it('clears currentUser and sessionStorage', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([user()]);
    await useAuthStore.getState().login('ceo', 'ceo123');
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(sessionStorage.getItem('vte_s')).toBeNull();
  });
});

describe('authStore.saveUsers', () => {
  it('updates local users and forwards the list to fbPushUsers', async () => {
    const next = [user({ u: 'a' }), user({ u: 'b' })];
    await useAuthStore.getState().saveUsers(next);
    expect(useAuthStore.getState().users).toEqual(next);
    expect(vi.mocked(fb.fbPushUsers).mock.calls[0][0]).toEqual(next);
  });
});
