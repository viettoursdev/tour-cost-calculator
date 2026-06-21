// tests/etl/independent-b.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient, resetAll } from '../../scripts/etl/db.mjs';
import { loadProfiles, makeResolver } from '../../scripts/etl/profiles.mjs';
import { loadContracts, loadRateCard, loadFxRates, loadRestaurants, loadPois, loadVisaProducts } from '../../scripts/etl/misc.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));
const c = serviceClient();

describe('etl independent entities B', () => {
  let r: ReturnType<typeof makeResolver>;
  beforeAll(async () => {
    await resetAll(c);
    r = makeResolver(await loadProfiles(c, dump));
    await loadContracts(c, dump, r);
    await loadRateCard(c, dump, r);
    await loadFxRates(c, dump, r);
    await loadRestaurants(c, dump, r);
    await loadPois(c, dump, r);
    await loadVisaProducts(c, dump, r);
  });

  it('loads contracts with payments + cancels', async () => {
    const { data } = await c.from('contracts').select('legacy_id, tour_key, created_by');
    expect(data).toHaveLength(1);
    expect(data![0].tour_key).toBe('tourA');
    expect(data![0].created_by).toBe(r.resolve('tony'));
    const { count: pays } = await c.from('contract_payments').select('*', { count: 'exact', head: true });
    const { count: cancels } = await c.from('contract_cancels').select('*', { count: 'exact', head: true });
    expect(pays).toBe(1); expect(cancels).toBe(1);
  });

  it('loads rate card sections, fx, restaurants, pois, visa products', async () => {
    const { count: hotels } = await c.from('rate_card_hotels').select('*', { count: 'exact', head: true });
    const { count: fx } = await c.from('fx_rates').select('*', { count: 'exact', head: true });
    const { count: rm } = await c.from('restaurant_menus').select('*', { count: 'exact', head: true });
    const { count: fees } = await c.from('visa_product_fees').select('*', { count: 'exact', head: true });
    expect(hotels).toBe(1); expect(fx).toBe(2); expect(rm).toBe(1); expect(fees).toBe(1);
    const { data: poi } = await c.from('pois').select('legacy_id, created_by, created_by_name');
    expect(poi![0].created_by).toBeNull();              // 'ghost' is unmapped
    expect(poi![0].created_by_name).toBe('ghost');       // attribution string preserved
    expect([...r.unmapped]).toContain('ghost');
  });
});
