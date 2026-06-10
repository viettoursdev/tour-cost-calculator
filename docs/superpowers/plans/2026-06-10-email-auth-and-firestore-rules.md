# Company-Email Auth + Firestore Lockdown — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace plaintext-password login with Firebase Auth email-link (magic link) restricted to `@viettours.com.vn`, then lock Firestore rules so unauthenticated clients cannot read or write any data.

**Architecture:** Firebase Auth (Email link / passwordless) for identity; Firestore rules enforce `request.auth.token.email_verified` + company-domain regex on every collection. Existing `User` records keep `username` as the canonical identifier; a new `email` field maps the verified Firebase Auth identity to the local user record. Three independently revertible phases.

**Tech Stack:** Firebase Auth 10 (`firebase/auth`), Firestore (existing), Vite 5 / React 18 / TypeScript 5 (strict), Zustand 4, Vitest 2.

**Spec:** `docs/superpowers/specs/2026-06-10-email-auth-and-firestore-rules-design.md`

---

## File Structure

**New files:**
- `firestore.rules` — locked-down rules (Phase 3).
- `firestore.rules.previous` — snapshot of current open rules for rollback (Phase 3).
- `firebase.json` — Firebase CLI config naming the rules file + the non-default database (Phase 3).
- `docs/firebase-setup.md` — one-time Console steps (Phase 2).

**Modified files:**

| File | Phase | Change |
|------|-------|--------|
| `src/types/user.ts` | 1 | Add `email?: string` (required field with optional TS type so legacy data without it loads cleanly until backfilled). |
| `src/auth/ROLES.ts` | 1 | Add `email` to every `DEFAULT_USERS` entry. |
| `src/components/admin/UserManagementModal.tsx` | 1 → 2 | Phase 1: add email input + validation. Phase 2: drop password input + plaintext-password warning. |
| `src/lib/firebase.ts` | 2 | Export `auth` and the four wrappers `fbSendSignInLink`, `fbCompleteSignInLink`, `fbSignOut`, `fbOnIdTokenChanged`. |
| `src/test/firebaseStub.ts` | 2 | Add stubs for the four wrappers + `auth` placeholder. |
| `src/stores/authStore.ts` | 2 | Replace password login with magic-link flow. Remove sessionStorage session restore. |
| `src/stores/authStore.test.ts` | 2 | Rewrite tests to cover the new flow. |
| `src/components/shell/LoginScreen.tsx` | 2 | Email-only form + sent-confirmation panel + cross-device branch. |
| `CLAUDE.md` | 3 | Replace "No Firebase Auth" bullet, remove "Open rules required" block, point at `firestore.rules`. |

**Out of scope** (per spec — captured as Phase 4 / follow-ups, not in this plan):
- API key rotation.
- Deletion of legacy `User.p` (password) field from type and live data.
- Firestore rules unit-testing (`@firebase/rules-unit-testing`).
- Role-based enforcement in Firestore rules (would need custom claims via Cloud Function).

---

## Conventions

- **Branches:** one feature branch per phase (`phase-1-email-field`, `phase-2-magic-link`, `phase-3-rules-lockdown`). Fast-forward merge to `main` when the phase is verified.
- **Commits:** Conventional Commits. One logical change per commit. CLAUDE.md says direct push to `main` after merge; we follow that.
- **Co-author:** `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` (match the tag recent commits use).
- **Verification gates:** every phase ends with `npm run lint && npm test && npm run typecheck && npm run build`. CI runs the same gates; do not push if any fails.
- **TDD:** types and store changes follow the test-first loop. UI changes are validated manually plus existing test coverage; do not invent UI tests since this codebase has none.

---

# Phase 1 — Add the email field

Goal: every `User` record can carry an `email`. Admin UI lets the CEO seed it. No login behavior changes.

## Task 1.1: Create the phase-1 feature branch

- [ ] **Step 1: Branch from main**

```bash
git checkout main
git pull --ff-only origin main
git checkout -b phase-1-email-field
```

Expected: `Switched to a new branch 'phase-1-email-field'`.

---

## Task 1.2: Add `email` to the `User` type

**Files:**
- Modify: `src/types/user.ts:11-17`

- [ ] **Step 1: Edit the type**

Replace the existing `User` type with:

```ts
export type User = {
  u: string;          // username — canonical app-level identifier
  email?: string;     // company email (@viettours.com.vn). Required for new
                      // users from Phase 1 onward; optional in the type so
                      // pre-migration records still load. Migration to
                      // required happens in Phase 4 cleanup.
  p: string;          // password (plaintext, legacy — removed in Phase 4)
  role: Role;
  name: string;
  color: string;      // hex
};
```

- [ ] **Step 2: Verify typecheck still passes**

```bash
npm run typecheck
```

Expected: exit 0, no errors. `email` is optional, so existing code that builds `User` literals without it still type-checks.

- [ ] **Step 3: Run the suite — existing tests should still pass**

```bash
npm test
```

Expected: 214 tests pass (no behavior change yet).

- [ ] **Step 4: Commit**

