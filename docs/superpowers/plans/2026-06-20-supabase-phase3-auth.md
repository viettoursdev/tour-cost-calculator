# Supabase Phase 3 — Auth Migration (dual-auth behind a flag) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete Supabase Auth sign-in path alongside the existing Firebase Auth path, selected at runtime by `VITE_AUTH_BACKEND`, so the code lands and is testable now while production stays on Firebase until the coordinated cutover flips the flag.

**Architecture:** Introduce an **auth-backend seam** — a single `authBackend` object (interface `AuthBackend`) chosen by `VITE_AUTH_BACKEND` (default `firebase`). `authStore` is reduced to IdP-agnostic orchestration (pending-method tracking, 48h idle expiry, error copy, state) and delegates all IdP calls + session→user resolution to the backend. The **Firebase backend** is a near-verbatim extraction of today's logic (email-match + client bootstrap-CEO). The **Supabase backend** resolves by auth UID against `profiles` and relies on the DB trigger for first-login provisioning (no client bootstrap). Cutover later = delete one file + flip the default.

**Tech Stack:** Vite 5 · React 18 · TypeScript 5 (strict) · Zustand 4 · `@supabase/supabase-js` v2 · Firebase 10 (retained) · Vitest (unit jsdom + integration node-vs-local-Supabase).

## Global Constraints

- **The `authStore` public API is FROZEN.** ~75 call sites consume `currentUser`, `users`, `init`, `requestSignInLink`, `completeCrossDeviceSignIn`, `signInWithPassword`, `cancelPendingSignIn`, `signOut`, `expireSession`, `saveUsers`, `hasHydrated`, `pendingEmail`, `pendingCrossDeviceUrl`, `authError`. Names, signatures, return types, and the Vietnamese error strings MUST NOT change.
- **Production behavior MUST NOT change in this phase.** Default `VITE_AUTH_BACKEND` is `firebase`. Firebase remains the live path until a later cutover. No `firebase.ts`/Firestore data calls are removed.
- **Parity-only RLS / identity already locked:** Supabase identity is the auth UID (`profiles.id uuid PK FK→auth.users`). First-login provisioning is the DB trigger `public.handle_new_user()` (migration `0001`); there is **no** client-side bootstrap on the Supabase path.
- **`sessionTimeout.ts` is IdP-agnostic and MUST stay untouched.** It keys off `username` + `vte_session_method_{username}`; both backends feed it a `username` + a method (`'link'`/`'password'`).
- **DEV password sign-in stays exempt from the 48h idle expiry** on both backends (existing behavior, governed in `authStore`, not the backend).
- **Worker JWT verification swap is Phase 5, NOT here.** This phase only routes the *client* token source (`aiWorker.authHeaders()`) through the active backend so the flag stays coherent.
- **Lint is `--max-warnings 0`; `tsc --noEmit` must be clean; `npm run test` (unit) and `npm run test:integration` must be green** before each commit's task is considered done.
- **Co-author trailer on every commit:** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/auth/backend.ts` (create) | `AuthSession`, `Resolution`, `AuthBackend` types; the `authBackend` selector (`VITE_AUTH_BACKEND`). |
| `src/auth/backends/firebaseBackend.ts` (create) | `AuthBackend` impl over `fb*`: IdP calls + email-match/bootstrap-CEO `resolve` (extracted from `authStore`). |
| `src/auth/backends/supabaseBackend.ts` (create) | `AuthBackend` impl over `sb*`: IdP calls + UID-lookup `resolve` (trigger provisions; no client bootstrap). |
| `src/lib/supabase.ts` (modify) | Add `sb*` auth gateway fns mirroring the `fb*` auth fns; adjust `createClient` options. |
| `src/stores/authStore.ts` (modify) | Rewire to `authBackend`; keep public API, pending-method, expiry, error copy. |
| `src/lib/aiWorker.ts` (modify) | `authHeaders()` reads the token from `authBackend.getAccessToken()`. |
| `.env.example` (modify) | Document `VITE_AUTH_BACKEND`. |
| `vitest.config.ts` (modify) | Define dummy `VITE_SUPABASE_*` so the unit suite can transitively import `supabase.ts`. |
| `src/test/supabaseStub.ts` (create) | Vitest stub for `@/lib/supabase` (mirrors `firebaseStub.ts`) for unit tests. |
| `src/auth/backend.test.ts` (create) | Unit: selector default + `firebaseBackend.resolve` (match / reject / bootstrap). |
| `tests/supabase/auth.test.ts` (create) | Integration: `sb*` auth fns vs local Supabase. |
| `tests/supabase/authBackend.test.ts` (create) | Integration: `supabaseBackend` end-to-end vs local Supabase. |
| `docs/supabase-setup.md` (modify) | Phase-3 section: dashboard auth config + flag + manual smoke checklist. |

## The seam interface (defined once, referenced by every task)

```ts
// src/auth/backend.ts
import type { User } from '@/types';

