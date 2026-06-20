import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import {
  sbSubscribeChats, sbSubscribeChat, sbEnsureChat, sbSendChatMessage,
} from '../../src/lib/supabase';
import type { Chat, ChatMessage } from '@/types/chat';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

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
});
