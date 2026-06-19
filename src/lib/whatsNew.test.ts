import { describe, it, expect } from 'vitest';
import { computeUnseen, type WhatsNewEntry } from './whatsNew';

const entries: WhatsNewEntry[] = [
  { id: 'c', date: '', title: 'C', items: [] },
  { id: 'b', date: '', title: 'B', items: [] },
  { id: 'a', date: '', title: 'A', items: [] },
];

describe('computeUnseen', () => {
  it('chưa xem gì → tất cả', () => {
    expect(computeUnseen(entries, null).map((e) => e.id)).toEqual(['c', 'b', 'a']);
  });
  it('đã xem entry mới nhất → không còn gì', () => {
    expect(computeUnseen(entries, 'c')).toEqual([]);
  });
  it('đã xem entry giữa → chỉ các entry mới hơn', () => {
    expect(computeUnseen(entries, 'b').map((e) => e.id)).toEqual(['c']);
  });
  it('seenId không còn trong nhật ký → coi như chưa xem', () => {
    expect(computeUnseen(entries, 'zzz').map((e) => e.id)).toEqual(['c', 'b', 'a']);
  });
});
