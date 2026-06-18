import { describe, it, expect } from 'vitest';
import { getViettoursClient, truncate } from './_setup';

describe('supabase harness', () => {
  it('signs in a @viettours user and reads under RLS', async () => {
    const c = await getViettoursClient();
    const { error } = await c.from('fx_rates').select('currency').limit(1);
    expect(error).toBeNull(); // RLS allows the company-domain user
  });

  it('truncate works on tables with non-id PK (fx_rates uses currency)', async () => {
    // fx_rates has PK column "currency", not "id" — this exercises the PK_COL map.
    await expect(truncate(['fx_rates'])).resolves.toBeUndefined();
  });
});