/** Normalized verified-session shape both IdPs map onto. */
export type AuthSession = { uid: string; email: string };

/** Result of mapping a verified session to an app user + the directory. */
export type Resolution =
  | { kind: 'ok'; user: User; users: User[] }
  | { kind: 'rejected'; users: User[] };

export interface AuthBackend {
  /** Send a passwordless magic link to `email` (caller already domain-gated). */
  sendSignInLink(email: string): Promise<void>;
  /** True when `url` carries this IdP's sign-in callback params. */
  isSignInLink(url: string): boolean;
  /** Complete a magic-link sign-in from the callback URL. */
  completeSignInLink(email: string, url: string): Promise<void>;
  /** DEV password sign-in. */
  signInWithPassword(email: string, password: string): Promise<void>;
  /** Sign the current user out of the IdP. */
  signOut(): Promise<void>;
  /** Subscribe to auth-state changes; `cb` gets a normalized session or null. */
  subscribe(cb: (session: AuthSession | null) => void): void;
  /** Map a verified session to the app user + full directory (backend-specific
   *  provisioning lives here: firebase bootstrap-CEO; supabase relies on the DB trigger). */
  resolve(session: AuthSession): Promise<Resolution>;
  /** Persist the editable user directory. */
  pushUsers(users: User[]): Promise<void>;
  /** Best-effort legacy-password cleanup (firebase: real; supabase: no-op). */
  purgeLegacyPasswords(): Promise<void>;
  /** Fresh access token for the AI Worker, or null when signed out. */
  getAccessToken(): Promise<string | null>;
}
```

---

### Task 1: Backend seam + Firebase backend + test wiring

Adds the seam types, the selector, the Firebase backend (extracted logic), and the unit-test plumbing (`supabaseStub`, dummy env). `authStore` is **not** touched yet — these modules are added green and unused; Task 2 wires them in. This keeps each commit building.

**Files:**
- Create: `src/auth/backend.ts`
- Create: `src/auth/backends/firebaseBackend.ts`
- Create: `src/test/supabaseStub.ts`
- Create: `src/auth/backend.test.ts`
- Modify: `.env.example`
- Modify: `vitest.config.ts` (add `define` block)

**Interfaces:**
- Produces: `authBackend: AuthBackend`, types `AuthSession`/`Resolution`/`AuthBackend` (from `src/auth/backend.ts`); `firebaseBackend: AuthBackend` (from `firebaseBackend.ts`).
- Consumes: `fb*` from `@/lib/firebase` (`fbSendSignInLink`, `fbIsSignInLink`, `fbCompleteSignInLink`, `fbSignInWithPassword`, `fbSignOut`, `fbOnIdTokenChanged`, `fbPullUsers`, `fbPushUsers`, `fbPurgeLegacyPasswords`); `auth` (for `getAccessToken`); `User`, `PERMISSIONS`.

- [ ] **Step 1: Write the failing unit test**

```ts
// src/auth/backend.test.ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/auth/backend.test.ts`
Expected: FAIL — `Cannot find module './backend'` / `./backends/firebaseBackend` / `@/test/supabaseStub`.

- [ ] **Step 3: Create `src/test/supabaseStub.ts`**

Mirror `firebaseStub.ts`. Only the auth surface that `supabaseBackend`/`supabase.ts` exports at module scope needs stubbing; keep it minimal and additive.

```ts
import { vi } from 'vitest';

// Real `sb` is a SupabaseClient; unit tests never hit the network.
export const sb = {} as unknown;

// Auth gateway (Task 3 adds the real ones; the stub keeps unit imports cheap).
export const sbSendSignInLink = vi.fn(async () => {});
export const sbIsSignInLink = vi.fn(() => false);
export const sbCompleteSignInLink = vi.fn(async () => {});
export const sbSignInWithPassword = vi.fn(async () => {});
export const sbSignOut = vi.fn(async () => {});
export const sbOnAuthChange = vi.fn(() => () => {});
export const sbGetProfileById = vi.fn(async () => null);
export const sbGetAccessToken = vi.fn(async () => null);
export const sbPullUsers = vi.fn(async () => []);
export const sbPushUsers = vi.fn(async () => {});
export const sbPurgeLegacyPasswords = vi.fn(async () => 0);
```

- [ ] **Step 4: Add dummy Supabase env to the unit config**

Edit `vitest.config.ts` — add a `define` block (alongside the existing `test`/`environment`) so the unit suite can transitively import `src/lib/supabase.ts` without the `createClient` env guard throwing. These are throwaway values; unit tests mock `@/lib/supabase`.

```ts
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://localhost:54321'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('unit-test-anon-key'),
  },
```

- [ ] **Step 5: Create `src/auth/backends/firebaseBackend.ts`**

