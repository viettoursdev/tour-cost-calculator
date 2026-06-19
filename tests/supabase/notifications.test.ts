import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import {
  sbSendNotification, sbSubscribeNotifications, sbPushNotifications,
  sbSendNotificationMany, sbEnsureNotifThread, sbSubscribeNotifThread,
  sbAddThreadComment, sbSetThreadStatus,
} from '../../src/lib/supabase';
import type { Notification, NotifThread, FileAttachment } from '@/types';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

describe('notifications gateway', () => {
  beforeEach(async () => {
    await truncate([
      'attachments',
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

  it('sendNotificationMany skips unmapped users, valid targets still receive (I1)', async () => {
    const c = await getViettoursClient();
    await sbSendNotificationMany(['tester', 'no-such-user'], {
      type: 'announcement', title: 'Resilient', message: 'Should arrive', createdBy: 'admin',
    }, c);
    const list = await once<Notification[]>((cb) => sbSubscribeNotifications('tester', cb, c));
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Resilient');
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

  it('subscribe thread fires again when a comment is added (I3 realtime)', async () => {
    const c = await getViettoursClient();
    const thread: NotifThread = {
      id: 'thread-rt', title: 'Realtime Thread', members: ['tester'],
      comments: [], createdAt: new Date().toISOString(), createdBy: 'tester',
    };
    await sbEnsureNotifThread(thread, c);

    const emissions: Array<NotifThread | null> = [];
    let resolveSecond: ((t: NotifThread | null) => void) | null = null;
    const secondEmission = new Promise<NotifThread | null>((res) => { resolveSecond = res; });

    const unsub = sbSubscribeNotifThread('thread-rt', (t) => {
      emissions.push(t);
      if (emissions.length === 2 && resolveSecond) {
        resolveSecond(t);
        resolveSecond = null;
      }
    }, c);

    // Wait for initial emission
    await new Promise<void>((res) => {
      const check = setInterval(() => {
        if (emissions.length >= 1) { clearInterval(check); res(); }
      }, 50);
    });

    // Add a comment — should trigger a second emission
    await sbAddThreadComment('thread-rt', {
      id: 'cmt-rt', by: 'tester', byName: 'QA Bot', text: 'New comment', at: new Date().toISOString(),
    }, c);

    const second = await Promise.race([
      secondEmission,
      new Promise<null>((_, rej) => setTimeout(() => rej(new Error('timeout: no second emission after comment insert')), 10000)),
    ]);

    unsub();

    expect(second).not.toBeNull();
    expect(second!.comments.length).toBeGreaterThan(0);
    expect(second!.comments.some((cm) => cm.text === 'New comment')).toBe(true);
  }, 30000);

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

  it('ensure thread preserves existing link when re-ensured without one (I2)', async () => {
    const c = await getViettoursClient();
    const base: NotifThread = {
      id: 'thread-link', title: 'Link Test', members: ['tester'],
      comments: [], createdAt: new Date().toISOString(), createdBy: 'tester',
      link: { type: 'contract', id: 'c-1', label: 'My Contract' },
    };
    await sbEnsureNotifThread(base, c);
    // re-ensure without a link — existing link must be preserved
    await sbEnsureNotifThread({ ...base, link: undefined }, c);
    const t = await once<NotifThread | null>((cb) => sbSubscribeNotifThread('thread-link', cb, c));
    expect(t!.link).toBeDefined();
    expect(t!.link?.id).toBe('c-1');
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

  it('Fix1: re-ensure with a new title updates title; re-ensure with empty title keeps existing', async () => {
    const c = await getViettoursClient();
    const base: NotifThread = {
      id: 'thread-title', title: 'T1', members: ['tester'],
      comments: [], createdAt: new Date().toISOString(), createdBy: 'tester',
    };
    await sbEnsureNotifThread(base, c);
    // re-ensure with a new non-empty title → should update
    await sbEnsureNotifThread({ ...base, title: 'T2' }, c);
    const t1 = await once<NotifThread | null>((cb) => sbSubscribeNotifThread('thread-title', cb, c));
    expect(t1!.title).toBe('T2');
    // re-ensure with empty title → should keep T2
    await sbEnsureNotifThread({ ...base, title: '' }, c);
    const t2 = await once<NotifThread | null>((cb) => sbSubscribeNotifThread('thread-title', cb, c));
    expect(t2!.title).toBe('T2');
  });

  it('Fix2: addThreadComment on missing thread resolves without throwing and inserts nothing', async () => {
    const c = await getViettoursClient();
    await expect(
      sbAddThreadComment('nonexistent-thread', {
        id: 'cmt-x', by: 'tester', byName: 'QA', text: 'ghost', at: new Date().toISOString(),
      }, c),
    ).resolves.toBeUndefined();
    // verify nothing was inserted
    const t = await once<NotifThread | null>((cb) => sbSubscribeNotifThread('nonexistent-thread', cb, c));
    expect(t).toBeNull();
  });

  it('priority, reminder, and attachments round-trip through send → subscribe', async () => {
    const c = await getViettoursClient();
    const attachment: FileAttachment = {
      key: 'r2/notif-test.pdf', name: 'brief.pdf',
      uploadedBy: 'admin', uploadedAt: '2026-09-01T00:00:00.000Z',
    };
    await sbSendNotification('tester', {
      type: 'announcement',
      title: 'Urgent notice',
      message: 'Please review',
      createdBy: 'admin',
      priority: 'urgent',
      reminder: { every: '4h', deadline: '2026-09-01' },
      attachments: [attachment],
    }, c);
    const list = await once<Notification[]>((cb) => sbSubscribeNotifications('tester', cb, c));
    expect(list).toHaveLength(1);
    const n = list[0];
    expect(n.priority).toBe('urgent');
    expect(n.reminder).toEqual({ every: '4h', deadline: '2026-09-01' });
    expect(n.attachments).toHaveLength(1);
    expect(n.attachments![0].key).toBe('r2/notif-test.pdf');
    expect(n.attachments![0].name).toBe('brief.pdf');
  });

  it('priority + reminder round-trip through push (sbPushNotifications)', async () => {
    const c = await getViettoursClient();
    await sbSendNotification('tester', {
      type: 'task', title: 'Task', message: 'Do it', createdBy: 'admin',
      priority: 'high',
      reminder: { every: '8h' },
    }, c);
    const list = await once<Notification[]>((cb) => sbSubscribeNotifications('tester', cb, c));
    expect(list[0].priority).toBe('high');
    expect(list[0].reminder).toEqual({ every: '8h' });
    // push back: priority/reminder must survive the overwrite
    await sbPushNotifications('tester', [{ ...list[0], read: true }], c);
    const list2 = await once<Notification[]>((cb) => sbSubscribeNotifications('tester', cb, c));
    expect(list2[0].priority).toBe('high');
    expect(list2[0].reminder).toEqual({ every: '8h' });
    expect(list2[0].read).toBe(true);
  });
});
