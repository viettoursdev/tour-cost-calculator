import { describe, it, expect } from 'vitest';
import { getViettoursClient } from './_setup';
import { sbPullUsers, sbPushUsers, sbPurgeLegacyPasswords } from '../../src/lib/supabase';

describe('users gateway', () => {
  it('pulls profiles as User[] and upserts editable fields by email', async () => {
    const c = await getViettoursClient();
    const before = await sbPullUsers(c);
    expect(before.some((u) => u.email === 'tester@viettours.com.vn')).toBe(true);

    await sbPushUsers(before.map((u) =>
      u.email === 'tester@viettours.com.vn' ? { ...u, name: 'QA Bot', color: '#123456' } : u,
    ), c);
    const after = await sbPullUsers(c);
    const t = after.find((u) => u.email === 'tester@viettours.com.vn')!;
    expect(t.name).toBe('QA Bot');
    expect(t.color).toBe('#123456');

    expect(await sbPurgeLegacyPasswords(c)).toBe(0);
  });
});
