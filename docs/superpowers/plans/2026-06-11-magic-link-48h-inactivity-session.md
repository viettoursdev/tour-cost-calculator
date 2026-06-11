# Magic-Link 48h Inactivity Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sign users out automatically after 48 hours of inactivity when they signed in via magic link; any user interaction resets the timer. DEV password sign-in is exempt and stays signed in indefinitely.

**Architecture:** A small `sessionTimeout` module owns three localStorage-backed concerns: which method a session used (`link` vs `password`), when the user was last active, and a DOM-event-driven tracker that resets the timer on interaction and signs out when 48h elapse. `authStore` is the only store that touches these helpers — it records the method on each successful sign-in, exposes an `expireSession()` action, and clears tracking on sign-out. `MainApp` starts the tracker for `'link'` sessions only and tears it down when the user changes.

**Tech Stack:** TypeScript strict · Zustand 4 · Firebase Auth 10 · Vitest 2 · plain DOM event APIs (no extra dependencies).

---

## File Structure

| Path | Status | Responsibility |
|------|--------|----------------|
| `src/auth/sessionTimeout.ts` | Create | Constants, per-user localStorage keys, expiry check, throttled `touchLastActive`, sign-in-method get/set/clear, and `startActivityTracker(username, onExpire)` |
| `src/auth/sessionTimeout.test.ts` | Create | Unit tests for all helpers using `vi.useFakeTimers()` |
| `src/stores/authStore.ts` | Modify | Persist method on successful sign-in, clear on sign-out, expose `expireSession()`, force sign-out on init when an existing link session is already expired |
| `src/stores/authStore.test.ts` | Modify | Tests for method persistence, `expireSession`, and init-time expiry |
| `src/components/shell/MainApp.tsx` | Modify | Effect that starts the tracker when `currentUser` is set AND method is `'link'`; teardown on cleanup |
| `CLAUDE.md` | Modify | Document the two new localStorage keys and the 48h inactivity rule |

The plan deliberately keeps pure helpers and DOM-listener wiring in one module — they share constants and storage shape, and splitting them would force the test file to mock its own module.

---

## Task 1: `sessionTimeout` module — pure helpers (no DOM)

**Files:**
- Create: `src/auth/sessionTimeout.ts`
- Test: `src/auth/sessionTimeout.test.ts`

This task establishes constants, localStorage I/O, and the expiry predicate. No event listeners yet — those land in Task 2.

- [ ] **Step 1.1: Write the failing tests**

