// tests/etl/notifications.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { serviceClient, resetAll } from '../../scripts/etl/db.mjs';
import { loadProfiles, makeResolver } from '../../scripts/etl/profiles.mjs';
import { loadNotifications, loadThreads, loadChats } from '../../scripts/etl/notifications.mjs';

const dump = JSON.parse(readFileSync(new URL('./fixtures/firestore-dump.sample.json', import.meta.url), 'utf8'));
const c = serviceClient();

describe('etl notifications + threads + chat', () => {
  let r: ReturnType<typeof makeResolver>;
  beforeAll(async () => {
    await resetAll(c);
    r = makeResolver(await loadProfiles(c, dump));
    await loadNotifications(c, dump, r);
    await loadThreads(c, dump, r);
    await loadChats(c, dump, r);
  });

  it('loads per-user notifications with owner user_id from the doc key', async () => {
    const { data } = await c.from('notifications').select('user_id, title, priority, created_by');
    expect(data).toHaveLength(1);
    expect(data![0].user_id).toBe(r.resolve('mai'));   // doc key 'mai'
    expect(data![0].priority).toBe('high');
    expect(data![0].created_by).toBe(r.resolve('tony'));
  });

  it('loads thread with members + comments', async () => {
    const { data: th } = await c.from('notification_threads').select('id, created_by');
    expect(th![0].id).toBe('th1');
    const { count: mem } = await c.from('notification_thread_members').select('*', { count: 'exact', head: true });
    const { count: com } = await c.from('notification_comments').select('*', { count: 'exact', head: true });
    expect(mem).toBe(2); expect(com).toBe(1);
  });

  it('loads chat with members (last_read from reads) + messages', async () => {
    const { data: ch } = await c.from('chats').select('id, is_group, last_text');
    expect(ch![0].id).toBe('dm_mai__tony');
    const { data: mem } = await c.from('chat_members').select('username, user_id, last_read').order('username');
    expect(mem).toHaveLength(2);
    expect(new Date(mem!.find((m) => m.username === 'tony')!.last_read).toISOString()).toBe('2026-06-01T01:00:00.000Z');
    const { data: msg } = await c.from('chat_messages').select('legacy_id, by_user_id, by_username, text');
    expect(msg![0].by_user_id).toBe(r.resolve('tony'));
    expect(msg![0].text).toBe('hey');
  });
});
