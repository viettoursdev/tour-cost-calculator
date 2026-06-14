# Remember Email on Login Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the last successfully-used email address on the login screen so returning users don't retype it.

**Architecture:** A tiny `rememberedEmail` helper module owns one localStorage key (`vte_remembered_email`) — read and normalized-write. `LoginScreen` seeds its `email` `useState` from the helper on mount and writes back after any of the three successful sign-in actions (new link, cross-device, DEV password). No checkbox, no "forget me" — just persist last-used; sign-out does not clear it (the point of remembering).

**Tech Stack:** TypeScript strict · React 18 · MUI v6 · Vitest 2.

---

## File Structure

| Path | Status | Responsibility |
|------|--------|----------------|
| `src/auth/rememberedEmail.ts` | Create | LS-backed `getRememberedEmail` / `setRememberedEmail` (normalize: trim+lowercase; empty input removes the key) |
| `src/auth/rememberedEmail.test.ts` | Create | Unit tests for both helpers |
| `src/components/shell/LoginScreen.tsx` | Modify | Seed `email` state from the helper on mount; write back after every successful sign-in action |
| `CLAUDE.md` | Modify | Add the new LS key row |

This mirrors the `sessionTimeout.ts` pattern already in the codebase (small per-feature module under `src/auth/` plus a colocated test).

---

## Task 1: `rememberedEmail` helper module

**Files:**
- Create: `src/auth/rememberedEmail.ts`
- Test: `src/auth/rememberedEmail.test.ts`

API:
- `getRememberedEmail(): string | null` — returns the stored value as-is, or `null` if absent.
- `setRememberedEmail(email: string): void` — trims, lowercases, and stores. If the trimmed input is empty, removes the key instead (don't pollute LS with `""`).

- [ ] **Step 1.1: Write the failing tests**

Create `src/auth/rememberedEmail.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getRememberedEmail, setRememberedEmail } from './rememberedEmail';

beforeEach(() => {
  localStorage.clear();
});

describe('rememberedEmail', () => {
  it('returns null when nothing is stored', () => {
    expect(getRememberedEmail()).toBeNull();
  });

  it('round-trips an email', () => {
    setRememberedEmail('ceo@viettours.com.vn');
    expect(getRememberedEmail()).toBe('ceo@viettours.com.vn');
  });

  it('normalizes by trimming whitespace', () => {
    setRememberedEmail('  ceo@viettours.com.vn  ');
    expect(getRememberedEmail()).toBe('ceo@viettours.com.vn');
  });

  it('normalizes by lowercasing', () => {
    setRememberedEmail('CEO@Viettours.COM.VN');
    expect(getRememberedEmail()).toBe('ceo@viettours.com.vn');
  });

  it('empty string removes the stored value', () => {
    setRememberedEmail('ceo@viettours.com.vn');
    setRememberedEmail('');
    expect(getRememberedEmail()).toBeNull();
  });

  it('whitespace-only input removes the stored value', () => {
    setRememberedEmail('ceo@viettours.com.vn');
    setRememberedEmail('   ');
    expect(getRememberedEmail()).toBeNull();
  });

  it('uses the LS key "vte_remembered_email"', () => {
    setRememberedEmail('ceo@viettours.com.vn');
    expect(localStorage.getItem('vte_remembered_email')).toBe('ceo@viettours.com.vn');
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `npx vitest run src/auth/rememberedEmail.test.ts`
Expected: FAIL — cannot resolve `./rememberedEmail`.

- [ ] **Step 1.3: Implement the module**

Create `src/auth/rememberedEmail.ts`:

```ts
const LS_KEY = 'vte_remembered_email';

export function getRememberedEmail(): string | null {
  return localStorage.getItem(LS_KEY);
}

export function setRememberedEmail(email: string): void {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    localStorage.removeItem(LS_KEY);
    return;
  }
  localStorage.setItem(LS_KEY, normalized);
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `npx vitest run src/auth/rememberedEmail.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 1.5: Run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 1.6: Commit**

```bash
git add src/auth/rememberedEmail.ts src/auth/rememberedEmail.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): add rememberedEmail helper for login screen prefill

Single-key localStorage helper. Trims and lowercases on write,
removes the key when the input is empty so we never store "".

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Wire `rememberedEmail` into `LoginScreen`

**Files:**
- Modify: `src/components/shell/LoginScreen.tsx`