```bash
git add src/types/user.ts
git commit -m "$(cat <<'EOF'
feat(types): add optional email to User

Phase 1 of the email-auth migration. The field is optional in TypeScript
so existing user records without an email continue to load until the CEO
seeds emails via the admin UI.

Spec: docs/superpowers/specs/2026-06-10-email-auth-and-firestore-rules-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1.3: Seed `email` in `DEFAULT_USERS`

**Why:** the "Reset mặc định" button in `UserManagementModal` re-seeds from `DEFAULT_USERS`. Without emails on the defaults, a reset would wipe all logins.

**Files:**
- Modify: `src/auth/ROLES.ts:22-29`
- Modify: `src/auth/ROLES.test.ts` (extend coverage for the new field)

- [ ] **Step 1: Add the failing test**

Open `src/auth/ROLES.test.ts` and add this test inside the existing `describe('DEFAULT_USERS', ...)` block:

```ts
it('every seed has a @viettours.com.vn email', () => {
  for (const u of DEFAULT_USERS) {
    expect(u.email).toBeDefined();
    expect(u.email!.toLowerCase()).toMatch(/@viettours\.com\.vn$/);
  }
});
```

- [ ] **Step 2: Run it — confirm it fails**

```bash
npx vitest run src/auth/ROLES.test.ts
```

Expected: 1 failing test (`every seed has a @viettours.com.vn email`).

- [ ] **Step 3: Edit `src/auth/ROLES.ts:22-29`**

Replace the `DEFAULT_USERS` block with:

```ts
export const DEFAULT_USERS: readonly User[] = [
  { u: 'ceo',      email: 'ceo@viettours.com.vn',      p: 'ceo123',  role: 'CEO',          name: 'Tony',  color: '#dc3250' },
  { u: 'manager1', email: 'manager1@viettours.com.vn', p: 'mgr123',  role: 'Trưởng Phòng', name: 'Mai',   color: '#f5a623' },
  { u: 'sale1',    email: 'sale1@viettours.com.vn',    p: 'sale123', role: 'Sales',        name: 'Linh',  color: '#14a08c' },
  { u: 'sale2',    email: 'sale2@viettours.com.vn',    p: 'sale123', role: 'Sales',        name: 'Hùng',  color: '#1abc9c' },
  { u: 'sale3',    email: 'sale3@viettours.com.vn',    p: 'sale123', role: 'Sales',        name: 'Trang', color: '#3498db' },
  { u: 'op1',      email: 'op1@viettours.com.vn',      p: 'op123',   role: 'Operations',   name: 'Khang', color: '#9b59b6' },
];
```

- [ ] **Step 4: Run the test — confirm it now passes**

```bash
npx vitest run src/auth/ROLES.test.ts
```

Expected: 7 tests pass (6 existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add src/auth/ROLES.ts src/auth/ROLES.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): seed @viettours.com.vn email on DEFAULT_USERS

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1.4: Add email input to UserManagementModal

**Files:**
- Modify: `src/components/admin/UserManagementModal.tsx`

**Behavior to add:**
1. `FormState` and `EMPTY_FORM` gain `email: string`.
2. The form renders a new `TextField` labelled "Email công ty" next to the existing Tên hiển thị field.
3. `handleSave` validates: non-empty, lowercase, ends with `@viettours.com.vn`. Reject with Vietnamese alert otherwise.
4. The user-row caption (currently shows `@username · MK: •••`) shows `@username · email@viettours.com.vn`. If `email` is missing, show a red "Chưa có email" chip and an explanatory tooltip.
5. The orange `<Alert>` at the bottom is updated to reflect the email-required state.

- [ ] **Step 1: Update `FormState` and `EMPTY_FORM` (around line 22-24)**

Replace those two lines with:

```ts
type FormState = Pick<User, 'u' | 'p' | 'name' | 'role' | 'color'> & { email: string };

const EMPTY_FORM: FormState = { u: '', email: '', p: '', name: '', role: 'Sales', color: USER_COLORS[2] };
```

- [ ] **Step 2: Populate `email` in `startEdit` (around line 53-56)**

Replace `startEdit`:

```ts
const startEdit = (usr: User) => {
  setEditingId(usr.u);
  setForm({ u: usr.u, email: usr.email ?? '', p: usr.p, name: usr.name, role: usr.role, color: usr.color });
  setShowForm(true);
};
```

- [ ] **Step 3: Add email validation + persistence in `handleSave` (around line 61-83)**

Replace the entire `handleSave` with:

```ts
const handleSave = () => {
  if (!form.u.trim()) { window.alert('Vui lòng nhập Username'); return; }
  if (!form.p.trim()) { window.alert('Vui lòng nhập Mật khẩu'); return; }
  if (!form.name.trim()) { window.alert('Vui lòng nhập Tên hiển thị'); return; }
  const email = form.email.trim().toLowerCase();
  if (!email) { window.alert('Vui lòng nhập Email công ty'); return; }
  if (!email.endsWith('@viettours.com.vn')) {
    window.alert('Email phải kết thúc bằng @viettours.com.vn');
    return;
  }
  const username = form.u.trim().toLowerCase();
  if (!editingId && users.some((x) => x.u === username)) {
    window.alert('Username này đã tồn tại');
    return;
  }
  if (users.some((x) => x.u !== editingId && (x.email ?? '').toLowerCase() === email)) {
    window.alert('Email này đã được dùng cho tài khoản khác');
    return;
  }
  const newUser: User = {
    u: username,
    email,
    p: form.p,
    name: form.name.trim(),
    role: form.role,
    color: form.color,
  };
  const next = editingId
    ? users.map((x) => (x.u === editingId ? newUser : x))
    : [...users, newUser];
  persist(next);
  setShowForm(false);
  setEditingId(null);
};
```

- [ ] **Step 4: Add the email TextField in the form Stack (around line 147-164)**

Find the `<Stack direction="row" spacing={1.5}>` that contains "Tên hiển thị" + role Select (around line 147-164). Wrap it so the email field appears on its own row above:

```tsx
<Stack direction="row" spacing={1.5}>
  <TextField
    label="Email công ty"
    value={form.email}
    onChange={(e) => setF('email', e.target.value)}
    size="small" fullWidth
    placeholder="vd: sale4@viettours.com.vn"
    helperText="Email công ty dùng để nhận link đăng nhập"
  />
</Stack>
<Stack direction="row" spacing={1.5}>
  <TextField
    label="Tên hiển thị"
    value={form.name}
    onChange={(e) => setF('name', e.target.value)}
    size="small" fullWidth
    placeholder="vd: Nguyễn Văn A"
  />
  <Select
    value={form.role}
    onChange={(e) => setF('role', e.target.value as Role)}
    size="small" fullWidth
  >
    {ROLES.map((r) => (
      <MenuItem key={r} value={r}>{r}</MenuItem>
    ))}
  </Select>
</Stack>
```

- [ ] **Step 5: Update the user-row caption (around line 220-222)**

Replace the `<Typography variant="caption" color="text.secondary">` block with:

```tsx
<Typography variant="caption" color="text.secondary">
  @{usr.u} · {usr.email ?? <Box component="span" sx={{ color: '#dc3250', fontWeight: 700 }}>Chưa có email — không thể đăng nhập</Box>}
</Typography>
```

- [ ] **Step 6: Update the bottom warning Alert (around line 277-279)**

Replace its body with:

```tsx
<Alert severity="warning" sx={{ mt: 2 }}>
  <strong>Lưu ý:</strong> Mỗi tài khoản phải có email @viettours.com.vn để nhận link đăng nhập (Phase 2). Mật khẩu lưu dạng văn bản thô (tạm thời — sẽ xoá ở Phase 4).
</Alert>
```

- [ ] **Step 7: Run typecheck + lint + tests + dev server**

```bash
npm run typecheck && npm run lint
```

Expected: both pass with zero warnings.

```bash
npm test
```

Expected: 215 tests pass (existing + the new DEFAULT_USERS test from Task 1.3).

```bash
npm run dev
```

Open `http://localhost:5173/tour-cost-calculator/`, log in as `ceo / ceo123`, open **👤 Quản lý tài khoản**, and verify:
- Existing users show "Chưa có email" badge except the seed CEO (which gets `ceo@viettours.com.vn` if reset is hit).
- Clicking "Thêm tài khoản mới" shows the new Email field with helper text.
- Submitting an email without `@viettours.com.vn` triggers the Vietnamese alert.
- Submitting a valid email saves successfully; the new user shows their email in the caption.
- Editing an existing user pre-fills their email.

