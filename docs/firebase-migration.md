# Firebase Project Migration — workflow

End-to-end runbook for moving the app between Firebase projects. The currently-active project is recorded in `CLAUDE.md` → `## Firebase`. There are two paths: **data-migration** (when you still have read access to the OLD project's data) and **fresh-bootstrap** (when you don't — e.g. the owner account was banned or the project was deleted).

## Stage 1 — Create the new Firebase project (Console)

1. https://console.firebase.google.com → **Add project** → pick a name; the project ID is derived from it and might get a numeric suffix if taken.
2. Disable Google Analytics if asked (not used).
3. **Build → Firestore Database → Create database**.
   - Mode: **Production**.
   - Location: **asia-southeast1 (Singapore)** to match the previous project.
   - Database ID: leave as **`(default)`**.
4. **Authentication → Get started**. Then **Sign-in method**:
   - Enable **Email/Password** (master toggle).
   - Within it, also enable **Email link (passwordless sign-in)**.
5. **Authentication → Settings → Authorized domains** → add `viettoursdev.github.io`. `localhost` is already present.
6. **Authentication → Templates → Email address sign-in** → customize sender name and the Vietnamese copy (reuse the template from the previous project; preserve `%LINK%`).
7. **Project Settings (⚙) → General → Your apps → Add app → Web** — register a web app, copy the SDK snippet's six fields (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
8. **Project Settings → Service accounts → Generate new private key**. Save as `new-service-account.json` at the repo root. Do not commit — it's gitignored.

## Stage 2 — Bring data into the new project (one of two paths)

### Path A: Data-migration (preferred — when OLD is still accessible)

1. On the OLD project, generate a service-account key. Save as `old-service-account.json` at the repo root.
2. From the repo root, run the export then import scripts:
   ```bash
   node scripts/firestore-export.mjs
   # Writes firestore-dump.json. Review the file — every expected collection should have content.

   SA_PATH=new-service-account.json node scripts/firestore-import.mjs
   # Writes the dump into the NEW project's default database.
   ```
3. Verify in the new project's Firebase Console → Firestore → Data:
   - `viettours/` should contain all expected singletons.
   - `quote_projects/`, `dmc_quote_projects/`, `user_notifications/`, `notification_threads/`, `tour_payments/`, `tour_itineraries/`, `tour_menus/`, `visa_procedures/` should all be populated.
4. Spot-check `viettours/user_accounts` — every active account must have an `email` field (`@viettours.com.vn`). If any are missing, add them via the in-app admin modal BEFORE Stage 3.

### Path B: Fresh-bootstrap (when OLD is inaccessible)

If you cannot generate a service-account key for the OLD project (account banned, project deleted, IAM revoked), accept the data loss and start fresh:

1. Skip the export/import scripts.
2. Seed at least one CEO user so sign-in resolves identity:
   ```bash
   # Edit scripts/seed-user-accounts.mjs and adjust SEED_USER if needed.
   node scripts/seed-user-accounts.mjs
   ```
3. Verify in the new project's Firestore Console: `viettours/user_accounts` should now contain one user. The seed script is idempotent — safe to re-run.
4. After cutover (Stage 3), use the in-app admin modal as the CEO to add the rest of the team. All other domain data (quotes, contracts, customers, rate cards) starts empty and must be re-entered manually.

## Stage 3 — Code cutover

After Stage 2 (either path) is verified:

1. Update local `.env` with the new project's six `VITE_FIREBASE_*` values (template in `.env.example`).
2. Update GitHub Actions repository secrets with the same six values: Settings → Secrets and variables → Actions.
3. Update `CLAUDE.md` → `## Firebase` block with the new Project ID + Auth Domain.
4. No source-code changes are required — Firebase config is read from env vars at build time.

## Stage 4 — Deploy rules to the new project

```bash
GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/new-service-account.json" \
  npx --yes firebase-tools deploy --only firestore:rules --project <NEW_PROJECT_ID>
```

