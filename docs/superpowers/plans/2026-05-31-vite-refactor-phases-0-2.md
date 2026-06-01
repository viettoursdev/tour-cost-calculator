# Vite Refactor — Phases 0–2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Vite + React + TypeScript + MUI + Zustand build, port Firebase/auth/rate-card to the new stack, and cut over from the legacy `index.html` to the Vite build at the root URL with `/legacy.html` as the safety net.

**Architecture:** Vite SPA deployed to GitHub Pages. State lives in per-domain Zustand stores. Firestore I/O isolated in `src/lib/firebase.ts`. During Phases 0–2 the Vite build serves from `/tour-cost-calculator/preview/` while the legacy `index.html` keeps serving at root; the cutover PR flips the build base back to `/tour-cost-calculator/` and replaces the root.

**Tech Stack:** Vite 5, React 18, TypeScript (strict), MUI v6 (`@mui/material`, `@mui/icons-material`, `@mui/x-date-pickers`, `@mui/x-data-grid`), Zustand 4 (`subscribeWithSelector` + `persist`), Firebase 10 modular SDK, GitHub Actions for Pages deploy.

**Spec:** [docs/superpowers/specs/2026-05-31-vite-react-refactor-design.md](../specs/2026-05-31-vite-react-refactor-design.md)

**Scope:** Phases 0–2 only. Phase 3 (tab-by-tab port) and Phase 4 (cleanup) get their own plans after cutover.

**Testing:** Per spec, no automated tests in this refactor. Verification = `npm run typecheck && npm run build` + manual smoke against `/preview/` (Phases 0–2 PRs) or root (post-cutover).

**A note on porting tasks (PR-2.1 onwards):** Steps that port a component from `index.html` give the exact source line range, the destination file, the Zustand actions to call, and a MUI-mapping reference. They do *not* pre-write 500+ lines of MUI JSX, because that code can only be written correctly by reading the legacy markup line by line. This is a procedural recipe, not a placeholder.

---

## File structure (created by end of Phase 2)

```
tour-cost-calculator/
├── index.html                      # Vite entry (small shell)
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── .eslintrc.cjs
├── .prettierrc
├── .gitignore                      # MODIFY (add node_modules, dist)
├── .github/workflows/deploy.yml    # MODIFY (replace existing if any)
├── public/
│   └── legacy.html                 # copy of pre-refactor index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── theme.ts
│   ├── global.css
│   ├── vite-env.d.ts
│   ├── lib/
│   │   ├── firebase.ts             # Firestore init + all fb* named exports
│   │   ├── storage.ts              # localStorage helpers + legacy migration
│   │   ├── notifications.ts        # browser-notif utils
│   │   └── util.ts                 # debounce, applyPath, fmt helpers
│   ├── types/
│   │   ├── user.ts
│   │   ├── rates.ts
│   │   └── index.ts                # re-exports
│   ├── auth/
│   │   └── PERMISSIONS.ts
│   ├── stores/
│   │   ├── authStore.ts
│   │   └── rateCardStore.ts
│   └── components/
│       ├── shell/
│       │   ├── MainApp.tsx
│       │   ├── AppShell.tsx        # AppBar + TabBar
│       │   ├── LoginScreen.tsx
│       │   └── TabPlaceholder.tsx  # "Open in legacy" stub for un-ported tabs
│       └── rates/
│           ├── RatesPanel.tsx
│           ├── RateCardModal.tsx
│           ├── HotelModal.tsx
│           └── VisaModal.tsx
```

---

## PR-0.1 — Vite scaffold and CI

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `.eslintrc.cjs`, `.prettierrc`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`, `src/global.css`, `index.html` (new Vite version), `public/legacy.html` (copy of old root file), `.github/workflows/deploy.yml`
- Modify: `.gitignore`

### Tasks

- [ ] **Step 1: Archive the legacy app**

Before any new files are written, copy the existing root `index.html` (the 10638-line monolith) to `public/legacy.html` so it's preserved as the cutover fallback.

```bash
mkdir -p public
cp index.html public/legacy.html
```

- [ ] **Step 2: Initialize npm package**

```bash
npm init -y
```

- [ ] **Step 3: Install runtime dependencies**

```bash
npm install react@18 react-dom@18 \
  @mui/material@6 @mui/icons-material@6 @mui/x-date-pickers@7 @mui/x-data-grid@7 \
  @emotion/react @emotion/styled \
  zustand@4 firebase@10 \
  xlsx jspdf html2canvas docx file-saver
```

- [ ] **Step 4: Install dev dependencies**

```bash
npm install -D vite@5 @vitejs/plugin-react@4 typescript@5 \
  @types/react@18 @types/react-dom@18 @types/file-saver \
  eslint@8 @typescript-eslint/parser@7 @typescript-eslint/eslint-plugin@7 \
  eslint-plugin-react-hooks@4 eslint-plugin-react-refresh@0.4 \
  prettier@3
```

- [ ] **Step 5: Add npm scripts to package.json**

Replace the `scripts` block in `package.json` with:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint . --ext ts,tsx --max-warnings 0",
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\""
  }
}
```

Also set `"type": "module"` at the top level.

- [ ] **Step 6: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 7: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 8: Create vite.config.ts (preview base for Phases 0–2)**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  base: '/tour-cost-calculator/preview/',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          mui: [
            '@mui/material',
            '@mui/icons-material',
            '@mui/x-data-grid',
            '@mui/x-date-pickers',
          ],
          firebase: ['firebase/app', 'firebase/firestore'],
          exports: ['xlsx', 'jspdf', 'html2canvas', 'docx', 'file-saver'],
        },
      },
    },
  },
  server: { port: 5173 },
});
```

> Note: `base` flips to `/tour-cost-calculator/` in PR-2.2 (cutover).

- [ ] **Step 9: Create .eslintrc.cjs**

```js
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'public/legacy.html'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
};
```

- [ ] **Step 10: Create .prettierrc**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 11: Update .gitignore**

Append to existing `.gitignore`:

```
node_modules
dist
*.log
.DS_Store
```

- [ ] **Step 12: Replace root index.html with the Vite shell**

Overwrite `index.html` (the old monolith is already safely at `public/legacy.html`):

```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Bảng Tính Chi Phí Tour – Viettours</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 13: Create src/global.css**