Create `src/auth/sessionTimeout.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  IDLE_TIMEOUT_MS,
  TOUCH_THROTTLE_MS,
  getSignInMethod,
  setSignInMethod,
  clearSessionTracking,
  readLastActive,
  touchLastActive,
  isExpired,
} from './sessionTimeout';

const U = 'alice';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-11T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sign-in method tracking', () => {
  it('returns null when no method is stored', () => {
    expect(getSignInMethod(U)).toBeNull();
  });

  it('round-trips link method', () => {
    setSignInMethod(U, 'link');
    expect(getSignInMethod(U)).toBe('link');
  });

  it('round-trips password method', () => {
    setSignInMethod(U, 'password');
    expect(getSignInMethod(U)).toBe('password');
  });

  it('clearSessionTracking removes both method and lastActive', () => {
    setSignInMethod(U, 'link');
    touchLastActive(U);
    clearSessionTracking(U);
    expect(getSignInMethod(U)).toBeNull();
    expect(readLastActive(U)).toBeNull();
  });
});

describe('lastActive read/write', () => {
  it('returns null when no timestamp stored', () => {
    expect(readLastActive(U)).toBeNull();
  });

  it('touchLastActive writes current time', () => {
    touchLastActive(U);
    expect(readLastActive(U)).toBe(Date.now());
  });

  it('touchLastActive is throttled within TOUCH_THROTTLE_MS', () => {
    touchLastActive(U);
    const first = readLastActive(U)!;
    vi.advanceTimersByTime(TOUCH_THROTTLE_MS - 1);
    touchLastActive(U);
    expect(readLastActive(U)).toBe(first);
  });

  it('touchLastActive writes again after TOUCH_THROTTLE_MS', () => {
    touchLastActive(U);
    const first = readLastActive(U)!;
    vi.advanceTimersByTime(TOUCH_THROTTLE_MS);
    touchLastActive(U);
    expect(readLastActive(U)).toBe(first + TOUCH_THROTTLE_MS);
  });

  it('touch throttle is per-user', () => {
    touchLastActive('alice');
    touchLastActive('bob');
    expect(readLastActive('alice')).toBe(Date.now());
    expect(readLastActive('bob')).toBe(Date.now());
  });
});

describe('isExpired', () => {
  it('returns false when no timestamp stored (fresh session)', () => {
    expect(isExpired(U)).toBe(false);
  });

  it('returns false when within 48h', () => {
    touchLastActive(U);
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
    expect(isExpired(U)).toBe(false);
  });

  it('returns true at exactly 48h', () => {
    touchLastActive(U);
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS);
    expect(isExpired(U)).toBe(true);
  });

  it('returns true past 48h', () => {
    touchLastActive(U);
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS + 60_000);
    expect(isExpired(U)).toBe(true);
  });

  it('IDLE_TIMEOUT_MS is 48 hours', () => {
    expect(IDLE_TIMEOUT_MS).toBe(48 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `npx vitest run src/auth/sessionTimeout.test.ts`
Expected: FAIL — cannot resolve `./sessionTimeout`.

- [ ] **Step 1.3: Implement the module**

Create `src/auth/sessionTimeout.ts`:

```ts
export const IDLE_TIMEOUT_MS = 48 * 60 * 60 * 1000;
export const TOUCH_THROTTLE_MS = 30 * 1000;

export type SignInMethod = 'link' | 'password';

const methodKey = (username: string) => `vte_session_method_${username}`;
const lastActiveKey = (username: string) => `vte_session_last_active_${username}`;

export function getSignInMethod(username: string): SignInMethod | null {
  const v = localStorage.getItem(methodKey(username));
  return v === 'link' || v === 'password' ? v : null;
}

export function setSignInMethod(username: string, method: SignInMethod): void {
  localStorage.setItem(methodKey(username), method);
}

export function clearSessionTracking(username: string): void {
  localStorage.removeItem(methodKey(username));
  localStorage.removeItem(lastActiveKey(username));
}

