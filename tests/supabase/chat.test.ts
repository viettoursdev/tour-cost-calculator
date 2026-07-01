import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import {
  sbSubscribeChats, sbSubscribeChat, sbEnsureChat, sbSendChatMessage,
  sbEditChatMessage, sbDeleteChatMessage, sbToggleChatReaction, sbMarkChatRead,
  sbSetChatMessagePinned, sbRenameChat, sbAddChatMembers, sbRemoveChatMember,
} from '../../src/lib/supabase';
import { sbSearchChatMessages } from '../../src/lib/chatSearch';
import type { Chat, ChatMessage } from '@/types/chat';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

const waitFor = async (pred: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('chat gateway', () => {
  beforeEach(async () => {
    await truncate(['chat_messages', 'chat_members', 'chats']);
  });

  it('ensure a DM chat → sbSubscribeChats yields it for each member', async () => {
    const c = await getViettoursClient();
    const chat: Chat = {
      id: 'dm_alpha__tester',
      members: ['tester', 'alpha'],
      isGroup: false,
      createdBy: 'tester',
      createdAt: new Date().toISOString(),
      messages: [],
    };
    await sbEnsureChat(chat, c);

    const list = await once<Chat[]>((cb) => sbSubscribeChats('tester', cb, c));
    expect(list.length).toBeGreaterThanOrEqual(1);
    const found = list.find((ch) => ch.id === 'dm_alpha__tester');
    expect(found).toBeDefined();
    expect(found!.members).toContain('tester');
    expect(found!.members).toContain('alpha');
  });

  it('send a message → lastText/lastAt update; sbSubscribeChat yields it with file + replyTo + reactions', async () => {
    const c = await getViettoursClient();
    const chatId = 'dm_alpha__tester';
    const chat: Chat = {
      id: chatId,
      members: ['tester', 'alpha'],
      isGroup: false,
      createdBy: 'tester',
      createdAt: new Date().toISOString(),
      messages: [],
    };
    await sbEnsureChat(chat, c);

    const msg: ChatMessage = {
      id: 'msg-001',
      by: 'tester',
      byName: 'QA Tester',
      at: new Date().toISOString(),
      text: 'Hello world',
      file: { key: 'r2/chat-test.pdf', name: 'brief.pdf', size: 1234, mime: 'application/pdf' },
      replyTo: { id: 'msg-000', byName: 'Alpha', text: 'Quoted' },
      reactions: { '👍': ['tester'] },
    };
    await sbSendChatMessage(chatId, msg, c);

    const result = await once<Chat | null>((cb) => sbSubscribeChat(chatId, cb, c));
    expect(result).not.toBeNull();
    expect(result!.lastText).toBe('Hello world');
    expect(result!.lastAt).toBeTruthy();
    expect(result!.lastByName).toBe('QA Tester');
    expect(result!.messages).toHaveLength(1);

    const m = result!.messages[0];
    expect(m.id).toBe('msg-001');
    expect(m.by).toBe('tester');
    expect(m.byName).toBe('QA Tester');
    expect(m.text).toBe('Hello world');
    expect(m.file).toEqual({ key: 'r2/chat-test.pdf', name: 'brief.pdf', size: 1234, mime: 'application/pdf' });
    expect(m.replyTo).toEqual({ id: 'msg-000', byName: 'Alpha', text: 'Quoted' });
    expect(m.reactions).toEqual({ '👍': ['tester'] });
  });

  it("sender's last_read advances to msg.at on send", async () => {
    const c = await getViettoursClient();
    const chatId = 'dm_bravo__tester';
    await sbEnsureChat({
      id: chatId, members: ['tester', 'bravo'], isGroup: false,
      createdBy: 'tester', createdAt: new Date().toISOString(), messages: [],
    }, c);

    const at = new Date().toISOString();
    await sbSendChatMessage(chatId, {
      id: 'msg-002', by: 'tester', byName: 'QA Tester', at, text: 'Read test',
    }, c);

    const result = await once<Chat | null>((cb) => sbSubscribeChat(chatId, cb, c));
    expect(result).not.toBeNull();
    expect(result!.reads).toBeDefined();
    expect(result!.reads!['tester']).toBeTruthy();
  });

  it('sbSubscribeChats shows lastText after a message is sent', async () => {
    const c = await getViettoursClient();
    const chatId = 'dm_charlie__tester';
    await sbEnsureChat({
      id: chatId, members: ['tester', 'charlie'], isGroup: false,
      createdBy: 'tester', createdAt: new Date().toISOString(), messages: [],
    }, c);

    await sbSendChatMessage(chatId, {
      id: 'msg-003', by: 'tester', byName: 'QA Tester',
      at: new Date().toISOString(), text: 'Preview text',
    }, c);

    const list = await once<Chat[]>((cb) => sbSubscribeChats('tester', cb, c));
    const found = list.find((ch) => ch.id === chatId);
    expect(found).toBeDefined();
    expect(found!.lastText).toBe('Preview text');
  });

  it('sbEnsureChat is idempotent — re-ensuring a DM merges members, does not duplicate', async () => {
    const c = await getViettoursClient();
    const chatId = 'dm_alpha__tester';
    const base: Chat = {
      id: chatId, members: ['tester', 'alpha'], isGroup: false,
      createdBy: 'tester', createdAt: new Date().toISOString(), messages: [],
    };
    await sbEnsureChat(base, c);
    await sbEnsureChat(base, c); // idempotent
    const result = await once<Chat | null>((cb) => sbSubscribeChat(chatId, cb, c));
    expect(result).not.toBeNull();
    expect(result!.members.filter((m) => m === 'tester')).toHaveLength(1);
    expect(result!.members.filter((m) => m === 'alpha')).toHaveLength(1);
  });

  it('sbEditChatMessage — text changes and editedAt is set', async () => {
    const c = await getViettoursClient();
    const chatId = 'dm_edit__tester';
    await sbEnsureChat({
      id: chatId, members: ['tester', 'edit'], isGroup: false,
      createdBy: 'tester', createdAt: new Date().toISOString(), messages: [],
    }, c);

    const before = new Date().toISOString();
    await sbSendChatMessage(chatId, {
      id: 'msg-edit-001', by: 'tester', byName: 'QA Tester',
      at: before, text: 'original text',
    }, c);

    await sbEditChatMessage(chatId, 'msg-edit-001', 'edited text', c);

    const result = await once<Chat | null>((cb) => sbSubscribeChat(chatId, cb, c));
    expect(result).not.toBeNull();
    const m = result!.messages.find((msg) => msg.id === 'msg-edit-001');
    expect(m).toBeDefined();
    expect(m!.text).toBe('edited text');
    expect(m!.editedAt).toBeTruthy();
    expect(new Date(m!.editedAt!).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    // Preview danh sách phải đồng bộ với nội dung đã sửa (Fix 3).
    expect(result!.lastText).toBe('edited text');
  });

  it('sbDeleteChatMessage — soft delete sets deleted=true, clears text+file', async () => {
    const c = await getViettoursClient();
    const chatId = 'dm_delete__tester';
    await sbEnsureChat({
      id: chatId, members: ['tester', 'delete'], isGroup: false,
      createdBy: 'tester', createdAt: new Date().toISOString(), messages: [],
    }, c);

    await sbSendChatMessage(chatId, {
      id: 'msg-del-001', by: 'tester', byName: 'QA Tester',
      at: new Date().toISOString(), text: 'to be deleted',
      file: { key: 'r2/x.pdf', name: 'x.pdf', size: 1 },
    }, c);

    await sbDeleteChatMessage(chatId, 'msg-del-001', c);

    const result = await once<Chat | null>((cb) => sbSubscribeChat(chatId, cb, c));
    expect(result).not.toBeNull();
    const m = result!.messages.find((msg) => msg.id === 'msg-del-001');
    expect(m).toBeDefined();
    expect(m!.deleted).toBe(true);
    expect(m!.text).toBeUndefined();
    expect(m!.file).toBeUndefined();
    // Preview danh sách phải hiện "Tin đã thu hồi" thay vì nội dung cũ (Fix 3).
    expect(result!.lastText).toBe('Tin đã thu hồi');
  });

  it('sbToggleChatReaction — adds then removes; emoji key dropped when array empties', async () => {
    const c = await getViettoursClient();
    const chatId = 'dm_react__tester';
    await sbEnsureChat({
      id: chatId, members: ['tester', 'react'], isGroup: false,
      createdBy: 'tester', createdAt: new Date().toISOString(), messages: [],
    }, c);

    await sbSendChatMessage(chatId, {
      id: 'msg-react-001', by: 'tester', byName: 'QA Tester',
      at: new Date().toISOString(), text: 'react me',
    }, c);

    // Toggle ON
    await sbToggleChatReaction(chatId, 'msg-react-001', '👍', 'tester', c);
    const after1 = await once<Chat | null>((cb) => sbSubscribeChat(chatId, cb, c));
    const m1 = after1!.messages.find((msg) => msg.id === 'msg-react-001');
    expect(m1!.reactions).toEqual({ '👍': ['tester'] });

    // Toggle OFF — emoji key must be dropped when array is empty
    await sbToggleChatReaction(chatId, 'msg-react-001', '👍', 'tester', c);
    const after2 = await once<Chat | null>((cb) => sbSubscribeChat(chatId, cb, c));
    const m2 = after2!.messages.find((msg) => msg.id === 'msg-react-001');
    expect(m2!.reactions).not.toHaveProperty('👍');
  });

  // Đánh dấu đã đọc cho CHÍNH MÌNH (RLS 0086 chỉ cho cập nhật dòng của mình — app
  // luôn gọi sbMarkChatRead với username của người đang đăng nhập).
  it('sbMarkChatRead — last_read for the current member advances', async () => {
    const c = await getViettoursClient();
    const chatId = 'dm_read__tester';
    await sbEnsureChat({
      id: chatId, members: ['tester', 'read'], isGroup: false,
      createdBy: 'tester', createdAt: new Date().toISOString(), messages: [],
    }, c);

    const snap1 = await once<Chat | null>((cb) => sbSubscribeChat(chatId, cb, c));
    const readBefore = snap1!.reads?.['tester'];

    await sbMarkChatRead(chatId, 'tester', c);

    const snap2 = await once<Chat | null>((cb) => sbSubscribeChat(chatId, cb, c));
    const readAfter = snap2!.reads?.['tester'];
    expect(readAfter).toBeTruthy();
    if (readBefore) {
      expect(new Date(readAfter!).getTime()).toBeGreaterThanOrEqual(new Date(readBefore).getTime());
    }
  });

  it('file-only message preview uses 📎 filename', async () => {
    const c = await getViettoursClient();
    const chatId = 'dm_delta__tester';
    await sbEnsureChat({
      id: chatId, members: ['tester', 'delta'], isGroup: false,
      createdBy: 'tester', createdAt: new Date().toISOString(), messages: [],
    }, c);

    await sbSendChatMessage(chatId, {
      id: 'msg-file', by: 'tester', byName: 'QA Tester',
      at: new Date().toISOString(),
      file: { key: 'r2/img.png', name: 'photo.png', size: 42000 },
    }, c);

    const result = await once<Chat | null>((cb) => sbSubscribeChat(chatId, cb, c));
    expect(result!.lastText).toBe('📎 photo.png');
  });

  it('mentions round-trip — gửi @nhắc, đọc lại đúng danh sách', async () => {
    const c = await getViettoursClient();
    const chatId = 'grp_mention__tester';
    await sbEnsureChat({
      id: chatId, members: ['tester', 'alpha', 'bravo'], isGroup: true, title: 'Nhóm @',
      createdBy: 'tester', createdAt: new Date().toISOString(), messages: [],
    }, c);

    await sbSendChatMessage(chatId, {
      id: 'msg-mention-001', by: 'tester', byName: 'QA Tester',
      at: new Date().toISOString(), text: '@Alpha @Bravo họp nhé', mentions: ['alpha', 'bravo'],
    }, c);

    const result = await once<Chat | null>((cb) => sbSubscribeChat(chatId, cb, c));
    const m = result!.messages.find((msg) => msg.id === 'msg-mention-001');
    expect(m).toBeDefined();
    expect(m!.mentions).toEqual(['alpha', 'bravo']);
  });

  it('ghim / bỏ ghim tin nhắn', async () => {
    const c = await getViettoursClient();
    const chatId = 'dm_echo__tester';
    await sbEnsureChat({ id: chatId, members: ['tester', 'echo'], isGroup: false, createdBy: 'tester', createdAt: new Date().toISOString(), messages: [] }, c);
    await sbSendChatMessage(chatId, { id: 'msg-pin', by: 'tester', byName: 'QA', at: new Date().toISOString(), text: 'ghim tin này' }, c);

    await sbSetChatMessagePinned(chatId, 'msg-pin', true, c);
    let res = await once<Chat | null>((cb) => sbSubscribeChat(chatId, cb, c));
    expect(res!.messages.find((m) => m.id === 'msg-pin')!.pinned).toBe(true);

    await sbSetChatMessagePinned(chatId, 'msg-pin', false, c);
    res = await once<Chat | null>((cb) => sbSubscribeChat(chatId, cb, c));
    expect(res!.messages.find((m) => m.id === 'msg-pin')!.pinned).toBeUndefined();
  });

  it('chuyển tiếp giữ forwardedFrom', async () => {
    const c = await getViettoursClient();
    const chatId = 'dm_foxtrot__tester';
    await sbEnsureChat({ id: chatId, members: ['tester', 'foxtrot'], isGroup: false, createdBy: 'tester', createdAt: new Date().toISOString(), messages: [] }, c);
    await sbSendChatMessage(chatId, { id: 'msg-fwd', by: 'tester', byName: 'QA', at: new Date().toISOString(), text: 'đã chuyển tiếp', forwardedFrom: 'Người Gốc' }, c);

    const res = await once<Chat | null>((cb) => sbSubscribeChat(chatId, cb, c));
    expect(res!.messages.find((m) => m.id === 'msg-fwd')!.forwardedFrom).toBe('Người Gốc');
  });

  it('quản lý nhóm: đổi tên + thêm/xoá thành viên', async () => {
    const c = await getViettoursClient();
    const chatId = 'grp_manage__1';
    await sbEnsureChat({ id: chatId, members: ['tester', 'alpha'], isGroup: true, title: 'Nhóm cũ', createdBy: 'tester', createdAt: new Date().toISOString(), messages: [] }, c);

    await sbRenameChat(chatId, 'Nhóm mới', c);
    await sbAddChatMembers(chatId, ['bravo'], c);
    let res = await once<Chat | null>((cb) => sbSubscribeChat(chatId, cb, c));
    expect(res!.title).toBe('Nhóm mới');
    expect(res!.members.sort()).toEqual(['alpha', 'bravo', 'tester']);

    await sbRemoveChatMember(chatId, 'alpha', c);
    res = await once<Chat | null>((cb) => sbSubscribeChat(chatId, cb, c));
    expect(res!.members.sort()).toEqual(['bravo', 'tester']);
  });

  it('phân trang: mở nạp trang mới nhất + loadOlder nạp tin cũ', async () => {
    const c = await getViettoursClient();
    const chatId = 'dm_golf__tester';
    await sbEnsureChat({ id: chatId, members: ['tester', 'golf'], isGroup: false, createdBy: 'tester', createdAt: new Date().toISOString(), messages: [] }, c);
    const base = Date.now();
    for (let i = 0; i < 35; i++) {
      await sbSendChatMessage(chatId, { id: `pg-${i}`, by: 'tester', byName: 'QA', at: new Date(base + i * 1000).toISOString(), text: `tin ${i}` }, c);
    }

    let latest: Chat | null = null;
    let hasMore = false;
    const sub = sbSubscribeChat(chatId, (chat, meta) => { latest = chat; if (meta) hasMore = meta.hasMore; }, c);
    try {
      await waitFor(() => !!latest && latest.messages.length === 30); // trang đầu = 30 tin mới nhất
      expect(hasMore).toBe(true);
      expect(latest!.messages[0].text).toBe('tin 5');
      expect(latest!.messages[29].text).toBe('tin 34');

      const n = await sub.loadOlder();
      expect(n).toBe(5);
      await waitFor(() => !!latest && latest.messages.length === 35);
      expect(latest!.messages[0].text).toBe('tin 0');
      expect(hasMore).toBe(false);
    } finally { sub(); }
  });

  it('tìm kiếm toàn cục: khớp mọi cuộc, không phân biệt hoa/thường, bỏ thu hồi & hệ thống', async () => {
    const c = await getViettoursClient();
    const t0 = new Date('2026-07-01T00:00:00.000Z').getTime();
    await sbEnsureChat({ id: 'dm_hotel__tester', members: ['tester', 'hotel'], isGroup: false, createdBy: 'tester', createdAt: new Date(t0).toISOString(), messages: [] }, c);
    await sbEnsureChat({ id: 'grp_search__1', members: ['tester', 'alpha'], isGroup: true, title: 'Nhóm tìm', createdBy: 'tester', createdAt: new Date(t0).toISOString(), messages: [] }, c);
    await sbSendChatMessage('dm_hotel__tester', { id: 's1', by: 'tester', byName: 'QA', at: new Date(t0 + 1000).toISOString(), text: 'Báo giá tour Đà Nẵng gấp' }, c);
    await sbSendChatMessage('grp_search__1', { id: 's2', by: 'tester', byName: 'QA', at: new Date(t0 + 2000).toISOString(), text: 'Lịch TOUR Hà Nội' }, c);
    await sbSendChatMessage('grp_search__1', { id: 's3', by: 'tester', byName: 'QA', at: new Date(t0 + 3000).toISOString(), text: 'tin sẽ thu hồi tour' }, c);
    await sbDeleteChatMessage('grp_search__1', 's3', c);
    await sbSendChatMessage('grp_search__1', { id: 's4', by: 'tester', byName: 'QA', at: new Date(t0 + 4000).toISOString(), text: 'X vào nhóm tour', system: true }, c);

    const hits = await sbSearchChatMessages('tour', c);
    const ids = hits.map((h) => h.msgId);
    expect(ids).toContain('s1');     // DM
    expect(ids).toContain('s2');     // nhóm, khác hoa/thường
    expect(ids).not.toContain('s3'); // đã thu hồi
    expect(ids).not.toContain('s4'); // tin hệ thống
    expect(await sbSearchChatMessages('a', c)).toEqual([]); // <2 ký tự → rỗng
  });
});