If the Admin SDK service account lacks `serviceusage.services.get` (common — that role isn't included by default), the CLI deploy fails with a 403 on Service Usage. Workaround: deploy via the Firebase Rules REST API directly (POST to `firebaserules.googleapis.com/v1/projects/<id>/rulesets`, then PATCH the `cloud.firestore` release). Authenticate with the same SA via `google-auth-library`.

## Stage 5 — Production smoke test + cleanup

1. Merge the cutover branch to `main`. GitHub Pages deploys the new bundle pointing at the new project.
2. CEO logs in via the new magic-link flow. Confirms quotes/contracts/customers load (Path A) or the app shell loads with empty lists (Path B).
3. Delete the local service-account keys and dump file:
   ```bash
   rm -f old-service-account.json new-service-account.json firestore-dump.json
   ```
4. Optional: on the OLD project (Path A), revoke the SA key or disable Firestore writes (set rules to deny-all). For Path B, the OLD project is presumed already gone.

## Rollback

If the new project misbehaves after cutover, the recovery path depends on the migration path used:

- **Path A:** Revert the GitHub Actions secrets to the OLD project's six `VITE_FIREBASE_*` values and trigger a re-deploy. The OLD project still has all data (we only added to the new project, never deleted from the old).
- **Path B:** No "previous good state" to roll back to. Recovery depends on whatever backup mechanism is in place for the new project.

---

## Appendix — actual 2026-06-15 migration to `tour-cost-calculator-v2`

Followed Path B because the owner's Google account hosting `tour-cost-calculator-4336c` was banned mid-migration. No data was migrated; the new project was bootstrapped via `scripts/seed-user-accounts.mjs` with `developer@viettours.com.vn` (CEO). Rules deploy used the REST API workaround. See `CLAUDE.md` → `## Firebase` for the historical project record.

---

## Backup arrangement (Phase 2)

After Stage 5 cutover, an hourly artifact backup runs automatically in CI. See `.github/workflows/backup.yml` for the source.

**What it does:**
- Runs at `:00` UTC every hour (cron `0 * * * *`) plus manual `workflow_dispatch`.
- Authenticates with `FIREBASE_BACKUP_SRC_SA_JSON` (GitHub Actions secret — the production project's service-account JSON).
- Materializes the secret into a tmpfile, runs `scripts/firestore-export.mjs` against the production project, uploads `firestore-dump.json` as a workflow artifact named `firestore-dump-<run_id>` with 30-day retention, scrubs the tmpfile on every exit.

**What it does NOT do:**
- It does not mirror to a second Firestore project. The originally planned NEW → OLD live mirror was dropped when the OLD project's Google account was banned.

**Restoring from a backup artifact:**

1. Open https://github.com/viettoursdev/tour-cost-calculator/actions/workflows/backup.yml, pick a successful run, download the `firestore-dump-<run_id>` artifact. The download is a zip containing `firestore-dump.json`.
2. Unzip into the repo root.
3. Generate (or reuse) a service-account JSON for the target project — save it next to the dump.
4. Run the import:
   ```bash
   SA_PATH=target-sa.json node scripts/firestore-import.mjs
   ```
   This will overwrite the target project's documents with the dump contents. `set()` semantics — safe to re-run.
5. Delete the local SA JSON and dump immediately after.

**Cost guard:** ~720 cron runs/month at ~1 minute each ≈ 12 hrs/month of GitHub Actions runner time (free on public repos; significant slice on private). One Firestore read per doc per run from the production project. To pause the backup, disable the workflow in the Actions UI or delete the `.github/workflows/backup.yml` file.

**Audit:** if new top-level Firestore collections are added to the app, they must be added to `SINGLE_DOCS` or `DYNAMIC_COLLECTIONS` in `scripts/firestore-export.mjs` or the hourly backup will silently miss them. The audit pattern: every `doc(db, 'viettours', X)` call in `src/lib/firebase.ts` must appear in `SINGLE_DOCS`; every `doc(db, 'X', ...)` for X other than 'viettours' must appear in `DYNAMIC_COLLECTIONS`.
