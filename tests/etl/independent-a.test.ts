// tests/etl/independent-a.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient, resetAll } from '../../scripts/etl/db.mjs';
import { loadProfiles, makeResolver } from '../../scripts/etl/profiles.mjs';
import { loadCustomers, loadSuppliers, loadNccProducts } from '../../scripts/etl/customers.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));
const c = serviceClient();
let r: ReturnType<typeof makeResolver>;
let custMap: Map<string,string>;
let supMap: Map<string,string>;

describe('etl independent entities A', () => {
  beforeAll(async () => {
    await resetAll(c);
    r = makeResolver(await loadProfiles(c, dump));
    custMap = await loadCustomers(c, dump, r);
    supMap = await loadSuppliers(c, dump, r);
    await loadNccProducts(c, dump, r, supMap);
  });

  it('loads customers with contacts + interactions and resolves createdBy', async () => {
    const { data: cust } = await c.from('customers').select('legacy_id, source, created_by, created_by_name');
    expect(cust).toHaveLength(1);
    expect(cust![0].source).toBe('web');
    expect(cust![0].created_by).toBe(r.resolve('mai'));
    const { count: contacts } = await c.from('customer_contacts').select('*', { count: 'exact', head: true });
    const { count: inter } = await c.from('customer_interactions').select('*', { count: 'exact', head: true });
    expect(contacts).toBe(1); expect(inter).toBe(1);
    expect(custMap.get('c1')).toBeTruthy();
  });

  it('loads suppliers and ncc_products with supplier_id resolved', async () => {
    const { data: prod } = await c.from('ncc_products').select('legacy_id, supplier_id, ncc_name');
    expect(prod).toHaveLength(1);
    expect(prod![0].supplier_id).toBe(supMap.get('s1'));
    const { count: prices } = await c.from('ncc_product_prices').select('*', { count: 'exact', head: true });
    expect(prices).toBe(1);
  });
});