Extract today's `authStore` resolution verbatim. `BOOTSTRAP_CEO_EMAIL`/`makeBootstrapCEO` move here. `resolve` returns `Resolution`; `subscribe` maps `fbOnIdTokenChanged`'s `FbUser` to the normalized `AuthSession`. `getAccessToken` lazily reads the Firebase token.

```ts
import {
  fbSendSignInLink, fbIsSignInLink, fbCompleteSignInLink, fbSignInWithPassword,
  fbSignOut, fbOnIdTokenChanged, fbPullUsers, fbPushUsers, fbPurgeLegacyPasswords, auth,
} from '@/lib/firebase';
import { PERMISSIONS } from '@/auth/PERMISSIONS';
import type { User } from '@/types';
import type { AuthBackend, AuthSession, Resolution } from '../backend';

// First sign-in by this address auto-provisions a CEO (mailbox must be tightly held).
const BOOTSTRAP_CEO_EMAIL = 'developer@viettours.com.vn';

function makeBootstrapCEO(email: string): User {
  return { u: 'developer', email, role: 'CEO', name: 'Developer', color: '#dc3250' };
}

export const firebaseBackend: AuthBackend = {
  sendSignInLink: (email) => fbSendSignInLink(email),
  isSignInLink: (url) => fbIsSignInLink(url),
  completeSignInLink: async (email, url) => { await fbCompleteSignInLink(email, url); },
  signInWithPassword: async (email, password) => { await fbSignInWithPassword(email, password); },
  signOut: () => fbSignOut(),

  subscribe: (cb) => {
    fbOnIdTokenChanged((fbUser) => {
      cb(fbUser ? { uid: fbUser.uid, email: (fbUser.email ?? '').toLowerCase() } : null);
    });
  },

  resolve: async (session: AuthSession): Promise<Resolution> => {
    let cloud: User[] = [];
    try {
      cloud = await fbPullUsers();
    } catch (e) {
      console.warn('Failed to pull users:', (e as Error).message);
    }
    const email = session.email.toLowerCase();
    const match = cloud.find((u) => (u.email ?? '').toLowerCase() === email);
    if (match) {
      // Dọn mật khẩu plaintext di sản (idempotent, non-blocking).
      void fbPurgeLegacyPasswords().catch(() => { /* không chặn đăng nhập */ });
      if (!(match.role in PERMISSIONS)) console.warn(`User ${match.u} has unknown role: ${match.role}`);
      return { kind: 'ok', user: match, users: cloud };
    }
    if (email === BOOTSTRAP_CEO_EMAIL) {
      const dev = makeBootstrapCEO(email);
      const next = [...cloud, dev];
      try {
        await fbPushUsers(next);
      } catch (e) {
        console.warn('Bootstrap CEO write to user_accounts failed:', (e as Error).message);
      }
      return { kind: 'ok', user: dev, users: next };
    }
    return { kind: 'rejected', users: cloud };
  },

  pushUsers: (users) => fbPushUsers(users),
  purgeLegacyPasswords: async () => { await fbPurgeLegacyPasswords(); },
  getAccessToken: async () => (await auth.currentUser?.getIdToken()) ?? null,
};
```

- [ ] **Step 6: Create `src/auth/backend.ts`**

Static-import the Firebase backend; lazy-pick Supabase to avoid loading the Supabase backend (and its `sb*` calls) unless selected. Because `supabase.ts`'s client is created at its module scope and the unit env now defines dummy `VITE_SUPABASE_*`, a static import of `supabaseBackend` is safe — but to keep the firebase-default path from constructing the Supabase backend object at all, import it eagerly only here and select by flag (the construction cost is trivial and the module is already import-safe).

```ts
import type { User } from '@/types';
import { firebaseBackend } from './backends/firebaseBackend';
import { supabaseBackend } from './backends/supabaseBackend';

export type AuthSession = { uid: string; email: string };

export type Resolution =
  | { kind: 'ok'; user: User; users: User[] }
  | { kind: 'rejected'; users: User[] };

export interface AuthBackend {
  sendSignInLink(email: string): Promise<void>;
  isSignInLink(url: string): boolean;
  completeSignInLink(email: string, url: string): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  subscribe(cb: (session: AuthSession | null) => void): void;
  resolve(session: AuthSession): Promise<Resolution>;
  pushUsers(users: User[]): Promise<void>;
  purgeLegacyPasswords(): Promise<void>;
  getAccessToken(): Promise<string | null>;
}

const which = import.meta.env.VITE_AUTH_BACKEND === 'supabase' ? 'supabase' : 'firebase';

export const authBackend: AuthBackend = which === 'supabase' ? supabaseBackend : firebaseBackend;
```

