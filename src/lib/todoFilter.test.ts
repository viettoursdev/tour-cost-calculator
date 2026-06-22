import { describe, it, expect } from 'vitest';
import { filterTodos, allTags, todoStats, EMPTY_FILTER } from './todoFilter';
import type { Todo } from '@/types';

const mk = (over: Partial<Todo>): Todo => ({
  id: Math.random().toString(36).slice(2), title: 'Việc', status: 'todo', priority: 'normal',
  createdBy: 'me', createdByName: 'Me', createdAt: '2026-01-01T00:00:00.000Z', assignees: [], ...over,
});

describe('filterTodos', () => {
  const todos = [
    mk({ title: 'Đặt cọc NCC', tags: ['tour'], assignees: ['an'], priority: 'high', status: 'doing' }),
    mk({ title: 'Gọi khách', createdBy: 'binh', assignees: ['binh'], status: 'done' }),
    mk({ title: 'Soạn hợp đồng', note: 'gấp', createdBy: 'me' }),
  ];

  it('scope mine chỉ lấy việc của tôi (tạo hoặc được giao)', () => {
    expect(filterTodos(todos, { ...EMPTY_FILTER, scope: 'mine' }, 'me')).toHaveLength(2);
    expect(filterTodos(todos, { ...EMPTY_FILTER, scope: 'all' }, 'me')).toHaveLength(3);
  });
  it('lọc theo người được giao', () => {
    expect(filterTodos(todos, { ...EMPTY_FILTER, scope: 'all', assignee: 'an' }, 'me')).toHaveLength(1);
  });
  it('lọc theo ưu tiên / trạng thái / ẩn xong', () => {
    expect(filterTodos(todos, { ...EMPTY_FILTER, scope: 'all', priority: 'high' }, 'me')).toHaveLength(1);
    expect(filterTodos(todos, { ...EMPTY_FILTER, scope: 'all', status: 'done' }, 'me')).toHaveLength(1);
    expect(filterTodos(todos, { ...EMPTY_FILTER, scope: 'all', hideDone: true }, 'me')).toHaveLength(2);
  });
  it('search khớp tiêu đề/mô tả/tag (không phân biệt hoa thường)', () => {
    expect(filterTodos(todos, { ...EMPTY_FILTER, scope: 'all', q: 'gấp' }, 'me')).toHaveLength(1);
    expect(filterTodos(todos, { ...EMPTY_FILTER, scope: 'all', q: 'TOUR' }, 'me')).toHaveLength(1);
  });
  it('lọc theo tag', () => {
    expect(filterTodos(todos, { ...EMPTY_FILTER, scope: 'all', tag: 'tour' }, 'me')).toHaveLength(1);
  });
});

describe('allTags', () => {
  it('gom tag duy nhất đã sắp', () => {
    expect(allTags([mk({ tags: ['b', 'a'] }), mk({ tags: ['a', 'c'] })])).toEqual(['a', 'b', 'c']);
  });
});

describe('todoStats', () => {
  const now = new Date('2026-06-22T00:00:00.000Z').getTime();
  const users = [{ u: 'an', name: 'An' }, { u: 'me', name: 'Me' }];
  const todos = [
    mk({ assignees: ['an'], dueDate: '2026-06-20T00:00:00.000Z' }),         // overdue, open
    mk({ assignees: ['an'], status: 'doing' }),                              // doing, open
    mk({ assignees: ['me'], status: 'done', completedAt: '2026-06-21T00:00:00.000Z' }), // done gần đây
  ];

  it('đếm tổng/mở/quá hạn/xong và tải theo người', () => {
    const s = todoStats(todos, users, now);
    expect(s.total).toBe(3);
    expect(s.open).toBe(2);
    expect(s.overdue).toBe(1);
    expect(s.done).toBe(1);
    const an = s.workload.find((r) => r.u === 'an')!;
    expect(an.open).toBe(2);
    expect(an.overdue).toBe(1);
    expect(s.workload[0].u).toBe('an'); // sắp quá hạn↓ rồi mở↓
  });
  it('việc xong quá hạn recentDays không tính vào done', () => {
    const old = todoStats([mk({ status: 'done', completedAt: '2026-01-01T00:00:00.000Z' })], users, now);
    expect(old.done).toBe(0);
  });
});