Stop the dev server (Ctrl-C).

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/UserManagementModal.tsx
git commit -m "$(cat <<'EOF'
feat(admin): add @viettours.com.vn email field to user management

Phase 1 of the email-auth migration. Adds the input, domain validation,
uniqueness check, and a 'Chưa có email — không thể đăng nhập' indicator
on user rows missing an email.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1.5: Final verification + merge phase 1

- [ ] **Step 1: Full CI gate locally**

```bash
npm run lint && npm test && npm run typecheck && npm run build
```

Expected: all four pass.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin phase-1-email-field
```

- [ ] **Step 3: Fast-forward merge to main and push**

```bash
git checkout main
git pull --ff-only origin main
git merge --ff-only phase-1-email-field
git push origin main
git branch -d phase-1-email-field
git push origin --delete phase-1-email-field
```

- [ ] **Step 4: CEO seeds emails on production (manual)**

The CEO opens the deployed app (https://viettoursdev.github.io/tour-cost-calculator/), logs in with their current password, and uses **👤 Quản lý tài khoản** to add a `@viettours.com.vn` email to every active user. This step gates Phase 2 — do not start Phase 2 until every active user has an email.

**Stop here and confirm seeding is complete before continuing to Phase 2.**

---

# Phase 2 — Magic-link login

Goal: replace the password form with email-link sign-in. Firestore rules are still open at the end of this phase — `viettoursdev.github.io` is the only authorized domain so the magic link redirects work, but the data is not yet protected. Phase 3 closes that gap.

## Task 2.1: Create the phase-2 feature branch

- [ ] **Step 1: Branch from main**

```bash
git checkout main
git pull --ff-only origin main
git checkout -b phase-2-magic-link
```

---

## Task 2.2: Add Firebase Auth wrappers to `src/lib/firebase.ts`

**Files:**
- Modify: `src/lib/firebase.ts`

**Why wrappers:** every Firestore call in the codebase goes through `fb*` named exports so stores can be tested by mocking `@/lib/firebase`. Same pattern for auth.

- [ ] **Step 1: Add the auth import + exports near the existing initializeApp block (around line 23)**

After `export const db = getFirestore(app, 'viettours');`, add:

```ts
import {
  getAuth, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
  signOut, onIdTokenChanged, type Auth, type User as FbUser, type Unsubscribe as AuthUnsubscribe,
} from 'firebase/auth';

export const auth: Auth = getAuth(app);

// ── Auth — Email-link (magic link) ──
// Used by authStore. Tests mock these via @/test/firebaseStub.
const ACTION_URL = `${window.location.origin}${import.meta.env.BASE_URL}?mode=auth`;

export async function fbSendSignInLink(email: string): Promise<void> {
  await sendSignInLinkToEmail(auth, email, { url: ACTION_URL, handleCodeInApp: true });
}

export function fbIsSignInLink(url: string): boolean {
  return isSignInWithEmailLink(auth, url);
}

export async function fbCompleteSignInLink(email: string, url: string): Promise<FbUser> {
  const cred = await signInWithEmailLink(auth, email, url);
  return cred.user;
}

export async function fbSignOut(): Promise<void> {
  await signOut(auth);
}