> **Note for implementer:** `backend.ts` imports `supabaseBackend`, which is created in **Task 4**. To keep Task 1 self-contained and green, create a **temporary stub** `src/auth/backends/supabaseBackend.ts` now that satisfies the interface by throwing on call (it is never selected under the default flag), then replace it with the real implementation in Task 4:
> ```ts
> import type { AuthBackend } from '../backend';
> const notReady = (): never => { throw new Error('supabaseBackend not implemented until Phase 3 Task 4'); };
> export const supabaseBackend: AuthBackend = {
>   sendSignInLink: notReady, isSignInLink: () => false, completeSignInLink: notReady,
>   signInWithPassword: notReady, signOut: notReady, subscribe: () => {}, resolve: notReady,
>   pushUsers: notReady, purgeLegacyPasswords: async () => {}, getAccessToken: async () => null,
> };
> ```

- [ ] **Step 7: Document the flag in `.env.example`**

Add below the Supabase block:

```
# Auth backend selector for the Firestore→Supabase migration.
# 'firebase' (default) = production magic-link/password via Firebase Auth.
# 'supabase' = Supabase Auth (built in Phase 3; flipped only at cutover).
VITE_AUTH_BACKEND=firebase
```

- [ ] **Step 8: Run unit tests + gates**

Run: `npx vitest run src/auth/backend.test.ts && npm run typecheck && npm run lint`
Expected: backend test PASS; typecheck exit 0; lint 0 warnings.

- [ ] **Step 9: Full unit suite (no regressions)**

Run: `npm run test`
Expected: all green (count ≥ prior 558, +3 new).

- [ ] **Step 10: Commit**

```bash
git add src/auth/backend.ts src/auth/backends/ src/test/supabaseStub.ts src/auth/backend.test.ts .env.example vitest.config.ts
git commit -m "feat(supabase): auth-backend seam + firebase backend (Phase 3 Task 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Rewire `authStore` to the backend seam (firebase stays default)

`authStore` stops importing `fb*` directly and orchestrates through `authBackend`. Resolution/bootstrap move out; pending-method, 48h expiry, error copy, and the public API stay. The existing `authStore.test.ts` stays green.

**Files:**
- Modify: `src/stores/authStore.ts`
- Modify: `src/stores/authStore.test.ts` (add the supabase mock; keep all assertions)

**Interfaces:**
- Consumes: `authBackend` + `AuthSession`/`Resolution` from `@/auth/backend`; `sessionTimeout` helpers (unchanged).
- Produces: identical `AuthState` public surface (frozen).

- [ ] **Step 1: Add the supabase mock to the existing test, run it (still firebase)**

At the top of `src/stores/authStore.test.ts`, beside the firebase mock, add:

```ts
vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));
```

Run: `npx vitest run src/stores/authStore.test.ts`
Expected: PASS (still the firebase path; mock just keeps the transitive import cheap).

- [ ] **Step 2: Rewrite `authStore.ts` to delegate to `authBackend`**

Replace the `fb*` imports and inline resolution with backend calls. Keep `normalizeEmail`, `isCompanyEmail`, `persistSessionStart`, `pendingSignInMethod`, the expiry check, and every Vietnamese string. The `init` subscriber now: get session → if null clear → else `resolve` → on `rejected` sign out with "chưa được cấp quyền" → on `ok` run the existing expiry check on `user.u`, then `persistSessionStart` + set state.

```ts
import { create } from 'zustand';
import { authBackend, type AuthSession } from '@/auth/backend';
import {
  clearSessionTracking, getSignInMethod, isExpired, setSignInMethod,
  touchLastActive, type SignInMethod,
} from '@/auth/sessionTimeout';
import type { User } from '@/types';

const ALLOWED_DOMAIN = '@viettours.com.vn';
const PENDING_EMAIL_KEY = 'vte_pending_signin_email';

function normalizeEmail(raw: string): string { return raw.trim().toLowerCase(); }
function isCompanyEmail(email: string): boolean { return normalizeEmail(email).endsWith(ALLOWED_DOMAIN); }

function persistSessionStart(username: string, method: SignInMethod | null): void {
  if (method === null) return; // already-running session (reload/refresh): keep stored values
  setSignInMethod(username, method);
  touchLastActive(username);
}

type SignInResult = { ok: true } | { ok: false; error: string };

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