export function readLastActive(username: string): number | null {
  const raw = localStorage.getItem(lastActiveKey(username));
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function touchLastActive(username: string): void {
  const now = Date.now();
  const prev = readLastActive(username);
  if (prev !== null && now - prev < TOUCH_THROTTLE_MS) return;
  localStorage.setItem(lastActiveKey(username), String(now));
}

export function isExpired(username: string, now: number = Date.now()): boolean {
  const last = readLastActive(username);
  if (last === null) return false;
  return now - last >= IDLE_TIMEOUT_MS;
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `npx vitest run src/auth/sessionTimeout.test.ts`
Expected: PASS — all 15 tests green.

- [ ] **Step 1.5: Run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 1.6: Commit**

```bash
git add src/auth/sessionTimeout.ts src/auth/sessionTimeout.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): add sessionTimeout helpers for 48h inactivity tracking

Pure helpers for per-user lastActive timestamps, sign-in method
persistence, and expiry check. No DOM bindings yet.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `startActivityTracker` — DOM-bound timer

**Files:**
- Modify: `src/auth/sessionTimeout.ts` (append `startActivityTracker`)
- Modify: `src/auth/sessionTimeout.test.ts` (append tracker tests)

The tracker subscribes to user-interaction events, calls `touchLastActive` (throttled), periodically checks `isExpired`, and invokes the `onExpire` callback when 48h have passed. It returns a cleanup function.

Listened events: `pointerdown`, `keydown`, `focus` (window-level), and `visibilitychange` (document-level — triggers an **immediate expiry check** but does NOT count as activity). A `setInterval` at `CHECK_INTERVAL_MS` provides the periodic check while the tab is foregrounded.

- [ ] **Step 2.1: Add the failing tracker tests**

Append to `src/auth/sessionTimeout.test.ts`:

```ts
import { startActivityTracker, CHECK_INTERVAL_MS } from './sessionTimeout';

describe('startActivityTracker', () => {
  beforeEach(() => {
    // Initialise lastActive so the tracker has a reference point.
    touchLastActive(U);
  });

  it('initializes lastActive on start if none stored', () => {
    clearSessionTracking(U);
    expect(readLastActive(U)).toBeNull();
    const stop = startActivityTracker(U, () => {});
    expect(readLastActive(U)).toBe(Date.now());
    stop();
  });

  it('does not overwrite lastActive on start if already stored', () => {
    const before = readLastActive(U);
    vi.advanceTimersByTime(1000);
    const stop = startActivityTracker(U, () => {});
    expect(readLastActive(U)).toBe(before);
    stop();
  });

  it('updates lastActive on pointerdown', () => {
    const stop = startActivityTracker(U, () => {});
    vi.advanceTimersByTime(TOUCH_THROTTLE_MS);
    const before = readLastActive(U)!;
    vi.advanceTimersByTime(1000);
    window.dispatchEvent(new Event('pointerdown'));
    expect(readLastActive(U)).toBe(before + 1000);
    stop();
  });

  it('updates lastActive on keydown', () => {
    const stop = startActivityTracker(U, () => {});
    vi.advanceTimersByTime(TOUCH_THROTTLE_MS);
    const before = readLastActive(U)!;
    vi.advanceTimersByTime(2000);
    window.dispatchEvent(new Event('keydown'));
    expect(readLastActive(U)).toBe(before + 2000);
    stop();
  });

  it('calls onExpire when interval fires after timeout', () => {
    const onExpire = vi.fn();
    const stop = startActivityTracker(U, onExpire);
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS + CHECK_INTERVAL_MS);
    expect(onExpire).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does not call onExpire while still within timeout', () => {
    const onExpire = vi.fn();
    const stop = startActivityTracker(U, onExpire);
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - CHECK_INTERVAL_MS);
    expect(onExpire).not.toHaveBeenCalled();
    stop();
  });

  it('visibilitychange triggers an immediate expiry check', () => {
    const onExpire = vi.fn();
    // Pre-age lastActive past the timeout WITHOUT advancing fake timers
    // (so the interval hasn't fired yet).
    localStorage.setItem(`vte_session_last_active_${U}`, String(Date.now() - IDLE_TIMEOUT_MS - 1));
    const stop = startActivityTracker(U, onExpire);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onExpire).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stop() removes listeners and stops the interval', () => {
    const onExpire = vi.fn();
    const stop = startActivityTracker(U, onExpire);
    stop();
    // After stop, advancing time past the timeout must not fire onExpire.
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS * 2);
    expect(onExpire).not.toHaveBeenCalled();
    // And events must not update lastActive.
    const frozen = readLastActive(U);
    vi.advanceTimersByTime(TOUCH_THROTTLE_MS + 1000);
    window.dispatchEvent(new Event('pointerdown'));
    expect(readLastActive(U)).toBe(frozen);
  });

  it('onExpire fires at most once per tracker', () => {
    const onExpire = vi.fn();
    const stop = startActivityTracker(U, onExpire);
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS + CHECK_INTERVAL_MS * 5);
    expect(onExpire).toHaveBeenCalledTimes(1);
    stop();
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `npx vitest run src/auth/sessionTimeout.test.ts`
Expected: FAIL — `startActivityTracker` and `CHECK_INTERVAL_MS` are not exported.

- [ ] **Step 2.3: Implement `startActivityTracker`**

Append to `src/auth/sessionTimeout.ts`:

```ts
export const CHECK_INTERVAL_MS = 60 * 1000;

export function startActivityTracker(
  username: string,
  onExpire: () => void,
): () => void {
  if (readLastActive(username) === null) {
    // Force-write the initial timestamp, bypassing the throttle map so a
    // recent touch on a different tab doesn't suppress it.
    localStorage.setItem(`vte_session_last_active_${username}`, String(Date.now()));
  }

  let fired = false;
  const fireIfExpired = () => {
    if (fired) return;
    if (isExpired(username)) {
      fired = true;
      onExpire();
    }
  };

  const onActivity = () => {
    touchLastActive(username);
    fireIfExpired();
  };

  window.addEventListener('pointerdown', onActivity);
  window.addEventListener('keydown', onActivity);
  window.addEventListener('focus', fireIfExpired);
  document.addEventListener('visibilitychange', fireIfExpired);

  const intervalId = window.setInterval(fireIfExpired, CHECK_INTERVAL_MS);

  return () => {
    window.removeEventListener('pointerdown', onActivity);
    window.removeEventListener('keydown', onActivity);
    window.removeEventListener('focus', fireIfExpired);
    document.removeEventListener('visibilitychange', fireIfExpired);
    window.clearInterval(intervalId);
  };
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `npx vitest run src/auth/sessionTimeout.test.ts`
Expected: PASS — all original tests plus 9 tracker tests green.

- [ ] **Step 2.5: Run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 2.6: Commit**

```bash
git add src/auth/sessionTimeout.ts src/auth/sessionTimeout.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): add startActivityTracker for inactivity sign-out

