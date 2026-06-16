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
  ['viettours', 'ncc_products'],
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
