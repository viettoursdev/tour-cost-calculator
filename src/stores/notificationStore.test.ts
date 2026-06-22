import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => import('@/test/supabaseStub'));

import { useNotificationStore } from './notificationStore';
import { snapshotInitial } from '@/test/storeReset';
import * as fb from '@/lib/supabase';
import type { Notification } from '@/types';

const reset = snapshotInitial(useNotificationStore);
beforeEach(() => { reset(); vi.clearAllMocks(); });

function notif(over: Partial<Notification> = {}): Notification {
  return {
    id: 'n1',
    type: 'info',
    title: 't',
    body: 'b',
    from: 'sys',
    to: 'ceo',
    createdAt: 0,
    read: false,
    ...over,
  } as Notification;
}

describe('notificationStore', () => {
  it('starts empty', () => {
    const s = useNotificationStore.getState();
    expect(s.notifications).toEqual([]);
    expect(s.unreadCount).toBe(0);
  });

  it('init subscribes for the given user', () => {
    useNotificationStore.getState().init('ceo');
    expect(fb.sbSubscribeNotifications).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fb.sbSubscribeNotifications).mock.calls[0][0]).toBe('ceo');
  });

  it('subscriber callback populates list and recomputes unreadCount', () => {
    useNotificationStore.getState().init('ceo');
    const cb = vi.mocked(fb.sbSubscribeNotifications).mock.calls[0][1];
    cb([notif({ id: 'a' }), notif({ id: 'b', read: true }), notif({ id: 'c' })]);
    const s = useNotificationStore.getState();
    expect(s.notifications.length).toBe(3);
    expect(s.unreadCount).toBe(2);
  });

  it('markAllRead flips every notification and pushes', async () => {
    useNotificationStore.setState({
      notifications: [notif({ id: 'a' }), notif({ id: 'b' })],
      unreadCount: 2,
    }, false);
    await useNotificationStore.getState().markAllRead('ceo');
    const s = useNotificationStore.getState();
    expect(s.unreadCount).toBe(0);
    expect(s.notifications.every((n) => n.read)).toBe(true);
    expect(fb.sbPushNotifications).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fb.sbPushNotifications).mock.calls[0][0]).toBe('ceo');
  });

  it('markRead flips only the matching id and recomputes count', async () => {
    useNotificationStore.setState({
      notifications: [notif({ id: 'a' }), notif({ id: 'b' })],
      unreadCount: 2,
    }, false);
    await useNotificationStore.getState().markRead('ceo', 'a');
    const s = useNotificationStore.getState();
    expect(s.notifications.find((n) => n.id === 'a')?.read).toBe(true);
    expect(s.notifications.find((n) => n.id === 'b')?.read).toBe(false);
    expect(s.unreadCount).toBe(1);
    expect(fb.sbPushNotifications).toHaveBeenCalledTimes(1);
  });
});
