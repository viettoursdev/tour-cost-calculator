import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));

import { useAuthStore } from './authStore';
import { snapshotInitial } from '@/test/storeReset';
import * as sb from '@/lib/supabase';
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
  vi.mocked(sb.sbIsSignInLink).mockReturnValue(false);
  vi.mocked(sb.sbOnAuthChange).mockImplementation((_cb) => () => {});
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
    expect(sb.sbSendSignInLink).not.toHaveBeenCalled();
  });

  it('rejects off-domain email', async () => {
    const out = await useAuthStore.getState().requestSignInLink('attacker@gmail.com');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('@viettours.com.vn');
    expect(sb.sbSendSignInLink).not.toHaveBeenCalled();
  });

  it('rejects look-alike domain', async () => {
    const out = await useAuthStore.getState().requestSignInLink('a@viettours.com.vn.evil.com');
    expect(out.ok).toBe(false);
    expect(sb.sbSendSignInLink).not.toHaveBeenCalled();
  });

  it('sends link, normalizes email, stashes in localStorage', async () => {
    const out = await useAuthStore.getState().requestSignInLink('CEO@Viettours.COM.VN');
    expect(out.ok).toBe(true);
    expect(sb.sbSendSignInLink).toHaveBeenCalledWith('ceo@viettours.com.vn');
    expect(localStorage.getItem('vte_pending_signin_email')).toBe('ceo@viettours.com.vn');
    expect(useAuthStore.getState().pendingEmail).toBe('ceo@viettours.com.vn');
  });

  it('returns error and does not stash when sbSendSignInLink throws', async () => {
    vi.mocked(sb.sbSendSignInLink).mockRejectedValueOnce(new Error('quota'));
    const out = await useAuthStore.getState().requestSignInLink('ceo@viettours.com.vn');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('quota');
    expect(localStorage.getItem('vte_pending_signin_email')).toBeNull();
  });
});

describe('init — magic-link completion', () => {
  it('with pending email: completes sign-in, clears pending email', async () => {
    localStorage.setItem('vte_pending_signin_email', 'ceo@viettours.com.vn');
    vi.mocked(sb.sbIsSignInLink).mockReturnValue(true);
    await useAuthStore.getState().init();
    expect(sb.sbCompleteSignInLink).toHaveBeenCalledWith(
      window.location.href,
    );
    expect(localStorage.getItem('vte_pending_signin_email')).toBeNull();
  });

  it('with no pending email: enters cross-device flow', async () => {
    vi.mocked(sb.sbIsSignInLink).mockReturnValue(true);
    await useAuthStore.getState().init();
    expect(sb.sbCompleteSignInLink).not.toHaveBeenCalled();
    expect(useAuthStore.getState().pendingCrossDeviceUrl).toBeTruthy();
  });

  it('surfaces Vietnamese error + clears pending email when completion throws', async () => {
    localStorage.setItem('vte_pending_signin_email', 'ceo@viettours.com.vn');
    vi.mocked(sb.sbIsSignInLink).mockReturnValue(true);
    vi.mocked(sb.sbCompleteSignInLink).mockRejectedValueOnce(new Error('expired'));
    await useAuthStore.getState().init();
    expect(useAuthStore.getState().authError).toMatch(/hết hạn/);
    expect(localStorage.getItem('vte_pending_signin_email')).toBeNull();
  });
});