```css
html, body, #root { height: 100%; margin: 0; }
body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
```

- [ ] **Step 14: Create src/vite-env.d.ts**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 15: Create src/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 16: Create src/App.tsx (placeholder)**

```tsx
export default function App() {
  return <div style={{ padding: 24 }}>Viettours Tour Cost Calculator — Vite scaffold ready</div>;
}
```

- [ ] **Step 17: Verify dev server boots**

Run: `npm run dev`
Expected: server starts on `http://localhost:5173/tour-cost-calculator/preview/`, page shows the placeholder text. Kill with Ctrl+C.

- [ ] **Step 18: Verify typecheck and production build**

Run: `npm run typecheck && npm run build`
Expected: both succeed; `dist/` contains `preview/` subdirectory with `index.html` and hashed JS/CSS chunks.

- [ ] **Step 19: Create .github/workflows/deploy.yml (preview-mode build)**

```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build
      # Vite outputs to dist/preview/ because base=/tour-cost-calculator/preview/.
      # We additionally publish the legacy app at the root so the live URL keeps working.
      - run: cp public/legacy.html dist/index.html
      - run: cp public/legacy.html dist/legacy.html
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

> **Manual step (one time):** In the GitHub repo Settings → Pages, change Source from "Deploy from a branch" to "GitHub Actions". This must happen before the first push of this workflow, or the deploy job will fail. Coordinate this with the user.

- [ ] **Step 20: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts \
  .eslintrc.cjs .prettierrc .gitignore index.html public/legacy.html \
  src/main.tsx src/App.tsx src/global.css src/vite-env.d.ts \
  .github/workflows/deploy.yml
git commit -m "chore(vite): scaffold Vite + React + TS build, archive legacy app

- Adds Vite 5 + React 18 + TypeScript strict scaffold.
- Archives existing index.html monolith to public/legacy.html.
- Replaces root index.html with Vite shell.
- Adds GitHub Actions workflow building to /preview/ while the legacy
  app keeps serving at root during phases 0-2.
- Cutover (PR-2.2) flips base back to root and removes the legacy copy step."
```

- [ ] **Step 21: Push and verify deployed preview**

```bash
git push origin <branch-name>
```

After CI completes, verify:
1. `https://viettoursdev.github.io/tour-cost-calculator/` still shows the legacy app (unchanged).
2. `https://viettoursdev.github.io/tour-cost-calculator/preview/` shows the placeholder text.
3. `https://viettoursdev.github.io/tour-cost-calculator/legacy.html` also shows the legacy app.

If any URL 404s, stop and fix before proceeding to PR-0.2.

---

## PR-0.2 — Theme + shell chrome

**Files:**
- Create: `src/theme.ts`, `src/components/shell/MainApp.tsx`, `src/components/shell/AppShell.tsx`, `src/components/shell/TabPlaceholder.tsx`
- Modify: `src/App.tsx`

### Tasks

- [ ] **Step 1: Create src/theme.ts**

Color palette is lifted from the legacy CSS (teal primary `#0d7a6a` used in the auto-sync toast in index.html:79; accent red `#dc3250` from CEO user color in index.html:632).

```ts
import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#0d7a6a' },
    secondary: { main: '#dc3250' },
    background: { default: '#f5f6f8' },
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    h6: { fontWeight: 700 },
  },
  shape: { borderRadius: 8 },
});
```

- [ ] **Step 2: Create src/components/shell/TabPlaceholder.tsx**

This is the "Open in legacy" stub used by every un-ported tab during Phases 2–3.

```tsx
import { Alert, Box, Button } from '@mui/material';

type Props = { tabKey: string; label: string };

export function TabPlaceholder({ tabKey, label }: Props) {
  const legacyUrl = `/tour-cost-calculator/legacy.html#tab=${encodeURIComponent(tabKey)}`;
  return (
    <Box sx={{ p: 4 }}>
      <Alert
        severity="info"
        action={
          <Button color="inherit" size="small" href={legacyUrl}>
            Mở trong bản cũ →
          </Button>
        }
      >
        Tab <strong>{label}</strong> đang được di chuyển sang phiên bản mới. Tạm thời sử dụng bản cũ.
      </Alert>
    </Box>
  );
}
```

- [ ] **Step 3: Create src/components/shell/AppShell.tsx**

Tab list and labels match the legacy app's `MainApp` (index.html:7200–7480). For Phase 0 every tab renders `TabPlaceholder`; later PRs swap tabs in one at a time.

```tsx
import { useState } from 'react';
import { AppBar, Box, Tab, Tabs, Toolbar, Typography } from '@mui/material';
import { TabPlaceholder } from './TabPlaceholder';