Subscribes to pointer/key events to reset the per-user lastActive
timestamp (throttled), checks expiry every 60s and on visibility/focus,
and invokes onExpire at most once when the 48h idle window elapses.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire sign-in method tracking into `authStore`

**Files:**
- Modify: `src/stores/authStore.ts`
- Modify: `src/stores/authStore.test.ts`

The auth store needs to know which method a given session used so the tracker only runs for magic-link sessions. We hold a transient `pendingSignInMethod` in store state, set it right before each Firebase call, and persist it under the resolved `currentUser.u` once `onIdTokenChanged` resolves a matched user. We also clear tracking on sign-out and on auth rejection.

- [ ] **Step 3.1: Add the failing authStore tests**

Append to `src/stores/authStore.test.ts`:

```ts
import {
  getSignInMethod,
  setSignInMethod,
  readLastActive,
  clearSessionTracking,
  IDLE_TIMEOUT_MS,
} from '@/auth/sessionTimeout';

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
    await useAuthStore.getState().requestSignInLink('ceo@viettours.com.vn');
    await idCb!({ email: 'ceo@viettours.com.vn' });

    expect(getSignInMethod('ceo')).toBe('link');
    expect(readLastActive('ceo')).toBe(Date.now());
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
```

Add `clearSessionTracking` cleanup to the existing `beforeEach`:

