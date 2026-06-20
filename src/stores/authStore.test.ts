import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));
vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));

import { useAuthStore } from './authStore';
import { snapshotInitial } from '@/test/storeReset';
import * as fb from '@/lib/firebase';
import type { User } from '@/types';
import {
  getSignInMethod,
  setSignInMethod,
  readLastActive,
  clearSessionTracking,
  IDLE_TIMEOUT_MS,
} from '@/auth/sessionTimeout';

const reset = snapshotInitial(useAuthStore);

beforeEach(() => {
  reset();
  vi.clearAllMocks();
  localStorage.clear();
  clearSessionTracking('ceo');
  vi.mocked(fb.fbIsSignInLink).mockReturnValue(false);
  vi.mocked(fb.fbOnIdTokenChanged).mockImplementation(() => () => {});
});

function user(over: Partial<User> = {}): User {
  return {
    u: 'ceo',
    email: 'ceo@viettours.com.vn',
    p: 'ceo123',
    role: 'CEO',
    name: 'Tony',
    color: '#dc3250',
    ...over,
  };
}

describe('requestSignInLink', () => {
  it('rejects empty email', async () => {
    const out = await useAuthStore.getState().requestSignInLink('');
    expect(out.ok).toBe(false);
    expect(fb.fbSendSignInLink).not.toHaveBeenCalled();
  });

  it('rejects off-domain email', async () => {
    const out = await useAuthStore.getState().requestSignInLink('attacker@gmail.com');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('@viettours.com.vn');
    expect(fb.fbSendSignInLink).not.toHaveBeenCalled();
  });

  it('rejects look-alike domain', async () => {
    const out = await useAuthStore.getState().requestSignInLink('a@viettours.com.vn.evil.com');
    expect(out.ok).toBe(false);
    expect(fb.fbSendSignInLink).not.toHaveBeenCalled();
  });

  it('sends link, normalizes email, stashes in localStorage', async () => {
    const out = await useAuthStore.getState().requestSignInLink('CEO@Viettours.COM.VN');
    expect(out.ok).toBe(true);
    expect(fb.fbSendSignInLink).toHaveBeenCalledWith('ceo@viettours.com.vn');
    expect(localStorage.getItem('vte_pending_signin_email')).toBe('ceo@viettours.com.vn');
    expect(useAuthStore.getState().pendingEmail).toBe('ceo@viettours.com.vn');
  });

  it('returns error and does not stash when fbSendSignInLink throws', async () => {
    vi.mocked(fb.fbSendSignInLink).mockRejectedValueOnce(new Error('quota'));
    const out = await useAuthStore.getState().requestSignInLink('ceo@viettours.com.vn');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('quota');
    expect(localStorage.getItem('vte_pending_signin_email')).toBeNull();
  });
});

describe('init — magic-link completion', () => {
  it('with pending email: completes sign-in, clears pending email', async () => {
    localStorage.setItem('vte_pending_signin_email', 'ceo@viettours.com.vn');
    vi.mocked(fb.fbIsSignInLink).mockReturnValue(true);
    await useAuthStore.getState().init();
    expect(fb.fbCompleteSignInLink).toHaveBeenCalledWith(
      'ceo@viettours.com.vn',
      window.location.href,
    );
    expect(localStorage.getItem('vte_pending_signin_email')).toBeNull();
  });

  it('with no pending email: enters cross-device flow', async () => {
    vi.mocked(fb.fbIsSignInLink).mockReturnValue(true);
    await useAuthStore.getState().init();
    expect(fb.fbCompleteSignInLink).not.toHaveBeenCalled();
    expect(useAuthStore.getState().pendingCrossDeviceUrl).toBeTruthy();
  });

  it('surfaces Vietnamese error + clears pending email when completion throws', async () => {
    localStorage.setItem('vte_pending_signin_email', 'ceo@viettours.com.vn');
    vi.mocked(fb.fbIsSignInLink).mockReturnValue(true);
    vi.mocked(fb.fbCompleteSignInLink).mockRejectedValueOnce(new Error('expired'));
    await useAuthStore.getState().init();
    expect(useAuthStore.getState().authError).toMatch(/hết hạn/);
    expect(localStorage.getItem('vte_pending_signin_email')).toBeNull();
  });
});