export const useAuthStore = create<AuthState>()((set, get) => ({
  currentUser: null,
  users: [],
  hasHydrated: false,
  pendingEmail: null,
  pendingCrossDeviceUrl: null,
  pendingSignInMethod: null,
  authError: null,

  init: async () => {
    // 1. Complete an in-flight magic link.
    try {
      if (authBackend.isSignInLink(window.location.href)) {
        const stashed = localStorage.getItem(PENDING_EMAIL_KEY);
        if (!stashed) {
          set({ pendingCrossDeviceUrl: window.location.href });
        } else {
          try {
            set({ pendingSignInMethod: 'link' });
            await authBackend.completeSignInLink(stashed, window.location.href);
            localStorage.removeItem(PENDING_EMAIL_KEY);
            set({ pendingEmail: null });
          } catch (e) {
            set({ authError: `Link đăng nhập đã hết hạn hoặc đã được dùng. Hãy yêu cầu link mới. (${(e as Error).message})`, pendingSignInMethod: null });
            localStorage.removeItem(PENDING_EMAIL_KEY);
          } finally {
            window.history.replaceState({}, '', window.location.pathname);
          }
        }
      }
    } catch (e) {
      set({ authError: `Lỗi xác thực: ${(e as Error).message}` });
    }

    // 2. Subscribe to auth state.
    authBackend.subscribe(async (session: AuthSession | null) => {
      if (!session) {
        set({ currentUser: null, hasHydrated: true });
        return;
      }
      const res = await authBackend.resolve(session);
      if (res.kind === 'rejected') {
        await authBackend.signOut();
        set({ currentUser: null, users: res.users, hasHydrated: true, authError: 'Email chưa được cấp quyền. Liên hệ admin.', pendingSignInMethod: null });
        return;
      }
      const { user, users } = res;
      // Existing-session expiry (link sessions only; password exempt).
      if (getSignInMethod(user.u) === 'link' && isExpired(user.u)) {
        clearSessionTracking(user.u);
        await authBackend.signOut();
        set({ currentUser: null, users, hasHydrated: true, authError: 'Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại.', pendingSignInMethod: null });
        return;
      }
      persistSessionStart(user.u, get().pendingSignInMethod);
      set({ currentUser: user, users, hasHydrated: true, authError: null, pendingSignInMethod: null });
    });
  },

  requestSignInLink: async (rawEmail) => {
    const email = normalizeEmail(rawEmail);
    if (!email) return { ok: false, error: 'Vui lòng nhập email' };
    if (!isCompanyEmail(email)) return { ok: false, error: 'Vui lòng dùng email công ty (@viettours.com.vn)' };
    try {
      await authBackend.sendSignInLink(email);
      localStorage.setItem(PENDING_EMAIL_KEY, email);
      set({ pendingEmail: email, authError: null, pendingSignInMethod: 'link' });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `Không gửi được link: ${(e as Error).message}` };
    }
  },

  completeCrossDeviceSignIn: async (rawEmail) => {
    const email = normalizeEmail(rawEmail);
    const url = get().pendingCrossDeviceUrl;
    if (!url) return { ok: false, error: 'Không có link đăng nhập đang chờ' };
    if (!isCompanyEmail(email)) return { ok: false, error: 'Vui lòng dùng email công ty (@viettours.com.vn)' };
    try {
      set({ pendingSignInMethod: 'link' });
      await authBackend.completeSignInLink(email, url);
      set({ pendingCrossDeviceUrl: null, pendingEmail: null });
      window.history.replaceState({}, '', window.location.pathname);
      return { ok: true };
    } catch (e) {
      set({ pendingSignInMethod: null });
      return { ok: false, error: `Không thể hoàn tất đăng nhập: ${(e as Error).message}` };
    }
  },

  signInWithPassword: async (rawEmail, password) => {
    const email = normalizeEmail(rawEmail);
    if (!email || !password) return { ok: false, error: 'Vui lòng nhập email và mật khẩu' };
    if (!isCompanyEmail(email)) return { ok: false, error: 'Vui lòng dùng email công ty (@viettours.com.vn)' };
    try {
      set({ pendingSignInMethod: 'password' });
      await authBackend.signInWithPassword(email, password);
      set({ authError: null });
      return { ok: true };
    } catch (e) {
      set({ pendingSignInMethod: null });
      return { ok: false, error: `Sai email hoặc mật khẩu (${(e as Error).message})` };
    }
  },

  cancelPendingSignIn: () => {
    localStorage.removeItem(PENDING_EMAIL_KEY);
    set({ pendingEmail: null, pendingCrossDeviceUrl: null, authError: null });
  },

  signOut: async () => {
    const u = get().currentUser?.u;
    await authBackend.signOut();
    if (u) clearSessionTracking(u);
    set({ currentUser: null, authError: null, pendingSignInMethod: null });
  },

  expireSession: async () => {
    const u = get().currentUser?.u;
    if (!u) return;
    await authBackend.signOut();
    clearSessionTracking(u);
    set({ currentUser: null, authError: 'Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại.', pendingSignInMethod: null });
  },

  saveUsers: async (users) => {
    set({ users });
    await authBackend.pushUsers(users);
  },
}));
```

- [ ] **Step 3: Run the existing auth-store test (must stay green)**

Run: `npx vitest run src/stores/authStore.test.ts`
Expected: PASS. The firebase backend wraps `fbOnIdTokenChanged` and re-calls `fbPullUsers`/`fbPushUsers`/`fbSignOut`/`fbCompleteSignInLink`, so every existing assertion (match, case-insensitive, reject→signOut, bootstrap→pushUsers, session-method, expiry) still holds. If any assertion now observes a call one layer deeper, fix the test minimally without weakening the assertion.

- [ ] **Step 4: Typecheck + lint + full unit suite**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: clean; all green.

- [ ] **Step 5: Commit**

```bash
git add src/stores/authStore.ts src/stores/authStore.test.ts
git commit -m "feat(supabase): route authStore through the auth-backend seam (Phase 3 Task 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Supabase auth gateway (`sb*`) in `supabase.ts`