const TABS = [
  { key: 'rates', label: 'Rate Card' },
  { key: 'quote', label: 'Báo Giá' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'payment', label: 'Thanh Toán' },
  { key: 'contract', label: 'Hợp Đồng' },
  { key: 'customer', label: 'Khách Hàng' },
  { key: 'ncc', label: 'NCC' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function AppShell() {
  const [active, setActive] = useState<TabKey>('rates');
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <AppBar position="static" color="primary">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Viettours — Tour Cost Calculator
          </Typography>
        </Toolbar>
        <Tabs
          value={active}
          onChange={(_, v) => setActive(v as TabKey)}
          textColor="inherit"
          indicatorColor="secondary"
          variant="scrollable"
        >
          {TABS.map((t) => (
            <Tab key={t.key} value={t.key} label={t.label} />
          ))}
        </Tabs>
      </AppBar>
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {TABS.map((t) =>
          t.key === active ? <TabPlaceholder key={t.key} tabKey={t.key} label={t.label} /> : null,
        )}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Create src/components/shell/MainApp.tsx**

Thin wrapper around `AppShell`. Will gain auth gating in PR-1.4.

```tsx
import { AppShell } from './AppShell';

export function MainApp() {
  return <AppShell />;
}
```

- [ ] **Step 5: Update src/App.tsx**

```tsx
import { CssBaseline, ThemeProvider } from '@mui/material';
import { theme } from './theme';
import { MainApp } from './components/shell/MainApp';

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <MainApp />
    </ThemeProvider>
  );
}
```

- [ ] **Step 6: Verify locally**

Run: `npm run dev`
Expected: AppBar with title, scrollable tab row with all 7 labels, clicking each tab shows the "Open in legacy" Alert with a working link.

- [ ] **Step 7: Verify typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add src/theme.ts src/App.tsx src/components/shell/
git commit -m "feat(shell): add MUI theme and tabbed shell with legacy placeholders"
```

---

## PR-1.1 — Types

**Files:**
- Create: `src/types/user.ts`, `src/types/rates.ts`, `src/types/index.ts`

### Tasks

- [ ] **Step 1: Create src/types/user.ts**

Values lifted from `index.html:631-658` (`DEFAULT_USERS` and `PERMISSIONS`).

```ts
export type Role =
  | 'CEO'
  | 'Trưởng Phòng'
  | 'Sales'
  | 'Operations'
  | 'Marketing'
  | 'Admin'
  | 'Accountant'
  | 'Standard';

export type User = {
  u: string;          // username
  p: string;          // password (plaintext, per existing app)
  role: Role;
  name: string;
  color: string;      // hex
};

export type PermissionKey =
  | 'manageUsers'
  | 'editRateCard'
  | 'exportQuote'
  | 'importQuote'
  | 'viewHistory'
  | 'syncRateCard'
  | 'manageNCC'
  | 'manageCustomers'
  | 'manageContracts'
  | 'viewContracts'
  | 'manageMenu'
  | 'manageVisa';

export type Permissions = Record<PermissionKey, boolean>;
```

- [ ] **Step 2: Create src/types/rates.ts**

Shape lifted from `_collectRC()` in `index.html:41-50` — Firestore `master_rate_card` document.

```ts
export type HotelEntry = Record<string, unknown>;
export type OtherRateEntry = Record<string, unknown>;
export type VisaRates = Record<string, unknown>;

export type RateCard = {
  hotels: Record<string, HotelEntry[]>;   // keyed by city (vte_hotels_v2_<city>)
  visaRates: VisaRates;                   // vte_visa_rates
  otherRates: Record<string, OtherRateEntry>; // vte_rate_* keys
};

export type RateCardMeta = {
  version: string;
  type: string;
  pushedAt: string;       // ISO date
  pushedBy: string;
  app: string;
  autoSync: boolean;
};

export type RateCardDoc = RateCard & { _meta?: RateCardMeta };
```

> Note: individual hotel/rate row shapes are intentionally loose (`Record<string, unknown>`) at this layer because the legacy app stores arbitrary user-defined fields. Tighter typing happens inside the rates components in PR-2.1, where row shape becomes load-bearing.

- [ ] **Step 3: Create src/types/index.ts**

```ts
export * from './user';
export * from './rates';
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/types/
git commit -m "feat(types): add user, role, permission, and rate-card types"
```

---

## PR-1.2 — `src/lib/firebase.ts` and `src/auth/PERMISSIONS.ts`

**Files:**
- Create: `src/lib/firebase.ts`, `src/auth/PERMISSIONS.ts`, `src/lib/util.ts`

### Tasks

- [ ] **Step 1: Create src/lib/util.ts**

```ts
export function debounce<A extends unknown[]>(
  fn: (...args: A) => unknown,
  wait: number,
): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function applyPath<T>(obj: T, path: string, value: unknown): T {
  // Dot-path setter, returns a new object. Used by rate card updates.
  const keys = path.split('.');
  const clone = structuredClone(obj) as Record<string, unknown>;
  let cur: Record<string, unknown> = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
  return clone as T;
}
```

- [ ] **Step 2: Create src/auth/PERMISSIONS.ts**

Values lifted verbatim from `index.html:649-663`.

```ts
import type { Permissions, Role, User, PermissionKey } from '@/types';

export const PERMISSIONS: Record<Role, Permissions> = {
  CEO:           { manageUsers:true,  editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true },
  'Trưởng Phòng':{ manageUsers:false, editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true },
  Sales:         { manageUsers:false, editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true },
  Operations:    { manageUsers:false, editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true },
  Marketing:     { manageUsers:false, editRateCard:true,  exportQuote:true,  importQuote:true,  viewHistory:true,  syncRateCard:true,  manageNCC:true,  manageCustomers:true,  manageContracts:true,  viewContracts:true,  manageMenu:true,  manageVisa:true },
  Admin:         { manageUsers:false, editRateCard:false, exportQuote:false, importQuote:false, viewHistory:true,  syncRateCard:false, manageNCC:false, manageCustomers:false, manageContracts:false, viewContracts:true,  manageMenu:false, manageVisa:false },
  Accountant:    { manageUsers:false, editRateCard:false, exportQuote:false, importQuote:false, viewHistory:true,  syncRateCard:false, manageNCC:false, manageCustomers:false, manageContracts:false, viewContracts:false, manageMenu:false, manageVisa:false },
  Standard:      { manageUsers:false, editRateCard:false, exportQuote:false, importQuote:false, viewHistory:false, syncRateCard:false, manageNCC:false, manageCustomers:false, manageContracts:false, viewContracts:false, manageMenu:false, manageVisa:false },
};

export function hasPerm(user: User | null, key: PermissionKey): boolean {
  if (!user) return false;
  const p = PERMISSIONS[user.role];
  return p ? !!p[key] : false;
}
```

- [ ] **Step 3: Create src/lib/firebase.ts — init + users API**

Config lifted from `index.html:24-31`. User push/pull surface mirrors `window.fbPushUsers` / `window.fbPullUsers` used at `index.html:689-696`.

```ts
import { initializeApp } from 'firebase/app';
import { doc, getDoc, getFirestore, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import type { RateCard, RateCardDoc, User } from '@/types';

const firebaseConfig = {
  apiKey: 'AIzaSyAL-pifSBDDrbek3s2uwkeIYw5Y1GZO9Iw',
  authDomain: 'viettours-cost-calculator.firebaseapp.com',
  projectId: 'viettours-cost-calculator',
  storageBucket: 'viettours-cost-calculator.firebasestorage.app',
  messagingSenderId: '304145851784',
  appId: '1:304145851784:web:e4977ff4e343ab74e4c63d',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, 'viettours');

const USERS_DOC = doc(db, 'viettours', 'user_accounts');
const RC_DOC = doc(db, 'viettours', 'master_rate_card');

// ── Users ──
export async function fbPullUsers(): Promise<User[]> {
  const snap = await getDoc(USERS_DOC);
  const data = snap.data();
  if (!data || !Array.isArray((data as { users?: User[] }).users)) return [];
  return (data as { users: User[] }).users;
}

export async function fbPushUsers(users: User[]): Promise<void> {
  await setDoc(USERS_DOC, { users, updatedAt: new Date().toISOString() });
}
```

- [ ] **Step 4: Add rate-card API to src/lib/firebase.ts**

Append below the users section. Mirrors the auto-sync semantics from `index.html:65-90`.

```ts
// ── Rate Card ──
export async function fbPullMasterRC(): Promise<RateCardDoc | null> {
  const snap = await getDoc(RC_DOC);
  if (!snap.exists()) return null;
  return snap.data() as RateCardDoc;
}

export async function fbPushMasterRC(rc: RateCard, pushedBy: string): Promise<void> {
  await setDoc(RC_DOC, {
    _meta: {
      version: '2.0',
      type: 'viettours_ratecard_master',
      pushedAt: new Date().toISOString(),
      pushedBy,
      app: 'Viettours Tour Cost Calculator',
      autoSync: true,
    },
    hotels: rc.hotels,
    visaRates: rc.visaRates,
    otherRates: rc.otherRates,
  });
}

export function fbSubscribeMasterRC(cb: (rc: RateCardDoc) => void): Unsubscribe {
  return onSnapshot(RC_DOC, (snap) => {
    if (snap.exists()) cb(snap.data() as RateCardDoc);
  });
}
```

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/util.ts src/lib/firebase.ts src/auth/PERMISSIONS.ts
git commit -m "feat(lib): add Firestore module and permissions table

Adds typed wrappers around the master_rate_card and user_accounts
Firestore documents. Mirrors legacy window.fb* signatures so component
ports can substitute named imports directly."
```

---

## PR-1.3 — `src/lib/storage.ts` and `src/lib/notifications.ts`

**Files:**
- Create: `src/lib/storage.ts`, `src/lib/notifications.ts`

### Tasks

- [ ] **Step 1: Create src/lib/storage.ts**

Legacy localStorage keys are documented in `CONTEXT.md` section 8. The migrate helper drains legacy rate-card keys into a single shape — used by `rateCardStore.init()` in PR-2.1.

```ts
import type { RateCard } from '@/types';

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded — ignore, behavior matches legacy */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// Drains vte_hotels_v2_*, vte_rate_*, vte_visa_rates into a RateCard shape.
// Returns null if nothing legacy found.
export function migrateLegacyRateCard(): RateCard | null {
  const hotels: RateCard['hotels'] = {};
  const otherRates: RateCard['otherRates'] = {};
  let visaRates: RateCard['visaRates'] = {};
  let found = false;
  const toDelete: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith('vte_hotels_v2_')) {
      const city = k.replace('vte_hotels_v2_', '');
      const parsed = readJSON<unknown>(k, null);
      if (parsed) {
        hotels[city] = parsed as RateCard['hotels'][string];
        toDelete.push(k);
        found = true;
      }
    } else if (k === 'vte_visa_rates') {
      visaRates = readJSON<RateCard['visaRates']>(k, {});
      toDelete.push(k);
      found = true;
    } else if (k.startsWith('vte_rate_')) {
      otherRates[k] = readJSON<unknown>(k, null) as RateCard['otherRates'][string];
      toDelete.push(k);
      found = true;
    }
  }

  if (!found) return null;
  toDelete.forEach(remove);
  return { hotels, visaRates, otherRates };
}
```

- [ ] **Step 2: Create src/lib/notifications.ts**

Surface-equivalent to the legacy `requestBrowserNotifPermission` / `showBrowserNotif` in `index.html:42-80`.

```ts
export async function requestBrowserNotifPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function showBrowserNotif(title: string, body: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body });
  } catch {
    /* ignore — browser/OS may suppress */
  }
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/storage.ts src/lib/notifications.ts
git commit -m "feat(lib): add storage helpers with legacy rate-card migration and browser-notif utils"
```

---

## PR-1.4 — `authStore` + login screen

**Files:**
- Create: `src/stores/authStore.ts`, `src/components/shell/LoginScreen.tsx`
- Modify: `src/components/shell/MainApp.tsx`

### Tasks

- [ ] **Step 1: Create src/stores/authStore.ts**

Behavior mirrors `ldUsers/syncUsersFromCloud/pushSingleUser/svUsers/doLogin` from `index.html:665-720` (and the `doLogin` function not shown above but located by grepping `function doLogin` in the legacy file). Session uses `sessionStorage` key `vte_s` per CONTEXT.md.

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fbPullUsers, fbPushUsers } from '@/lib/firebase';
import type { User } from '@/types';

const DEFAULT_USERS: User[] = [
  { u: 'ceo',      p: 'ceo123',  role: 'CEO',           name: 'Tony',  color: '#dc3250' },
  { u: 'manager1', p: 'mgr123',  role: 'Trưởng Phòng',  name: 'Mai',   color: '#f5a623' },
  { u: 'sale1',    p: 'sale123', role: 'Sales',         name: 'Linh',  color: '#14a08c' },
  { u: 'sale2',    p: 'sale123', role: 'Sales',         name: 'Hùng',  color: '#1abc9c' },
  { u: 'sale3',    p: 'sale123', role: 'Sales',         name: 'Trang', color: '#3498db' },
  { u: 'op1',      p: 'op123',   role: 'Operations',    name: 'Khang', color: '#9b59b6' },
];

type AuthState = {
  currentUser: User | null;
  users: User[];
  hasHydrated: boolean;
  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => void;
  saveUsers: (users: User[]) => Promise<void>;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      users: DEFAULT_USERS,
      hasHydrated: false,

      init: async () => {
        try {
          const cloud = await fbPullUsers();
          if (cloud.length === 0) {
            // First-time migration: push local defaults up.
            await fbPushUsers(get().users);
          } else {
            // Merge: cloud wins, keep local-only users (excluding the seed CEO).
            const cloudIds = new Set(cloud.map((u) => u.u));
            const localOnly = get().users.filter(
              (u) => !cloudIds.has(u.u) && u.u !== DEFAULT_USERS[0]?.u,
            );
            const merged = [...cloud, ...localOnly];
            if (localOnly.length > 0) await fbPushUsers(merged);
            set({ users: merged });
          }
        } catch (e) {
          console.warn('User cloud sync failed:', (e as Error).message);
        } finally {
          set({ hasHydrated: true });
        }
      },

      login: async (username, password) => {
        // Always re-sync before checking, so new accounts created on other devices work.
        await get().init();
        const match = get().users.find((u) => u.u === username && u.p === password);
        if (!match) return { ok: false, error: 'Sai tài khoản hoặc mật khẩu' };
        set({ currentUser: match });
        try {
          sessionStorage.setItem('vte_s', JSON.stringify(match));
        } catch {
          /* ignore */
        }
        return { ok: true };
      },

      logout: () => {
        set({ currentUser: null });
        try {
          sessionStorage.removeItem('vte_s');
        } catch {
          /* ignore */
        }
      },

      saveUsers: async (users) => {
        set({ users });
        await fbPushUsers(users);
      },
    }),
    {
      name: 'vte_users',
      partialize: (s) => ({ users: s.users }), // persist user list only, not session
    },
  ),
);

