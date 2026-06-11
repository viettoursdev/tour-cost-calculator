#!/usr/bin/env node
/**
 * Stage 2 of the Firebase project switch.
 *
 * Reads every known doc + dynamic collection from the OLD project
 * (viettours-cost-calculator, named database `viettours`) and writes a
 * single JSON file: firestore-dump.json.
 *
 * Run from the repo root:
 *   node scripts/firestore-export.mjs
 *
 * Requires `old-service-account.json` at the repo root (a Firebase service
 * account key downloaded from the OLD project's Console: Project Settings →
 * Service accounts → Generate new private key). Gitignored.
 *
 * Idempotent: safe to re-run; later runs overwrite firestore-dump.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SA_PATH = 'old-service-account.json';
const OUT_PATH = 'firestore-dump.json';
const OLD_DB_NAME = 'viettours';

const SINGLE_DOCS = [
  ['viettours', 'master_rate_card'],
  ['viettours', 'user_accounts'],
  ['viettours', 'ncc_master'],
  ['viettours', 'contracts_master'],
  ['viettours', 'quote_history'],
  ['viettours', 'dmc_quote_history'],
  ['viettours', 'customer_list'],
];

const DYNAMIC_COLLECTIONS = [
  'quote_projects',
  'dmc_quote_projects',
  'user_notifications',
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
  const db = getFirestore(app, OLD_DB_NAME);

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