Add `sb*` auth fns mirroring the `fb*` auth fns, plus a UID profile read and an access-token getter. Adjust `createClient` options so the magic-link callback is handled explicitly (parity with firebase's explicit-complete flow) and tokens persist/refresh.

**Files:**
- Modify: `src/lib/supabase.ts` (createClient options + new exports near the existing profile gateway)
- Create: `tests/supabase/auth.test.ts`

**Interfaces:**
- Produces (all in `@/lib/supabase`):
  - `sbSendSignInLink(email: string, client?): Promise<void>`
  - `sbIsSignInLink(url: string): boolean`
  - `sbCompleteSignInLink(url: string, client?): Promise<void>`
  - `sbSignInWithPassword(email: string, password: string, client?): Promise<void>`
  - `sbSignOut(client?): Promise<void>`
  - `sbOnAuthChange(cb: (session: { uid: string; email: string } | null) => void, client?): () => void`
  - `sbGetProfileById(uid: string, client?): Promise<User | null>`
  - `sbGetAccessToken(client?): Promise<string | null>`
- Consumes: existing `sb`, `profileToUser`, `User`. Uses `import.meta.env.BASE_URL` for the redirect URL.

- [ ] **Step 1: Write the failing integration test**

```ts
// tests/supabase/auth.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  sbSignInWithPassword, sbSignOut, sbOnAuthChange, sbGetProfileById, sbGetAccessToken,
} from '@/lib/supabase';
import { LOCAL_SUPABASE_URL, LOCAL_SUPABASE_ANON_KEY, SERVICE_ROLE_KEY, adminCreateUser, adminDeleteUser } from './_setup';

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
```

> **Implementer:** `_setup.ts` already provides a signed-in test client + keys. If `adminCreateUser`/`adminDeleteUser` helpers do not exist there yet, add them using the service-role client (`auth.admin.createUser({ email, password, email_confirm: true })` / `auth.admin.deleteUser(uid)`). Reuse the existing exported constants; do not hardcode new keys.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:integration -- tests/supabase/auth.test.ts`
Expected: FAIL — the `sb*` auth fns are not exported yet.

- [ ] **Step 3: Adjust `createClient` options in `supabase.ts`**

Replace the client construction so the magic-link callback is consumed explicitly (mirrors firebase's `completeSignInLink`) and sessions persist/refresh:

```ts
export const sb: SupabaseClient = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // we complete the link explicitly in sbCompleteSignInLink
    flowType: 'pkce',
  },
});
```

- [ ] **Step 4: Add the `sb*` auth fns (near the profile gateway block)**

```ts
const AUTH_REDIRECT = `${window.location.origin}${import.meta.env.BASE_URL}?mode=auth`;

export async function sbSendSignInLink(email: string, client: SupabaseClient = sb): Promise<void> {
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: AUTH_REDIRECT, shouldCreateUser: true },
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
    .select('username, email, phone, role, name, color').eq('id', uid).maybeSingle();
  if (error) throw new Error('sbGetProfileById: ' + error.message);
  return data ? profileToUser(data) : null;
}

export async function sbGetAccessToken(client: SupabaseClient = sb): Promise<string | null> {
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}
```

- [ ] **Step 5: Run the integration test to verify it passes**

Run: `npm run test:integration -- tests/supabase/auth.test.ts`
Expected: PASS (Docker + local Supabase running).

- [ ] **Step 6: Gates + full integration suite**

Run: `npm run typecheck && npm run lint && npm run test:integration`
Expected: clean; all green (≥ prior 110, +3).

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase.ts tests/supabase/auth.test.ts
git commit -m "feat(supabase): sb* auth gateway (otp/password/onAuthChange/profile-by-uid) (Phase 3 Task 3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Supabase backend implementation

Replace the Task-1 throwing stub with the real `supabaseBackend`. `resolve` reads the profile by UID (trigger already provisioned it); no client bootstrap. `subscribe` wraps `sbOnAuthChange`. The directory (`users`) comes from `sbPullUsers`.

**Files:**
- Modify (replace stub): `src/auth/backends/supabaseBackend.ts`
- Create: `tests/supabase/authBackend.test.ts`

**Interfaces:**
- Produces: `supabaseBackend: AuthBackend`.
- Consumes: `sb*` from `@/lib/supabase` (`sbSendSignInLink`, `sbIsSignInLink`, `sbCompleteSignInLink`, `sbSignInWithPassword`, `sbSignOut`, `sbOnAuthChange`, `sbGetProfileById`, `sbGetAccessToken`, `sbPullUsers`, `sbPushUsers`); `AuthBackend`/`AuthSession`/`Resolution`.

- [ ] **Step 1: Write the failing integration test**

```ts
// tests/supabase/authBackend.test.ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:integration -- tests/supabase/authBackend.test.ts`
Expected: FAIL — stub throws / no real impl.

