import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  fbSubscribeNotifications, fbPushNotifications,
} from '@/lib/firebase';
import type { Notification } from '@/types';
import type { Unsubscribe } from 'firebase/firestore';

type NotificationState = {
  notifications: Notification[];
  unreadCount: number;
  init: (username: string) => Unsubscribe;
  markAllRead: (username: string) => Promise<void>;
  markRead: (username: string, id: string) => Promise<void>;
};

export const useNotificationStore = create<NotificationState>()(
  subscribeWithSelector((set, get) => ({
    notifications: [],
    unreadCount: 0,

    init: (username) =>
      fbSubscribeNotifications(username, (list) => {
        set({ notifications: list, unreadCount: list.filter((n) => !n.read).length });
      }),

    markAllRead: async (username) => {
      const next = get().notifications.map((n) => ({ ...n, read: true }));
      set({ notifications: next, unreadCount: 0 });
      await fbPushNotifications(username, next);
    },

    markRead: async (username, id) => {
      const next = get().notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      );
      set({ notifications: next, unreadCount: next.filter((n) => !n.read).length });
      await fbPushNotifications(username, next);
    },
  })),
);
