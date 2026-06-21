#!/usr/bin/env node
// scripts/supabase-etl.mjs — orchestrates the Firestore->Supabase ETL in spec order.
import { readFileSync } from 'node:fs';
import { serviceClient, resetAll } from './etl/db.mjs';
import { loadProfiles, makeResolver } from './etl/profiles.mjs';
import { loadCustomers, loadSuppliers, loadNccProducts } from './etl/customers.mjs';
import { loadContracts, loadRateCard, loadFxRates, loadRestaurants, loadPois, loadVisaProducts } from './etl/misc.mjs';
import { loadQuotes } from './etl/quotes.mjs';
import { loadItineraries, loadMenus } from './etl/itineraries.mjs';
import { loadVisaProcedures, loadVisaProjects } from './etl/visa.mjs';
import { loadTourPayments, loadPaymentApprovals } from './etl/payments.mjs';
import { loadNotifications, loadThreads, loadChats } from './etl/notifications.mjs';

export async function runEtl(client, dump, opts = {}) {
  await resetAll(client);

  // 1. Keystone: profiles + map.
  const usernameMap = await loadProfiles(client, dump);
  const r = makeResolver(usernameMap);

  // 2. Independent entities.
  const customerMap = await loadCustomers(client, dump, r);
  const supplierMap = await loadSuppliers(client, dump, r);
  await loadNccProducts(client, dump, r, supplierMap);
  await loadContracts(client, dump, r);
  await loadRateCard(client, dump, r);
  await loadFxRates(client, dump, r);
  await loadRestaurants(client, dump, r);
  await loadPois(client, dump, r);
  await loadVisaProducts(client, dump, r);

  // 3. Quotes (regular + DMC).
  await loadQuotes(client, dump, r, customerMap);

  // 4. Itineraries, menus, visa.
  await loadItineraries(client, dump, r);
  await loadMenus(client, dump, r);
  await loadVisaProcedures(client, dump, r);
  await loadVisaProjects(client, dump, r);

  // 5. Payments, notifications, threads, chat.
  await loadTourPayments(client, dump, r);
  await loadPaymentApprovals(client, dump, r);
  await loadNotifications(client, dump, r);
  await loadThreads(client, dump, r);
  await loadChats(client, dump, r);

  const unmapped = [...r.unmapped].sort();
  if (unmapped.length && !opts.allowUnmapped) {
    throw new Error(`Unmapped usernames: ${unmapped.join(', ')} — pass ALLOW_UNMAPPED=1 to accept (deleted users).`);
  }
  return { unmapped };
}

// CLI: node scripts/supabase-etl.mjs  (reads DUMP_PATH, default firestore-dump.json)
if (import.meta.url === `file://${process.argv[1]}`) {
  const dumpPath = process.env.DUMP_PATH || 'firestore-dump.json';
  const dump = JSON.parse(readFileSync(dumpPath, 'utf8'));
  const client = serviceClient();
  runEtl(client, dump, { allowUnmapped: process.env.ALLOW_UNMAPPED === '1' })
    .then((res) => {
      console.log(`ETL complete. Unmapped usernames: ${res.unmapped.length ? res.unmapped.join(', ') : '(none)'}`);
    })
    .catch((e) => { console.error('ETL failed:', e.message); process.exit(1); });
}