// Restore session on module load.
try {
  const raw = sessionStorage.getItem('vte_s');
  if (raw) {
    const u = JSON.parse(raw) as User;
    useAuthStore.setState({ currentUser: u });
  }
} catch {
  /* ignore */
}
```

- [ ] **Step 2: Create src/components/shell/LoginScreen.tsx**

```tsx
import { useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useAuthStore } from '@/stores/authStore';

export function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const result = await login(u.trim(), p);
    setBusy(false);
    if (!result.ok) setErr(result.error);
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
      }}
    >
      <Paper sx={{ p: 4, width: 360 }} component="form" onSubmit={onSubmit}>
        <Typography variant="h6" gutterBottom>
          Đăng nhập — Viettours
        </Typography>
        <Stack spacing={2}>
          <TextField
            label="Tài khoản"
            value={u}
            onChange={(e) => setU(e.target.value)}
            autoFocus
            required
            autoComplete="username"
          />
          <TextField
            label="Mật khẩu"
            type="password"
            value={p}
            onChange={(e) => setP(e.target.value)}
            required
            autoComplete="current-password"
          />
          {err && <Alert severity="error">{err}</Alert>}
          <Button type="submit" variant="contained" disabled={busy || !u || !p}>
            {busy ? 'Đang xử lý…' : 'Đăng nhập'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
```

- [ ] **Step 3: Update src/components/shell/MainApp.tsx to gate on auth**

```tsx
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { AppShell } from './AppShell';
import { LoginScreen } from './LoginScreen';

export function MainApp() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (!currentUser) return <LoginScreen />;
  return <AppShell />;
}
```

- [ ] **Step 4: Add logout to AppShell**

Modify `src/components/shell/AppShell.tsx` Toolbar to include a logout button. Replace the existing `<Toolbar>` with:

```tsx
import { useAuthStore } from '@/stores/authStore';
// ...inside AppShell component body, before return:
const currentUser = useAuthStore((s) => s.currentUser);
const logout = useAuthStore((s) => s.logout);