```ts
beforeEach(() => {
  reset();
  vi.clearAllMocks();
  localStorage.clear();
  clearSessionTracking('ceo');
  vi.mocked(fb.fbIsSignInLink).mockReturnValue(false);
  vi.mocked(fb.fbOnIdTokenChanged).mockImplementation(() => () => {});
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `npx vitest run src/stores/authStore.test.ts`
Expected: FAIL — `expireSession` does not exist; method is not persisted; init does not check expiry.

- [ ] **Step 3.3: Modify `authStore.ts` — add imports and state field**

Replace the imports at the top of `src/stores/authStore.ts` (lines 1–8) with:

```ts
import { create } from 'zustand';
import {
  fbPullUsers, fbPushUsers,
  fbSendSignInLink, fbIsSignInLink, fbCompleteSignInLink, fbSignInWithPassword,
  fbSignOut, fbOnIdTokenChanged,
} from '@/lib/firebase';
import { PERMISSIONS } from '@/auth/PERMISSIONS';
import {
  clearSessionTracking,
  getSignInMethod,
  isExpired,
  setSignInMethod,
  touchLastActive,
  type SignInMethod,
} from '@/auth/sessionTimeout';
import type { User } from '@/types';
```

Extend the `AuthState` type — add `pendingSignInMethod` to the state slice and `expireSession` to the actions:

```ts
type AuthState = {
  currentUser: User | null;
  users: User[];
  hasHydrated: boolean;
  pendingEmail: string | null;
  pendingCrossDeviceUrl: string | null;
  pendingSignInMethod: SignInMethod | null;
  authError: string | null;

  init: () => Promise<void>;
  requestSignInLink: (email: string) => Promise<SignInResult>;
  completeCrossDeviceSignIn: (email: string) => Promise<SignInResult>;
  signInWithPassword: (email: string, password: string) => Promise<SignInResult>;
  cancelPendingSignIn: () => void;
  signOut: () => Promise<void>;
  expireSession: () => Promise<void>;
  saveUsers: (users: User[]) => Promise<void>;
};
```

Add `pendingSignInMethod: null,` to the initial state literal (next to `authError: null`).

- [ ] **Step 3.4: Update the `onIdTokenChanged` callback to handle method persistence and expiry**

Inside `init`, replace the entire body of the `fbOnIdTokenChanged(async (fbUser) => { ... })` callback with:

```ts
fbOnIdTokenChanged(async (fbUser) => {
  if (!fbUser) {
    set({ currentUser: null, hasHydrated: true });
    return;
  }
  let cloud: User[] = [];
  try {
    cloud = await fbPullUsers();
  } catch (e) {
    console.warn('Failed to pull users:', (e as Error).message);
  }
  const verifiedEmail = (fbUser.email ?? '').toLowerCase();
  const match = cloud.find((u) => (u.email ?? '').toLowerCase() === verifiedEmail);

  const finalizeRejection = async (msg: string) => {
    await fbSignOut();
    set({ currentUser: null, users: cloud, hasHydrated: true, authError: msg, pendingSignInMethod: null });
  };

  if (!match) {
    if (verifiedEmail === BOOTSTRAP_CEO_EMAIL) {
      const dev = makeBootstrapCEO(verifiedEmail);
      const next = [...cloud, dev];
      try {
        await fbPushUsers(next);
      } catch (e) {
        console.warn('Bootstrap CEO write to user_accounts failed:', (e as Error).message);
      }
      persistSessionStart(dev.u, get().pendingSignInMethod);
      set({ currentUser: dev, users: next, hasHydrated: true, authError: null, pendingSignInMethod: null });
      return;
    }
    await finalizeRejection('Email chưa được cấp quyền. Liên hệ admin.');
    return;
  }

  if (!(match.role in PERMISSIONS)) {
    console.warn(`User ${match.u} has unknown role: ${match.role}`);
  }

  // Existing-session expiry check: if a prior link session for this user is
  // already past the idle window, sign them out before letting them in.
  // Password sessions are exempt.
  if (getSignInMethod(match.u) === 'link' && isExpired(match.u)) {
    clearSessionTracking(match.u);
    await finalizeRejection('Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại.');
    return;
  }

  persistSessionStart(match.u, get().pendingSignInMethod);
  set({ currentUser: match, users: cloud, hasHydrated: true, authError: null, pendingSignInMethod: null });
});
```

Add the `persistSessionStart` helper just below the existing `isCompanyEmail` helper (above the `AuthState` type):

```ts
function persistSessionStart(username: string, method: SignInMethod | null): void {
  if (method === null) {
    // Already-running session (e.g. token refresh on reload). Keep whatever
    // method/lastActive was stored previously; don't touch them.
    return;
  }
  setSignInMethod(username, method);
  touchLastActive(username);
}
```

- [ ] **Step 3.5: Update sign-in actions to set `pendingSignInMethod`**

In `requestSignInLink`, set the pending method immediately before `fbSendSignInLink`:

```ts
requestSignInLink: async (rawEmail) => {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, error: 'Vui lòng nhập email' };
  if (!isCompanyEmail(email)) {
    return { ok: false, error: 'Vui lòng dùng email công ty (@viettours.com.vn)' };
  }
  try {
    await fbSendSignInLink(email);
    localStorage.setItem(PENDING_EMAIL_KEY, email);
    set({ pendingEmail: email, authError: null, pendingSignInMethod: 'link' });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Không gửi được link: ${(e as Error).message}` };
  }
},
```

In `completeCrossDeviceSignIn`, mark `'link'` before the call:

```ts
completeCrossDeviceSignIn: async (rawEmail) => {
  const email = normalizeEmail(rawEmail);
  const url = get().pendingCrossDeviceUrl;
  if (!url) return { ok: false, error: 'Không có link đăng nhập đang chờ' };
  if (!isCompanyEmail(email)) {
    return { ok: false, error: 'Vui lòng dùng email công ty (@viettours.com.vn)' };
  }
  try {
    set({ pendingSignInMethod: 'link' });
    await fbCompleteSignInLink(email, url);
    set({ pendingCrossDeviceUrl: null, pendingEmail: null });
    window.history.replaceState({}, '', window.location.pathname);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Không thể hoàn tất đăng nhập: ${(e as Error).message}` };
  }
},
```

In `signInWithPassword`, mark `'password'` before the call:

```ts
signInWithPassword: async (rawEmail, password) => {
  const email = normalizeEmail(rawEmail);
  if (!email || !password) return { ok: false, error: 'Vui lòng nhập email và mật khẩu' };
  if (!isCompanyEmail(email)) {
    return { ok: false, error: 'Vui lòng dùng email công ty (@viettours.com.vn)' };
  }
  try {
    set({ pendingSignInMethod: 'password' });
    await fbSignInWithPassword(email, password);
    set({ authError: null });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Sai email hoặc mật khẩu (${(e as Error).message})` };
  }
},
```

Also in `init`, update the same-device magic-link completion branch (around the existing `await fbCompleteSignInLink(stashed, window.location.href);` call) so the method flag is set before the Firebase callback fires. Replace the inner same-device block with:

```ts
} else {
  try {
    set({ pendingSignInMethod: 'link' });
    await fbCompleteSignInLink(stashed, window.location.href);
    localStorage.removeItem(PENDING_EMAIL_KEY);
    set({ pendingEmail: null });
  } catch (e) {
    set({ authError: `Link đăng nhập đã hết hạn hoặc đã được dùng. Hãy yêu cầu link mới. (${(e as Error).message})`, pendingSignInMethod: null });
    localStorage.removeItem(PENDING_EMAIL_KEY);
  } finally {
    window.history.replaceState({}, '', window.location.pathname);
  }
}
```

- [ ] **Step 3.6: Add `expireSession` action and clear tracking in `signOut`**

Replace the existing `signOut` action and add `expireSession` immediately after it:

```ts
signOut: async () => {
  const u = get().currentUser?.u;
  await fbSignOut();
  if (u) clearSessionTracking(u);
  set({ currentUser: null, authError: null, pendingSignInMethod: null });
},

expireSession: async () => {
  const u = get().currentUser?.u;
  if (!u) return;
  await fbSignOut();
  clearSessionTracking(u);
  set({
    currentUser: null,
    authError: 'Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại.',
    pendingSignInMethod: null,
  });
},
```

- [ ] **Step 3.7: Run tests to verify they pass**

Run: `npx vitest run src/stores/authStore.test.ts`
Expected: PASS — pre-existing tests still pass and all 7 new tests pass.

- [ ] **Step 3.8: Run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 3.9: Commit**

```bash
git add src/stores/authStore.ts src/stores/authStore.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): persist sign-in method + expireSession action

Track 'link' vs 'password' per user so the 48h idle timer can be
applied only to magic-link sessions. Adds an init-time expiry check
that signs out an already-expired link session with a Vietnamese
notice, and an expireSession() action used by the activity tracker.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Start/stop the activity tracker in `MainApp`

**Files:**
- Modify: `src/components/shell/MainApp.tsx`

Only magic-link sessions are tracked. The effect runs alongside the existing post-sign-in effect, but stays separate so it doesn't tangle with the long list of store subscriptions.

- [ ] **Step 4.1: Add imports**

At the top of `src/components/shell/MainApp.tsx`, add:

```ts
import { getSignInMethod, startActivityTracker } from '@/auth/sessionTimeout';
```

- [ ] **Step 4.2: Add the tracker effect**

Immediately after the existing `useEffect(() => { void authInit(); }, [authInit]);` effect (around line 29), insert:

```ts
useEffect(() => {
  if (!currentUser) return;
  if (getSignInMethod(currentUser.u) !== 'link') return;
  const stop = startActivityTracker(currentUser.u, () => {
    void useAuthStore.getState().expireSession();
  });
  return stop;
}, [currentUser]);
```

- [ ] **Step 4.3: Verify typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean build, no warnings.

- [ ] **Step 4.4: Manual smoke (dev server)**

Run: `npm run dev` and open the app.

Verification checklist (do all four):

1. **DEV password sign-in path** — sign in with email + password. In DevTools → Application → Local Storage, confirm `vte_session_method_<username>` is `password` and `vte_session_last_active_<username>` is missing or unchanged after several minutes. Open the React DevTools and confirm `MainApp`'s tracker effect did NOT register listeners (the `if (getSignInMethod(...) !== 'link') return;` guard exits early).
2. **Magic-link sign-in path** — request a link, complete sign-in. Confirm `vte_session_method_<username>` is `link` and `vte_session_last_active_<username>` is the current epoch ms.
3. **Activity resets timer** — wait ~35 seconds (past throttle), click anywhere, confirm `vte_session_last_active_<username>` advances.
4. **Forced expiry** — in DevTools, set `vte_session_last_active_<username>` to `Date.now() - 49*60*60*1000`. Click anywhere in the app (or wait up to 60s for the interval). Expect: signed out, login screen visible with "Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại."

If any of the four fails, stop and debug before committing.

- [ ] **Step 4.5: Commit**

```bash
git add src/components/shell/MainApp.tsx
git commit -m "$(cat <<'EOF'
feat(auth): start 48h idle tracker for magic-link sessions

MainApp starts startActivityTracker only when the current user's
stored method is 'link'. On expiry it calls authStore.expireSession(),
which signs the user out with a Vietnamese inactivity notice.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Document in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

Add the two new keys to the localStorage table and a brief note in the Key Design Decisions section.

- [ ] **Step 5.1: Add the two new localStorage rows**

In `CLAUDE.md`, find the `## localStorage Keys` table. Add these two rows immediately below the `vte_pending_signin_email` row:

```markdown
| `vte_session_method_{username}` | `'link'` or `'password'` — which sign-in method started this session (`authStore` / `sessionTimeout`) |
| `vte_session_last_active_{username}` | Epoch ms of the user's last interaction. Drives the 48h inactivity sign-out for `link` sessions only. |
```

- [ ] **Step 5.2: Add a Key Design Decisions paragraph**

In the `## Key Design Decisions` section of `CLAUDE.md`, add this paragraph immediately after the existing **Firebase Auth — magic link…** paragraph:

```markdown
**48h inactivity sign-out (magic-link only).** Magic-link sessions auto-sign-out after 48 hours of no user interaction. `src/auth/sessionTimeout.ts` owns the per-user `vte_session_last_active_{username}` timestamp; `startActivityTracker` listens to `pointerdown`/`keydown` (throttled to one write per 30s) and runs a 60-second interval check plus an immediate check on `focus`/`visibilitychange`. `authStore.expireSession()` signs the user out and shows "Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại." DEV password sign-ins are intentionally exempt — they stay signed in indefinitely for testing convenience.
```

- [ ] **Step 5.3: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(claude): document 48h inactivity sign-out for magic-link sessions

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] **Step F.1: Full check**

Run: `npm run lint && npm run typecheck && npx vitest run && npm run build`
Expected: lint clean, types clean, all tests green, build succeeds.

- [ ] **Step F.2: Push**

```bash
git push origin main
```
