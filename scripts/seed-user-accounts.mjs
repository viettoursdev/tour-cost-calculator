#!/usr/bin/env node
/**
 * Seed viettours/user_accounts on a fresh Firebase project.
 *
 * Background: the OLD Firebase project became inaccessible (lost Google account),
 * so a full Firestore export/import was not possible. This script bootstraps the
 * NEW project with a single CEO user so that magic-link sign-in resolves to a
 * known identity and the in-app admin modal can be used to add the rest of the
 * team.
 *
 * Run from the repo root:
 *   node scripts/seed-user-accounts.mjs
 *   SA_PATH=other-key.json node scripts/seed-user-accounts.mjs   # alt key
 *
 * Env vars:
 *   SA_PATH   default: new-service-account.json
 *
 * Idempotent: if a user with the seed email already exists in the doc, the
 * script prints a message and exits without writing. If the doc exists but
 * the seed user is missing, the seed user is appended (existing users kept).
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SA_PATH = process.env.SA_PATH || 'new-service-account.json';

// ── Edit this block to change the bootstrap user ──────────────────────────────
const SEED_USER = {
  u: 'developer',
  email: 'developer@viettours.com.vn',
  name: 'developer',
  role: 'CEO',
  // p is the legacy plaintext field — only used by the DEV-mode password panel,
  // never by magic-link auth. Slated for removal in CLAUDE.md Phase 4 cleanup.
  p: 'Viettours@19b',
  color: '#1976d2',
};
// ─────────────────────────────────────────────────────────────────────────────

function loadKey() {
  try {
    return JSON.parse(readFileSync(SA_PATH, 'utf8'));
  } catch {
    console.error(
      `ERROR: ${SA_PATH} not found.\n`
      + 'Download it from the NEW Firebase Console → Project Settings → Service accounts → Generate new private key,\n'
      + `and save as ${SA_PATH} at the repo root.`,
    );
    process.exit(1);
  }
}

async function main() {
  const sa = loadKey();
  const app = initializeApp({ credential: cert(sa) }, 'seed');
  const db = getFirestore(app); // default database

  const ref = db.collection('viettours').doc('user_accounts');
  const snap = await ref.get();

  const seedEmail = SEED_USER.email.toLowerCase();

  if (snap.exists) {
    const existing = snap.data();
    const users = Array.isArray(existing.users) ? existing.users : [];
    const alreadyPresent = users.some(
      (u) => typeof u.email === 'string' && u.email.toLowerCase() === seedEmail,
    );
    if (alreadyPresent) {
      console.log('Seed user already present; nothing to do.');
      return;
    }
    // Merge: append seed user, keep existing users
    const merged = [...users, SEED_USER];
    await ref.set({ users: merged, updatedAt: new Date().toISOString() });
    console.log(
      `Appended seed user ${SEED_USER.email} (${SEED_USER.role}) — users array length: ${merged.length}`,
    );
  } else {
    // Fresh doc
    await ref.set({ users: [SEED_USER], updatedAt: new Date().toISOString() });
    console.log(
      `Seeded user ${SEED_USER.email} (${SEED_USER.role}) — users array length: 1`,
    );
  }
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
