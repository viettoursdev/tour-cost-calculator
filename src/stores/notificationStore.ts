import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  sbSubscribeNotifications, sbPushNotifications,
} from '@/lib/supabase';
import type { Notification } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type NotificationState = {
  notifications: Notification[];
  unreadCount: number;
  /** Global open-state for the full-screen Notification Center (single instance). */
  centerOpen: boolean;
  setCenterOpen: (v: boolean) => void;
  init: (username: string) => Unsubscribe;
  markAllRead: (username: string) => Promise<void>;
  markRead: (username: string, id: string) => Promise<void>;
};

export const useNotificationStore = create<NotificationState>()(
  subscribeWithSelector((set, get) => ({
    notifications: [],
    unreadCount: 0,
    centerOpen: false,
    setCenterOpen: (v) => set({ centerOpen: v }),

    init: (username) =>
      sbSubscribeNotifications(username, (list) => {
        set({ notifications: list, unreadCount: list.filter((n) => !n.read).length });
      }),

    markAllRead: async (username) => {
      const next = get().notifications.map((n) => ({ ...n, read: true }));
      set({ notifications: next, unreadCount: 0 });
      await sbPushNotifications(username, next);
    },

    markRead: async (username, id) => {
      const next = get().notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      );
      set({ notifications: next, unreadCount: next.filter((n) => !n.read).length });
      await sbPushNotifications(username, next);
    },
  })),
);
