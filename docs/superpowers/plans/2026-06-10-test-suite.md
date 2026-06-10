# Test Suite for Business Logic — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Vitest-based unit test suite covering every non-UI logic module in `src/` (15 Zustand stores, `lib/` utilities, `auth/` permissions, quote calc), with CI gating between lint and typecheck.

**Architecture:** Vitest + jsdom env. Tests co-located next to source (`*.test.ts`). Shared helpers in `src/test/` (jsdom polyfills, store reset, firebase stub). Each store test mocks `@/lib/firebase` via `vi.mock` with an async factory that re-exports the shared stub.

**Tech Stack:** Vitest 2.x, jsdom 25.x, TypeScript 5 (strict), existing Zustand 4 / React 18 / Firebase 10 surface.

**Spec:** `docs/superpowers/specs/2026-06-10-test-suite-design.md`

---

## File Map

**New files:**
- `vitest.config.ts` — Vitest config (jsdom env, path alias, setup file).
- `src/test/setup.ts` — Storage cleanup + global polyfills.
- `src/test/storeReset.ts` — Helper to snapshot+restore Zustand initial state.
- `src/test/firebaseStub.ts` — vi.fn() stubs for every export of `@/lib/firebase` used by tests.
- 24 test files (see Tasks 6-30) co-located with their sources.

**Modified files:**
- `package.json` — Add devDeps (`vitest`, `@vitest/coverage-v8`-optional-later, `jsdom`); add `test` + `test:watch` scripts.
- `tsconfig.json` — Add `vitest/globals` and `@testing-library/jest-dom`-not-needed; verify `types: ["vite/client", "vitest/globals"]`.
- `.github/workflows/deploy.yml` — Add `npm test` step between lint and typecheck.

**Out of scope (per spec):**
- `src/lib/exports/*` — PDF/DOCX/Excel generators (output-heavy, low ROI).
- All React components (UI tests not in scope).

---

## Conventions

- TDD note: most "tests" here verify pre-existing logic, so the TDD loop becomes (1) write test, (2) run, (3) if green commit, if red decide whether test or code is wrong. When the test reveals a real bug, file it but **don't fix code in this plan** — the goal is coverage, not bug hunting. Pin the current (possibly buggy) behavior with a clearly-named test (e.g. `it('TODO bug: returns null when X')`) and move on.
- One commit per task unless noted. Conventional Commits: `test(<scope>): …`.
- Commands run from repo root: `/Users/vitahoang/Code/tour-cost-calculator`.

---

## Task 1: Install Vitest + jsdom

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install devDeps**

```bash
npm install --save-dev vitest@^2.1.0 jsdom@^25.0.0
```

Expected: `package.json` gains both entries under `devDependencies`. No prod-deps changed.

- [ ] **Step 2: Add npm scripts to package.json**

Edit `package.json` `scripts` block:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -p tsconfig.json --noEmit && vite build",
  "preview": "vite preview",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "lint": "eslint . --ext ts,tsx --max-warnings 0",
  "format": "prettier --write \"src/**/*.{ts,tsx,css}\"",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Verify install**

```bash
npx vitest --version
```

Expected: prints `vitest/2.x.y`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(test): install vitest and jsdom"
```

---

## Task 2: Vitest config + setup file

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Write vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    css: false,
  },
});
```

- [ ] **Step 2: Write src/test/setup.ts**

```ts
import { afterEach } from 'vitest';

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
```

- [ ] **Step 3: Smoke test — create a throwaway test**

Create `src/test/setup.smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('vitest setup', () => {
  it('runs in jsdom and has localStorage', () => {
    localStorage.setItem('k', 'v');
    expect(localStorage.getItem('k')).toBe('v');
  });
});
```

- [ ] **Step 4: Run smoke test**

```bash
npm test
```

Expected: `1 passed`. If "Cannot find module 'jsdom'" → re-run `npm install`.

- [ ] **Step 5: Delete smoke test**

```bash
rm src/test/setup.smoke.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts src/test/setup.ts
git commit -m "chore(test): add vitest config and jsdom setup"
```

---

## Task 3: Store-reset helper

**Files:**
- Create: `src/test/storeReset.ts`

- [ ] **Step 1: Write storeReset.ts**

```ts
/**
 * Snapshot a Zustand store's initial state for restoration between tests.
 *
 * Use ONCE per test file at module top level, BEFORE any test mutates the store:
 *
 *   import { snapshotInitial } from '@/test/storeReset';
 *   import { useFooStore } from './fooStore';
 *   const reset = snapshotInitial(useFooStore);
 *   beforeEach(reset);
 *
 * Snapshot is deep-cloned via structuredClone so nested arrays/objects don't
 * leak mutations from prior tests.
 */
export function snapshotInitial<T>(store: {
  getState: () => T;
  setState: (s: T, replace: boolean) => void;
}): () => void {
  const initial = structuredClone(store.getState()) as T;
  return () => {
    store.setState(structuredClone(initial) as T, true);
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/test/storeReset.ts
git commit -m "chore(test): add store-reset helper"
```

---

## Task 4: Firebase stub module

**Files:**
- Create: `src/test/firebaseStub.ts`

**Context:** Stores import named functions from `@/lib/firebase` (e.g. `fbSaveQuote`, `fbSubscribeNcc`, `generateQuoteCode`). The stub replaces them with `vi.fn()`s that tests can override per-case via `vi.mocked(fn).mockResolvedValue(...)`. The list below mirrors the exports actually consumed by stores in scope — add more if a future test needs them.

- [ ] **Step 1: Write firebaseStub.ts**

```ts
import { vi } from 'vitest';

// Real `db` is a Firestore instance; tests don't use it, so a placeholder is enough.
export const db = {};

// ── Users ──
export const fbPullUsers = vi.fn(async () => []);
export const fbPushUsers = vi.fn(async () => {});

// ── Rate card ──
export const fbPullMasterRC = vi.fn(async () => null);
export const fbPushMasterRC = vi.fn(async () => 'stub-id');
export const fbSubscribeMasterRC = vi.fn(() => () => {});

// ── Quote codes ──
export const generateQuoteCode = vi.fn(() => 'TEST-QUOTE-CODE');

// ── Regular quote project ──
export const fbSubscribeQuoteHistory = vi.fn(() => () => {});
export const fbSaveQuote = vi.fn(async (entry: unknown) => entry);
export const fbSaveQuoteState = vi.fn(async () => {});
export const fbDeleteQuote = vi.fn(async () => {});
export const fbUpdateCollaborators = vi.fn(async () => {});
export const fbGetQuoteProject = vi.fn(async () => null);

// ── DMC quote project ──
export const fbSubscribeDMCQuoteHistory = vi.fn(() => () => {});
export const fbSaveDMCQuote = vi.fn(async (entry: unknown) => entry);
export const fbSaveDMCQuoteState = vi.fn(async () => {});
export const fbDeleteDMCQuote = vi.fn(async () => {});
export const fbUpdateDMCCollaborators = vi.fn(async () => {});
export const fbGetDMCQuoteProject = vi.fn(async () => null);

// ── Customers ──
export const fbSubscribeCustomers = vi.fn(() => () => {});
export const fbPushCustomers = vi.fn(async () => {});

// ── NCC ──
export const fbSubscribeNcc = vi.fn(() => () => {});
export const fbPushNcc = vi.fn(async () => {});

// ── Contracts ──
export const fbSubscribeContracts = vi.fn(() => () => {});
export const fbGetContracts = vi.fn(async () => []);
export const fbPushContracts = vi.fn(async () => {});

// ── Notifications ──
export const fbSendNotification = vi.fn(async () => {});
export const fbSubscribeNotifications = vi.fn(() => () => {});
export const fbPushNotifications = vi.fn(async () => {});

// ── Payments ──
export const fbSaveTourPayments = vi.fn(async () => {});
export const fbSubscribeTourPayments = vi.fn(() => () => {});
export const fbSetApprovalStage = vi.fn(async () => {});
export const fbSubscribePaymentApprovals = vi.fn(() => () => {});

// ── Itinerary / Restaurant / Menu / Visa ──
export const fbSaveItinerary = vi.fn(async () => {});
export const fbGetItinerary = vi.fn(async () => null);
export const fbDeleteItinerary = vi.fn(async () => {});
export const fbSubscribeItineraries = vi.fn(() => () => {});

export const fbSubscribeRestaurants = vi.fn(() => () => {});
export const fbSaveRestaurants = vi.fn(async () => {});

export const fbSaveMenu = vi.fn(async () => {});
export const fbGetMenu = vi.fn(async () => null);
export const fbDeleteMenu = vi.fn(async () => {});
export const fbSubscribeMenus = vi.fn(() => () => {});

export const fbSubscribeVisaProducts = vi.fn(() => () => {});
export const fbSaveVisaProducts = vi.fn(async () => {});

export const fbSaveVisaProc = vi.fn(async () => {});
export const fbGetVisaProc = vi.fn(async () => null);
export const fbDeleteVisaProc = vi.fn(async () => {});
export const fbSubscribeVisaProcs = vi.fn(() => () => {});
```

