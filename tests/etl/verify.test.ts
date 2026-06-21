// tests/etl/verify.test.ts — single full ETL run asserted against the fixture's known totals.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient } from '../../scripts/etl/db.mjs';
import { runEtl } from '../../scripts/supabase-etl.mjs';
import { EXPECTED } from './fixtures/expected.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));
const c = serviceClient();

async function count(table: string): Promise<number> {
  const { count, error } = await c.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

describe('etl verification harness', () => {
  let result: { unmapped: string[] };
  beforeAll(async () => { result = await runEtl(c, dump, { allowUnmapped: true }); }, 60000);

  it('reports exactly the expected unmapped usernames', () => {
    expect(result.unmapped).toEqual(EXPECTED.unmapped_usernames);
  });

  it('matches per-table row counts for every table', async () => {
    const tables = Object.keys(EXPECTED).filter((k) => !k.startsWith('sum_') && k !== 'unmapped_usernames');
    const actual: Record<string, number> = {};
    for (const t of tables) actual[t] = await count(t);
    const expected: Record<string, number> = {};
    for (const t of tables) expected[t] = (EXPECTED as Record<string, number>)[t];
    expect(actual).toEqual(expected);
  });

  it('matches financial checksums', async () => {
    const { data: q } = await c.from('quotes').select('total_cost');
    expect(q!.reduce((s, x) => s + Number(x.total_cost), 0)).toBe(EXPECTED.sum_total_cost);
    const { data: fx } = await c.from('fx_rates').select('rate_to_vnd');
    expect(fx!.reduce((s, x) => s + Number(x.rate_to_vnd), 0)).toBe(EXPECTED.sum_fx_rate_to_vnd);
  });
});
