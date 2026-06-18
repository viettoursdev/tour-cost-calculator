import { describe, it, expect } from 'vitest';
import { getViettoursClient } from './_setup';

describe('supabase harness', () => {
  it('signs in a @viettours user and reads under RLS', async () => {
    const c = await getViettoursClient();
    const { error } = await c.from('fx_rates').select('currency').limit(1);
    expect(error).toBeNull(); // RLS allows the company-domain user
  });
});