- [ ] **Step 2: Document the per-test-file mock pattern**

Add a top-of-file comment to remind future contributors how to wire this in. Already included above as a JSDoc on the `db` line — keep it.

Each store test file will start with:

```ts
vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));
```

This pattern is fine inside vitest because `vi.mock` accepts an async factory whose body can return a dynamic import. The factory is hoisted, but the import inside is evaluated lazily.

- [ ] **Step 3: Commit**

```bash
git add src/test/firebaseStub.ts
git commit -m "chore(test): add firebase module stub"
```

---

## Task 5: Verify foundation by running suite

- [ ] **Step 1: Run suite (expect 0 tests)**

```bash
npm test
```

Expected output: "No test files found" OR exit 0 with 0 tests reported. Either is acceptable — confirms the runner starts cleanly.

If "No test files found" causes a non-zero exit, add `passWithNoTests: true` to `vitest.config.ts` `test` block. Re-run.

- [ ] **Step 2: Commit if you changed config**

```bash
# only if vitest.config.ts changed
git add vitest.config.ts
git commit -m "chore(test): allow empty test run"
```

---

# Pure-logic tests (no Firebase needed)

## Task 6: lib/currency tests

**Files:**
- Source: `src/lib/currency.ts` (no edits)
- Create: `src/lib/currency.test.ts`

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect } from 'vitest';
import { toOutputCurrency, fmtCurrency, fmtOutput } from './currency';

describe('toOutputCurrency', () => {
  it('returns VND unchanged when target is VND', () => {
    expect(toOutputCurrency(1_000_000, 'VND', { USD: 25_000 })).toBe(1_000_000);
  });

  it('returns VND unchanged when target rate is missing', () => {
    expect(toOutputCurrency(1_000_000, 'USD', {})).toBe(1_000_000);
  });

  it('divides by rate when target rate is present', () => {
    expect(toOutputCurrency(1_000_000, 'USD', { USD: 25_000 })).toBe(40);
  });
});

describe('fmtCurrency', () => {
  it('formats VND with vi-VN grouping and ₫ suffix', () => {
    expect(fmtCurrency(1_234_567, 'VND')).toBe('1.234.567 ₫');
  });

  it('formats JPY with en-US grouping, no decimals, suffix', () => {
    expect(fmtCurrency(1_234_567, 'JPY')).toBe('1,234,567 JPY');
  });

  it('formats KRW with en-US grouping, no decimals, suffix', () => {
    expect(fmtCurrency(1_234_567, 'KRW')).toBe('1,234,567 KRW');
  });

  it('formats USD with 2 decimals + comma grouping + suffix', () => {
    expect(fmtCurrency(1234.5, 'USD')).toBe('1,234.50 USD');
  });
});

describe('fmtOutput', () => {
  it('returns em-dash when non-VND rate is missing', () => {
    expect(fmtOutput(1_000_000, 'USD', {})).toBe('—');
  });

  it('formats VND directly', () => {
    expect(fmtOutput(1_234_567, 'VND', {})).toBe('1.234.567 ₫');
  });

  it('converts then formats when rate is present', () => {
    expect(fmtOutput(1_000_000, 'USD', { USD: 25_000 })).toBe('40.00 USD');
  });
});
```

- [ ] **Step 2: Run**

```bash
npx vitest run src/lib/currency.test.ts
```

Expected: 10 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/currency.test.ts
git commit -m "test(lib): cover currency conversion and formatting"
```

---

## Task 7: lib/dateUtils tests

**Files:**
- Source: `src/lib/dateUtils.ts`
- Create: `src/lib/dateUtils.test.ts`

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect } from 'vitest';
import { calcEndDate, fmtDate } from './dateUtils';

describe('calcEndDate', () => {
  it('returns null when startDate is null', () => {
    expect(calcEndDate(null, 5)).toBeNull();
  });

  it('returns null when startDate is undefined', () => {
    expect(calcEndDate(undefined, 5)).toBeNull();
  });

  it('returns the same day when days = 1', () => {
    const end = calcEndDate('2026-06-10', 1);
    expect(end?.toISOString().slice(0, 10)).toBe('2026-06-10');
  });

  it('adds days - 1 to the start date', () => {
    const end = calcEndDate('2026-06-10', 5);
    expect(end?.toISOString().slice(0, 10)).toBe('2026-06-14');
  });

  it('clamps negative days to 0 (same day)', () => {
    const end = calcEndDate('2026-06-10', -3);
    expect(end?.toISOString().slice(0, 10)).toBe('2026-06-10');
  });
});