- [ ] **Step 3: Implement `supabaseBackend.ts`**

```ts
import {
  sbSendSignInLink, sbIsSignInLink, sbCompleteSignInLink, sbSignInWithPassword,
  sbSignOut, sbOnAuthChange, sbGetProfileById, sbGetAccessToken, sbPullUsers, sbPushUsers,
} from '@/lib/supabase';
import type { AuthBackend, AuthSession, Resolution } from '../backend';

export const supabaseBackend: AuthBackend = {
  sendSignInLink: (email) => sbSendSignInLink(email),
  isSignInLink: (url) => sbIsSignInLink(url),
  completeSignInLink: async (_email, url) => { await sbCompleteSignInLink(url); },
  signInWithPassword: (email, password) => sbSignInWithPassword(email, password),
  signOut: () => sbSignOut(),
  subscribe: (cb) => { sbOnAuthChange(cb); },

  resolve: async (session: AuthSession): Promise<Resolution> => {
    // First-login provisioning is the DB trigger (handle_new_user); the profile
    // row exists by the time this fires. No client-side bootstrap.
    const [user, users] = await Promise.all([sbGetProfileById(session.uid), sbPullUsers()]);
    if (!user) return { kind: 'rejected', users };
    return { kind: 'ok', user, users };
  },

  pushUsers: (users) => sbPushUsers(users),
  purgeLegacyPasswords: async () => { /* no plaintext password column exists in Postgres */ },
  getAccessToken: () => sbGetAccessToken(),
};
```

> `completeSignInLink` ignores `email` (PKCE needs only the `code`); the signature stays uniform with the interface. The cross-device caveat (PKCE verifier is device-local) is documented in Task 6's manual checklist — it matches firebase's existing "different device → re-enter email" deferral well enough for parity.

- [ ] **Step 4: Run the integration test to verify it passes**

Run: `npm run test:integration -- tests/supabase/authBackend.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm the unit suite still defaults to firebase**

Run: `npx vitest run src/auth/backend.test.ts`
Expected: PASS — `authBackend === firebaseBackend` (flag unset). Importing the now-real `supabaseBackend` must not run network calls at module load (it only references `sb*` fns; `@/lib/supabase` is mocked in unit tests).

- [ ] **Step 6: Gates + full suites**

Run: `npm run typecheck && npm run lint && npm run test && npm run test:integration`
Expected: clean; all green.

- [ ] **Step 7: Commit**

```bash
git add src/auth/backends/supabaseBackend.ts tests/supabase/authBackend.test.ts
git commit -m "feat(supabase): supabase auth backend (resolve-by-uid, trigger-provisioned) (Phase 3 Task 4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Route the AI Worker token through the active backend

`aiWorker.authHeaders()` currently reads the Firebase token directly. Route it through `authBackend.getAccessToken()` so the client token follows the selected backend. (Worker-side verification swap stays Phase 5.)

**Files:**
- Modify: `src/lib/aiWorker.ts` (`authHeaders` only)
- Create: `src/lib/aiWorker.test.ts` (focused unit test for `authHeaders`) — *only if a test for this file does not already exist; otherwise extend it.*

**Interfaces:**
- Consumes: `authBackend.getAccessToken()` from `@/auth/backend`.

- [ ] **Step 1: Write the failing unit test**

```ts
// src/lib/aiWorker.test.ts
import { describe, it, expect, vi } from 'vitest';

const getAccessToken = vi.fn(async () => 'tok-123');
vi.mock('@/auth/backend', () => ({ authBackend: { getAccessToken } }));

import { __getAuthHeadersForTest } from './aiWorker';

describe('authHeaders', () => {
  it('uses the active backend access token', async () => {
    expect(await __getAuthHeadersForTest()).toEqual({ Authorization: 'Bearer tok-123' });
  });
  it('returns {} when there is no token', async () => {
    getAccessToken.mockResolvedValueOnce(null);
    expect(await __getAuthHeadersForTest()).toEqual({});
  });
});
```

