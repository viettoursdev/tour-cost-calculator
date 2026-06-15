# Firebase Dual-Project Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a brand-new Firebase project as the production database, keep the suspended `tour-cost-calculator-4336c` alive as a backup destination, and run an **hourly** GitHub Actions workflow that snapshots NEW → OLD so the backup stays at most ~1 hour stale.

**Architecture:** Two phases. **Phase 1** is the one-shot cutover — point the app at the NEW project via env vars (no source-code change), copy live data NEW ← OLD using the existing node scripts (after fixing the script's missing-collections gap), deploy rules to NEW. **Phase 2** is the hourly backup — parameterize the same scripts so they can run in either direction, then drive them from a scheduled `.github/workflows/backup.yml` workflow that holds both service-account JSONs as GitHub secrets and writes a full snapshot of NEW into OLD every hour. The OLD project is never served to clients; it exists only as a Firestore destination for the cron and a manual rollback target.

**Tech Stack:** Firebase Admin SDK (node), Firebase CLI (`firebase-tools`) for rules deploy + login, Vite env vars, GitHub Actions secrets + scheduled workflows.

---

## File Map

**Phase 1 — Migration**
- **Modify:** `scripts/firestore-export.mjs` — change `OLD_DB_NAME` to default, complete `SINGLE_DOCS` + `DYNAMIC_COLLECTIONS`, parameterize the SA path via env var, refresh header docstring.
- **Modify:** `scripts/firestore-import.mjs` — parameterize the SA path via env var, refresh header docstring (no other logic change).
- **Modify:** `.env` (gitignored) — replace the 6 `VITE_FIREBASE_*` values with the new project's values.
- **Modify:** `CLAUDE.md` — update the `Firebase` block with new project ID and auth domain; add a note about the dual-project setup.
- **Modify:** `docs/firebase-migration.md` — generalize from "viettours → tour-cost-calculator" to a project-agnostic runbook and document the dual-project arrangement.
- **Create (transient, gitignored):** `old-service-account.json`, `new-service-account.json`, `firestore-dump.json` — deleted in the cleanup task once they live in GitHub secrets.
- **GitHub repo settings (manual):** 6 GitHub Actions secrets updated via the web UI (the `VITE_FIREBASE_*` cutover secrets).

**Phase 2 — Hourly backup**
- **Create:** `.github/workflows/backup.yml` — scheduled cron + manual `workflow_dispatch`. Runs hourly at `:00`. Materializes the two SA JSONs from secrets into tmpfiles, runs export from NEW, runs import into OLD, deletes tmpfiles, uploads `firestore-dump.json` as a 30-day artifact (off-Firestore third copy).
- **GitHub repo settings (manual):** 2 more secrets — `FIREBASE_BACKUP_SRC_SA_JSON` (NEW project SA) and `FIREBASE_BACKUP_DEST_SA_JSON` (OLD project SA).

---

## Pre-flight

Read once at the start, no actions yet:

- The current project is `tour-cost-calculator-4336c`, default DB. Its **browser** API key is suspended, but Firestore read/write via the Admin SDK (service account JWT) is a separate IAM channel and is expected to still work. **We rely on this assumption for Phase 2**: the hourly backup writes into OLD as a service account. If the very first cron run fails with permission errors, the suspension is broader than expected and we'll need to either un-suspend the OLD project or pick a third Firebase project to act as the backup destination.
- The new project does not exist yet. The first batch of tasks creates it.
- Production magic-link sign-in is broken right now (that's why we're migrating). Local dev with `npm run dev` is also broken for the same reason. So we can't "smoke test before cutover" against the old project — verification happens after the cutover, against the new project.
- All migration artifacts (`*-service-account.json`, `firestore-dump.json`) are already in `.gitignore`. Do not commit them.
- Cost expectation (Phase 2): hourly full-snapshot writes ≈ ~720k Firestore writes/month on OLD project ≈ **~$1.30/month**. GitHub Actions: ~18 hrs/month — free for public repos, meaningful slice of the 2000-min monthly quota for private repos. If this repo is private and budget-sensitive, consider dropping cadence to daily in Task 14.

---

## Task 1: Branch + working notes

**Files:**
- Create: `MIGRATION_NOTES.md` (gitignored, scratch space for IDs/URLs you'll paste as you go)

- [ ] **Step 1: Create migration branch**

```bash
git checkout -b firebase-migration-2026-06-15
```

- [ ] **Step 2: Add the scratch file to gitignore**

Edit `.gitignore`, append at the bottom:

```
# Transient migration scratch notes — never commit.
MIGRATION_NOTES.md
```

- [ ] **Step 3: Create the scratch file with the fields you'll fill in**

```bash
cat > MIGRATION_NOTES.md <<'EOF'
# Migration scratch (gitignored)

NEW_PROJECT_ID:
NEW_PROJECT_NUMBER:
NEW_API_KEY:
NEW_AUTH_DOMAIN:
NEW_STORAGE_BUCKET:
NEW_MESSAGING_SENDER_ID:
NEW_APP_ID:

OLD_PROJECT_ID: tour-cost-calculator-4336c

Export single-doc count expected (from console):
Export dynamic-collection counts expected (from console):
EOF
```

- [ ] **Step 4: Commit gitignore change only**

```bash
git add .gitignore
git commit -m "chore(migration): gitignore MIGRATION_NOTES.md scratch file"
```

---

# Phase 1 — Migrate to the new project

## Task 2: Audit + update the export script

The current script is missing 9 single docs and 5 dynamic collections. We add them by reading the truth from `src/lib/firebase.ts` and aligning. We also flip the source database from named `viettours` to default AND parameterize the SA path via env var (Phase 2's hourly backup will set this env var to point at the NEW-project key instead of the OLD-project key, with the rest of the script unchanged).

**Files:**
- Modify: `scripts/firestore-export.mjs`

- [ ] **Step 1: Re-read the source of truth**

Open `src/lib/firebase.ts` and confirm the complete set of single-doc collections used today. Grep is enough:

```bash
grep -E "^const [A-Z_]+_DOC = doc\(db, " src/lib/firebase.ts
grep -E "= doc\(db, '[a-z_]+', '[a-z_]+'\)" src/lib/firebase.ts | sort -u
```

Confirm the list below matches what you see. If new collections have been added since this plan was written, add them too.

- [ ] **Step 2: Update the script header + constants**

Replace the entire `scripts/firestore-export.mjs` file with this content. The changes vs. the previous version: header is rewritten for the new source layout, `OLD_DB_NAME` is removed and `getFirestore(app)` uses the default DB, SINGLE_DOCS + DYNAMIC_COLLECTIONS are completed, and the SA path is read from `SA_PATH` env var (with the original `old-service-account.json` as default, so the Phase 1 migration runbook keeps working unchanged).

```javascript
#!/usr/bin/env node
/**
 * Firestore export — direction-agnostic.
 *
 * Reads every known doc + dynamic collection from whichever project the
 * service-account JSON at SA_PATH belongs to, and writes a single JSON file
 * (OUT_PATH). Assumes the source project uses the DEFAULT Firestore database.
 *
 * Run from the repo root:
 *   node scripts/firestore-export.mjs
 *   SA_PATH=new-service-account.json node scripts/firestore-export.mjs   # alt source
 *
 * Env vars:
 *   SA_PATH   default: old-service-account.json
 *   OUT_PATH  default: firestore-dump.json
 *
 * Idempotent: safe to re-run; later runs overwrite OUT_PATH.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SA_PATH = process.env.SA_PATH || 'old-service-account.json';
const OUT_PATH = process.env.OUT_PATH || 'firestore-dump.json';

const SINGLE_DOCS = [
  ['viettours', 'master_rate_card'],
  ['viettours', 'user_accounts'],
  ['viettours', 'ncc_master'],
  ['viettours', 'contracts_master'],
  ['viettours', 'quote_history'],
  ['viettours', 'dmc_quote_history'],
  ['viettours', 'customer_list'],
  ['viettours', 'fx_rates'],
  ['viettours', 'payment_approvals'],
  ['viettours', 'itinerary_index'],
  ['viettours', 'restaurant_list'],
  ['viettours', 'menu_index'],
  ['viettours', 'visa_products'],
  ['viettours', 'visa_proc_index'],
  ['viettours', 'visa_projects'],
  ['viettours', 'poi_library'],
];

const DYNAMIC_COLLECTIONS = [
  'quote_projects',
  'dmc_quote_projects',
  'user_notifications',
  'notification_threads',
  'tour_payments',
  'tour_itineraries',
  'tour_menus',
  'visa_procedures',
];

function loadKey() {
  try {
    return JSON.parse(readFileSync(SA_PATH, 'utf8'));
  } catch {
    console.error(
      `ERROR: ${SA_PATH} not found.\n`
      + 'Download it from Firebase Console → Project Settings → Service accounts → Generate new private key,\n'
      + `and save as ${SA_PATH} at the repo root.`,
    );
    process.exit(1);
  }
}

async function main() {
  const sa = loadKey();
  const app = initializeApp({ credential: cert(sa) }, 'export');
  const db = getFirestore(app);

  const dump = { singles: {}, collections: {} };

  console.log(`Reading ${SINGLE_DOCS.length} single documents…`);
  for (const [coll, docId] of SINGLE_DOCS) {
    const snap = await db.collection(coll).doc(docId).get();
    if (snap.exists) {
      dump.singles[`${coll}/${docId}`] = snap.data();
      console.log(`  ✓ ${coll}/${docId} (${Object.keys(snap.data() ?? {}).length} top-level keys)`);
    } else {
      console.log(`  - ${coll}/${docId} (does not exist, skipping)`);
    }
  }

  for (const coll of DYNAMIC_COLLECTIONS) {
    console.log(`Reading dynamic collection ${coll}…`);
    const snap = await db.collection(coll).get();
    dump.collections[coll] = {};
    snap.forEach((doc) => {
      dump.collections[coll][doc.id] = doc.data();
    });
    console.log(`  ✓ ${coll} (${snap.size} docs)`);
  }

  writeFileSync(OUT_PATH, JSON.stringify(dump, null, 2));
  const bytes = readFileSync(OUT_PATH).length;
  console.log(`\nDump written to ${OUT_PATH} (${(bytes / 1024).toFixed(1)} KB).`);
  console.log('Next: download a service-account key for the NEW project as `new-service-account.json`, then run `node scripts/firestore-import.mjs`.');
}

main().catch((e) => {
  console.error('Export failed:', e);
  process.exit(1);
});
```

- [ ] **Step 3: Lint to make sure nothing in the file broke**

```bash
npx eslint scripts/firestore-export.mjs --max-warnings 0
```

Expected: no output (zero warnings, zero errors).

- [ ] **Step 4: Commit**

```bash
git add scripts/firestore-export.mjs
git commit -m "chore(migration): cover all current Firestore collections + default DB source"
```

---

## Task 3: Parameterize + refresh the import script

The import logic is already correct (it writes via `getFirestore(app)` to the default DB). We just need to parameterize the SA path so Phase 2's hourly backup can point it at the OLD-project key, and refresh the stale header comment.

**Files:**
- Modify: `scripts/firestore-import.mjs`

- [ ] **Step 1: Replace the docstring + SA_PATH constant**

Open `scripts/firestore-import.mjs`. Replace the top docstring (the `/** … */` block) AND the `const SA_PATH = 'new-service-account.json';` line with:

```javascript
/**
 * Firestore import — direction-agnostic.
 *
 * Reads DUMP_PATH (default firestore-dump.json) and writes every doc to
 * whichever project the service-account JSON at SA_PATH belongs to. Writes
 * to the DEFAULT Firestore database.
 *
 * Run from the repo root after `firestore-export.mjs`:
 *   node scripts/firestore-import.mjs
 *   SA_PATH=old-service-account.json node scripts/firestore-import.mjs   # alt dest
 *
 * Env vars:
 *   SA_PATH    default: new-service-account.json
 *   DUMP_PATH  default: firestore-dump.json
 *
 * Uses set() — safe to re-run; existing docs are overwritten with dump data.
 * Bails early if DUMP_PATH is missing.
 */
```

Then locate `const SA_PATH = 'new-service-account.json';` and `const DUMP_PATH = 'firestore-dump.json';` and replace with:

```javascript
const SA_PATH = process.env.SA_PATH || 'new-service-account.json';
const DUMP_PATH = process.env.DUMP_PATH || 'firestore-dump.json';
```

- [ ] **Step 2: Lint**

```bash
npx eslint scripts/firestore-import.mjs --max-warnings 0
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add scripts/firestore-import.mjs
git commit -m "chore(migration): refresh firestore-import.mjs header"
```

---

## Task 4: Create the new Firebase project (Console)

This is all manual work in the Firebase Console. No code changes — just record what you did in `MIGRATION_NOTES.md` as you go.

- [ ] **Step 1: Create the project**

Go to https://console.firebase.google.com → **Add project**.

- Project name: pick something. Suggest `viettours-prod` or `tour-cost-calculator-v2` — anything that's not the suspended one.
- Disable Google Analytics if asked.

Once created, copy the **Project ID** (under Project Settings → General → "Project ID") into `MIGRATION_NOTES.md` as `NEW_PROJECT_ID`.

- [ ] **Step 2: Enable Firestore**

**Build → Firestore Database → Create database**

- Mode: **Production**.
- Location: **asia-southeast1 (Singapore)** — must match the old project.
- Database ID: leave as **`(default)`**.

- [ ] **Step 3: Enable Auth providers**

**Authentication → Get started → Sign-in method:**

- Enable **Email/Password** (master toggle on).
- Within it, also enable **Email link (passwordless sign-in)**.

- [ ] **Step 4: Configure authorized domains**

**Authentication → Settings → Authorized domains** → add `viettoursdev.github.io`. (`localhost` is already there.)

- [ ] **Step 5: Customize the magic-link email template**

**Authentication → Templates → Email address sign-in**. Reuse the Vietnamese template from the suspended project — open it in the old console, copy the sender name + subject + body, paste into the new one. Keep `%LINK%` exactly.

- [ ] **Step 6: Register the web app and capture its config**

**Project Settings → General → Your apps → Add app → Web**.

- App nickname: "Viettours Tour Cost Calculator" (anything; not user-visible).
- Skip Firebase Hosting.

When the Firebase SDK snippet shows up, copy the six fields into `MIGRATION_NOTES.md`:

- `apiKey` → `NEW_API_KEY`
- `authDomain` → `NEW_AUTH_DOMAIN`
- `projectId` → `NEW_PROJECT_ID` (should match Step 1)
- `storageBucket` → `NEW_STORAGE_BUCKET`
- `messagingSenderId` → `NEW_MESSAGING_SENDER_ID`
- `appId` → `NEW_APP_ID`

- [ ] **Step 7: Download a NEW-project service account key**

**Project Settings → Service accounts → Generate new private key**. Save the downloaded JSON as `new-service-account.json` at the repo root.

- [ ] **Step 8: Download an OLD-project service account key**

Same flow on the suspended project (`tour-cost-calculator-4336c`). Save as `old-service-account.json` at the repo root.

- [ ] **Step 9: Verify both keys are gitignored before you do anything else**

```bash
git status --short
```

Expected: `old-service-account.json` and `new-service-account.json` should NOT appear in `git status`. If they do, the `.gitignore` is broken — stop and fix before continuing.

---

## Task 5: Record expected counts from the OLD console (sanity check)

Before we trust the export, snapshot what the old project actually contains so we have something to compare the import against.

- [ ] **Step 1: Open the OLD project console → Firestore → Data**

For each top-level collection, look at the document count shown in the console and write it into `MIGRATION_NOTES.md` under "Expected counts". You only need counts for the dynamic collections (`quote_projects`, `dmc_quote_projects`, `user_notifications`, `notification_threads`, `tour_payments`, `tour_itineraries`, `tour_menus`, `visa_procedures`).

The Firebase Console doesn't give per-collection counts directly; click into each and either count visible rows or scroll/skim. Approximate is fine — we just need to detect order-of-magnitude losses.

For singletons, just confirm each of the 16 documents exists under `viettours/`. Tick them off in your notes.

- [ ] **Step 2: No commit (this is purely your scratch notes).**

---

## Task 6: Export from the OLD project

- [ ] **Step 1: Run the export**

```bash
node scripts/firestore-export.mjs
```

Expected output: one line per single doc (`✓` or `-`), one line per dynamic collection with a count, and a final "Dump written to firestore-dump.json (X KB)." line. Should take 10–60s depending on data volume.

- [ ] **Step 2: Compare the printed counts against your notes**

For each dynamic collection, the count in the script output should match (within a doc or two) the count you recorded in `MIGRATION_NOTES.md`. If anything is off by an order of magnitude, stop and investigate — likely a misnamed collection in the script.

Also check: any singleton showing `- (does not exist, skipping)` is a missing doc. Cross-check against your console snapshot. Some are legitimately optional (e.g. `payment_approvals` may not exist if no approvals have been filed yet) — that's fine. But `master_rate_card`, `user_accounts`, `contracts_master`, `quote_history` MUST exist; if any of those are missing, you're talking to the wrong project.

- [ ] **Step 3: Spot-check the dump**

```bash
node -e "const d = JSON.parse(require('fs').readFileSync('firestore-dump.json')); console.log('singles:', Object.keys(d.singles).length, 'collections:', Object.keys(d.collections).map(k => k+':'+Object.keys(d.collections[k]).length).join(' '));"
```

Expected: a summary line. Numbers should be reasonable.

- [ ] **Step 4: Confirm user_accounts has emails**

The app resolves identity by matching the magic-link verified email (case-insensitive) against `User.email` in `viettours/user_accounts`. Every active account MUST have an `email` ending in `@viettours.com.vn`, or that user can't sign in post-cutover.

```bash
node -e "const d = JSON.parse(require('fs').readFileSync('firestore-dump.json')); const u = d.singles['viettours/user_accounts']?.users || []; console.log('users:', u.length); const missing = u.filter(x => !x.email || !x.email.endsWith('@viettours.com.vn')); console.log('missing/bad email:', missing.length); if (missing.length) console.log(missing.map(x => x.u || x.name));"
```

Expected: `users: <N>`, `missing/bad email: 0`. If anything is missing, you'll need to fix it in the OLD project (via the in-app admin modal), re-run the export, and re-check. Don't proceed until this is clean — those users will be locked out otherwise.

- [ ] **Step 5: No commit (the dump is gitignored).**

---

## Task 7: Import into the NEW project

- [ ] **Step 1: Run the import**

```bash
node scripts/firestore-import.mjs
```

Expected output: one line per write, ending with a "Done" / summary line. Should take longer than the export (writes are slower than reads).

- [ ] **Step 2: Open the NEW project console → Firestore → Data**

Verify visually:

- The `viettours/` collection contains all the singleton docs you saw in the OLD project.
- `quote_projects/` and `dmc_quote_projects/` have entries (expand a few; they should have a `versions` array and a `currentState` object).
- `user_notifications/` has per-username docs.
- Each of `notification_threads`, `tour_payments`, `tour_itineraries`, `tour_menus`, `visa_procedures` has data if the old project had data in them.

- [ ] **Step 3: Verify counts roughly match**

For each dynamic collection, click into it on the NEW console and confirm the count is in the same ballpark as the OLD. (Firebase console "Number of documents" is approximate; ±a few is fine.)

- [ ] **Step 4: No commit (dump is gitignored).**

---

## Task 8: Deploy Firestore rules to the new project

Rules live in `firestore.rules` and currently require `request.auth != null` plus an `@viettours.com.vn` email. Those rules are project-agnostic so we can deploy them as-is.

- [ ] **Step 1: Log in to Firebase CLI (if you haven't recently)**

```bash
npx firebase-tools login
```

This opens a browser window. Sign in with your Viettours Google account.

- [ ] **Step 2: Deploy rules to the NEW project**

Use the NEW project ID from `MIGRATION_NOTES.md`:

```bash
npx firebase-tools deploy --only firestore:rules --project <NEW_PROJECT_ID>
```

Replace `<NEW_PROJECT_ID>` with the literal value (e.g. `viettours-prod`). Expected: "✔  Deploy complete!" with a link to the rules page.

- [ ] **Step 3: Verify in the console**

NEW project → Firestore Database → Rules tab. The rules should match `firestore.rules` from the repo. Last published timestamp should be "moments ago."

- [ ] **Step 4: No commit (firestore.rules wasn't changed).**

---

## Task 9: Local cutover — update `.env` and smoke-test

- [ ] **Step 1: Update `.env` with the new project's values**

Replace the file contents with the six values from `MIGRATION_NOTES.md`:

```
VITE_FIREBASE_API_KEY=<NEW_API_KEY>
VITE_FIREBASE_AUTH_DOMAIN=<NEW_AUTH_DOMAIN>
VITE_FIREBASE_PROJECT_ID=<NEW_PROJECT_ID>
VITE_FIREBASE_STORAGE_BUCKET=<NEW_STORAGE_BUCKET>
VITE_FIREBASE_MESSAGING_SENDER_ID=<NEW_MESSAGING_SENDER_ID>
VITE_FIREBASE_APP_ID=<NEW_APP_ID>
```

- [ ] **Step 2: Restart the dev server**

Kill any running `npm run dev`, then:

```bash
npm run dev
```

Expected: Vite starts on http://localhost:5173/tour-cost-calculator/ with no startup errors. (The `for (const [k, v] of Object.entries(firebaseConfig))` guard in `src/lib/firebase.ts` will throw at module load if any env var is missing — if you see that, double-check `.env`.)

- [ ] **Step 3: Smoke test — magic link sign-in**

In the browser:

1. Open http://localhost:5173/tour-cost-calculator/.
2. Enter your `@viettours.com.vn` email.
3. Click "Gửi link đăng nhập."
4. Open the email, click the link.
5. You should land back in the app, signed in.

Expected: no errors in the DevTools console, no `auth/permission-denied` from the new key. If the API key error reappears, it likely means the new project's API key restrictions block the localhost referer — check Google Cloud Console → APIs & Services → Credentials → Browser key.

- [ ] **Step 4: Smoke test — data loads**

Once signed in, verify:

- The quote history list populates (regular + DMC tabs).
- Open one quote → cost view shows the cost lines.
- Customers list, NCC list, contracts list all populate.
- Rate card modal opens with hotel data.

Spot-check just one or two items per area — we're verifying the wiring, not auditing the data (which we already verified at import).

- [ ] **Step 5: No commit (`.env` is gitignored).**

---

## Task 10: Update repo metadata (CLAUDE.md + migration doc)

This is the only step that produces a committed change for the cutover branch.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/firebase-migration.md`

- [ ] **Step 1: Update `CLAUDE.md` Firebase block**

Find the section that starts with `## Firebase` and the fenced block beneath it. Replace it with the NEW project's values from `MIGRATION_NOTES.md`. The env-var note below the block stays as-is (this morning's commit) — only the four-line config block changes.

```
Project ID:    <NEW_PROJECT_ID>
Database name: (default)
Location:      asia-southeast1
Auth Domain:   <NEW_AUTH_DOMAIN>
```

- [ ] **Step 2: Update `docs/firebase-migration.md` to be project-agnostic**

Open the file. Today's title and first line reference the very first migration ("from `viettours-cost-calculator` … to `tour-cost-calculator`"). Replace the title and first paragraph with:

```markdown
# Firebase Project Migration — workflow

End-to-end runbook for moving the app between Firebase projects. The current production project is recorded in `CLAUDE.md` → `## Firebase`. To do a migration, start fresh from this doc and have the export/import scripts in `scripts/` already cover all current collections (audit them against `src/lib/firebase.ts` before running).
```

Also update Stage 1 step 3's "Mode/Location/Database ID" wording if it still mentions the named DB — by now both old and new projects use the default DB, so the named-DB note can be removed.

Stage 3 "Code cutover" used to talk about editing `src/lib/firebase.ts` directly. That's no longer how cutover works — it's now `.env` (local) + GitHub Actions secrets (CI). Rewrite Stage 3 to:

```markdown
## Stage 3 — Code cutover

After data migration verified:

1. Update local `.env` with the new project's six `VITE_FIREBASE_*` values (template in `.env.example`).
2. Update GitHub Actions secrets with the same six values (Settings → Secrets and variables → Actions).
3. Update `CLAUDE.md` → `## Firebase` block with the new Project ID + Auth Domain.
4. No code changes are required — Firebase config is read from env vars at build time.
```

- [ ] **Step 3: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: both pass (these doc changes shouldn't affect either, but run them anyway).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/firebase-migration.md
git commit -m "docs(migration): point CLAUDE.md at the new Firebase project and generalize the runbook"
```

---

## Task 11: Production cutover — GitHub secrets + push

Without this step the deploy will ship a broken bundle pointing at the suspended project. Do this before pushing to `main`.

- [ ] **Step 1: Update the 6 GitHub Actions secrets**

Repo → Settings → Secrets and variables → Actions → Repository secrets. For each of the six existing secrets, click "Update" and paste the NEW value from `MIGRATION_NOTES.md`:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

If any of these don't exist yet (i.e. they weren't created when the env-var refactor was committed earlier), add them now via "New repository secret."

- [ ] **Step 2: Push the migration branch**

```bash
git push -u origin firebase-migration-2026-06-15
```

- [ ] **Step 3: Open the PR (or merge directly to main per the project's "direct push to main" convention)**

Per `CLAUDE.md`: "Direct push to `main`." If you're comfortable with that here:

```bash
git checkout main
git merge --ff-only firebase-migration-2026-06-15
git push origin main
```

Otherwise open a PR via `gh pr create` and merge it once you're ready.

- [ ] **Step 4: Watch the GitHub Actions deploy run**

Repo → Actions tab. Find the "Deploy" run triggered by the merge. Wait for "build" and "deploy" jobs to both go green. Should take ~2 minutes.

- [ ] **Step 5: Smoke test in production**

Open https://viettoursdev.github.io/tour-cost-calculator/ in a clean browser session (or incognito so cached auth state is gone). Repeat Task 9, Step 3 + Step 4 (magic-link sign-in, then spot-check data loads).

Expected: production now points at the NEW project. CEO + any other testers should be able to sign in.

If something is broken in production, see **Rollback** below.

---

## Task 12: Local credentials — hand off to GitHub then delete local copies

Once production smoke test passes, the service-account keys and dump can leave local disk. **Both SAs need to live on as GitHub Actions secrets** so Phase 2's hourly backup can use them — don't revoke them at the project level.

- [ ] **Step 1: Promote both SAs into GitHub Actions secrets**

Repo → Settings → Secrets and variables → Actions → New repository secret. Add two:

- `FIREBASE_BACKUP_SRC_SA_JSON` — paste the **entire contents** of `new-service-account.json` (it's the SOURCE for the backup, because NEW is the production primary). Multi-line is fine; GitHub stores JSON secrets verbatim.
- `FIREBASE_BACKUP_DEST_SA_JSON` — paste the **entire contents** of `old-service-account.json` (DEST for the backup).

Verify in the UI that both secrets show "Updated just now."

- [ ] **Step 2: Delete the local keys and dump**

```bash
rm -f old-service-account.json new-service-account.json firestore-dump.json
```

- [ ] **Step 3: Verify they're gone**

```bash
ls old-service-account.json new-service-account.json firestore-dump.json 2>&1 | grep "No such"
```

Expected: three "No such file" lines.

- [ ] **Step 4: Delete the scratch notes**

```bash
rm -f MIGRATION_NOTES.md
```

- [ ] **Step 5: Do NOT revoke the service accounts at the Firebase / IAM level**

Phase 2's hourly backup workflow needs both of them. If you want belt-and-suspenders security, you can revoke them later AFTER Phase 2 is running and rotate to new keys re-pasted into the same secrets. For now: leave them be.

---

# Phase 2 — Hourly NEW → OLD backup

Goal of this phase: the OLD project's Firestore stays at most ~1 hour stale compared to NEW, achieved via a scheduled GitHub Actions workflow.

## Task 13: Create the backup workflow

**Files:**
- Create: `.github/workflows/backup.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/backup.yml` with this content:

```yaml
name: Firestore backup (NEW → OLD)
on:
  schedule:
    # Top of every hour, UTC. Worst-case staleness on OLD: ~1 hour.
    - cron: '0 * * * *'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: firestore-backup
  cancel-in-progress: false

jobs:
  backup:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'
      - run: npm ci

      - name: Materialize service-account JSONs
        env:
          SRC_SA: ${{ secrets.FIREBASE_BACKUP_SRC_SA_JSON }}
          DEST_SA: ${{ secrets.FIREBASE_BACKUP_DEST_SA_JSON }}
        run: |
          printf '%s' "$SRC_SA"  > src-sa.json
          printf '%s' "$DEST_SA" > dest-sa.json
          chmod 600 src-sa.json dest-sa.json

      - name: Export NEW (source)
        env:
          SA_PATH: src-sa.json
        run: node scripts/firestore-export.mjs

      - name: Import into OLD (destination)
        env:
          SA_PATH: dest-sa.json
        run: node scripts/firestore-import.mjs

      - name: Upload dump as artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: firestore-dump-${{ github.run_id }}
          path: firestore-dump.json
          retention-days: 30

      - name: Scrub service-account files
        if: always()
        run: rm -f src-sa.json dest-sa.json
```

Notes:
- `printf '%s'` instead of `echo "$VAR" >` avoids an extra trailing newline that would break JSON parsing.
- `if: always()` on the scrub step makes sure SA files are deleted even if export/import failed.
- `concurrency: cancel-in-progress: false` queues overlapping runs instead of cancelling, so a slow run won't get killed by the next hourly trigger and leave OLD partially written.
- The artifact gives you a 30-day off-Firestore third copy. Storage is GB-month based but at our data size negligible.

- [ ] **Step 2: Lint the YAML**

```bash
npx -y --package=js-yaml node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/backup.yml', 'utf8')); console.log('YAML OK');"
```

Expected: `YAML OK`. (This just parses; semantic check happens when GitHub runs it.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/backup.yml
git commit -m "feat(backup): hourly Firestore snapshot NEW → OLD"
```

- [ ] **Step 4: Push to main**

```bash
git push origin main
```

GitHub Actions picks up the new workflow file on push. Cron will fire at the next top-of-hour.

---

## Task 14: Smoke-test the backup workflow manually

Before trusting the cron, kick off one run manually and watch it succeed end-to-end.

- [ ] **Step 1: Manually dispatch the workflow**

Repo → Actions → "Firestore backup (NEW → OLD)" → "Run workflow" → pick `main` → "Run workflow."

- [ ] **Step 2: Watch the run**

Click the new run as it starts. Steps to verify:

- "Materialize service-account JSONs" runs in ~1s.
- "Export NEW (source)" — open the logs; you should see one line per single doc and one per dynamic collection, ending with "Dump written…".
- "Import into OLD (destination)" — see writes succeed.
- "Upload dump as artifact" — artifact appears in the run summary, 30-day retention.

Expected total runtime: 60–120 seconds.

- [ ] **Step 3: If "Import into OLD" fails with permission-denied**

That means the OLD project's API key suspension extended to its service account (rare but possible). Two fallback paths:

1. Try to un-suspend via the GCP console for `tour-cost-calculator-4336c` (Billing → resolve any billing issues; IAM → confirm the SA isn't disabled). Re-run the workflow.
2. If un-suspension isn't possible, create a third Firebase project to act as the backup destination. Generate a fresh service-account key, update the `FIREBASE_BACKUP_DEST_SA_JSON` secret to point at it, re-run. Document the new destination in `MIGRATION_NOTES.md` (or revive that file) and in `CLAUDE.md`.

- [ ] **Step 4: Verify the backup landed in OLD project's Firestore**

Open the OLD project console → Firestore Database → Data. The data should match what's in NEW. Spot-check a recent quote — open the same quote in NEW and OLD, confirm `updatedAt` lines up (within the export window).

- [ ] **Step 5: Wait for the next scheduled run**

At the next top-of-hour UTC, a fresh run should fire automatically. Confirm in the Actions tab. If it doesn't fire within ~5 minutes after the hour, GitHub Actions cron occasionally lags on the free tier — wait a bit longer before troubleshooting.

---

## Task 15: Document the backup arrangement

Future-you (and CLAUDE.md readers) need to know that OLD is a live backup target, not just a dormant ex-prod project.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/firebase-migration.md`

- [ ] **Step 1: Append to `CLAUDE.md`'s `## Firebase` section**

Below the existing block (after the env-var note), add:

```markdown
**Dual-project backup arrangement.** `tour-cost-calculator-4336c` is kept alive as a Firestore-only backup destination. `.github/workflows/backup.yml` runs hourly, exports from the production project (NEW), and imports into `tour-cost-calculator-4336c` (OLD). Worst-case staleness on the backup: ~1 hour. The backup project is never served to clients — its browser API key is suspended and that's intentional. Service-account keys for both projects live as GitHub Actions secrets `FIREBASE_BACKUP_SRC_SA_JSON` (NEW) and `FIREBASE_BACKUP_DEST_SA_JSON` (OLD). To restore from backup: swap `.env` / GitHub `VITE_FIREBASE_*` secrets back to the OLD project's web SDK config (recorded in `MIGRATION_NOTES.md` during the migration, or re-fetchable from the OLD project's Console). The OLD project's API key suspension would need to be lifted first — see rollback notes in `docs/firebase-migration.md`.
```

- [ ] **Step 2: Append a Stage 6 to `docs/firebase-migration.md`**

After the existing Stages 1–5 + Rollback, add:

```markdown
## Stage 6 — Standing dual-project backup (optional)

Once the new project is live, you can keep the old one alive as a Firestore-only backup that's at most ~1 hour stale.

1. **Promote both service accounts to GitHub secrets** (if they aren't already):
   - `FIREBASE_BACKUP_SRC_SA_JSON` — the production (NEW) project's SA JSON.
   - `FIREBASE_BACKUP_DEST_SA_JSON` — the backup (OLD) project's SA JSON.
2. **Verify `.github/workflows/backup.yml` is on `main`.** It triggers hourly via cron, plus on `workflow_dispatch`.
3. **Manually dispatch one run** to confirm the wiring before letting cron take over. See the run's logs to check that export and import both succeeded; the OLD project's Firestore should now mirror NEW.
4. **Costs:** ~720k Firestore writes/month on the OLD project ≈ ~$1.30. GitHub Actions: ~18 minutes/month per run × 24/day × 30 days ≈ ~18 hrs (free for public repos).
5. **To stop the backup:** delete `.github/workflows/backup.yml`. Optionally also revoke the SAs and clear the two secrets.
```

- [ ] **Step 3: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/firebase-migration.md
git commit -m "docs(backup): document hourly NEW → OLD backup workflow"
git push origin main
```

---

## Rollback

If the new project misbehaves after cutover:

1. **First step: pause the hourly backup so it doesn't overwrite OLD's data with whatever bad state NEW is in.** Actions → "Firestore backup (NEW → OLD)" → "…" menu → "Disable workflow." OR delete the workflow file on a branch and merge to `main`.
2. **Auth still needs to work on OLD before you can serve users from it.** Either get the OLD project's browser API key un-suspended (Google Cloud Console → APIs & Services → Credentials → check billing + appeals) OR pick a third Firebase project as the new primary. The OLD project's API-key suspension is what triggered this whole exercise; until it's resolved, OLD is data-only.
3. **Once auth on OLD (or replacement) is restored:** update GitHub Actions secrets — the six `VITE_FIREBASE_*` values — back to the OLD project's web SDK config (which you recorded in `MIGRATION_NOTES.md` or can re-fetch from the OLD project's Console). Trigger a re-deploy (Actions → Deploy → "Run workflow" against `main`). Within ~2 minutes prod is back on the old project. OLD's data is at most ~1 hour stale relative to NEW thanks to the backup, plus you have the most recent dump as a workflow artifact.
4. **Worst case: nothing works.** Open a yet-another fresh Firebase project, follow Phase 1 of this plan again, importing from OLD (which still has your data).

---

## Done criteria

All of these must be true at the end:

**Phase 1 (migration):**
- [ ] Production at https://viettoursdev.github.io/tour-cost-calculator/ loads, magic-link sign-in works, every list view populates.
- [ ] `MIGRATION_NOTES.md`, `old-service-account.json`, `new-service-account.json`, `firestore-dump.json` no longer exist on the local disk.
- [ ] `CLAUDE.md` `## Firebase` block names the NEW project and includes the dual-project backup note.
- [ ] `npm run lint && npm run typecheck && npm run build` all pass on `main`.

**Phase 2 (hourly backup):**
- [ ] `.github/workflows/backup.yml` exists on `main`.
- [ ] `FIREBASE_BACKUP_SRC_SA_JSON` and `FIREBASE_BACKUP_DEST_SA_JSON` are set as GitHub Actions secrets.
- [ ] One manual `workflow_dispatch` run completed green, writing data into the OLD project's Firestore.
- [ ] At least one scheduled cron run also completed green (i.e. cron is actually firing).
- [ ] The OLD project's Firestore data visibly mirrors NEW (spot-checked at least one document).