describe('fmtDate', () => {
  it('returns empty string for null', () => {
    expect(fmtDate(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(fmtDate(undefined)).toBe('');
  });

  it('formats vi-VN by default', () => {
    // vi-VN: dd/mm/yyyy
    expect(fmtDate('2026-06-10')).toMatch(/^10\/0?6\/2026$/);
  });

  it('formats en-GB when en=true', () => {
    // en-GB: dd/mm/yyyy too, but no leading zero variance — both should pass
    expect(fmtDate('2026-06-10', true)).toMatch(/^10\/0?6\/2026$/);
  });

  it('accepts a Date instance', () => {
    expect(fmtDate(new Date('2026-06-10'))).toMatch(/^10\/0?6\/2026$/);
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/lib/dateUtils.test.ts
```

Expected: 10 passing.

```bash
git add src/lib/dateUtils.test.ts
git commit -m "test(lib): cover date helpers"
```

---

## Task 8: lib/util tests

**Files:**
- Source: `src/lib/util.ts`
- Create: `src/lib/util.test.ts`

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce, applyPath } from './util';

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires once after the wait period', () => {
    const spy = vi.fn();
    const d = debounce(spy, 100);
    d('a');
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('a');
  });

  it('uses the latest args when called rapidly', () => {
    const spy = vi.fn();
    const d = debounce(spy, 100);
    d('a');
    d('b');
    d('c');
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('c');
  });

  it('resets the timer on each call', () => {
    const spy = vi.fn();
    const d = debounce(spy, 100);
    d('a');
    vi.advanceTimersByTime(50);
    d('b');
    vi.advanceTimersByTime(50); // total 100 from first call but only 50 from second
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('b');
  });
});

describe('applyPath', () => {
  it('sets a top-level key', () => {
    const result = applyPath({ a: 1 }, 'a', 2);
    expect(result).toEqual({ a: 2 });
  });

  it('sets a nested key', () => {
    const result = applyPath({ a: { b: { c: 1 } } }, 'a.b.c', 99);
    expect(result).toEqual({ a: { b: { c: 99 } } });
  });

  it('creates intermediate objects when missing', () => {
    const result = applyPath({}, 'a.b.c', 1);
    expect(result).toEqual({ a: { b: { c: 1 } } });
  });

  it('does not mutate the input', () => {
    const input = { a: { b: 1 } };
    applyPath(input, 'a.b', 99);
    expect(input).toEqual({ a: { b: 1 } });
  });

  it('overwrites a non-object intermediate', () => {
    const result = applyPath({ a: 5 }, 'a.b', 1);
    expect(result).toEqual({ a: { b: 1 } });
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/lib/util.test.ts
```

Expected: 8 passing.

```bash
git add src/lib/util.test.ts
git commit -m "test(lib): cover debounce and applyPath"
```

---

## Task 9: auth/PERMISSIONS tests

**Files:**
- Source: `src/auth/PERMISSIONS.ts`
- Create: `src/auth/PERMISSIONS.test.ts`

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect } from 'vitest';
import { PERMISSIONS, hasPerm } from './PERMISSIONS';
import type { User } from '@/types';

function user(role: User['role']): User {
  return { u: 'x', p: 'x', role, name: 'x', color: '#000' };
}

describe('hasPerm', () => {
  it('returns false for a null user', () => {
    expect(hasPerm(null, 'manageUsers')).toBe(false);
  });

  it('returns true for CEO manageUsers', () => {
    expect(hasPerm(user('CEO'), 'manageUsers')).toBe(true);
  });

  it('returns false for Trưởng Phòng manageUsers', () => {
    expect(hasPerm(user('Trưởng Phòng'), 'manageUsers')).toBe(false);
  });
});

describe('Admin role (view-only on history and contracts)', () => {
  const admin = user('Admin');
  it('can viewHistory', () => expect(hasPerm(admin, 'viewHistory')).toBe(true));
  it('can viewContracts', () => expect(hasPerm(admin, 'viewContracts')).toBe(true));
  it('cannot manageContracts', () => expect(hasPerm(admin, 'manageContracts')).toBe(false));
  it('cannot exportQuote', () => expect(hasPerm(admin, 'exportQuote')).toBe(false));
  it('cannot editRateCard', () => expect(hasPerm(admin, 'editRateCard')).toBe(false));
});

describe('Accountant role (history-only)', () => {
  const acc = user('Accountant');
  it('can viewHistory', () => expect(hasPerm(acc, 'viewHistory')).toBe(true));
  it('cannot viewContracts', () => expect(hasPerm(acc, 'viewContracts')).toBe(false));
  it('cannot exportQuote', () => expect(hasPerm(acc, 'exportQuote')).toBe(false));
  it('cannot editRateCard', () => expect(hasPerm(acc, 'editRateCard')).toBe(false));
});

describe('Standard role', () => {
  const std = user('Standard');
  it('has no perms', () => {
    const perms = PERMISSIONS.Standard;
    for (const v of Object.values(perms)) expect(v).toBe(false);
    expect(hasPerm(std, 'viewHistory')).toBe(false);
  });
});

describe('Permission matrix shape', () => {
  it('every role has every permission key', () => {
    const keys = Object.keys(PERMISSIONS.CEO);
    for (const role of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
      expect(Object.keys(PERMISSIONS[role]).sort()).toEqual(keys.sort());
    }
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/auth/PERMISSIONS.test.ts
```

Expected: 11 passing.

```bash
git add src/auth/PERMISSIONS.test.ts
git commit -m "test(auth): cover permission matrix and hasPerm"
```

---

## Task 10: auth/ROLES tests

**Files:**
- Source: `src/auth/ROLES.ts`
- Create: `src/auth/ROLES.test.ts`

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect } from 'vitest';
import { ROLES, DEFAULT_USERS, USER_COLORS } from './ROLES';

describe('ROLES', () => {
  it('matches the documented hierarchy order', () => {
    expect(ROLES).toEqual([
      'CEO',
      'Trưởng Phòng',
      'Sales',
      'Operations',
      'Marketing',
      'Admin',
      'Accountant',
      'Standard',
    ]);
  });
});

describe('DEFAULT_USERS', () => {
  it('has unique usernames', () => {
    const us = DEFAULT_USERS.map((u) => u.u);
    expect(new Set(us).size).toBe(us.length);
  });

  it('seeds at least one CEO', () => {
    expect(DEFAULT_USERS.some((u) => u.role === 'CEO')).toBe(true);
  });

  it('every seed has a role that exists in ROLES', () => {
    for (const u of DEFAULT_USERS) {
      expect(ROLES).toContain(u.role);
    }
  });

  it('every seed has a non-empty name and password', () => {
    for (const u of DEFAULT_USERS) {
      expect(u.name.trim().length).toBeGreaterThan(0);
      expect(u.p.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('USER_COLORS', () => {
  it('is a non-empty list of hex strings', () => {
    expect(USER_COLORS.length).toBeGreaterThan(0);
    for (const c of USER_COLORS) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/auth/ROLES.test.ts
git add src/auth/ROLES.test.ts
git commit -m "test(auth): cover ROLES, DEFAULT_USERS, USER_COLORS"
```

---

## Task 11: components/quote/calc tests (highest-value file)

**Files:**
- Source: `src/components/quote/calc.ts`
- Create: `src/components/quote/calc.test.ts`

**Context:** `computeTotals` is the core of the calculator. The legacy semantics are subtle (svcBasis applied before margin; Math.round on margin and VAT; Math.ceil on per-pax selling; grandTotal derived from roundedPPax × pax). Pin all of these.

- [ ] **Step 1: Write the tests**

> **TS note:** If strict mode complains about extra/missing fields on `Item` or `QuoteDraft`, open `src/types/` and add the required fields to the factory functions below. Don't widen the test inputs to `any` — keep them typed.

```ts
import { describe, it, expect } from 'vitest';
import { calcVND, catTotal, subtotal, computeTotals } from './calc';
import type { Item, QuoteDraft, CategoryId } from '@/types';
import { CATS } from './constants';

function item(over: Partial<Item> = {}): Item {
  return {
    id: 1,
    name: 'x',
    cur: 'VND',
    price: 100,
    times: 1,
    qtyMode: 'per_group',
    customQty: 1,
    enabled: true,
    foc: false,
    ...over,
  };
}

function emptyDraft(over: Partial<QuoteDraft> = {}): QuoteDraft {
  const catEnabled = Object.fromEntries(
    CATS.map((c) => [c.id, false]),
  ) as Record<CategoryId, boolean>;
  return {
    template: 'domestic',
    info: { name: '', dest: '', days: 1, nights: 0, startDate: null },
    pax: 20,
    rates: { USD: 25_000 },
    margin: 0,
    vat: 0,
    svcBasis: 0,
    rounding: 1,
    items: {},
    catEnabled,
    currentQuoteId: null,
    ...over,
  };
}

describe('calcVND', () => {
  it('returns 0 when item is disabled (enabled === false)', () => {
    expect(calcVND(item({ enabled: false, price: 999 }), {}, 10)).toBe(0);
  });

  it('treats undefined enabled as enabled (legacy parity)', () => {
    // delete enabled to simulate JSON-import missing field
    const it = item();
    delete (it as Partial<Item>).enabled;
    expect(calcVND(it as Item, {}, 10)).toBe(100);
  });

  it('returns 0 for FOC items', () => {
    expect(calcVND(item({ foc: true, price: 999 }), {}, 10)).toBe(0);
  });

  it('treats VND with no rate as rate=1', () => {
    expect(calcVND(item({ cur: 'VND', price: 1000 }), {}, 10)).toBe(1000);
  });

  it('converts USD price using provided rate', () => {
    expect(calcVND(item({ cur: 'USD', price: 100, times: 1 }), { USD: 25_000 }, 10))
      .toBe(2_500_000);
  });

  it('multiplies by pax for per_pax mode', () => {
    expect(calcVND(item({ qtyMode: 'per_pax', price: 100 }), {}, 5)).toBe(500);
  });

  it('uses customQty for custom mode', () => {
    expect(calcVND(item({ qtyMode: 'custom', customQty: 7, price: 100 }), {}, 99)).toBe(700);
  });

  it('uses 1 for per_group mode regardless of pax/customQty', () => {
    expect(calcVND(item({ qtyMode: 'per_group', customQty: 999, price: 100 }), {}, 99))
      .toBe(100);
  });

  it('multiplies by times', () => {
    expect(calcVND(item({ price: 100, times: 3 }), {}, 1)).toBe(300);
  });
});

describe('catTotal', () => {
  it('sums enabled items only', () => {
    const items = [
      item({ price: 100 }),
      item({ price: 200, enabled: false }),
      item({ price: 300 }),
    ];
    expect(catTotal(items, {}, 1)).toBe(400);
  });
});

describe('subtotal', () => {
  it('skips disabled categories', () => {
    const d = emptyDraft({
      items: { tour: [item({ price: 1000 })] } as QuoteDraft['items'],
      catEnabled: { ...emptyDraft().catEnabled, tour: false },
    });
    expect(subtotal(d)).toBe(0);
  });

  it('sums enabled categories', () => {
    const d = emptyDraft({
      items: {
        tour: [item({ price: 1000 })],
        food: [item({ price: 500 })],
      } as QuoteDraft['items'],
      catEnabled: { ...emptyDraft().catEnabled, tour: true, food: true },
    });
    expect(subtotal(d)).toBe(1500);
  });
});

describe('computeTotals — legacy semantics', () => {
  it('returns all zeros for an empty draft', () => {
    const t = computeTotals(emptyDraft());
    expect(t).toEqual({
      totalCost: 0,
      totalProfit: 0,
      totalVAT: 0,
      sellingPPax: 0,
      roundedPPax: 0,
      grandTotal: 0,
    });
  });

  it('applies svcBasis BEFORE margin (legacy order)', () => {
    // cost=0, svcBasis=1000, margin=10% → profit = round((0+1000)*0.10) = 100
    const d = emptyDraft({ pax: 1, svcBasis: 1000, margin: 10, vat: 0, rounding: 1 });
    expect(computeTotals(d).totalProfit).toBe(100);
  });

  it('VAT applies to (cost + svcBasis + profit)', () => {
    // cost=0, svcBasis=1000, margin=10 (profit=100), vat=8 → vat = round((0+1000+100)*0.08) = 88
    const d = emptyDraft({ pax: 1, svcBasis: 1000, margin: 10, vat: 8, rounding: 1 });
    expect(computeTotals(d).totalVAT).toBe(88);
  });

  it('rounds per-pax selling price up (Math.ceil) to nearest rounding step', () => {
    // cost=10_001, pax=1, no svc/margin/vat → sellingPPax = 10_001
    // rounding=100 → roundedPPax = ceil(10_001 / 100) * 100 = 10_100
    const d = emptyDraft({
      pax: 1,
      rounding: 100,
      items: { tour: [item({ price: 10_001 })] } as QuoteDraft['items'],
      catEnabled: { ...emptyDraft().catEnabled, tour: true },
    });
    expect(computeTotals(d).roundedPPax).toBe(10_100);
  });

  it('grandTotal = roundedPPax × pax', () => {
    const d = emptyDraft({
      pax: 10,
      rounding: 100,
      items: { tour: [item({ price: 1_001 })] } as QuoteDraft['items'],
      catEnabled: { ...emptyDraft().catEnabled, tour: true },
    });
    // cost=1001, pax=10, sellingPPax = 100.1, roundedPPax = ceil(100.1/100)*100 = 200
    // grandTotal = 200 * 10 = 2000
    expect(computeTotals(d).grandTotal).toBe(2000);
  });

  it('treats rounding=0 as 1 (no division by zero)', () => {
    const d = emptyDraft({ pax: 1, rounding: 0, items: {
      tour: [item({ price: 1234 })],
    } as QuoteDraft['items'], catEnabled: { ...emptyDraft().catEnabled, tour: true } });
    expect(computeTotals(d).roundedPPax).toBe(1234);
  });

  it('returns sellingPPax=0 when pax=0', () => {
    // Defensive: store should clamp to 1, but calc itself must not divide by zero.
    const d = emptyDraft({ pax: 0 });
    expect(computeTotals(d).sellingPPax).toBe(0);
  });
});
```

- [ ] **Step 2: Run**

```bash
npx vitest run src/components/quote/calc.test.ts
```

Expected: 18 passing. If a test fails, **read the source again before changing the test** — these assertions encode the documented legacy semantics. If the test reveals a divergence, file it but leave the test pinning current behavior with a `// TODO bug:` comment.

- [ ] **Step 3: Commit**

```bash
git add src/components/quote/calc.test.ts
git commit -m "test(quote): cover computeTotals legacy semantics"
```

---

## Task 12: components/quote/constants tests

**Files:**
- Source: `src/components/quote/constants.ts`
- Create: `src/components/quote/constants.test.ts`

- [ ] **Step 1: Inspect source first**

```bash
sed -n '1,80p' src/components/quote/constants.ts
```

Confirm exports: `TEMPLATES`, `CATS`, `DMC_CAT_IDS`, `RATES_INIT`, `mkItem`.

- [ ] **Step 2: Write the tests**

```ts
import { describe, it, expect } from 'vitest';
import { TEMPLATES, CATS, DMC_CAT_IDS, mkItem } from './constants';

describe('TEMPLATES', () => {
  it('declares the 7 documented templates', () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual(
      ['dmc', 'doctranslate', 'domestic', 'intl', 'itinerary', 'menu', 'visa'].sort(),
    );
  });

  it('each template has a kind of "standard" or "alt"', () => {
    for (const [key, tpl] of Object.entries(TEMPLATES)) {
      expect(['standard', 'alt']).toContain(tpl.kind);
      // Standard templates supply an init function; alt templates may not.
      if (tpl.kind === 'standard') expect(typeof tpl.init).toBe('function');
      // sanity: key matches itself
      expect(key.length).toBeGreaterThan(0);
    }
  });
});

describe('DMC_CAT_IDS', () => {
  it('is a subset of CATS', () => {
    const allIds = new Set(CATS.map((c) => c.id));
    for (const id of DMC_CAT_IDS) expect(allIds.has(id)).toBe(true);
  });

  it('is non-empty', () => {
    expect(DMC_CAT_IDS.length).toBeGreaterThan(0);
  });
});

describe('mkItem', () => {
  it('produces an item with a unique-looking id', () => {
    const a = mkItem();
    const b = mkItem();
    expect(a.id).not.toBe(b.id);
  });

  it('applies overrides', () => {
    const it = mkItem({ name: 'custom', price: 999 });
    expect(it.name).toBe('custom');
    expect(it.price).toBe(999);
  });

  it('defaults enabled=true and foc=false', () => {
    const it = mkItem();
    expect(it.enabled).toBe(true);
    expect(it.foc).toBe(false);
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/components/quote/constants.test.ts
git add src/components/quote/constants.test.ts
git commit -m "test(quote): cover templates, cats, mkItem"
```

---

## Task 13: lib/storage tests

**Files:**
- Source: `src/lib/storage.ts`
- Create: `src/lib/storage.test.ts`

- [ ] **Step 1: Inspect source**

```bash
sed -n '1,90p' src/lib/storage.ts
```

Identify exported readers/writers: typically `readSavedQuotes`, `writeSavedQuotes`, `readUserSnapshots`, plus localStorage key constants. Adapt the tests below to match the actual export names.

- [ ] **Step 2: Write the tests**

```ts
import { describe, it, expect, afterEach } from 'vitest';
import {
  readSavedQuotes,
  writeSavedQuotes,
  readUserSnapshots,
} from './storage';

afterEach(() => localStorage.clear());

describe('readSavedQuotes / writeSavedQuotes', () => {
  it('returns empty object when key absent', () => {
    expect(readSavedQuotes()).toEqual({});
  });

  it('round-trips a saved map', () => {
    const m = { ceo: [{ id: 1, name: 'q1' }] } as Parameters<typeof writeSavedQuotes>[0];
    writeSavedQuotes(m);
    expect(readSavedQuotes()).toEqual(m);
  });

  it('returns empty object on malformed JSON', () => {
    localStorage.setItem('vte_q', '{not json');
    expect(readSavedQuotes()).toEqual({});
  });
});

describe('readUserSnapshots', () => {
  it('returns empty array for an unknown user', () => {
    expect(readUserSnapshots('nobody')).toEqual([]);
  });

  it('returns the per-user list when present', () => {
    const m = { ceo: [{ id: 1, name: 'q1' }] } as Parameters<typeof writeSavedQuotes>[0];
    writeSavedQuotes(m);
    expect(readUserSnapshots('ceo')).toEqual(m.ceo);
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/lib/storage.test.ts
git add src/lib/storage.test.ts
git commit -m "test(lib): cover storage helpers"
```

If export names differ from the ones used above, rename in the test file. Do not modify the source.

---

## Task 14: lib/notifications tests

**Files:**
- Source: `src/lib/notifications.ts`
- Create: `src/lib/notifications.test.ts`

- [ ] **Step 1: Inspect source**

```bash
sed -n '1,60p' src/lib/notifications.ts
```

Identify the dispatcher API. Typical shape: `pushNotification(payload)` + `subscribeNotifications(cb)`.

- [ ] **Step 2: Write the tests (adapt API names if needed)**

```ts
import { describe, it, expect, vi } from 'vitest';
import * as notif from './notifications';

describe('notifications dispatcher', () => {
  it('delivers a pushed payload to a subscriber', () => {
    const cb = vi.fn();
    const unsub = (notif as { subscribe?: (fn: (p: unknown) => void) => () => void })
      .subscribe?.(cb);
    (notif as { push?: (p: unknown) => void }).push?.({ kind: 'test', msg: 'hello' });
    expect(cb).toHaveBeenCalledWith({ kind: 'test', msg: 'hello' });
    unsub?.();
  });

  it('stops delivering after unsubscribe', () => {
    const cb = vi.fn();
    const unsub = (notif as { subscribe?: (fn: (p: unknown) => void) => () => void })
      .subscribe?.(cb);
    unsub?.();
    (notif as { push?: (p: unknown) => void }).push?.({ kind: 'test', msg: 'x' });
    expect(cb).not.toHaveBeenCalled();
  });
});
```

**If the API doesn't match (e.g. there's no `subscribe`/`push` and it's a different pattern):** rewrite the tests against the actual exports. The goal is *one happy path + one teardown* per exported function. If the module is purely declarative (constants only, no functions), commit a placeholder describe + skip the file.

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/lib/notifications.test.ts
git add src/lib/notifications.test.ts
git commit -m "test(lib): cover notifications dispatcher"
```

---

## Task 15: lib/docExtract tests (judge first)

**Files:**
- Source: `src/lib/docExtract.ts`
- Create (conditional): `src/lib/docExtract.test.ts`

- [ ] **Step 1: Inspect source**

```bash
sed -n '1,99p' src/lib/docExtract.ts
```

Decision rule:
- **If the file has its own parsing/normalization logic** (text cleanup, field extraction, error normalization): write tests covering it.
- **If the file is a thin wrapper around mammoth/pdfjs with no own logic**: skip. Note the decision in the commit message and move on.

- [ ] **Step 2: Either write the tests or commit a skip note**

If writing tests, focus on:
- Happy-path: well-formed input → expected extracted shape.
- Error tolerance: malformed/empty input → defined error shape (not a throw).

If skipping, do NOT create a placeholder file. Just commit a one-line note in the next task's PR description.

- [ ] **Step 3: Commit (if tests written)**

```bash
git add src/lib/docExtract.test.ts
git commit -m "test(lib): cover docExtract parsing"
```

---

# Store tests

**Per-store-test boilerplate.** Every store test file follows this exact opening:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));

import { useFooStore } from './fooStore';
import { snapshotInitial } from '@/test/storeReset';

const reset = snapshotInitial(useFooStore);
beforeEach(() => {
  reset();
  vi.clearAllMocks();
});
```

The `vi.mock` call is hoisted; the import below runs with the mock in place. The `reset` snapshot is captured at module load, before any test has run — that's the pristine initial state.

For stores that call other stores (e.g. quoteStore calls authStore), also mock those if they would touch Firebase during the test. For most cases, snapshotting both is enough.

---

## Task 16: paymentApprovalStore tests (simplest store)

**Files:**
- Source: `src/stores/paymentApprovalStore.ts` (17 lines)
- Create: `src/stores/paymentApprovalStore.test.ts`

- [ ] **Step 1: Inspect**

```bash
cat src/stores/paymentApprovalStore.ts
```

- [ ] **Step 2: Write a single happy-path test that exercises every action**

Template (adapt action names to actual exports):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));

import { usePaymentApprovalStore } from './paymentApprovalStore';
import { snapshotInitial } from '@/test/storeReset';

const reset = snapshotInitial(usePaymentApprovalStore);
beforeEach(() => { reset(); vi.clearAllMocks(); });

describe('paymentApprovalStore', () => {
  it('starts in its documented initial state', () => {
    const s = usePaymentApprovalStore.getState();
    // Replace with actual initial-state assertions after reading the file.
    expect(s).toMatchSnapshot();
  });

  it('exposes the documented actions', () => {
    const s = usePaymentApprovalStore.getState();
    // List the action names you found in the file.
    expect(typeof s).toBe('object');
  });
});
```

After reading the source, replace the placeholders with real assertions: pick one core action (e.g. `setStage`), call it, verify state changed.

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/stores/paymentApprovalStore.test.ts
git add src/stores/paymentApprovalStore.test.ts
git commit -m "test(stores): cover paymentApprovalStore"
```

---

## Task 17: notificationStore tests

**Files:**
- Source: `src/stores/notificationStore.ts`
- Create: `src/stores/notificationStore.test.ts`

Cover: push/read/mark-as-read state transitions; per-user routing (if the store keys by username).

- [ ] **Step 1: Read source** then write tests following the boilerplate, with assertions that pin the documented actions.

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/stores/notificationStore.test.ts
git add src/stores/notificationStore.test.ts
git commit -m "test(stores): cover notificationStore"
```

---

## Task 18: restaurantStore tests

**Files:**
- Source: `src/stores/restaurantStore.ts`
- Create: `src/stores/restaurantStore.test.ts`

Cover: load list, save list, subscribe wiring.

- [ ] **Step 1: Write the tests** following the boilerplate. Mock `fbSubscribeRestaurants` to immediately invoke its callback with seed data, and assert the store reflects that data.

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/stores/restaurantStore.test.ts
git add src/stores/restaurantStore.test.ts
git commit -m "test(stores): cover restaurantStore"
```

---

## Task 19: itineraryStore tests

**Files:**
- Source: `src/stores/itineraryStore.ts`
- Create: `src/stores/itineraryStore.test.ts`

Cover: load index, get-by-id, save, delete.

- [ ] **Step 1: Write the tests.** Override Firebase mocks via `vi.mocked(fbGetItinerary).mockResolvedValueOnce(...)` per test.

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/stores/itineraryStore.test.ts
git add src/stores/itineraryStore.test.ts
git commit -m "test(stores): cover itineraryStore"
```

---

## Task 20: menuStore tests

**Files:**
- Source: `src/stores/menuStore.ts`
- Create: `src/stores/menuStore.test.ts`

Cover: load index, get-by-id, save, delete. Same shape as itineraryStore.

- [ ] **Step 1: Tests, run, commit.**

```bash
npx vitest run src/stores/menuStore.test.ts
git add src/stores/menuStore.test.ts
git commit -m "test(stores): cover menuStore"
```

---

## Task 21: visaProcStore tests

**Files:**
- Source: `src/stores/visaProcStore.ts`
- Create: `src/stores/visaProcStore.test.ts`

Cover: load index, get-by-id, save, delete.

- [ ] **Step 1: Tests, run, commit.**

```bash
npx vitest run src/stores/visaProcStore.test.ts
git add src/stores/visaProcStore.test.ts
git commit -m "test(stores): cover visaProcStore"
```

---

## Task 22: visaProductsStore tests

**Files:**
- Source: `src/stores/visaProductsStore.ts`
- Create: `src/stores/visaProductsStore.test.ts`

Cover: load, save products list.

- [ ] **Step 1: Tests, run, commit.**

```bash
npx vitest run src/stores/visaProductsStore.test.ts
git add src/stores/visaProductsStore.test.ts
git commit -m "test(stores): cover visaProductsStore"
```

---

## Task 23: customerStore tests

**Files:**
- Source: `src/stores/customerStore.ts`
- Create: `src/stores/customerStore.test.ts`

Cover: CRUD (add, update, delete), assert `fbPushCustomers` is called with the right payload after each mutation.

- [ ] **Step 1: Tests, run, commit.**

```bash
npx vitest run src/stores/customerStore.test.ts
git add src/stores/customerStore.test.ts
git commit -m "test(stores): cover customerStore"
```

---

## Task 24: nccStore tests (representative full CRUD pattern)

**Files:**
- Source: `src/stores/nccStore.ts`
- Create: `src/stores/nccStore.test.ts`

**Why detailed here:** This task documents the *pattern* for the CRUD stores (customer, contract, ncc). Other CRUD store tasks reference this one for the assertion shape.

- [ ] **Step 1: Inspect source**

```bash
cat src/stores/nccStore.ts
```

Identify action names (likely `add`, `update`, `delete`, `init`). Verify `fbPushNcc` and `fbSubscribeNcc` are the Firebase functions used.

- [ ] **Step 2: Write the tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));

import { useNccStore } from './nccStore';
import { snapshotInitial } from '@/test/storeReset';
import * as fb from '@/lib/firebase';
import type { Ncc } from '@/types';

const reset = snapshotInitial(useNccStore);
beforeEach(() => { reset(); vi.clearAllMocks(); });

function ncc(over: Partial<Ncc> = {}): Ncc {
  return {
    id: 'n1',
    name: 'NCC One',
    type: 'hotel',
    city: 'Hà Nội',
    phone: '',
    email: '',
    note: '',
    ...over,
  };
}

describe('nccStore', () => {
  it('starts with an empty supplier list', () => {
    expect(useNccStore.getState().list).toEqual([]);
  });

  it('init subscribes to fb and updates list when callback fires', () => {
    useNccStore.getState().init();
    expect(fb.fbSubscribeNcc).toHaveBeenCalledTimes(1);
    const cb = vi.mocked(fb.fbSubscribeNcc).mock.calls[0][0];
    cb([ncc()]);
    expect(useNccStore.getState().list).toEqual([ncc()]);
  });

  it('add pushes a new supplier and persists to fb', async () => {
    await useNccStore.getState().add(ncc({ id: 'n1', name: 'A' }), 'tester');
    expect(useNccStore.getState().list).toContainEqual(expect.objectContaining({ name: 'A' }));
    expect(fb.fbPushNcc).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fb.fbPushNcc).mock.calls[0][0]).toContainEqual(
      expect.objectContaining({ name: 'A' }),
    );
  });

  it('update mutates an existing entry and persists', async () => {
    // seed
    useNccStore.setState({ list: [ncc({ id: 'n1', name: 'A' })] }, false);
    await useNccStore.getState().update({ ...ncc({ id: 'n1', name: 'A renamed' }) }, 'tester');
    expect(useNccStore.getState().list[0].name).toBe('A renamed');
    expect(fb.fbPushNcc).toHaveBeenCalledTimes(1);
  });

  it('delete removes by id and persists', async () => {
    useNccStore.setState({ list: [ncc({ id: 'n1' }), ncc({ id: 'n2' })] }, false);
    await useNccStore.getState().delete('n1', 'tester');
    expect(useNccStore.getState().list).toEqual([ncc({ id: 'n2' })]);
    expect(fb.fbPushNcc).toHaveBeenCalledTimes(1);
  });
});
```

**Adapt to reality:** if action names differ (e.g. `addNcc` instead of `add`), match the source. The pattern stays: (1) seed by `setState`, (2) call action, (3) assert local state, (4) assert `fbPushNcc` argument shape.

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/stores/nccStore.test.ts
git add src/stores/nccStore.test.ts
git commit -m "test(stores): cover nccStore CRUD"
```

---

## Task 25: contractStore tests

**Files:**
- Source: `src/stores/contractStore.ts` (150 lines — same CRUD shape as nccStore)
- Create: `src/stores/contractStore.test.ts`

Cover: init/subscribe, add, update, delete. Use `fbPushContracts` / `fbSubscribeContracts` / `fbGetContracts`. Follow Task 24's pattern.

If the store has extra logic (e.g. filtering by tour, contract status transitions), test those too.

- [ ] **Step 1: Tests, run, commit.**

```bash
npx vitest run src/stores/contractStore.test.ts
git add src/stores/contractStore.test.ts
git commit -m "test(stores): cover contractStore"
```

---

## Task 26: rateCardStore tests

**Files:**
- Source: `src/stores/rateCardStore.ts`
- Create: `src/stores/rateCardStore.test.ts`

Cover: init/subscribe, push, and the `applyPath`-style nested update (rateCardStore is the main consumer of `applyPath`). Pin: nested update doesn't mutate prior state; push is debounced if it is (use fake timers).

- [ ] **Step 1: Tests, run, commit.**

```bash
npx vitest run src/stores/rateCardStore.test.ts
git add src/stores/rateCardStore.test.ts
git commit -m "test(stores): cover rateCardStore"
```

---

## Task 27: quoteHistoryStore tests

**Files:**
- Source: `src/stores/quoteHistoryStore.ts`
- Create: `src/stores/quoteHistoryStore.test.ts`

Cover: separate `quotes` and `dmcQuotes` lists; both subscribers wired on init; updates to one list do not touch the other.

- [ ] **Step 1: Tests, run, commit.**

```bash
npx vitest run src/stores/quoteHistoryStore.test.ts
git add src/stores/quoteHistoryStore.test.ts
git commit -m "test(stores): cover quoteHistoryStore"
```

---

## Task 28: paymentStore tests

**Files:**
- Source: `src/stores/paymentStore.ts`
- Create: `src/stores/paymentStore.test.ts`

Cover: per-tour keying via `vte_payments_{tourKey}`, payment addition, totals computation if any exists in the store.

- [ ] **Step 1: Tests, run, commit.**

```bash
npx vitest run src/stores/paymentStore.test.ts
git add src/stores/paymentStore.test.ts
git commit -m "test(stores): cover paymentStore"
```

---

## Task 29: authStore tests

**Files:**
- Source: `src/stores/authStore.ts` (108 lines)
- Create: `src/stores/authStore.test.ts`

**Gotchas to pin:**
- `login()` syncs users via `init()` first, then validates credentials.
- Bad password returns failure without setting `currentUser`.
- Successful login writes `vte_s` to sessionStorage.
- Plaintext password comparison (this is internal-tool deliberate, not a bug).

- [ ] **Step 1: Inspect**

```bash
cat src/stores/authStore.ts
```

- [ ] **Step 2: Write the tests**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));

import { useAuthStore } from './authStore';
import { snapshotInitial } from '@/test/storeReset';
import * as fb from '@/lib/firebase';
import type { User } from '@/types';

const reset = snapshotInitial(useAuthStore);
beforeEach(() => { reset(); vi.clearAllMocks(); });
afterEach(() => sessionStorage.clear());

function seedUser(over: Partial<User> = {}): User {
  return { u: 'ceo', p: 'ceo123', role: 'CEO', name: 'Tony', color: '#dc3250', ...over };
}

describe('authStore.login', () => {
  it('returns failure on unknown user', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([seedUser()]);
    const ok = await useAuthStore.getState().login('nobody', 'x');
    expect(ok).toBe(false);
    expect(useAuthStore.getState().currentUser).toBeNull();
  });

  it('returns failure on wrong password', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([seedUser()]);
    const ok = await useAuthStore.getState().login('ceo', 'wrong');
    expect(ok).toBe(false);
    expect(useAuthStore.getState().currentUser).toBeNull();
  });

  it('returns success and sets currentUser on correct creds', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([seedUser()]);
    const ok = await useAuthStore.getState().login('ceo', 'ceo123');
    expect(ok).toBe(true);
    expect(useAuthStore.getState().currentUser?.u).toBe('ceo');
  });

  it('persists session to sessionStorage on success', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([seedUser()]);
    await useAuthStore.getState().login('ceo', 'ceo123');
    expect(sessionStorage.getItem('vte_s')).toBeTruthy();
  });

  it('calls fbPullUsers before validating (login triggers init)', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([seedUser()]);
    await useAuthStore.getState().login('ceo', 'ceo123');
    expect(fb.fbPullUsers).toHaveBeenCalled();
  });
});

describe('authStore.logout', () => {
  it('clears currentUser and sessionStorage', async () => {
    vi.mocked(fb.fbPullUsers).mockResolvedValueOnce([seedUser()]);
    await useAuthStore.getState().login('ceo', 'ceo123');
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(sessionStorage.getItem('vte_s')).toBeNull();
  });
});
```

If the store exposes additional actions (e.g. `addUser`, `updateUser`), add tests covering one happy path each. Skip `setUsers` if it's a private setter only the subscriber calls.

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/stores/authStore.test.ts
git add src/stores/authStore.test.ts
git commit -m "test(stores): cover authStore login/logout"
```

---

## Task 30: quoteStore tests (the big one)

**Files:**
- Source: `src/stores/quoteStore.ts` (465 lines)
- Create: `src/stores/quoteStore.test.ts`

This task pins all the gotchas documented in `CLAUDE.md` and the source. Long but high-value.

- [ ] **Step 1: Inspect once more to confirm action names**

```bash
sed -n '40,90p' src/stores/quoteStore.ts
```

- [ ] **Step 2: Write the tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/firebase', () => import('@/test/firebaseStub'));

import { useQuoteStore } from './quoteStore';
import { useAuthStore } from './authStore';
import { snapshotInitial } from '@/test/storeReset';
import * as fb from '@/lib/firebase';
import type { User } from '@/types';

const resetQuote = snapshotInitial(useQuoteStore);
const resetAuth = snapshotInitial(useAuthStore);

const u: User = { u: 'ceo', p: 'ceo123', role: 'CEO', name: 'Tony', color: '#dc3250' };

beforeEach(() => {
  resetQuote();
  resetAuth();
  vi.clearAllMocks();
  useAuthStore.setState({ currentUser: u } as Partial<ReturnType<typeof useAuthStore.getState>>, false);
});

describe('quoteStore.init — per-user hydration', () => {
  it('hydrates draft from vte_quote_draft_{username}', () => {
    const seed = {
      state: { draft: { template: 'domestic', info: { name: 'Hà Nội 3N2Đ' } }, view: 'cost' },
    };
    localStorage.setItem('vte_quote_draft_ceo', JSON.stringify(seed));
    useQuoteStore.getState().init(u);
    expect(useQuoteStore.getState().draft.template).toBe('domestic');
    expect(useQuoteStore.getState().draft.info.name).toBe('Hà Nội 3N2Đ');
    expect(useQuoteStore.getState().currentUsername).toBe('ceo');
  });

  it('does not cross-leak between users on the same device', () => {
    localStorage.setItem(
      'vte_quote_draft_ceo',
      JSON.stringify({ state: { draft: { template: 'domestic', info: { name: 'A' } } } }),
    );
    localStorage.setItem(
      'vte_quote_draft_sale1',
      JSON.stringify({ state: { draft: { template: 'intl', info: { name: 'B' } } } }),
    );
    useQuoteStore.getState().init(u);
    expect(useQuoteStore.getState().draft.info.name).toBe('A');
    useQuoteStore.getState().init({ ...u, u: 'sale1', role: 'Sales' });
    expect(useQuoteStore.getState().draft.info.name).toBe('B');
  });

  it('discards a persisted DMC draft and evicts the key (known-issue workaround)', () => {
    const dmcSeed = JSON.stringify({
      state: { draft: { template: 'dmc', info: { name: 'old dmc' } } },
    });
    localStorage.setItem('vte_quote_draft_ceo', dmcSeed);
    useQuoteStore.getState().init(u);
    expect(useQuoteStore.getState().draft.template).toBeNull();
    expect(localStorage.getItem('vte_quote_draft_ceo')).toBeNull();
  });

  it('tolerates malformed JSON and falls back to empty draft', () => {
    localStorage.setItem('vte_quote_draft_ceo', '{not json');
    useQuoteStore.getState().init(u);
    expect(useQuoteStore.getState().draft.template).toBeNull();
  });
});

describe('quoteStore.setView — DMC view restriction', () => {
  it('clamps non-cost/history views to cost when template is dmc', () => {
    useQuoteStore.setState(
      { draft: { ...useQuoteStore.getState().draft, template: 'dmc' } },
      false,
    );
    useQuoteStore.getState().setView('dashboard');
    expect(useQuoteStore.getState().view).toBe('cost');
    useQuoteStore.getState().setView('history');
    expect(useQuoteStore.getState().view).toBe('history');
  });

  it('allows any view when template is not dmc', () => {
    useQuoteStore.setState(
      { draft: { ...useQuoteStore.getState().draft, template: 'domestic' } },
      false,
    );
    useQuoteStore.getState().setView('dashboard');
    expect(useQuoteStore.getState().view).toBe('dashboard');
  });
});

describe('quoteStore.newDraft', () => {
  it('seeds dmcDefaults and DMC-only catEnabled when template is dmc', () => {
    useQuoteStore.getState().newDraft('dmc');
    const d = useQuoteStore.getState().draft;
    expect(d.outputCurrency).toBe('USD');
    expect(d.dmcPrices).toEqual({ 20: 0, 25: 0, 30: 0, 35: 0, 40: 0 });
    expect(d.dmcMargin).toEqual({ type: 'percent', value: 0 });
  });

  it('does not enable the dmc category for non-dmc templates', () => {
    useQuoteStore.getState().newDraft('domestic');
    expect(useQuoteStore.getState().draft.catEnabled.dmc).toBe(false);
  });
});

describe('quoteStore — setter clamps', () => {
  it('setPax clamps to >= 1', () => {
    useQuoteStore.getState().setPax(0);
    expect(useQuoteStore.getState().draft.pax).toBe(1);
    useQuoteStore.getState().setPax(-5);
    expect(useQuoteStore.getState().draft.pax).toBe(1);
  });

  it('setRounding clamps to >= 1', () => {
    useQuoteStore.getState().setRounding(0);
    expect(useQuoteStore.getState().draft.rounding).toBe(1);
  });
});

describe('quoteStore.importJSON', () => {
  it('rejects files with the wrong _meta.app', () => {
    const raw = JSON.stringify({ _meta: { app: 'something else' }, template: 'domestic' });
    expect(useQuoteStore.getState().importJSON(raw)).toEqual({
      ok: false,
      error: expect.stringContaining('không hợp lệ'),
    });
  });

  it('rejects malformed JSON with an error message', () => {
    const out = useQuoteStore.getState().importJSON('{not json');
    expect(out.ok).toBe(false);
  });

  it('accepts valid Viettours payload and merges fields', () => {
    const raw = JSON.stringify({
      _meta: { app: 'Viettours Tour Cost Calculator' },
      pax: 25,
      margin: 12,
    });
    expect(useQuoteStore.getState().importJSON(raw)).toEqual({ ok: true });
    expect(useQuoteStore.getState().draft.pax).toBe(25);
    expect(useQuoteStore.getState().draft.margin).toBe(12);
  });

  it('clamps imported pax: 0 to 1', () => {
    const raw = JSON.stringify({
      _meta: { app: 'Viettours Tour Cost Calculator' },
      pax: 0,
    });
    useQuoteStore.getState().importJSON(raw);
    expect(useQuoteStore.getState().draft.pax).toBe(1);
  });
});

describe('quoteStore.exportJSON', () => {
  it('includes _meta with the app identifier and current draft', () => {
    const raw = useQuoteStore.getState().exportJSON();
    const parsed = JSON.parse(raw);
    expect(parsed._meta?.app).toBe('Viettours Tour Cost Calculator');
    expect(parsed._meta?.exportedBy).toContain('Tony');
  });
});

describe('quoteStore.saveCloud', () => {
  it('calls fbSaveQuote for non-dmc templates', async () => {
    useQuoteStore.setState(
      { draft: { ...useQuoteStore.getState().draft, template: 'domestic' } },
      false,
    );
    await useQuoteStore.getState().saveCloud('q1', []);
    expect(fb.fbSaveQuote).toHaveBeenCalledTimes(1);
    expect(fb.fbSaveDMCQuote).not.toHaveBeenCalled();
  });

  it('calls fbSaveDMCQuote for dmc templates', async () => {
    useQuoteStore.setState(
      { draft: { ...useQuoteStore.getState().draft, template: 'dmc' } },
      false,
    );
    await useQuoteStore.getState().saveCloud('q1', []);
    expect(fb.fbSaveDMCQuote).toHaveBeenCalledTimes(1);
    expect(fb.fbSaveQuote).not.toHaveBeenCalled();
  });

  it('generates a quote code only when the draft is new', async () => {
    useQuoteStore.setState(
      { draft: { ...useQuoteStore.getState().draft, template: 'domestic', currentQuoteId: null } },
      false,
    );
    await useQuoteStore.getState().saveCloud('q1', []);
    expect(fb.generateQuoteCode).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    useQuoteStore.setState(
      { draft: { ...useQuoteStore.getState().draft, currentQuoteId: 'existing-id' } },
      false,
    );
    await useQuoteStore.getState().saveCloud('q1', []);
    expect(fb.generateQuoteCode).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run**

```bash
npx vitest run src/stores/quoteStore.test.ts
```

Expected: all green. If `saveCloud` tests fail because `useQuoteHistoryStore.getState().quotes` is empty (the store reads it for quote code generation), seed an empty `quotes` array via `useQuoteHistoryStore.setState({ quotes: [] }, false)` in `beforeEach`. Add the import if needed.

- [ ] **Step 4: Commit**

```bash
git add src/stores/quoteStore.test.ts
git commit -m "test(stores): cover quoteStore — hydration, gotchas, cloud sync"
```

---

## Task 31: Full suite + CI wiring

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Run the entire suite locally**

```bash
npm test
```

Expected: all test files green, exit 0. If any are red, fix the offending test (or pin a real bug with a TODO comment) before continuing.

- [ ] **Step 2: Run lint + typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: both pass with no warnings.

- [ ] **Step 3: Edit `.github/workflows/deploy.yml`**

Insert one `- run: npm test` between lint and typecheck:

```yaml
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run typecheck
      - run: npm run build
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: run vitest between lint and typecheck"
```

- [ ] **Step 5: Final sanity check**

```bash
npm run lint && npm test && npm run typecheck && npm run build
```

Expected: all four steps pass in sequence.

---

# Done

What you should now have:
- `npm test` runs the full suite in CI and locally.
- Every file in `src/stores/`, `src/lib/` (minus exports), `src/auth/`, plus `src/components/quote/calc.ts` and `constants.ts` has a co-located `.test.ts` with meaningful behavior coverage.
- Foundation under `src/test/` (setup, store reset, firebase stub) ready for future test additions.
- CI blocks the GitHub Pages deploy on test failure, the same way it blocks on lint and typecheck.

What you should NOT have done:
- No `.test.tsx` component tests.
- No tests under `src/lib/exports/*`.
- No coverage threshold gate.
- No new prod dependencies — only devDeps.

If `lib/notifications.ts` or `lib/docExtract.ts` turned out to be pure declarations or pure third-party wrappers, those test files may have been skipped — that's expected and should be noted in their commit messages.