Two surgical changes:
1. Initialize `email` state from `getRememberedEmail()` (currently `useState('')`).
2. After each successful sign-in action, persist the trimmed email back. The three actions are `submitNewLink`, `submitCrossDevice`, `submitPassword`. All three already call `useAuthStore.getState().<action>(email.trim(), ...)` and check `out.ok`.

- [ ] **Step 2.1: Add the import**

In `src/components/shell/LoginScreen.tsx`, find the existing line:

```ts
import { useAuthStore } from '@/stores/authStore';
```

Add immediately below it:

```ts
import { getRememberedEmail, setRememberedEmail } from '@/auth/rememberedEmail';
```

- [ ] **Step 2.2: Seed the `email` state from LS**

In `src/components/shell/LoginScreen.tsx`, replace:

```ts
  const [email, setEmail] = useState('');
```

with:

```ts
  const [email, setEmail] = useState(() => getRememberedEmail() ?? '');
```

The function form runs only on mount, so we don't pay the LS read on every render.

- [ ] **Step 2.3: Persist on each successful sign-in**

In `src/components/shell/LoginScreen.tsx`, find:

```ts
  async function submitNewLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const out = await useAuthStore.getState().requestSignInLink(email.trim());
    setBusy(false);
    if (!out.ok) setErr(out.error);
    else setCooldown(RESEND_SECONDS);
  }
```

Replace with:

```ts
  async function submitNewLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const out = await useAuthStore.getState().requestSignInLink(email.trim());
    setBusy(false);
    if (!out.ok) {
      setErr(out.error);
      return;
    }
    setRememberedEmail(email);
    setCooldown(RESEND_SECONDS);
  }
```

In the same file, find:

```ts
  async function submitCrossDevice(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const out = await useAuthStore.getState().completeCrossDeviceSignIn(email.trim());
    setBusy(false);
    if (!out.ok) setErr(out.error);
  }
```

Replace with:

```ts
  async function submitCrossDevice(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const out = await useAuthStore.getState().completeCrossDeviceSignIn(email.trim());
    setBusy(false);
    if (!out.ok) {
      setErr(out.error);
      return;
    }
    setRememberedEmail(email);
  }
```

And find:

```ts
  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const out = await useAuthStore.getState().signInWithPassword(email.trim(), password);
    setBusy(false);
    if (!out.ok) setErr(out.error);
  }
```

Replace with:

```ts
  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const out = await useAuthStore.getState().signInWithPassword(email.trim(), password);
    setBusy(false);
    if (!out.ok) {
      setErr(out.error);
      return;
    }
    setRememberedEmail(email);
  }
```

- [ ] **Step 2.4: Verify typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 2.5: Manual smoke (dev server)**

Run: `npm run dev` and open the app.

Verification checklist (do all three):

1. **Initial empty state** — open in a fresh browser profile (or clear LS). Email field is empty.
2. **Persist after magic-link request** — type `ceo@viettours.com.vn`, click "Gửi link đăng nhập". Confirm `localStorage.vte_remembered_email === 'ceo@viettours.com.vn'`. Reload the page — email field prefilled.
3. **Persist after DEV password sign-in** — clear LS, expand the DEV panel, enter a valid Firebase email + password, sign in. After success, confirm `localStorage.vte_remembered_email` is set. Sign out, return to login screen — email is prefilled.
4. **Failed sign-in does NOT update** — clear LS, type `bad@external.com`, click "Gửi link đăng nhập" — domain validation should reject. Confirm `localStorage.vte_remembered_email` is still absent. (Failed attempts must NOT persist the email — that's why `setRememberedEmail` is gated behind `if (!out.ok) return;`.)

If any of the four fails, stop and debug before committing.

- [ ] **Step 2.6: Commit**

```bash
git add src/components/shell/LoginScreen.tsx
git commit -m "$(cat <<'EOF'
feat(login): remember the last successfully-used email

Seed the email input from vte_remembered_email on mount; persist back
after any successful sign-in (link, cross-device, DEV password).
Failed attempts do not update the stored value.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Document in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 3.1: Add the new localStorage row**

In `CLAUDE.md`, find the `## localStorage Keys` table and the existing row:

```markdown
| `vte_pending_signin_email` | Email a magic link was sent to (`authStore`, cleared on completion) |
```

Add immediately below it:

```markdown
| `vte_remembered_email` | Last successfully-used email, used to prefill the login screen (`rememberedEmail`). Never cleared on sign-out. |
```

- [ ] **Step 3.2: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(claude): document vte_remembered_email LS key

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