// ...replace existing <Toolbar>...</Toolbar> with:
<Toolbar>
  <Typography variant="h6" sx={{ flexGrow: 1 }}>
    Viettours — Tour Cost Calculator
  </Typography>
  {currentUser && (
    <>
      <Typography variant="body2" sx={{ mr: 2 }}>
        {currentUser.name} ({currentUser.role})
      </Typography>
      <Button color="inherit" onClick={logout}>
        Đăng xuất
      </Button>
    </>
  )}
</Toolbar>
```

Add `Button` to the `@mui/material` import line.

- [ ] **Step 5: Verify locally**

Run: `npm run dev`. In browser:
1. Page shows LoginScreen.
2. Enter `ceo` / `ceo123` → AppShell appears with "Tony (CEO)" and Logout in the header.
3. Click Logout → returns to LoginScreen.
4. Refresh page → stays logged out (session cleared) or in (if just logged in within the tab).
5. Open DevTools → Application → IndexedDB/LocalStorage: `vte_users` is populated.

- [ ] **Step 6: Verify typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/stores/authStore.ts src/components/shell/LoginScreen.tsx src/components/shell/MainApp.tsx src/components/shell/AppShell.tsx
git commit -m "feat(auth): add authStore and login screen with cloud user sync"
```

---

## PR-2.1 — `rateCardStore` + Rates tab components

This is the largest PR in Phases 0–2. It validates the full pattern (MUI form modals + Zustand + Firestore subscribe + debounced push + legacy localStorage migration) on the riskiest tab. Failing here is cheap; failing later after porting many tabs is expensive.

