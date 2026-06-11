#!/usr/bin/env node
/**
 * Stage 2 of the Firebase project switch.
 *
 * Reads firestore-dump.json and writes every doc to the NEW project
 * (tour-cost-calculator, default database).
 *
 * Run from the repo root after `firestore-export.mjs`:
 *   node scripts/firestore-import.mjs
 *
 * Requires `new-service-account.json` at the repo root (service account key
 * downloaded from the NEW project's Console). Gitignored.
 *
 * Uses set() — safe to re-run; existing docs are overwritten with dump data.
 * Bails early if firestore-dump.json is missing.
 */
import { readFileSync, existsSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SA_PATH = 'new-service-account.json';
const DUMP_PATH = 'firestore-dump.json';

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

function loadDump() {
  if (!existsSync(DUMP_PATH)) {
    console.error(`ERROR: ${DUMP_PATH} not found. Run \`node scripts/firestore-export.mjs\` first.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(DUMP_PATH, 'utf8'));
}

async function main() {
  const sa = loadKey();
  const dump = loadDump();
  const app = initializeApp({ credential: cert(sa) }, 'import');
  const db = getFirestore(app); // default database

  let singleCount = 0;
  let collDocCount = 0;

  console.log(`Writing ${Object.keys(dump.singles).length} single documents…`);
  for (const [path, data] of Object.entries(dump.singles)) {
    const [coll, docId] = path.split('/');
    await db.collection(coll).doc(docId).set(data);
    singleCount++;
    console.log(`  ✓ ${path}`);
  }

  for (const [coll, docs] of Object.entries(dump.collections)) {
    const ids = Object.keys(docs);
    console.log(`Writing dynamic collection ${coll} (${ids.length} docs)…`);
    // Batch writes for efficiency; Firestore caps at 500 ops per batch.
    const BATCH_SIZE = 400;
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const id of ids.slice(i, i + BATCH_SIZE)) {
        batch.set(db.collection(coll).doc(id), docs[id]);
      }
      await batch.commit();
      collDocCount += Math.min(BATCH_SIZE, ids.length - i);
    }
    console.log(`  ✓ ${coll}`);
  }

  console.log(`\nDone. Wrote ${singleCount} single docs and ${collDocCount} collection docs to the new project.`);
  console.log('Next: delete the service-account keys and firestore-dump.json:');
  console.log('  rm old-service-account.json new-service-account.json firestore-dump.json');
}

main().catch((e) => {
  console.error('Import failed:', e);
  process.exit(1);
});