describe('init — onAuthChange subscriber', () => {
  it('null session clears currentUser and flags hydrated', async () => {
    await useAuthStore.getState().init();
    const cb = vi.mocked(sb.sbOnAuthChange).mock.calls[0][0];
    await cb(null);
    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(useAuthStore.getState().hasHydrated).toBe(true);
  });

  it('email matching user_accounts: populates currentUser', async () => {
    const u = user();
    vi.mocked(sb.sbGetProfileById).mockResolvedValueOnce(u);
    vi.mocked(sb.sbPullUsers).mockResolvedValueOnce([u]);
    await useAuthStore.getState().init();
    const cb = vi.mocked(sb.sbOnAuthChange).mock.calls[0][0];
    await cb({ uid: 'stub-uid', email: 'ceo@viettours.com.vn' });
    expect(useAuthStore.getState().currentUser?.u).toBe('ceo');
  });

  it('email match is case-insensitive (profile found by uid)', async () => {
    const u = user({ email: 'ceo@viettours.com.vn' });
    vi.mocked(sb.sbGetProfileById).mockResolvedValueOnce(u);
    vi.mocked(sb.sbPullUsers).mockResolvedValueOnce([u]);
    await useAuthStore.getState().init();
    const cb = vi.mocked(sb.sbOnAuthChange).mock.calls[0][0];
    await cb({ uid: 'stub-uid', email: 'CEO@Viettours.COM.VN' });
    expect(useAuthStore.getState().currentUser?.u).toBe('ceo');
  });

  it('profile not found: signs out and sets authError', async () => {
    vi.mocked(sb.sbGetProfileById).mockResolvedValueOnce(null);
    vi.mocked(sb.sbPullUsers).mockResolvedValueOnce([user()]);
    await useAuthStore.getState().init();
    const cb = vi.mocked(sb.sbOnAuthChange).mock.calls[0][0];
    await cb({ uid: 'stranger-uid', email: 'stranger@viettours.com.vn' });
    expect(sb.sbSignOut).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(useAuthStore.getState().authError).toMatch(/chưa được cấp quyền/);
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
    expect(sb.sbCompleteSignInLink).not.toHaveBeenCalled();
  });

  it('completes and clears pending state on success', async () => {
    useAuthStore.setState({ pendingCrossDeviceUrl: 'https://example/?mode=auth' }, false);
    const out = await useAuthStore.getState().completeCrossDeviceSignIn('ceo@viettours.com.vn');
    expect(out.ok).toBe(true);
    expect(sb.sbCompleteSignInLink).toHaveBeenCalled();
    expect(useAuthStore.getState().pendingCrossDeviceUrl).toBeNull();
  });
});