> `authHeaders` is module-private. Export a thin test alias `export const __getAuthHeadersForTest = authHeaders;` at the bottom of `aiWorker.ts` (matches the repo's existing test-seam style), or, if the reviewer prefers no test-only export, drop this unit test and rely on typecheck + the manual checklist. Prefer the alias.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/aiWorker.test.ts`
Expected: FAIL — `__getAuthHeadersForTest` not exported / still reads firebase.

- [ ] **Step 3: Rewrite `authHeaders`**

```ts
async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { authBackend } = await import('@/auth/backend'); // lazy — avoid eager IdP init
    const token = await authBackend.getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

// Test seam.
export const __getAuthHeadersForTest = authHeaders;
```

Update the JSDoc above `authHeaders` to say the bearer token is the active auth backend's token (Firebase ID token or Supabase access token), not "Firebase ID token" specifically.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/aiWorker.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates + full unit suite**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: clean; all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/aiWorker.ts src/lib/aiWorker.test.ts
git commit -m "feat(supabase): AI Worker token follows the active auth backend (Phase 3 Task 5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Docs — Supabase Auth dashboard config, flag, manual smoke checklist

Document what a human must do to make the Supabase path usable (dashboard config can't be coded here) and how to smoke-test the browser-only magic-link redirect that integration tests can't cover.

**Files:**
- Modify: `docs/supabase-setup.md`

- [ ] **Step 1: Add a "Phase 3 — Auth" section**

Cover, concisely:
- **Flag:** `VITE_AUTH_BACKEND` (`firebase` default; `supabase` flips the app to Supabase Auth). Production `.env`/CI secret stays `firebase` until cutover.
- **Dashboard (one-time, before flipping):** enable the **Email** provider; set **Site URL** + **Redirect URLs** to the Pages URL with `?mode=auth`; restrict sign-ups to `viettours.com.vn` (Auth → Providers → Email → allowed domains, or an `auth` hook); the magic-link email template's action link must land on the redirect URL (PKCE `?code=`).
- **First-login provisioning:** the `handle_new_user()` trigger creates a `profiles` row (role from the bootstrap-CEO GUC, else `Standard`; `username`/`name` = email local-part). **Known caveats, tracked for cutover:** (a) the bootstrap-CEO GUC is currently **unset in prod** — a fresh bootstrap user lands as `Standard`; (b) trigger-derived `username` = email local-part, not the historical username — the Phase 6 ETL backfills real usernames before the Supabase path goes live.
- **Worker:** verification swap is **Phase 5**; until then a Supabase token sent to the current (Firebase-verifying or unauthenticated) Worker behaves as today.
- **Manual browser smoke checklist** (run with `VITE_AUTH_BACKEND=supabase` against a dev project): request magic link → email arrives → click → app completes session (`?code=` exchanged) → `currentUser` resolves from `profiles` → reload keeps the session → sign out clears it → DEV password panel signs in. Note the **cross-device** limitation: PKCE stores the verifier on the requesting device, so opening the link on a different device fails (parity with the existing "different device → re-enter email" deferral).

- [ ] **Step 2: Verify docs build/links**

Run: `npm run typecheck`
Expected: clean (no code changed; sanity gate).

- [ ] **Step 3: Commit**

```bash
git add docs/supabase-setup.md
git commit -m "docs(supabase): Phase 3 auth dashboard config + flag + smoke checklist (Phase 3 Task 6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage** (design doc §Authentication + §Architecture seam 3):
- Magic link (`signInWithOtp` + `emailRedirectTo=?mode=auth`) → Task 3 `sbSendSignInLink`. ✅
- DEV password (`signInWithPassword`) → Task 3 `sbSignInWithPassword`, gated by the same DEV accordion (LoginScreen unchanged; `import.meta.env.DEV` already governs the panel). ✅
- Session resolution via `onAuthStateChange` + resolve by **auth UID** (`profiles WHERE id = uid`) → Task 3 `sbOnAuthChange`/`sbGetProfileById`, Task 4 `supabaseBackend.resolve`. ✅
- `sessionTimeout.ts` untouched; DEV password exempt → preserved in `authStore` (Task 2), not the backend. ✅
- First-login provisioning by DB trigger (no client bootstrap on Supabase) → Task 4 comment + Task 6 docs. ✅
- Worker client token via `getSession()` → Task 5. ✅ (Worker *verification* swap correctly deferred to Phase 5.)
- Domain defense three layers: client gate (kept in `authStore`), Auth allowlist (Task 6 docs), RLS (already in schema). ✅
- **Dual-auth-behind-a-flag** (the user's locked Phase-3 decision, beyond the spec's straight swap) → `VITE_AUTH_BACKEND` selector, firebase default, production unchanged. ✅

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows full code; test code is concrete. ✅

**Type consistency:** `AuthBackend`/`AuthSession`/`Resolution` identical across `backend.ts`, both backends, and `authStore`. `sb*` signatures in Task 3 match their use in Task 4. `Resolution` discriminant `kind: 'ok'|'rejected'` used consistently. `authStore` public `AuthState` unchanged vs. the frozen API. ✅

**Risks flagged for the executor:**
- Keep `authStore.test.ts` green by construction (firebase backend re-calls the same `fb*` the test mocks). If the test reaches into call ordering, fix minimally — never weaken an assertion.
- The unit suite must not throw on the transitive `supabase.ts` import — the dummy `define` in `vitest.config.ts` (Task 1) + `@/lib/supabase` mock (Tasks 1–2) cover this.
- Integration tests need Docker + a running local Supabase stack and the `adminCreateUser`/`adminDeleteUser` helpers in `_setup.ts`.