describe('init — onIdTokenChanged subscriber', () => {
  it('null fbUser clears currentUser and flags hydrated', async () => {
    await useAuthStore.getState().init();
    const cb = vi.mocked(fb.fbOnIdTokenChanged).mock.calls[0][0];
    await cb(null);
    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(useAuthStore.getState().hasHydrated).toBe(true);
  });

  it('email matching user_accounts: populates currentUser', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([user()]);
    await useAuthStore.getState().init();
    const cb = vi.mocked(fb.fbOnIdTokenChanged).mock.calls[0][0];
    await cb({ email: 'ceo@viettours.com.vn', emailVerified: true } as Parameters<typeof cb>[0]);
    expect(useAuthStore.getState().currentUser?.u).toBe('ceo');
  });

  it('email match is case-insensitive', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([user({ email: 'ceo@viettours.com.vn' })]);
    await useAuthStore.getState().init();
    const cb = vi.mocked(fb.fbOnIdTokenChanged).mock.calls[0][0];
    await cb({ email: 'CEO@Viettours.COM.VN', emailVerified: true } as Parameters<typeof cb>[0]);
    expect(useAuthStore.getState().currentUser?.u).toBe('ceo');
  });

  it('email NOT in user_accounts: signs out and sets authError', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([user()]);
    await useAuthStore.getState().init();
    const cb = vi.mocked(fb.fbOnIdTokenChanged).mock.calls[0][0];
    await cb({ email: 'stranger@viettours.com.vn', emailVerified: true } as Parameters<typeof cb>[0]);
    expect(fb.fbSignOut).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(useAuthStore.getState().authError).toMatch(/chưa được cấp quyền/);
  });

  it('developer@viettours.com.vn auto-provisions as CEO when not in user_accounts', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([]);
    await useAuthStore.getState().init();
    const cb = vi.mocked(fb.fbOnIdTokenChanged).mock.calls[0][0];
    await cb({ email: 'developer@viettours.com.vn', emailVerified: true } as Parameters<typeof cb>[0]);
    const state = useAuthStore.getState();
    expect(state.currentUser?.u).toBe('developer');
    expect(state.currentUser?.role).toBe('CEO');
    expect(state.authError).toBeNull();
    expect(fb.fbSignOut).not.toHaveBeenCalled();
    expect(fb.fbPushUsers).toHaveBeenCalledTimes(1);
    const pushed = vi.mocked(fb.fbPushUsers).mock.calls[0][0];
    expect(pushed.find((u) => u.email === 'developer@viettours.com.vn')?.role).toBe('CEO');
  });

  it('developer@viettours.com.vn signs in normally if already in user_accounts', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([
      user({ u: 'developer', email: 'developer@viettours.com.vn', name: 'Dev', role: 'CEO' }),
    ]);
    await useAuthStore.getState().init();
    const cb = vi.mocked(fb.fbOnIdTokenChanged).mock.calls[0][0];
    await cb({ email: 'developer@viettours.com.vn', emailVerified: true } as Parameters<typeof cb>[0]);
    expect(useAuthStore.getState().currentUser?.u).toBe('developer');
    // Not bootstrapped — found in cloud, no second write.
    expect(fb.fbPushUsers).not.toHaveBeenCalled();
  });
});

