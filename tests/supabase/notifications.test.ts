import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import {
  sbSendNotification, sbSubscribeNotifications, sbPushNotifications,
  sbSendNotificationMany, sbEnsureNotifThread, sbSubscribeNotifThread,
  sbAddThreadComment, sbSetThreadStatus,
} from '../../src/lib/supabase';
import type { Notification, NotifThread } from '@/types';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('notifications gateway', () => {
  beforeEach(async () => {
    await truncate([
      'notification_comments', 'notification_thread_members',
      'notification_threads', 'notifications',
    ]);
  });

  it('send to a user → subscribe yields it', async () => {
    const c = await getViettoursClient();
    await sbSendNotification('tester', {
      type: 'announcement', title: 'Hello', message: 'World',
      createdBy: 'admin',
    }, c);
    const list = await once<Notification[]>((cb) => sbSubscribeNotifications('tester', cb, c));
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Hello');
    expect(list[0].read).toBe(false);
    expect(list[0].id).toBeTruthy();
    expect(list[0].createdAt).toBeTruthy();
  });

  it('push (mark-read) round-trips read flag', async () => {
    const c = await getViettoursClient();
    await sbSendNotification('tester', {
      type: 'task', title: 'Task', message: 'Do it', createdBy: 'admin',
    }, c);
    let list = await once<Notification[]>((cb) => sbSubscribeNotifications('tester', cb, c));
    expect(list[0].read).toBe(false);
    await sbPushNotifications('tester', [{ ...list[0], read: true }], c);
    list = await once<Notification[]>((cb) => sbSubscribeNotifications('tester', cb, c));
    expect(list[0].read).toBe(true);
  });

  it('sendNotificationMany deduplicates and sends to all targets', async () => {
    const c = await getViettoursClient();
    // send to same user twice (dedup) and once to tester
    await sbSendNotificationMany(['tester', 'tester'], {
      type: 'announcement', title: 'Broadcast', message: 'Hi all', createdBy: 'admin',
    }, c);
    const list = await once<Notification[]>((cb) => sbSubscribeNotifications('tester', cb, c));
    // dedup → only 1 notification, not 2
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Broadcast');
  });

  it('ensure thread + add comment → subscribe yields comment', async () => {
    const c = await getViettoursClient();
    const thread: NotifThread = {
      id: 'thread-1', title: 'Test Thread', members: ['tester'],
      comments: [], createdAt: new Date().toISOString(), createdBy: 'tester',
      status: 'pending',
    };
    await sbEnsureNotifThread(thread, c);
    await sbAddThreadComment('thread-1', {
      id: 'cmt-1', by: 'tester', byName: 'QA Bot', text: 'LGTM', at: new Date().toISOString(),
    }, c);
    const t = await once<NotifThread | null>((cb) => sbSubscribeNotifThread('thread-1', cb, c));
    expect(t).not.toBeNull();
    expect(t!.title).toBe('Test Thread');
    expect(t!.members).toContain('tester');
    expect(t!.comments).toHaveLength(1);
    expect(t!.comments[0].text).toBe('LGTM');
  });

  it('ensure thread is idempotent and merges new members', async () => {
    const c = await getViettoursClient();
    const base: NotifThread = {
      id: 'thread-2', title: 'Original', members: ['tester'],
      comments: [], createdAt: new Date().toISOString(), createdBy: 'tester',
    };
    await sbEnsureNotifThread(base, c);
    // call again with extra member
    await sbEnsureNotifThread({ ...base, members: ['tester', 'admin'] }, c);
    const t = await once<NotifThread | null>((cb) => sbSubscribeNotifThread('thread-2', cb, c));
    expect(t!.members).toContain('tester');
    expect(t!.members).toContain('admin');
    expect(t!.title).toBe('Original'); // title must not be overwritten on re-ensure
  });

  it('setThreadStatus updates status field', async () => {
    const c = await getViettoursClient();
    await sbEnsureNotifThread({
      id: 'thread-3', title: 'Status Test', members: ['tester'],
      comments: [], createdAt: new Date().toISOString(), createdBy: 'tester',
      status: 'pending',
    }, c);
    await sbSetThreadStatus('thread-3', 'approved', 'Boss', c);
    const t = await once<NotifThread | null>((cb) => sbSubscribeNotifThread('thread-3', cb, c));
    expect(t!.status).toBe('approved');
    expect(t!.updatedByName).toBe('Boss');
    expect(t!.updatedAt).toBeTruthy();
  });
});
