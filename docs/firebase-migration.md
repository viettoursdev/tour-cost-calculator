# Firebase Project Migration — workflow

End-to-end guide for moving the app from `viettours-cost-calculator` (named DB `viettours`) to `tour-cost-calculator` (default DB).

## Stage 1 — Create the new Firebase project (Console)

1. https://console.firebase.google.com → **Add project** → name `tour-cost-calculator` (or whatever you decide; the project ID is derived from this and might get a numeric suffix if taken).
2. Disable Google Analytics if asked (not used).
3. **Build → Firestore Database → Create database**.
   - Mode: **Production**.
   - Location: **asia-southeast1 (Singapore)** to match the old project.
   - Database ID: leave as **`(default)`**.
4. **Authentication → Get started**. Then **Sign-in method**:
   - Enable **Email/Password** (master toggle).
   - Within it, also enable **Email link (passwordless sign-in)**.
5. **Authentication → Settings → Authorized domains** → add `viettoursdev.github.io`. `localhost` is already present.
6. **Authentication → Templates → Email address sign-in** → customize sender name and the Vietnamese copy (reuse the template from the old project; preserve `%LINK%`).
7. **Project Settings (⚙) → Service accounts → Generate new private key**. Save the JSON as `new-service-account.json` at the repo root. **Do not commit** — it's gitignored.
8. Also: on the OLD project (`viettours-cost-calculator`), generate a service-account key. Save as `old-service-account.json` at the repo root.

## Stage 2 — Migrate data

From the repo root:

```bash
node scripts/firestore-export.mjs
# Writes firestore-dump.json. Look over the file — every collection listed should have content.

node scripts/firestore-import.mjs
# Writes the dump into the new project's default database.
```

Verify in the new project's Firebase Console → Firestore Database → Data:
- `viettours/` should contain `master_rate_card`, `user_accounts`, `ncc_master`, `contracts_master`, `quote_history`, `dmc_quote_history`, `customer_list`.
- `quote_projects/` and `dmc_quote_projects/` should have all the project documents from the old database.
- `user_notifications/` should have entries keyed by username.

Spot-check `viettours/user_accounts` — every entry that should keep working post-migration must have an `email` field (`@viettours.com.vn`). If any are missing, add them via the in-app admin modal BEFORE the cutover.

## Stage 3 — Code cutover (separate session)

After data migration verified:

1. A separate branch updates `src/lib/firebase.ts` with the new project's config block (Project Settings → General → Your apps → Web app → Firebase SDK snippet → Config). The new API key, project ID, etc.
2. Drop the database argument from `getFirestore(app, 'viettours')` → `getFirestore(app)` because the new project uses the default database.
3. Update `firebase.json` for the default database (single-object form, no `database` field).
4. Update `CLAUDE.md` Firebase section with new project ID, new API key, new database name.

## Stage 4 — Deploy rules to the new project

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project tour-cost-calculator
```

## Stage 5 — Production smoke test + cleanup

1. Merge the cutover branch to `main`. GitHub Pages deploys the new bundle pointing at the new project.
2. CEO logs in via the new magic-link flow. Confirms quotes, contracts, customers all load.
3. **Delete the service-account keys and dump file:**

   ```bash
   rm -f old-service-account.json new-service-account.json firestore-dump.json
   ```

4. (Optional) On the OLD project: revoke the service-account key, disable Firestore writes (set rules to deny-all), or delete the project entirely.

## Rollback

If the new project misbehaves after cutover:

1. `git revert <cutover-commit>` on `main` and push. GitHub Pages redeploys the old bundle pointing at the OLD project.
2. The old project still has all its data (we only added to the new project, never deleted from the old).
3. Investigate, fix, re-cutover.