describe('signInWithPassword', () => {
  it('rejects when email or password is empty', async () => {
    const a = await useAuthStore.getState().signInWithPassword('', 'pw');
    expect(a.ok).toBe(false);
    const b = await useAuthStore.getState().signInWithPassword('ceo@viettours.com.vn', '');
    expect(b.ok).toBe(false);
    expect(sb.sbSignInWithPassword).not.toHaveBeenCalled();
  });

  it('rejects off-domain email', async () => {
    const out = await useAuthStore.getState().signInWithPassword('attacker@gmail.com', 'pw');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('@viettours.com.vn');
    expect(sb.sbSignInWithPassword).not.toHaveBeenCalled();
  });

  it('normalizes email and forwards to sbSignInWithPassword', async () => {
    const out = await useAuthStore.getState().signInWithPassword('CEO@Viettours.COM.VN', 'pw');
    expect(out.ok).toBe(true);
    expect(sb.sbSignInWithPassword).toHaveBeenCalledWith('ceo@viettours.com.vn', 'pw');
  });

  it('returns Vietnamese error when sbSignInWithPassword throws', async () => {
    vi.mocked(sb.sbSignInWithPassword).mockRejectedValueOnce(new Error('wrong-password'));
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
  it('clears currentUser and calls sbSignOut', async () => {
    useAuthStore.setState({ currentUser: user() }, false);
    await useAuthStore.getState().signOut();
    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(sb.sbSignOut).toHaveBeenCalledTimes(1);
  });
});

describe('saveUsers', () => {
  it('updates local users and forwards to sbPushUsers', async () => {
    const next = [user({ u: 'a' }), user({ u: 'b' })];
    await useAuthStore.getState().saveUsers(next);
    expect(useAuthStore.getState().users).toEqual(next);
    expect(vi.mocked(sb.sbPushUsers).mock.calls[0][0]).toEqual(next);
  });
});

describe('sign-in method persistence', () => {
  it('records "link" method when requestSignInLink resolves and a user signs in', async () => {
    const u = user();
    vi.mocked(sb.sbGetProfileById).mockResolvedValue(u);
    vi.mocked(sb.sbPullUsers).mockResolvedValue([u]);
    let authCb: ((session: { uid: string; email: string } | null) => Promise<void>) | null = null;
    vi.mocked(sb.sbOnAuthChange).mockImplementation((cb) => {
      authCb = cb as typeof authCb;
      return () => {};
    });

    await useAuthStore.getState().init();
    const start = Date.now();
    await useAuthStore.getState().requestSignInLink('ceo@viettours.com.vn');
    await authCb!({ uid: 'stub-uid', email: 'ceo@viettours.com.vn' });

    expect(getSignInMethod('ceo')).toBe('link');
    const last = readLastActive('ceo');
    expect(last).not.toBeNull();
    expect(last!).toBeGreaterThanOrEqual(start);
    expect(last!).toBeLessThanOrEqual(Date.now());
  });

  it('records "password" method when signInWithPassword resolves and a user signs in', async () => {
    const u = user();
    vi.mocked(sb.sbGetProfileById).mockResolvedValue(u);
    vi.mocked(sb.sbPullUsers).mockResolvedValue([u]);
    let authCb: ((session: { uid: string; email: string } | null) => Promise<void>) | null = null;
    vi.mocked(sb.sbOnAuthChange).mockImplementation((cb) => {
      authCb = cb as typeof authCb;
      return () => {};
    });

    await useAuthStore.getState().init();
    await useAuthStore.getState().signInWithPassword('ceo@viettours.com.vn', 'pw');
    await authCb!({ uid: 'stub-uid', email: 'ceo@viettours.com.vn' });

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

    expect(sb.sbSignOut).toHaveBeenCalled();
    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(useAuthStore.getState().authError).toBe(
      'Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại.',
    );
    expect(getSignInMethod('ceo')).toBeNull();
    expect(readLastActive('ceo')).toBeNull();
  });

  it('is a no-op when there is no currentUser', async () => {
    await useAuthStore.getState().expireSession();
    expect(sb.sbSignOut).not.toHaveBeenCalled();
  });
});

describe('init-time expiry check', () => {
  it('signs out and sets authError when a link session is already expired', async () => {
    const u = user();
    vi.mocked(sb.sbGetProfileById).mockResolvedValue(u);
    vi.mocked(sb.sbPullUsers).mockResolvedValue([u]);
    setSignInMethod('ceo', 'link');
    localStorage.setItem(
      'vte_session_last_active_ceo',
      String(Date.now() - IDLE_TIMEOUT_MS - 1000),
    );

    let authCb: ((session: { uid: string; email: string } | null) => Promise<void>) | null = null;
    vi.mocked(sb.sbOnAuthChange).mockImplementation((cb) => {
      authCb = cb as typeof authCb;
      return () => {};
    });

    await useAuthStore.getState().init();
    await authCb!({ uid: 'stub-uid', email: 'ceo@viettours.com.vn' });

    expect(sb.sbSignOut).toHaveBeenCalled();
    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(useAuthStore.getState().authError).toBe(
      'Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại.',
    );
    expect(getSignInMethod('ceo')).toBeNull();
  });

  it('does NOT sign out when a password session is past 48h (password is exempt)', async () => {
    const u = user();
    vi.mocked(sb.sbGetProfileById).mockResolvedValue(u);
    vi.mocked(sb.sbPullUsers).mockResolvedValue([u]);
    setSignInMethod('ceo', 'password');
    localStorage.setItem(
      'vte_session_last_active_ceo',
      String(Date.now() - IDLE_TIMEOUT_MS - 1000),
    );

    let authCb: ((session: { uid: string; email: string } | null) => Promise<void>) | null = null;
    vi.mocked(sb.sbOnAuthChange).mockImplementation((cb) => {
      authCb = cb as typeof authCb;
      return () => {};
    });

    await useAuthStore.getState().init();
    await authCb!({ uid: 'stub-uid', email: 'ceo@viettours.com.vn' });

    expect(sb.sbSignOut).not.toHaveBeenCalled();
    expect(useAuthStore.getState().currentUser?.u).toBe('ceo');
  });
});
