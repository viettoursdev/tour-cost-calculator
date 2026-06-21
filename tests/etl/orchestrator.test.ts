// tests/etl/orchestrator.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient } from '../../scripts/etl/db.mjs';
import { runEtl } from '../../scripts/supabase-etl.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));
const c = serviceClient();

describe('etl orchestrator', () => {
  it('throws on unmapped usernames unless allowed', async () => {
    await expect(runEtl(c, dump)).rejects.toThrow(/Unmapped usernames: ghost/);
  });

  it('runs end to end and reports unmapped when allowed', async () => {
    const res = await runEtl(c, dump, { allowUnmapped: true });
    expect(res.unmapped).toEqual(['ghost']);
    const { count } = await c.from('quotes').select('*', { count: 'exact', head: true });
    expect(count).toBe(2);
    // idempotent: a second run reloads cleanly (no duplicate-key errors)
    const res2 = await runEtl(c, dump, { allowUnmapped: true });
    expect(res2.unmapped).toEqual(['ghost']);
    const { count: count2 } = await c.from('quotes').select('*', { count: 'exact', head: true });
    expect(count2).toBe(2);
  });
});
