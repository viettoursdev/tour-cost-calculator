import { describe, it, expect } from 'vitest';
import { chatUnread, pickNewIncoming, firstUnreadIndex } from './chatStore';
import type { Chat, ChatMessage } from '@/types';

const mkChat = (over: Partial<Chat>): Chat => ({
  id: 'c1', members: ['me', 'bob'], isGroup: false, createdBy: 'me',
  createdAt: '2026-01-01T00:00:00.000Z', messages: [], ...over,
});

describe('chatUnread', () => {
  it('chưa đọc khi tin cuối mới hơn mốc đọc của mình', () => {
    const c = mkChat({ lastAt: '2026-07-01T10:00:00.000Z', reads: { me: '2026-07-01T09:00:00.000Z' } });
    expect(chatUnread(c, 'me')).toBe(true);
  });
  it('đã đọc khi mốc đọc ≥ tin cuối', () => {
    const c = mkChat({ lastAt: '2026-07-01T10:00:00.000Z', reads: { me: '2026-07-01T10:00:00.000Z' } });
    expect(chatUnread(c, 'me')).toBe(false);
  });
  it('không tính chưa đọc khi tin cuối do MÌNH gửi', () => {
    const last: ChatMessage = { id: 'm1', by: 'me', byName: 'Me', at: '2026-07-01T10:00:00.000Z', text: 'hi' };
    const c = mkChat({ lastAt: last.at, messages: [last] });
    expect(chatUnread(c, 'me')).toBe(false);
  });
  it('không có lastAt → không chưa đọc', () => {
    expect(chatUnread(mkChat({}), 'me')).toBe(false);
  });
});

describe('pickNewIncoming', () => {
  it('KHÔNG báo ở lần nạp đầu (baseline rỗng)', () => {
    const chats = [mkChat({ id: 'c1', lastAt: '2026-07-01T10:00:00.000Z', reads: {} })];
    expect(pickNewIncoming({}, chats, 'me')).toEqual([]);
  });
  it('báo khi lastAt tăng & đang chưa đọc', () => {
    const prev = { c1: '2026-07-01T09:00:00.000Z' };
    const chats = [mkChat({ id: 'c1', lastAt: '2026-07-01T10:00:00.000Z', reads: { me: '2026-07-01T09:00:00.000Z' } })];
    expect(pickNewIncoming(prev, chats, 'me').map((c) => c.id)).toEqual(['c1']);
  });
  it('KHÔNG báo khi lastAt tăng nhưng mình đã đọc (mình vừa gửi từ máy khác)', () => {
    const prev = { c1: '2026-07-01T09:00:00.000Z' };
    const chats = [mkChat({ id: 'c1', lastAt: '2026-07-01T10:00:00.000Z', reads: { me: '2026-07-01T10:00:00.000Z' } })];
    expect(pickNewIncoming(prev, chats, 'me')).toEqual([]);
  });
  it('KHÔNG báo khi lastAt không đổi', () => {
    const prev = { c1: '2026-07-01T10:00:00.000Z' };
    const chats = [mkChat({ id: 'c1', lastAt: '2026-07-01T10:00:00.000Z', reads: { me: '2026-07-01T09:00:00.000Z' } })];
    expect(pickNewIncoming(prev, chats, 'me')).toEqual([]);
  });
});

describe('firstUnreadIndex', () => {
  const msgs: ChatMessage[] = [
    { id: 'm1', by: 'me', byName: 'Me', at: '2026-07-01T08:00:00.000Z', text: 'a' },
    { id: 'm2', by: 'bob', byName: 'Bob', at: '2026-07-01T09:00:00.000Z', text: 'b' },
    { id: 'm3', by: 'bob', byName: 'Bob', at: '2026-07-01T10:00:00.000Z', text: 'c' },
  ];
  it('tin chưa đọc đầu tiên sau mốc đọc, không phải của mình', () => {
    expect(firstUnreadIndex(msgs, '2026-07-01T09:30:00.000Z', 'me')).toBe(2);
  });
  it('chưa từng đọc → tin không-của-mình đầu tiên', () => {
    expect(firstUnreadIndex(msgs, undefined, 'me')).toBe(1);
  });
  it('đã đọc hết → -1', () => {
    expect(firstUnreadIndex(msgs, '2026-07-01T10:00:00.000Z', 'me')).toBe(-1);
  });
});