**Files:**
- Create: `src/stores/rateCardStore.ts`, `src/components/rates/RatesPanel.tsx`, `src/components/rates/RateCardModal.tsx`, `src/components/rates/HotelModal.tsx`, `src/components/rates/VisaModal.tsx`
- Modify: `src/components/shell/AppShell.tsx` (render `RatesPanel` for the `rates` tab), `src/components/shell/MainApp.tsx` (call `rateCardStore.init()` on login)

### Source map in legacy `index.html`

| Component | Approx lines | Notes |
|---|---|---|
| `RatesPanel` | 1200–1400 | The root rates UI; opens the modals |
| `RateCardModal` | ~900–1200 | The "manage all rate cards" modal — table + add/edit rows |
| `HotelModal` | ~600–800 | Hotel-specific editor with per-city tabs |
| `VisaModal` | ~800–900 | Visa rates editor |

Exact ranges may drift ±50 lines from CONTEXT.md's estimates. **Before writing any component task below, run `grep -n "^const HotelModal\|^const VisaModal\|^const RateCardModal\|^const RatesPanel\|^function HotelModal\|^function VisaModal\|^function RateCardModal\|^function RatesPanel" index.html`** to lock down the actual line numbers — and read each range end-to-end before porting.

### MUI mapping cheat-sheet

Use these substitutions when porting legacy markup:

| Legacy | MUI v6 |
|---|---|
| `<button className="btn-primary">` | `<Button variant="contained">` |
| `<button className="btn-ghost">` | `<Button variant="text">` or `<Button variant="outlined">` |
| `<input type="text">` | `<TextField size="small">` |
| `<input type="number">` | `<TextField type="number" size="small">` |
| `<select>` | `<Select>` inside `<FormControl size="small">` |
| `<div className="modal">…</div>` | `<Dialog open onClose>...<DialogTitle/><DialogContent/><DialogActions/></Dialog>` |
| Custom table with editable rows | `<DataGrid>` from `@mui/x-data-grid` with `editable: true` columns |
| Toast (custom `document.createElement`) | `useState` for `Snackbar` + `Alert`, OR a global `notistack` provider (defer) |
| Inline `style={{...}}` blocks | MUI `sx` prop |
| `className="card"` | `<Paper sx={{ p: 2 }}>` |

### Tasks

- [ ] **Step 1: Create src/stores/rateCardStore.ts**

```ts
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { persist } from 'zustand/middleware';
import { fbPullMasterRC, fbPushMasterRC, fbSubscribeMasterRC } from '@/lib/firebase';
import { migrateLegacyRateCard } from '@/lib/storage';
import { debounce } from '@/lib/util';
import { useAuthStore } from './authStore';
import type { RateCard } from '@/types';
import type { Unsubscribe } from 'firebase/firestore';

const EMPTY_RC: RateCard = { hotels: {}, visaRates: {}, otherRates: {} };

type Status = 'idle' | 'syncing' | 'error';

type RateCardState = {
  rates: RateCard;
  status: Status;
  init: () => Unsubscribe | undefined;
  setRates: (next: RateCard) => void;
  updateHotels: (city: string, rows: RateCard['hotels'][string]) => void;
  updateVisa: (visaRates: RateCard['visaRates']) => void;
  updateOtherRate: (key: string, value: RateCard['otherRates'][string]) => void;
};

let pushDebounced:
  | ((rc: RateCard, pushedBy: string) => void)
  | null = null;

export const useRateCardStore = create<RateCardState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        rates: EMPTY_RC,
        status: 'idle',

        init: () => {
          // 1. One-time legacy migration.
          const migrated = migrateLegacyRateCard();
          if (migrated) set({ rates: migrated });

          // 2. Pull current cloud state.
          void fbPullMasterRC().then((cloud) => {
            if (cloud) set({ rates: { hotels: cloud.hotels, visaRates: cloud.visaRates, otherRates: cloud.otherRates } });
          });

          // 3. Wire push debouncer (2s, matches legacy auto-sync).
          if (!pushDebounced) {
            pushDebounced = debounce((rc: RateCard, pushedBy: string) => {
              fbPushMasterRC(rc, pushedBy)
                .then(() => set({ status: 'idle' }))
                .catch(() => set({ status: 'error' }));
            }, 2000);
          }

          // 4. Subscribe to remote changes from other clients.
          return fbSubscribeMasterRC((cloud) => {
            set({ rates: { hotels: cloud.hotels, visaRates: cloud.visaRates, otherRates: cloud.otherRates } });
          });
        },

        setRates: (next) => {
          const u = useAuthStore.getState().currentUser;
          const pushedBy = u ? `${u.name} (${u.role})` : 'unknown';
          set({ rates: next, status: 'syncing' });
          pushDebounced?.(next, pushedBy);
        },

        updateHotels: (city, rows) => {
          const next: RateCard = { ...get().rates, hotels: { ...get().rates.hotels, [city]: rows } };
          get().setRates(next);
        },

        updateVisa: (visaRates) => {
          const next: RateCard = { ...get().rates, visaRates };
          get().setRates(next);
        },

        updateOtherRate: (key, value) => {
          const next: RateCard = { ...get().rates, otherRates: { ...get().rates.otherRates, [key]: value } };
          get().setRates(next);
        },
      }),
      { name: 'vte_master_rate_card' },
    ),
  ),
);

```

- [ ] **Step 2: Wire rateCardStore.init() into MainApp**

Modify `src/components/shell/MainApp.tsx`:

```tsx
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useRateCardStore } from '@/stores/rateCardStore';
import { AppShell } from './AppShell';
import { LoginScreen } from './LoginScreen';

export function MainApp() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const authInit = useAuthStore((s) => s.init);

  useEffect(() => {
    void authInit();
  }, [authInit]);

  useEffect(() => {
    if (!currentUser) return;
    const unsub = useRateCardStore.getState().init();
    return () => unsub?.();
  }, [currentUser]);

  if (!currentUser) return <LoginScreen />;
  return <AppShell />;
}
```