export function fbOnIdTokenChanged(cb: (user: FbUser | null) => void): AuthUnsubscribe {
  return onIdTokenChanged(auth, cb);
}
```

The first `import` should go up with the other imports at the top of the file (not literally where the snippet is positioned above). Match the existing import style.

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Verify the bundle still builds**

```bash
npm run build
```

Expected: success. Firebase Auth gets pulled into the existing `firebase` vendor chunk (configured in `vite.config.ts:manualChunks`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/firebase.ts
git commit -m "$(cat <<'EOF'
feat(lib): add Firebase Auth email-link wrappers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2.3: Extend `firebaseStub.ts` with auth stubs

**Files:**
- Modify: `src/test/firebaseStub.ts`

- [ ] **Step 1: Add the new exports at the bottom of the file**

```ts
// ── Auth ──
export const auth = {};
export const fbSendSignInLink = vi.fn(async (_email: string) => {});
export const fbIsSignInLink = vi.fn((_url: string) => false);
export const fbCompleteSignInLink = vi.fn(async (_email: string, _url: string) => ({
  uid: 'stub-uid',
  email: 'stub@viettours.com.vn',
  emailVerified: true,
} as unknown as import('firebase/auth').User));
export const fbSignOut = vi.fn(async () => {});
export const fbOnIdTokenChanged = vi.fn((_cb: (u: unknown) => void) => () => {});
```

- [ ] **Step 2: Run tests — they should still pass with the new stubs in place**

```bash
npm test
```

Expected: 215 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/test/firebaseStub.ts
git commit -m "$(cat <<'EOF'
chore(test): add firebase auth stubs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2.4: Rewrite `authStore` for magic-link

**Files:**
- Modify: `src/stores/authStore.ts`

**New state shape:**

```ts
type AuthState = {
  currentUser: User | null;
  users: User[];
  hasHydrated: boolean;
  pendingEmail: string | null;          // email a sign-in link was just sent to
  pendingCrossDeviceUrl: string | null; // set when we detect a magic-link URL but localStorage has no pending email
  authError: string | null;

  init: () => Promise<void>;
  requestSignInLink: (email: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  completeCrossDeviceSignIn: (email: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  cancelPendingSignIn: () => void;
  signOut: () => Promise<void>;
  saveUsers: (users: User[]) => Promise<void>;
};
```

Removed: `login(username, password)`, the module-load `sessionStorage` block (current `authStore.ts:99-108`), and the `persist` middleware (Firebase Auth handles persistence now; we no longer need `vte_users` in localStorage either).

- [ ] **Step 1: Replace the entire contents of `src/stores/authStore.ts` with the version below**

```ts
import { create } from 'zustand';
import {
  fbPullUsers, fbPushUsers,
  fbSendSignInLink, fbIsSignInLink, fbCompleteSignInLink, fbSignOut, fbOnIdTokenChanged,
} from '@/lib/firebase';
import { PERMISSIONS } from '@/auth/PERMISSIONS';
import type { User } from '@/types';

const ALLOWED_DOMAIN = '@viettours.com.vn';
const PENDING_EMAIL_KEY = 'vte_pending_signin_email';

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isCompanyEmail(email: string): boolean {
  return normalizeEmail(email).endsWith(ALLOWED_DOMAIN);
}

type AuthState = {
  currentUser: User | null;
  users: User[];
  hasHydrated: boolean;
  pendingEmail: string | null;
  pendingCrossDeviceUrl: string | null;
  authError: string | null;

  init: () => Promise<void>;
  requestSignInLink: (email: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  completeCrossDeviceSignIn: (email: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  cancelPendingSignIn: () => void;
  signOut: () => Promise<void>;
  saveUsers: (users: User[]) => Promise<void>;
};

export const useAuthStore = create<AuthState>()((set, get) => ({
  currentUser: null,
  users: [],
  hasHydrated: false,
  pendingEmail: null,
  pendingCrossDeviceUrl: null,
  authError: null,

  init: async () => {
    // 1. Complete a magic-link sign-in if the URL carries one.
    try {
      if (fbIsSignInLink(window.location.href)) {
        const stashed = localStorage.getItem(PENDING_EMAIL_KEY);
        if (!stashed) {
          // Different device than the one that requested the link. Ask the
          // user to re-enter their email before we complete the sign-in.
          set({ pendingCrossDeviceUrl: window.location.href });
        } else {
          try {
            await fbCompleteSignInLink(stashed, window.location.href);
            localStorage.removeItem(PENDING_EMAIL_KEY);
            set({ pendingEmail: null });
          } catch (e) {
            set({ authError: `Link đăng nhập đã hết hạn hoặc đã được dùng. Hãy yêu cầu link mới. (${(e as Error).message})` });
            localStorage.removeItem(PENDING_EMAIL_KEY);
          } finally {
            window.history.replaceState({}, '', window.location.pathname);
          }
        }
      }
    } catch (e) {
      set({ authError: `Lỗi xác thực: ${(e as Error).message}` });
    }

    // 2. Subscribe to Firebase Auth state. The callback runs immediately with
    //    the cached user (if any) and again whenever auth state changes.
    fbOnIdTokenChanged(async (fbUser) => {
      if (!fbUser) {
        set({ currentUser: null, hasHydrated: true });
        return;
      }
      // Refresh local user list from Firestore on every auth change so a
      // newly added user reflects without manual refresh.
      let cloud: User[] = [];
      try {
        cloud = await fbPullUsers();
      } catch (e) {
        console.warn('Failed to pull users:', (e as Error).message);
      }
      const verifiedEmail = (fbUser.email ?? '').toLowerCase();
      const match = cloud.find((u) => (u.email ?? '').toLowerCase() === verifiedEmail);
      if (!match) {
        // Verified company-domain account but not authorized for this app.
        await fbSignOut();
        set({
          currentUser: null,
          users: cloud,
          hasHydrated: true,
          authError: 'Email chưa được cấp quyền. Liên hệ admin.',
        });
        return;
      }
      // Sanity: the matched user's role must exist (defensive check).
      if (!(match.role in PERMISSIONS)) {
        console.warn(`User ${match.u} has unknown role: ${match.role}`);
      }
      set({ currentUser: match, users: cloud, hasHydrated: true, authError: null });
    });
  },

  requestSignInLink: async (rawEmail) => {
    const email = normalizeEmail(rawEmail);
    if (!email) return { ok: false, error: 'Vui lòng nhập email' };
    if (!isCompanyEmail(email)) {
      return { ok: false, error: 'Vui lòng dùng email công ty (@viettours.com.vn)' };
    }
    try {
      await fbSendSignInLink(email);
      localStorage.setItem(PENDING_EMAIL_KEY, email);
      set({ pendingEmail: email, authError: null });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `Không gửi được link: ${(e as Error).message}` };
    }
  },

  completeCrossDeviceSignIn: async (rawEmail) => {
    const email = normalizeEmail(rawEmail);
    const url = get().pendingCrossDeviceUrl;
    if (!url) return { ok: false, error: 'Không có link đăng nhập đang chờ' };
    if (!isCompanyEmail(email)) {
      return { ok: false, error: 'Vui lòng dùng email công ty (@viettours.com.vn)' };
    }
    try {
      await fbCompleteSignInLink(email, url);
      set({ pendingCrossDeviceUrl: null, pendingEmail: null });
      window.history.replaceState({}, '', window.location.pathname);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `Không thể hoàn tất đăng nhập: ${(e as Error).message}` };
    }
  },

  cancelPendingSignIn: () => {
    localStorage.removeItem(PENDING_EMAIL_KEY);
    set({ pendingEmail: null, pendingCrossDeviceUrl: null, authError: null });
  },

  signOut: async () => {
    await fbSignOut();
    set({ currentUser: null, authError: null });
  },

  saveUsers: async (users) => {
    set({ users });
    await fbPushUsers(users);
  },
}));
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: exit 0. If errors mention "Property 'login' does not exist", that's a caller in another file — find and fix in Task 2.5/2.6.

- [ ] **Step 3: Find and fix any callers of the removed `login` action**

```bash
grep -rn "authStore.*login\|\\.login(" src/ --include="*.ts" --include="*.tsx" | grep -v test
```

Expected hits: `LoginScreen.tsx` (will be rewritten in Task 2.6). If anything else shows up, note it — likely an unused import. The `login` reference inside `authStore.ts` itself is gone.

- [ ] **Step 4: Commit (tests will be updated next task; suite will be red between commits — that's OK on a feature branch)**

```bash
git add src/stores/authStore.ts
git commit -m "$(cat <<'EOF'
feat(auth): replace password login with magic-link store

Removes password login, sessionStorage session restore, and the Zustand
persist middleware. Firebase Auth handles persistence via IndexedDB.

Tests follow in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2.5: Rewrite `authStore.test.ts`

**Files:**
- Modify: `src/stores/authStore.test.ts` (full rewrite — the password-login tests are obsolete)

- [ ] **Step 1: Replace the file with the version below**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));

import { useAuthStore } from './authStore';
import { snapshotInitial } from '@/test/storeReset';
import * as fb from '@/lib/firebase';
import type { User } from '@/types';

const reset = snapshotInitial(useAuthStore);

beforeEach(() => {
  reset();
  vi.clearAllMocks();
  localStorage.clear();
  // Default: no magic-link URL.
  vi.mocked(fb.fbIsSignInLink).mockReturnValue(false);
  // Default: onIdTokenChanged returns an unsubscribe but doesn't fire.
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

  it('rejects non-company-domain email', async () => {
    const out = await useAuthStore.getState().requestSignInLink('attacker@gmail.com');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('@viettours.com.vn');
    expect(fb.fbSendSignInLink).not.toHaveBeenCalled();
  });

  it('rejects look-alike domain', async () => {
    const out = await useAuthStore.getState().requestSignInLink('a@viettours.com.vn.evil.com');
    expect(out.ok).toBe(false);
  });

  it('sends link, stashes pending email in localStorage, sets pendingEmail', async () => {
    const out = await useAuthStore.getState().requestSignInLink('CEO@Viettours.COM.VN');
    expect(out.ok).toBe(true);
    expect(fb.fbSendSignInLink).toHaveBeenCalledWith('ceo@viettours.com.vn');
    expect(localStorage.getItem('vte_pending_signin_email')).toBe('ceo@viettours.com.vn');
    expect(useAuthStore.getState().pendingEmail).toBe('ceo@viettours.com.vn');
  });

  it('returns error when fbSendSignInLink throws', async () => {
    vi.mocked(fb.fbSendSignInLink).mockRejectedValueOnce(new Error('quota exceeded'));
    const out = await useAuthStore.getState().requestSignInLink('ceo@viettours.com.vn');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('quota exceeded');
  });
});

describe('init — magic-link completion', () => {
  it('with pending email in localStorage: completes sign-in and clears pending email', async () => {
    localStorage.setItem('vte_pending_signin_email', 'ceo@viettours.com.vn');
    vi.mocked(fb.fbIsSignInLink).mockReturnValue(true);
    await useAuthStore.getState().init();
    expect(fb.fbCompleteSignInLink).toHaveBeenCalledWith(
      'ceo@viettours.com.vn',
      window.location.href,
    );
    expect(localStorage.getItem('vte_pending_signin_email')).toBeNull();
  });

  it('with no pending email: enters cross-device flow (does NOT call fbCompleteSignInLink)', async () => {
    vi.mocked(fb.fbIsSignInLink).mockReturnValue(true);
    await useAuthStore.getState().init();
    expect(fb.fbCompleteSignInLink).not.toHaveBeenCalled();
    expect(useAuthStore.getState().pendingCrossDeviceUrl).toBeTruthy();
  });

  it('surfaces a Vietnamese error and clears pending email when completion throws', async () => {
    localStorage.setItem('vte_pending_signin_email', 'ceo@viettours.com.vn');
    vi.mocked(fb.fbIsSignInLink).mockReturnValue(true);
    vi.mocked(fb.fbCompleteSignInLink).mockRejectedValueOnce(new Error('expired'));
    await useAuthStore.getState().init();
    expect(useAuthStore.getState().authError).toMatch(/hết hạn/);
    expect(localStorage.getItem('vte_pending_signin_email')).toBeNull();
  });
});

describe('init — onIdTokenChanged subscriber', () => {
  it('null user clears currentUser', async () => {
    await useAuthStore.getState().init();
    const cb = vi.mocked(fb.fbOnIdTokenChanged).mock.calls[0][0];
    await cb(null);
    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(useAuthStore.getState().hasHydrated).toBe(true);
  });

  it('verified email matching user_accounts: populates currentUser', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([user()]);
    await useAuthStore.getState().init();
    const cb = vi.mocked(fb.fbOnIdTokenChanged).mock.calls[0][0];
    await cb({ email: 'ceo@viettours.com.vn', emailVerified: true } as Parameters<typeof cb>[0]);
    expect(useAuthStore.getState().currentUser?.u).toBe('ceo');
  });

  it('email is case-insensitive when matching user_accounts', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([user({ email: 'ceo@viettours.com.vn' })]);
    await useAuthStore.getState().init();
    const cb = vi.mocked(fb.fbOnIdTokenChanged).mock.calls[0][0];
    await cb({ email: 'CEO@Viettours.COM.VN', emailVerified: true } as Parameters<typeof cb>[0]);
    expect(useAuthStore.getState().currentUser?.u).toBe('ceo');
  });

  it('verified email NOT in user_accounts: signs out and sets authError', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([user()]);
    await useAuthStore.getState().init();
    const cb = vi.mocked(fb.fbOnIdTokenChanged).mock.calls[0][0];
    await cb({ email: 'stranger@viettours.com.vn', emailVerified: true } as Parameters<typeof cb>[0]);
    expect(fb.fbSignOut).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(useAuthStore.getState().authError).toMatch(/chưa được cấp quyền/);
  });
});

describe('completeCrossDeviceSignIn', () => {
  it('fails when no cross-device URL is pending', async () => {
    const out = await useAuthStore.getState().completeCrossDeviceSignIn('ceo@viettours.com.vn');
    expect(out.ok).toBe(false);
  });

  it('rejects non-company-domain even with a pending URL', async () => {
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
```

- [ ] **Step 2: Run the test file**

```bash
npx vitest run src/stores/authStore.test.ts
```

Expected: all green (around 16 tests). If `Property 'fbIsSignInLink' does not exist` — re-check Task 2.3.

- [ ] **Step 3: Run the full suite**

```bash
npm test
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/stores/authStore.test.ts
git commit -m "$(cat <<'EOF'
test(auth): cover magic-link store flow

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2.6: Rewrite `LoginScreen.tsx`

**Files:**
- Modify: `src/components/shell/LoginScreen.tsx` (full rewrite)

Three visual states:

1. **Form** — single email field, "Gửi link đăng nhập" button.
2. **Sent** — "Đã gửi link đăng nhập đến {email}" + 60s cooldown "Gửi lại" + "Đổi email".
3. **Cross-device** — "Bạn vừa bấm vào link đăng nhập từ thiết bị khác. Vui lòng nhập lại email để xác nhận." + email field + "Xác nhận".

- [ ] **Step 1: Replace the file**

```tsx
import { useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useAuthStore } from '@/stores/authStore';

const RESEND_SECONDS = 60;

export function LoginScreen() {
  const pendingEmail = useAuthStore((s) => s.pendingEmail);
  const pendingCrossDeviceUrl = useAuthStore((s) => s.pendingCrossDeviceUrl);
  const authError = useAuthStore((s) => s.authError);

  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Auto-clear inline error after 3s (legacy parity).
  useEffect(() => {
    if (!err) return;
    const t = setTimeout(() => setErr(null), 3000);
    return () => clearTimeout(t);
  }, [err]);

  // Resend cooldown timer.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function submitNewLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const out = await useAuthStore.getState().requestSignInLink(email.trim());
    setBusy(false);
    if (!out.ok) {
      setErr(out.error);
    } else {
      setCooldown(RESEND_SECONDS);
    }
  }

  async function submitCrossDevice(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const out = await useAuthStore.getState().completeCrossDeviceSignIn(email.trim());
    setBusy(false);
    if (!out.ok) setErr(out.error);
  }

  const containerSx = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    bgcolor: 'background.default',
  };
  const paperSx = { p: 4, width: 420 };
  const header = (
    <Box sx={{ textAlign: 'center', mb: 2.5 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, color: '#0d7a6a' }}>
        VIETTOURS
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Bảng tính chi phí tour
      </Typography>
    </Box>
  );

  // ── State 3: Cross-device confirmation ──
  if (pendingCrossDeviceUrl) {
    return (
      <Box sx={containerSx}>
        <Paper sx={paperSx} component="form" onSubmit={submitCrossDevice}>
          {header}
          <Typography sx={{ fontSize: 20, fontWeight: 800, mb: 1.5, color: '#0f3a4a' }}>
            Xác nhận đăng nhập
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Bạn vừa bấm vào link đăng nhập từ thiết bị khác. Vui lòng nhập lại email công ty để xác nhận.
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Email công ty"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus required autoComplete="email"
              placeholder="vd: sale4@viettours.com.vn"
            />
            {err && <Alert severity="error">{err}</Alert>}
            <Button type="submit" variant="contained" disabled={busy || !email}>
              {busy ? 'Đang xác minh…' : 'Xác nhận'}
            </Button>
            <Button onClick={() => useAuthStore.getState().cancelPendingSignIn()}>
              Huỷ
            </Button>
          </Stack>
        </Paper>
      </Box>
    );
  }

  // ── State 2: Link sent ──
  if (pendingEmail) {
    return (
      <Box sx={containerSx}>
        <Paper sx={paperSx}>
          {header}
          <Typography sx={{ fontSize: 20, fontWeight: 800, mb: 1.5, color: '#0f3a4a' }}>
            Đã gửi link đăng nhập
          </Typography>
          <Alert severity="success" sx={{ mb: 2 }}>
            Đã gửi link đăng nhập đến <strong>{pendingEmail}</strong>. Vui lòng mở email và bấm vào liên kết để hoàn tất.
          </Alert>
          <Stack spacing={1.5}>
            <Button
              variant="outlined"
              disabled={cooldown > 0 || busy}
              onClick={async () => {
                setBusy(true);
                const out = await useAuthStore.getState().requestSignInLink(pendingEmail);
                setBusy(false);
                if (out.ok) setCooldown(RESEND_SECONDS);
                else setErr(out.error);
              }}
            >
              {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại link'}
            </Button>
            <Button onClick={() => useAuthStore.getState().cancelPendingSignIn()}>
              Đổi email
            </Button>
            {err && <Alert severity="error">{err}</Alert>}
          </Stack>
        </Paper>
      </Box>
    );
  }

  // ── State 1: Email form ──
  return (
    <Box sx={containerSx}>
      <Paper sx={paperSx} component="form" onSubmit={submitNewLink}>
        {header}
        <Typography sx={{ fontSize: 22, fontWeight: 800, mb: 1.5, color: '#0f3a4a' }}>
          Đăng nhập hệ thống
        </Typography>
        {authError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {authError}
          </Alert>
        )}
        <Stack spacing={2}>
          <TextField
            label="Email công ty"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus required autoComplete="email"
            placeholder="vd: sale4@viettours.com.vn"
            helperText="Bạn sẽ nhận được link đăng nhập qua email."
          />
          {err && <Alert severity="error">{err}</Alert>}
          <Button type="submit" variant="contained" disabled={busy || !email}>
            {busy ? 'Đang gửi…' : 'Gửi link đăng nhập'}
          </Button>
        </Stack>
        {import.meta.env.DEV && (
          <Alert severity="info" sx={{ mt: 2.5, fontSize: 12 }}>
            <strong>Dev:</strong> chỉ email kết thúc bằng @viettours.com.vn được chấp nhận. Cần Firebase Console "Email link" đã bật và `localhost` (hoặc `viettoursdev.github.io`) trong Authorized domains.
          </Alert>
        )}
      </Paper>
    </Box>
  );
}
```

- [ ] **Step 2: Find and remove password field from `UserManagementModal` (Phase 2 cleanup)**

In `src/components/admin/UserManagementModal.tsx`:

- Remove `p: form.p` line from the `newUser` object inside `handleSave`. Replace with `p: editingId ? users.find((x) => x.u === editingId)?.p ?? '' : ''` (preserves any legacy password for existing users; new users get empty string).
- Remove the password input (the second `<TextField>` in the row at lines 139-145) and turn the username row into a single full-width field.
- Remove the `if (!form.p.trim()) { window.alert('Vui lòng nhập Mật khẩu'); return; }` line from `handleSave`.
- Remove `· MK: {'•'.repeat(usr.p.length)}` from the user-row caption.

Show the exact replacement of `handleSave`:

```ts
const handleSave = () => {
  if (!form.u.trim()) { window.alert('Vui lòng nhập Username'); return; }
  if (!form.name.trim()) { window.alert('Vui lòng nhập Tên hiển thị'); return; }
  const email = form.email.trim().toLowerCase();
  if (!email) { window.alert('Vui lòng nhập Email công ty'); return; }
  if (!email.endsWith('@viettours.com.vn')) {
    window.alert('Email phải kết thúc bằng @viettours.com.vn');
    return;
  }
  const username = form.u.trim().toLowerCase();
  if (!editingId && users.some((x) => x.u === username)) {
    window.alert('Username này đã tồn tại');
    return;
  }
  if (users.some((x) => x.u !== editingId && (x.email ?? '').toLowerCase() === email)) {
    window.alert('Email này đã được dùng cho tài khoản khác');
    return;
  }
  const legacyPassword = editingId ? users.find((x) => x.u === editingId)?.p ?? '' : '';
  const newUser: User = {
    u: username,
    email,
    p: legacyPassword,
    name: form.name.trim(),
    role: form.role,
    color: form.color,
  };
  const next = editingId
    ? users.map((x) => (x.u === editingId ? newUser : x))
    : [...users, newUser];
  persist(next);
  setShowForm(false);
  setEditingId(null);
};
```

Update the form row that previously had Username + Password to be just Username (full width):

```tsx
<Stack direction="row" spacing={1.5}>
  <TextField
    label="Username"
    value={form.u}
    onChange={(e) => setF('u', e.target.value)}
    disabled={!!editingId}
    size="small" fullWidth
    placeholder="vd: sale4"
  />
</Stack>
```

Update the user-row caption to:

```tsx
<Typography variant="caption" color="text.secondary">
  @{usr.u} · {usr.email ?? <Box component="span" sx={{ color: '#dc3250', fontWeight: 700 }}>Chưa có email — không thể đăng nhập</Box>}
</Typography>
```

(Same as Phase 1 — the "· MK:" segment was added back inadvertently earlier; this is the final shape.)

- [ ] **Step 3: Find other callers of removed APIs**

```bash
grep -rn "useAuthStore\.\|login(" src/components src/stores --include="*.ts" --include="*.tsx" | grep -v test
```

Expected: no references to `.login(` outside the test file (which we already rewrote). If anything turns up, fix or remove it.

- [ ] **Step 4: Wire `init()` at app startup**

Open `src/components/shell/MainApp.tsx` (or wherever the app initially calls `useAuthStore.getState().init()` — find it):

```bash
grep -rn "authStore.*init\|useAuthStore.*init" src/components --include="*.tsx" | head
```

If the call sites pass a `user: User` argument (old API), update them to call `init()` with no args. Show the diff:

```diff
- useAuthStore.getState().init(currentUser);
+ void useAuthStore.getState().init();
```

The `void` keyword is because `init()` is now async and we don't await it at the call site.

- [ ] **Step 5: Run typecheck + lint + tests + dev**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: all green.

```bash
npm run dev
```

Open `http://localhost:5173/tour-cost-calculator/` in a private/incognito window. Verify:
- The login screen shows an email field, not username/password.
- Submitting `attacker@gmail.com` shows "Vui lòng dùng email công ty (@viettours.com.vn)".
- Submitting `ceo@viettours.com.vn` flips to the "Đã gửi link đăng nhập" panel (the actual email **will fail to send** because Firebase Console hasn't enabled email-link sign-in yet — that's Task 2.8).
- The "Đổi email" button returns to the form.

Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/shell/LoginScreen.tsx src/components/admin/UserManagementModal.tsx
# also commit any MainApp/init wiring change
git add -p src/components/shell/  # stage any init() call-site update
git commit -m "$(cat <<'EOF'
feat(auth): magic-link login UI

Replaces username/password login with the email-link flow described in
the spec. Three states: form, sent-confirmation, cross-device.
Also removes the password field from UserManagementModal — Firebase Auth
takes over identity and the local p field is legacy until Phase 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2.7: Write `docs/firebase-setup.md`

**Files:**
- Create: `docs/firebase-setup.md`

- [ ] **Step 1: Create the file**

```markdown
# Firebase Console — one-time setup for email-link auth

These steps must be done in the Firebase Console (https://console.firebase.google.com → project **viettours-cost-calculator**) before Phase 2 ships and again any time a new deploy URL is added.

## 1. Enable Email-link sign-in

1. **Authentication → Sign-in method**.
2. Click **Email/Password**.
3. Toggle **Email/Password** ON if it isn't already.
4. Toggle **Email link (passwordless sign-in)** ON.
5. **Save**.

## 2. Add authorized domains

1. **Authentication → Settings → Authorized domains**.
2. Add `viettoursdev.github.io` (the GH Pages domain). `localhost` should already be present.
3. **Save**.

## 3. Customize the sign-in email (Vietnamese)

1. **Authentication → Templates → Email address sign-in**.
2. Click **edit** (✏️).
3. **Sender name:** `Viettours`.
4. **Subject:** `Đăng nhập hệ thống Viettours`.
5. **Message:** preserve the `%LINK%` placeholder; replace the boilerplate with Vietnamese copy approximately like:

   ```
   Chào,

   Bấm vào liên kết bên dưới để đăng nhập vào hệ thống tính chi phí tour Viettours:

   %LINK%

   Nếu bạn không yêu cầu link này, hãy bỏ qua email này.

   — Viettours
   ```
6. **Save**.

## 4. Verification

After deploying Phase 2:
1. Open the deployed app in an incognito window.
2. Enter the CEO's `@viettours.com.vn` email.
3. The CEO opens the inbox, clicks the link.
4. The app should sign them in and show the main UI.

If the link returns to a blank page or the app shows "Link đăng nhập đã hết hạn", check:
- Email-link sign-in is enabled (step 1).
- `viettoursdev.github.io` is in Authorized domains (step 2).
```

- [ ] **Step 2: Commit**

```bash
git add docs/firebase-setup.md
git commit -m "$(cat <<'EOF'
docs(firebase): one-time Console setup for email-link auth

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2.8: Firebase Console setup (manual, blocking)

- [ ] **Step 1: Complete every step in `docs/firebase-setup.md` against the production Firebase project**

This is a manual action in the Firebase Console. **Do not merge Phase 2 to `main` until this is done** — the moment the build deploys, password login is gone, and users won't be able to sign in if email-link isn't enabled.

---

## Task 2.9: Final verification + merge phase 2

- [ ] **Step 1: Full CI gate locally**

```bash
npm run lint && npm test && npm run typecheck && npm run build
```

Expected: all four pass.

- [ ] **Step 2: Push**

```bash
git push -u origin phase-2-magic-link
```

- [ ] **Step 3: Smoke test on a deploy preview**

Either trigger a manual deploy via `gh workflow run deploy.yml` (against the branch) or merge to `main` and let CI deploy. The risk window for "users locked out" is small if Console setup is done. CEO smoke-tests:

1. Open the deployed app, enter `ceo@viettours.com.vn`.
2. Receive the email, click the link.
3. App signs in, main UI appears.
4. Sign out, repeat from a different device — confirm the cross-device flow asks for email re-entry.

- [ ] **Step 4: Fast-forward merge to main and push**

```bash
git checkout main
git pull --ff-only origin main
git merge --ff-only phase-2-magic-link
git push origin main
git branch -d phase-2-magic-link
git push origin --delete phase-2-magic-link
```

**Stop here and let the team transition (a day or two) before tightening Firestore rules. Anyone who hasn't received their magic link yet still works because rules are open.**

---

# Phase 3 — Tighten Firestore rules

Goal: anonymous/external clients cannot read or write any Firestore data. This is the phase that actually delivers the security guarantee.

## Task 3.1: Create the phase-3 feature branch

- [ ] **Step 1: Branch from main**

```bash
git checkout main
git pull --ff-only origin main
git checkout -b phase-3-rules-lockdown
```

---

## Task 3.2: Snapshot the current rules into `firestore.rules.previous`

**Why:** rollback path. If Phase 3 breaks something, we need to redeploy exactly what was running before.

- [ ] **Step 1: Open Firebase Console → Firestore Database → Rules tab**

Copy the entire current rules text verbatim.

- [ ] **Step 2: Create `firestore.rules.previous` with that exact content**

Open Write tool on `firestore.rules.previous` and paste the snapshot. This file is committed but never deployed.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules.previous
git commit -m "$(cat <<'EOF'
chore(rules): snapshot pre-lockdown Firestore rules for rollback

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3.3: Create `firestore.rules` and `firebase.json`

**Files:**
- Create: `firestore.rules`
- Create: `firebase.json`

- [ ] **Step 1: Write `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  // The {database} placeholder is required by the rules syntax. Database
  // scoping to `viettours` is done in firebase.json — this rules file is
  // applied only to the `viettours` Firestore database.
  match /databases/{database}/documents {

    function isEmployee() {
      return request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.email.lower().matches('.*@viettours[.]com[.]vn$');
    }

    // Shared single-doc collections.
    match /viettours/{docId}             { allow read, write: if isEmployee(); }
    // Per-quote project documents.
    match /quote_projects/{id}           { allow read, write: if isEmployee(); }
    match /dmc_quote_projects/{id}       { allow read, write: if isEmployee(); }
    // Per-user notification queue.
    match /user_notifications/{username} { allow read, write: if isEmployee(); }

    // Default deny everything else.
    match /{document=**} { allow read, write: if false; }
  }
}
```

- [ ] **Step 2: Write `firebase.json`**

```json
{
  "firestore": [
    {
      "database": "viettours",
      "rules": "firestore.rules"
    }
  ]
}
```

The array form is required because `viettours` is a non-default Firestore database.

- [ ] **Step 3: Verify the rules syntactically by deploying to the Firebase Rules Playground**

Either:
- (a) Use Firebase CLI: `npx firebase-tools deploy --only firestore:rules --project viettours-cost-calculator --dry-run` (requires `firebase login` once locally), or
- (b) Open the Firebase Console → Firestore → Rules tab, paste the new rules into the editor, click **Run** in the Playground to dry-run a sample read with no auth (should be denied) and with a mock `viettours.com.vn` token (should be allowed).

If (a) errors with "Database 'viettours' not found": check the spelling matches the actual Firestore database name (case-sensitive).

- [ ] **Step 4: Commit**

```bash
git add firestore.rules firebase.json
git commit -m "$(cat <<'EOF'
feat(rules): require @viettours.com.vn auth for all Firestore access

Locks down every collection to authenticated employees with a verified
@viettours.com.vn email. Anonymous and external-domain clients get
permission-denied on every read and write.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3.4: Deploy the rules

- [ ] **Step 1: Deploy via Firebase CLI**

```bash
npx firebase-tools deploy --only firestore:rules --project viettours-cost-calculator
```

(or paste `firestore.rules` content into the Console **Firestore → Rules → Publish** if the CLI is not set up).

Expected: "✔  firestore: deployed rules to cloud.firestore (viettours)".

- [ ] **Step 2: Verify in an incognito browser window — the security-critical check**

Open `https://viettoursdev.github.io/tour-cost-calculator/` in a new incognito window. You should:
- See the login screen.
- See no other data anywhere.
- In DevTools → Network, any Firestore request attempted by the unauthenticated app should respond with status `403` or a Firestore SDK `permission-denied` error.

To go further: open DevTools → Console and run a raw Firestore probe:

```js
// Paste in DevTools console on the deployed page (no auth):
const { getFirestore, doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js');
const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js');
const app = initializeApp({
  apiKey: 'AIzaSyAL-pifSBDDrbek3s2uwkeIYw5Y1GZO9Iw',
  authDomain: 'viettours-cost-calculator.firebaseapp.com',
  projectId: 'viettours-cost-calculator',
});
const db = getFirestore(app, 'viettours');
try {
  const snap = await getDoc(doc(db, 'viettours', 'user_accounts'));
  console.log('LEAK:', snap.data());
} catch (e) {
  console.log('OK, denied:', e.code, e.message);
}
```

Expected: `OK, denied: permission-denied …`. If you see `LEAK: ...`, **rules are not active** — investigate before continuing.

- [ ] **Step 3: Verify the deployed app still works for the CEO**

Log in via the email link in another browser window. Confirm:
- Dashboard loads.
- Quotes/contracts/customers all visible.
- Editing a quote saves successfully (proves writes still pass for authenticated users).

- [ ] **Step 4: If something is broken, roll back**

Redeploy the snapshot:

```bash
# Temporarily restore the previous rules:
cp firestore.rules.previous firestore.rules
npx firebase-tools deploy --only firestore:rules --project viettours-cost-calculator
# Then revert the cp:
git checkout firestore.rules
```

Or paste `firestore.rules.previous` into the Console manually and publish. Investigate, fix, redeploy.

---

## Task 3.5: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the "Key Design Decisions" block (around line 79)**

Replace this paragraph:

```
**No Firebase Auth.** Custom username/password in Firestore (`viettours/user_accounts`). Passwords plaintext (internal tool). `authStore.login()` calls `init()` to sync users before checking credentials.
```

with:

```
**Firebase Auth — email-link only.** Sign-in uses `sendSignInLinkToEmail` restricted to `@viettours.com.vn`. The local `User.email` field maps the verified Firebase Auth identity to the existing `user_accounts` record (username stays canonical). `authStore.init()` completes any in-flight magic link and subscribes via `onIdTokenChanged`. Legacy plaintext `User.p` is unused and slated for removal in Phase 4 cleanup.
```

- [ ] **Step 2: Replace the "Open rules required" section (around line 101-107) with a pointer to the rules file**

Replace:

```
Open rules required for these paths (apply manually in Firebase Console):

\`\`\`
match /user_notifications/{username} { allow read, write: if true; }
match /dmc_quote_projects/{quoteId}  { allow read, write: if true; }
\`\`\`
```

with:

```
Firestore rules live in `firestore.rules` (root). Deploy with `npx firebase-tools deploy --only firestore:rules`. Every collection requires `request.auth.token.email_verified` plus a `@viettours.com.vn` email — anonymous clients are denied across the board.
```

- [ ] **Step 3: Add an entry to the localStorage Keys table (around line 124-134)**

Add:

```
| `vte_pending_signin_email` | Email a magic-link was sent to (cleared on completion) (`authStore`) |
```

And **remove** the `vte_s` row, since Firebase Auth replaces sessionStorage.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(claude): reflect email-link auth and locked Firestore rules

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3.6: Final verification + merge phase 3

- [ ] **Step 1: Full CI gate locally**

```bash
npm run lint && npm test && npm run typecheck && npm run build
```

Expected: all four pass.

- [ ] **Step 2: Push and fast-forward merge to main**

```bash
git push -u origin phase-3-rules-lockdown
git checkout main
git pull --ff-only origin main
git merge --ff-only phase-3-rules-lockdown
git push origin main
git branch -d phase-3-rules-lockdown
git push origin --delete phase-3-rules-lockdown
```

- [ ] **Step 3: Final production-incognito check**

Repeat the Task 3.4 / Step 2 incognito leak probe one more time after the merge has deployed. The deployed bundle no longer matters for security (rules are server-side), but the check confirms the post-merge state is correct.

---

# Done

What you should have at this point:

- Every authenticated session starts from a verified `@viettours.com.vn` email link.
- Every Firestore read and write fails with `permission-denied` for any unauthenticated or off-domain client.
- The Phase 1 / 2 / 3 commits on `main` are each independently revertible.
- `CLAUDE.md` reflects the new model.
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` are all still green.

What you should NOT have done (per spec, deferred to Phase 4):

- Rotated the Firebase API key.
- Removed `User.p` from the type or the live `viettours/user_accounts` document.
- Built rule unit tests with `@firebase/rules-unit-testing`.
- Added per-role Firestore enforcement (custom claims).

These are the natural follow-ups; track them separately.