describe('completeCrossDeviceSignIn', () => {
  it('fails with no pending URL', async () => {
    const out = await useAuthStore.getState().completeCrossDeviceSignIn('ceo@viettours.com.vn');
    expect(out.ok).toBe(false);
  });

  it('rejects off-domain even with pending URL', async () => {
    useAuthStore.setState({ pendingCrossDeviceUrl: 'https://example/?mode=auth' }, false);
    const out = await useAuthStore.getState().completeCrossDeviceSignIn('attacker@gmail.com');
    expect(out.ok).toBe(false);
    expect(fb.fbCompleteSignInLink).not.toHaveBeenCalled();
  });

  it('completes and clears pending state on success', async () => {
    useAuthStore.setState({ pendingCrossDeviceUrl: 'https://example/?mode=auth' }, false);
    const out = await useAuthStore.getState().completeCrossDeviceSignIn('ceo@viettours.com.vn');
    expect(out.ok).toBe(true);
    expect(fb.fbCompleteSignInLink).toHaveBeenCalled();
    expect(useAuthStore.getState().pendingCrossDeviceUrl).toBeNull();
  });
});

describe('signInWithPassword', () => {
  it('rejects when email or password is empty', async () => {
    const a = await useAuthStore.getState().signInWithPassword('', 'pw');
    expect(a.ok).toBe(false);
    const b = await useAuthStore.getState().signInWithPassword('ceo@viettours.com.vn', '');
    expect(b.ok).toBe(false);
    expect(fb.fbSignInWithPassword).not.toHaveBeenCalled();
  });

  it('rejects off-domain email', async () => {
    const out = await useAuthStore.getState().signInWithPassword('attacker@gmail.com', 'pw');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('@viettours.com.vn');
    expect(fb.fbSignInWithPassword).not.toHaveBeenCalled();
  });

  it('normalizes email and forwards to fbSignInWithPassword', async () => {
    const out = await useAuthStore.getState().signInWithPassword('CEO@Viettours.COM.VN', 'pw');
    expect(out.ok).toBe(true);
    expect(fb.fbSignInWithPassword).toHaveBeenCalledWith('ceo@viettours.com.vn', 'pw');
  });

  it('returns Vietnamese error when fbSignInWithPassword throws', async () => {
    vi.mocked(fb.fbSignInWithPassword).mockRejectedValueOnce(new Error('wrong-password'));
    const out = await useAuthStore.getState().signInWithPassword('ceo@viettours.com.vn', 'bad');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/Sai/);
  });
});

describe('cancelPendingSignIn', () => {
  it('clears localStorage and store state', () => {
    localStorage.setItem('vte_pending_signin_email', 'x@viettours.com.vn');
    useAuthStore.setState({ pendingEmail: 'x@viettours.com.vn', pendingCrossDeviceUrl: 'u' }, false);
    useAuthStore.getState().cancelPendingSignIn();
    expect(localStorage.getItem('vte_pending_signin_email')).toBeNull();
    expect(useAuthStore.getState().pendingEmail).toBeNull();
    expect(useAuthStore.getState().pendingCrossDeviceUrl).toBeNull();
  });
});

describe('signOut', () => {
  it('clears currentUser and calls fbSignOut', async () => {
    useAuthStore.setState({ currentUser: user() }, false);
    await useAuthStore.getState().signOut();
    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(fb.fbSignOut).toHaveBeenCalledTimes(1);
  });
});

describe('saveUsers', () => {
  it('updates local users and forwards to fbPushUsers', async () => {
    const next = [user({ u: 'a' }), user({ u: 'b' })];
    await useAuthStore.getState().saveUsers(next);
    expect(useAuthStore.getState().users).toEqual(next);
    expect(vi.mocked(fb.fbPushUsers).mock.calls[0][0]).toEqual(next);
  });
});

