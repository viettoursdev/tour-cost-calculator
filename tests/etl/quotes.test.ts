// tests/etl/quotes.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient, resetAll } from '../../scripts/etl/db.mjs';
import { loadProfiles, makeResolver } from '../../scripts/etl/profiles.mjs';
import { loadCustomers } from '../../scripts/etl/customers.mjs';
import { loadQuotes } from '../../scripts/etl/quotes.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));
const c = serviceClient();

describe('etl quotes', () => {
  let r: ReturnType<typeof makeResolver>;
  beforeAll(async () => {
    await resetAll(c);
    r = makeResolver(await loadProfiles(c, dump));
    const custMap = await loadCustomers(c, dump, r);
    await loadQuotes(c, dump, r, custMap);
  });

  it('unifies regular + dmc into quotes with resolved created_by + customer_id', async () => {
    const { data } = await c.from('quotes').select('cloud_id, template, total_cost, created_by, created_by_username, customer_id, customer_name').order('cloud_id');
    expect(data).toHaveLength(2);
    const reg = data!.find((q) => q.cloud_id === 'cloud-q1')!;
    expect(reg.template).toBe('domestic');
    expect(reg.created_by).toBe(r.resolve('tony'));
    expect(reg.created_by_username).toBe('tony');
    expect(reg.customer_id).toBeTruthy();        // resolved from legacy 'c1'
    const dmc = data!.find((q) => q.cloud_id === 'cloud-d1')!;
    expect(dmc.template).toBe('dmc');
    expect(dmc.customer_id).toBeNull();
  });

  it('shreds child tables from currentState', async () => {
    const counts: Record<string, number> = {};
    for (const t of ['quote_line_items','quote_payments','quote_passengers','quote_workflow_steps','quote_workflow_logs','quote_versions','quote_collaborators']) {
      const { count } = await c.from(t).select('*', { count: 'exact', head: true });
      counts[t] = count ?? 0;
    }
    expect(counts.quote_line_items).toBe(1);
    expect(counts.quote_payments).toBe(1);
    expect(counts.quote_passengers).toBe(1);
    expect(counts.quote_workflow_steps).toBe(1);
    expect(counts.quote_workflow_logs).toBe(1);
    expect(counts.quote_versions).toBe(1);
    expect(counts.quote_collaborators).toBe(1);  // 'mai' on cloud-q1
  });

  it('resolves workflow assignee + collaborator to UUIDs', async () => {
    const { data: w } = await c.from('quote_workflow_steps').select('assignee_user_id, assignee_username');
    expect(w![0].assignee_user_id).toBe(r.resolve('linh'));
    expect(w![0].assignee_username).toBe('linh');
    const { data: collab } = await c.from('quote_collaborators').select('user_id, username');
    expect(collab![0].user_id).toBe(r.resolve('mai'));
  });
});
