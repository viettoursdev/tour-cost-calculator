import { describe, it, expect } from 'vitest';
import { sameDay, chatDayLabel, groupWithPrev, mentionQuery, applyMention, mentionSegments, matchMessageIds, searchHighlight } from './chatFormat';
import type { ChatMessage } from '@/types';

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: 'm', by: 'a', byName: 'A', at: '2026-07-01T10:00:00.000Z', ...over,
});

describe('sameDay / chatDayLabel', () => {
  it('sameDay đúng/sai', () => {
    expect(sameDay('2026-07-01T01:00:00', '2026-07-01T23:00:00')).toBe(true);
    expect(sameDay('2026-07-01T10:00:00', '2026-07-02T10:00:00')).toBe(false);
  });
  it('nhãn Hôm nay / Hôm qua / ngày', () => {
    const now = '2026-07-01T12:00:00';
    expect(chatDayLabel('2026-07-01T08:00:00', now)).toBe('Hôm nay');
    expect(chatDayLabel('2026-06-30T08:00:00', now)).toBe('Hôm qua');
    expect(chatDayLabel('2026-06-15T08:00:00', now)).toMatch(/15/);
  });
});

describe('groupWithPrev', () => {
  it('gộp khi cùng người & ≤5 phút cùng ngày', () => {
    const p = msg({ by: 'a', at: '2026-07-01T10:00:00.000Z' });
    const c = msg({ by: 'a', at: '2026-07-01T10:03:00.000Z' });
    expect(groupWithPrev(p, c)).toBe(true);
  });
  it('KHÔNG gộp khi khác người', () => {
    expect(groupWithPrev(msg({ by: 'a' }), msg({ by: 'b', at: '2026-07-01T10:01:00.000Z' }))).toBe(false);
  });
  it('KHÔNG gộp khi cách > 5 phút', () => {
    const p = msg({ by: 'a', at: '2026-07-01T10:00:00.000Z' });
    const c = msg({ by: 'a', at: '2026-07-01T10:06:00.000Z' });
    expect(groupWithPrev(p, c)).toBe(false);
  });
  it('không có prev → false', () => {
    expect(groupWithPrev(undefined, msg({}))).toBe(false);
  });
});

describe('mentionQuery', () => {
  it('lấy query sau @ đầu token', () => {
    expect(mentionQuery('chào @an', 8)).toBe('an');
    expect(mentionQuery('@', 1)).toBe('');
  });
  it('null khi @ giữa từ hoặc query có khoảng trắng', () => {
    expect(mentionQuery('email@abc', 9)).toBe(null);
    expect(mentionQuery('@an binh', 8)).toBe(null);
    expect(mentionQuery('không có', 8)).toBe(null);
  });
});

describe('applyMention', () => {
  it('thay @query bằng @Tên + space, dời con trỏ', () => {
    const r = applyMention('chào @an', 8, 'An Nguyễn');
    expect(r.value).toBe('chào @An Nguyễn ');
    expect(r.caret).toBe(r.value.length);
  });
  it('chèn giữa câu', () => {
    const r = applyMention('hi @a cuối', 5, 'Anh');
    expect(r.value).toBe('hi @Anh  cuối');
  });
});

describe('mentionSegments', () => {
  it('đánh dấu đoạn @Tên', () => {
    const segs = mentionSegments('chào @An Nguyễn nhé', ['An Nguyễn']);
    expect(segs).toEqual([
      { t: 'chào ', mention: false },
      { t: '@An Nguyễn', mention: true },
      { t: ' nhé', mention: false },
    ]);
  });
  it('khớp tên dài trước (tránh khớp một phần)', () => {
    const segs = mentionSegments('@An Nguyễn', ['An', 'An Nguyễn']);
    expect(segs).toEqual([{ t: '@An Nguyễn', mention: true }]);
  });
  it('không có tên → một đoạn thường', () => {
    expect(mentionSegments('xin chào', [])).toEqual([{ t: 'xin chào', mention: false }]);
  });
});

describe('matchMessageIds', () => {
  const msgs: ChatMessage[] = [
    msg({ id: 'a', text: 'Chào team nhé' }),
    msg({ id: 'b', text: 'Báo giá tour Đà Nẵng' }),
    msg({ id: 'c', text: 'tour Hà Nội' }),
    msg({ id: 'd', text: 'đã thu hồi', deleted: true }),
    msg({ id: 'e', text: 'X vào nhóm', system: true }),
  ];
  it('khớp không phân biệt hoa/thường, bỏ thu hồi & hệ thống', () => {
    expect(matchMessageIds(msgs, 'TOUR')).toEqual(['b', 'c']);
    expect(matchMessageIds(msgs, '')).toEqual([]);
    expect(matchMessageIds(msgs, 'xyz')).toEqual([]);
  });
});

describe('searchHighlight', () => {
  it('đánh dấu các đoạn khớp', () => {
    expect(searchHighlight('tour Đà Nẵng tour', 'tour')).toEqual([
      { t: 'tour', hit: true },
      { t: ' Đà Nẵng ', hit: false },
      { t: 'tour', hit: true },
    ]);
  });
  it('không khớp → một đoạn thường; query rỗng giữ nguyên', () => {
    expect(searchHighlight('abc', 'z')).toEqual([{ t: 'abc', hit: false }]);
    expect(searchHighlight('abc', '')).toEqual([{ t: 'abc', hit: false }]);
  });
});