- [ ] **Step 3: Verify typecheck and build (store-only, no UI yet)**

Run: `npm run typecheck && npm run build`
Expected: passes.

- [ ] **Step 4: Inventory legacy rates components**

Run:
```bash
grep -n "^const HotelModal\|^const VisaModal\|^const RateCardModal\|^const RatesPanel\|^function HotelModal\|^function VisaModal\|^function RateCardModal\|^function RatesPanel\|^const HistPanel\|^const RatesPanel" index.html
```
Record the line range for each of: `RatesPanel`, `RateCardModal`, `HotelModal`, `VisaModal`. Save these ranges in a scratch note — every subsequent port step references them.

- [ ] **Step 5: Read RatesPanel end-to-end**

Read the lines for `RatesPanel` from Step 4's inventory. Identify:
- What state it owns (likely `selectedCity`, modal-open flags).
- Which localStorage keys it reads (`vte_hotels_v2_*`, `vte_rate_*`, `vte_visa_rates`).
- Which child components it renders.
- Which buttons open which modals.

Write this as a 10-line summary in the scratch note before touching code.

- [ ] **Step 6: Port RatesPanel skeleton**

Create `src/components/rates/RatesPanel.tsx`. Replace each `localStorage.getItem('vte_hotels_v2_<city>')` read with a selector: `const hotels = useRateCardStore(s => s.rates.hotels)`. Replace each `localStorage.setItem` + `_autoSync()` pair with the corresponding store action (`updateHotels`, `updateVisa`, `updateOtherRate`). Replace markup using the MUI cheat-sheet above.

If `RatesPanel` is currently a single ~200-line component, port it as a single file. If it exceeds 300 lines after MUI conversion, extract sub-components for the top-bar, the city picker, and the hotel-table panel into separate files in the same directory.

Verify after this step: `npm run typecheck && npm run build`. If RatesPanel imports `HotelModal` / `VisaModal` / `RateCardModal` that don't exist yet, stub them as:

```tsx
// temporary stub during port
export function HotelModal(_props: { open: boolean; onClose: () => void }) {
  return null;
}
```

- [ ] **Step 7: Wire RatesPanel into AppShell**

Modify `src/components/shell/AppShell.tsx`:

```tsx
import { RatesPanel } from '@/components/rates/RatesPanel';
// ...inside the tab-content map:
{TABS.map((t) =>
  t.key === active ? (
    t.key === 'rates' ? <RatesPanel key={t.key} /> : <TabPlaceholder key={t.key} tabKey={t.key} label={t.label} />
  ) : null,
)}
```

Manually verify in browser: `npm run dev` → login → "Rate Card" tab shows the new panel (still partial — modals not implemented yet). Other tabs still show the placeholder.

- [ ] **Step 8: Read and port HotelModal**

Same procedure as Step 6 but for `HotelModal`. Key things to preserve:
- Per-city tabs (use `<Tabs>` from MUI).
- Row add/edit/delete (use `<DataGrid>` with `editable` columns, or a controlled `<TextField>` table if the row shape is too dynamic for DataGrid columns).
- "Save" closes the modal and calls `updateHotels(city, rows)`.

Replace the stub from Step 6. Verify build and manually test by opening the modal from RatesPanel.

- [ ] **Step 9: Read and port VisaModal**

Same procedure. Calls `updateVisa(visaRates)` on save.

- [ ] **Step 10: Read and port RateCardModal**

Same procedure. This is the "manage all" view — likely calls a mix of `updateHotels`, `updateVisa`, `updateOtherRate` depending on which sub-section the user is editing.

- [ ] **Step 11: End-to-end manual smoke**

Run `npm run dev`. With `ceo` logged in:
1. Open Rate Card tab.
2. Open HotelModal, add a hotel row for a city, save.
3. Open a second browser tab on the same `/preview/` URL, log in as a different user (e.g. `sale1`).
4. Wait ~3 seconds. The new hotel row should appear in the second tab's view without a refresh (Firestore `onSnapshot` push).
5. In legacy app (open `/legacy.html` in a third tab, log in), open the rate card. The new row should appear there too (since both apps read the same `viettours/master_rate_card` document).

This bidirectional sync between Vite app and legacy app is the load-bearing property that makes Phase 3 incremental porting safe. **If sync does not work, stop and debug before proceeding to cutover.**

- [ ] **Step 12: Verify typecheck, lint, build**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: all pass.

- [ ] **Step 13: Commit (split into 2 commits for review hygiene)**

```bash
git add src/stores/rateCardStore.ts src/types/index.ts src/components/shell/MainApp.tsx
git commit -m "feat(rates): add rateCardStore with Firestore sync and legacy migration"

git add src/components/rates/ src/components/shell/AppShell.tsx
git commit -m "feat(rates): port Rates tab UI to MUI (RatesPanel, HotelModal, VisaModal, RateCardModal)"
```

---

## PR-2.2 — CUTOVER

This PR flips the deployment so the Vite build serves at the root URL instead of `/preview/`. Read every step before starting.

**Files:**
- Modify: `vite.config.ts`, `.github/workflows/deploy.yml`

### Tasks

- [ ] **Step 1: Pre-flight check**

Confirm in the live site (before this PR is merged):
1. `https://viettoursdev.github.io/tour-cost-calculator/preview/` — login works, Rates tab works, bidirectional Firestore sync verified.
2. `https://viettoursdev.github.io/tour-cost-calculator/` — legacy app still works as it always did.
3. There are no open PRs touching `index.html`, `vite.config.ts`, or `.github/workflows/deploy.yml` other than this one.

If any of these fail, do not proceed.

- [ ] **Step 2: Flip Vite base path**

Modify `vite.config.ts`:

```ts
// before:
base: '/tour-cost-calculator/preview/',
// after:
base: '/tour-cost-calculator/',
```

- [ ] **Step 3: Simplify the deploy workflow**

