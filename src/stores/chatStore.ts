import { create } from 'zustand';
import { fbSubscribeChats } from '@/lib/firebase';
import type { Chat } from '@/types';
import type { Unsubscribe } from 'firebase/firestore';

type ChatState = {
  chats: Chat[];
  username: string | null;
  init: (username: string) => Unsubscribe;
};

export const useChatStore = create<ChatState>()((set) => ({
  chats: [],
  username: null,
  init: (username) => {
    set({ username, chats: [] });
    return fbSubscribeChats(username, (chats) => set({ chats }));
  },
}));

/** 1 cuộc có tin chưa đọc cho user: tin cuối mới hơn lần đọc & không phải mình gửi. */
export function chatUnread(c: Chat, username: string): boolean {
  if (!c.lastAt) return false;
  const last = c.messages[c.messages.length - 1];
  if (last && last.by === username) return false;     // mình vừa gửi
  const read = c.reads?.[username];
  return !read || read < c.lastAt;
}