describe('sign-in method persistence', () => {
  it('records "link" method when requestSignInLink resolves and a user signs in', async () => {
    const u = user();
    vi.mocked(fb.fbPullUsers).mockResolvedValue([u]);
    let idCb: ((fbUser: { email: string } | null) => Promise<void>) | null = null;
    vi.mocked(fb.fbOnIdTokenChanged).mockImplementation((cb) => {
      idCb = cb as typeof idCb;
      return () => {};
    });

    await useAuthStore.getState().init();
    const start = Date.now();
    await useAuthStore.getState().requestSignInLink('ceo@viettours.com.vn');
    await idCb!({ email: 'ceo@viettours.com.vn' });

    expect(getSignInMethod('ceo')).toBe('link');
    const last = readLastActive('ceo');
    expect(last).not.toBeNull();
    expect(last!).toBeGreaterThanOrEqual(start);
    expect(last!).toBeLessThanOrEqual(Date.now());
  });

  it('records "password" method when signInWithPassword resolves and a user signs in', async () => {
    const u = user();
    vi.mocked(fb.fbPullUsers).mockResolvedValue([u]);
    let idCb: ((fbUser: { email: string } | null) => Promise<void>) | null = null;
    vi.mocked(fb.fbOnIdTokenChanged).mockImplementation((cb) => {
      idCb = cb as typeof idCb;
      return () => {};
    });

    await useAuthStore.getState().init();
    await useAuthStore.getState().signInWithPassword('ceo@viettours.com.vn', 'pw');
    await idCb!({ email: 'ceo@viettours.com.vn' });

    expect(getSignInMethod('ceo')).toBe('password');
  });

  it('clears session tracking on signOut', async () => {
    setSignInMethod('ceo', 'link');
    localStorage.setItem('vte_session_last_active_ceo', String(Date.now()));
    useAuthStore.setState({ currentUser: user() });
    await useAuthStore.getState().signOut();
    expect(getSignInMethod('ceo')).toBeNull();
    expect(readLastActive('ceo')).toBeNull();
  });
});

describe('expireSession action', () => {
  it('signs out, sets Vietnamese authError, clears tracking', async () => {
    setSignInMethod('ceo', 'link');
    localStorage.setItem('vte_session_last_active_ceo', String(Date.now()));
    useAuthStore.setState({ currentUser: user() });

    await useAuthStore.getState().expireSession();

    expect(fb.fbSignOut).toHaveBeenCalled();
    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(useAuthStore.getState().authError).toBe(
      'Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại.',
    );
    expect(getSignInMethod('ceo')).toBeNull();
    expect(readLastActive('ceo')).toBeNull();
  });

  it('is a no-op when there is no currentUser', async () => {
    await useAuthStore.getState().expireSession();
    expect(fb.fbSignOut).not.toHaveBeenCalled();
  });
});

describe('init-time expiry check', () => {
  it('signs out and sets authError when a link session is already expired', async () => {
    const u = user();
    vi.mocked(fb.fbPullUsers).mockResolvedValue([u]);
    setSignInMethod('ceo', 'link');
    localStorage.setItem(
      'vte_session_last_active_ceo',
      String(Date.now() - IDLE_TIMEOUT_MS - 1000),
    );

    let idCb: ((fbUser: { email: string } | null) => Promise<void>) | null = null;
    vi.mocked(fb.fbOnIdTokenChanged).mockImplementation((cb) => {
      idCb = cb as typeof idCb;
      return () => {};
    });

    await useAuthStore.getState().init();
    await idCb!({ email: 'ceo@viettours.com.vn' });

    expect(fb.fbSignOut).toHaveBeenCalled();
    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(useAuthStore.getState().authError).toBe(
      'Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại.',
    );
    expect(getSignInMethod('ceo')).toBeNull();
  });

  it('does NOT sign out when a password session is past 48h (password is exempt)', async () => {
    const u = user();
    vi.mocked(fb.fbPullUsers).mockResolvedValue([u]);
    setSignInMethod('ceo', 'password');
    localStorage.setItem(
      'vte_session_last_active_ceo',
      String(Date.now() - IDLE_TIMEOUT_MS - 1000),
    );

    let idCb: ((fbUser: { email: string } | null) => Promise<void>) | null = null;
    vi.mocked(fb.fbOnIdTokenChanged).mockImplementation((cb) => {
      idCb = cb as typeof idCb;
      return () => {};
    });

    await useAuthStore.getState().init();
    await idCb!({ email: 'ceo@viettours.com.vn' });

    expect(fb.fbSignOut).not.toHaveBeenCalled();
    expect(useAuthStore.getState().currentUser?.u).toBe('ceo');
  });
});
