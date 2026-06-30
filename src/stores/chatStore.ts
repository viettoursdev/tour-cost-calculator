import { create } from 'zustand';
import { sbSubscribeChats, sbJoinPresence } from '@/lib/supabase';
import { showPushNotif } from '@/lib/notifications';
import { playChatPing } from '@/lib/chatPing';
import type { Chat, ChatMessage } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

type ChatState = {
  chats: Chat[];
  online: string[];                 // username đang online (presence)
  username: string | null;
  panelOpen: boolean;               // khung chat đang mở?
  activeChatId: string | null;      // cuộc đang xem (để KHÔNG báo trùng)
  setPanelOpen: (v: boolean) => void;
  setActiveChatId: (id: string | null) => void;
  init: (username: string, name: string) => Unsubscribe;
};

export const useChatStore = create<ChatState>()((set, get) => ({
  chats: [],
  online: [],
  username: null,
  panelOpen: false,
  activeChatId: null,
  setPanelOpen: (v) => set({ panelOpen: v }),
  setActiveChatId: (id) => set({ activeChatId: id }),
  init: (username, name) => {
    set({ username, chats: [], online: [] });
    const seen: Record<string, string> = {}; // baseline lastAt theo từng cuộc

    const unsubChats = sbSubscribeChats(username, (chats) => {
      // Báo tin ĐẾN mới (âm thanh + OS notif) — bỏ qua cuộc đang mở & đang focus.
      const incoming = pickNewIncoming(seen, chats, username);
      if (incoming.length) {
        const { panelOpen, activeChatId } = get();
        for (const c of incoming) {
          const focused = !document.hidden && panelOpen && activeChatId === c.id;
          if (focused) continue;
          playChatPing();
          const title = c.isGroup ? (c.title || 'Nhóm') : (c.lastByName || 'Tin nhắn mới');
          const body = c.isGroup && c.lastByName ? `${c.lastByName}: ${c.lastText ?? ''}` : (c.lastText ?? '');
          showPushNotif(`💬 ${title}`, body, `chat:${c.id}`);
        }
      }
      for (const c of chats) seen[c.id] = c.lastAt ?? '';
      set({ chats });
    });

    const unsubPresence = sbJoinPresence(username, name, (online) => set({ online }));
    return () => { unsubChats(); unsubPresence(); };
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

/**
 * Các cuộc có TIN ĐẾN MỚI so với baseline `prevSeen` (lastAt tăng) và đang chưa đọc.
 * Cuộc chưa có trong baseline (mới xuất hiện) KHÔNG tính là tin mới → tránh báo dồn
 * khi vừa nạp danh sách lần đầu. Hàm thuần để kiểm thử.
 */
export function pickNewIncoming(
  prevSeen: Record<string, string>,
  chats: Chat[],
  username: string,
): Chat[] {
  const out: Chat[] = [];
  for (const c of chats) {
    const before = prevSeen[c.id];
    if (before !== undefined && c.lastAt && c.lastAt > before && chatUnread(c, username)) {
      out.push(c);
    }
  }
  return out;
}

/**
 * Vị trí tin CHƯA ĐỌC ĐẦU TIÊN (để chèn dải "Tin chưa đọc"): tin không phải của mình,
 * có thời điểm muộn hơn `lastReadISO` (mốc đọc đã chốt lúc mở cuộc). Trả -1 nếu không có.
 * Hàm thuần để kiểm thử.
 */
export function firstUnreadIndex(
  messages: ChatMessage[],
  lastReadISO: string | undefined,
  myU: string,
): number {
  if (!lastReadISO) return messages.findIndex((m) => m.by !== myU);
  return messages.findIndex((m) => m.at > lastReadISO && m.by !== myU);
}