Modify `.github/workflows/deploy.yml`. Replace the `build:` job's `steps:` with:

```yaml
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build
      - run: cp public/legacy.html dist/legacy.html
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
```

Specifically: remove the lines `cp public/legacy.html dist/index.html` (legacy is no longer at root — Vite owns root now). Keep the `cp public/legacy.html dist/legacy.html` line (fallback still available).

- [ ] **Step 4: Verify locally**

Run: `npm run build`
Expected: `dist/index.html` is the small Vite shell (not the legacy 10K-line file), `dist/assets/` contains hashed bundles.

```bash
ls -la dist/
# expect: index.html (tiny), assets/, vite.svg or similar
```

Then run preview: `npm run preview`
Expected: serves at `http://localhost:4173/tour-cost-calculator/`, login + Rates tab work, other tabs show "Open in legacy" with link to `/tour-cost-calculator/legacy.html` (won't resolve locally — that's expected, it will resolve in production).

- [ ] **Step 5: Commit and open the cutover PR**

```bash
git add vite.config.ts .github/workflows/deploy.yml
git commit -m "chore(cutover): switch Pages root to Vite build; legacy preserved at /legacy.html"
```

Open the PR with a clear description: this is the cutover, what URLs change, the rollback procedure (revert the commit, push, redeploys legacy at root in ~2 min), and a request for explicit reviewer approval before merge.

- [ ] **Step 6: Post-merge verification**

After CI completes (~2–5 min after merge):
1. `https://viettoursdev.github.io/tour-cost-calculator/` — Vite app loads. Login screen appears.
2. Log in with `ceo` / `ceo123` — Rates tab works.
3. `https://viettoursdev.github.io/tour-cost-calculator/legacy.html` — legacy app loads and works.
4. From legacy app, edit a rate; from Vite app, confirm the change appears within ~3 seconds.

- [ ] **Step 7: Announce the cutover**

Notify the team:
- New app is live at the same URL.
- For any tab that shows "Open in legacy", click the link or bookmark `/tour-cost-calculator/legacy.html`.
- Report any regressions immediately.

- [ ] **Step 8: Update CONTEXT.md**

Append a "Phase 2 cutover complete" note to `CONTEXT.md` section 6 ("Current Status") with the date and a one-line summary. Commit separately:

```bash
git add CONTEXT.md
git commit -m "docs: record Phase 2 cutover to Vite build"
```

---

## Done condition for Phases 0–2

- Production URL `https://viettoursdev.github.io/tour-cost-calculator/` serves the Vite app.
- Login works against existing user accounts in Firestore.
- Rate Card tab is fully functional and bidirectionally syncs with the legacy app via `viettours/master_rate_card`.
- Every other tab shows the "Open in legacy" placeholder with a working link to `/legacy.html`.
- `/legacy.html` serves the pre-refactor app unmodified, reading/writing the same Firestore docs.
- CI runs `lint + typecheck + build` on every push to `main`.
- Rollback path (revert the cutover commit) is tested mentally and the team knows about `/legacy.html`.

Next plan: Phase 3 — tab-by-tab port (one focused plan per tab, written after Phase 2 ships).

---

## Carryovers for Phase 3 (from PR-2.1 implementation)

The PR-2.1 implementer surfaced these deliberate simplifications and one plan misattribution. Phase-3 plans must address each:

1. **Plan misattribution on `RatesPanel`.** Legacy `RatesPanel` (legacy.html:2641) is a small currency-conversion widget (USD/EUR → VND), NOT the rate-card editor. The actual rate-card UI in legacy is a dropdown on the calculator toolbar at legacy.html:8700 opening the three modals. PR-2.1 implemented `RatesPanel` as a launcher panel of category cards (one per Hotel/Visa/Transport/Staff/DMC/etc.) opening the modals — surfacing the dropdown's behavior as a first-class tab. **Accepted by user.** The original currency-conversion widget belongs to the Cost view; port it there in PR-3.1 if still needed.

2. **Seed data tables omitted.** Legacy modals seed empty user state from multi-hundred-line constant tables (`HOTEL_DB`, `RATE_VISA`, `RATE_TRANSPORT`, `RATE_STAFF`, `RATE_DMC`). PR-2.1's modals start from whatever is already saved or let users add rows from scratch. **PR-3.1 (Cost view) must either ship the seed tables in `src/lib/seeds/` or seed them into Firestore on first run** — pick one, document the decision in the Phase-3 plan.

3. **`onPick` integration omitted from modals.** Legacy modals double as "pick a row into the current quote" widgets. PR-2.1's modals are edit-only. Re-add the `onPick` callback when the Cost view is ported in PR-3.1 — likely as a second prop on each modal that toggles its action buttons between "Save" and "Save & insert into quote."

4. **`RateCardModal` simplified to a generic table editor.** Legacy `RateCardModal` (legacy.html:2221–2640, ~420 LoC) branches across 8+ category-specific layouts (transport with city selector, intl-staff with country selector, etc.). PR-2.1 implemented one generic table-of-records editor parameterised by `type`, with columns derived from saved-row key union (defaults to `label/min/max/unit/note`). Numeric coercion is best-effort by column-name regex. **A Phase-3 PR (likely PR-3.6 Contract core or earlier if a Sales user reports friction) may want a richer per-category editor.** Triage based on actual user feedback after cutover.

5. **Hotel last-selected city not persisted.** Legacy stored `vte_hotel_city` for cross-session UX. PR-2.1's HotelModal resets to HCM each time it opens. If parity matters, extend `rateCardStore` with `selectedCity: string` + persist via the existing `persist` middleware partialize.

6. **Visa "bulk-add to quote" footer omitted.** Depends on `onPick` integration (item 3).

7. **`status` chip added beyond plan.** PR-2.1 added a small "Đang đồng bộ / Đã đồng bộ / Lỗi" chip to the RatesPanel header surfacing the store's `status` field. Kept — useful UX. No action needed.
