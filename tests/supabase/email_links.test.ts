import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbSubscribeEmailLinks, sbPushEmailLinks } from '../../src/lib/supabase';
import type { EmailLink } from '@/types';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

const mk = (id: string): EmailLink => ({
  id, emailId: 'e' + id, subject: 'S', fromName: 'N', fromAddress: 'a@x.com',
  receivedAt: '2026-01-01T00:00:00.000Z', targetType: 'customer', targetId: 'c1',
  linkedBy: 'admin', linkedAt: '2026-01-01T00:00:00.000Z',
});

describe('email links gateway', () => {
  beforeEach(async () => { await truncate(['email_links']); });

  it('push then subscribe round-trips the list', async () => {
    const c = await getViettoursClient();
    await sbPushEmailLinks([mk('1'), mk('2')], { name: 'Admin', role: 'CEO' }, c);
    const got = await once<EmailLink[]>((cb) => sbSubscribeEmailLinks(cb, c));
    expect(got).toHaveLength(2);
    expect(got[0].id).toBe('1');
  });

  it('subscribe on empty table yields []', async () => {
    const c = await getViettoursClient();
    const got = await once<EmailLink[]>((cb) => sbSubscribeEmailLinks(cb, c));
    expect(got).toEqual([]);
  });
});
