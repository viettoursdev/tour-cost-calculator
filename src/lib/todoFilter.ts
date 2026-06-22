import type { Todo, TodoStatus } from '@/types';
import { isMyTodo } from '@/stores/todoStore';

/** Bộ lọc cho workspace Việc cần làm. */
export type TodoFilter = {
  q: string;                              // tìm theo tiêu đề/mô tả/tag
  scope: 'mine' | 'all';                  // của tôi / tất cả
  assignee: string;                       // username, '' = mọi người
  priority: '' | Todo['priority'];
  tag: string;                            // '' = mọi tag
  status: '' | TodoStatus;
  hideDone: boolean;
};

export const EMPTY_FILTER: TodoFilter = {
  q: '', scope: 'mine', assignee: '', priority: '', tag: '', status: '', hideDone: false,
};

/** Tập tag duy nhất (đã sắp) xuất hiện trong danh sách việc. */
export function allTags(todos: Todo[]): string[] {
  const s = new Set<string>();
  for (const t of todos) for (const tag of t.tags ?? []) if (tag.trim()) s.add(tag.trim());
  return [...s].sort((a, b) => a.localeCompare(b, 'vi'));
}

/** Áp toàn bộ tiêu chí lọc. `meU` = username người đang đăng nhập (cho scope 'mine'). */
export function filterTodos(todos: Todo[], f: TodoFilter, meU: string): Todo[] {
  const q = f.q.trim().toLowerCase();
  return todos.filter((t) => {
    if (f.scope === 'mine' && !isMyTodo(t, meU)) return false;
    if (f.assignee && !t.assignees.includes(f.assignee)) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.hideDone && t.status === 'done') return false;
    if (f.tag && !(t.tags ?? []).includes(f.tag)) return false;
    if (q) {
      const hay = `${t.title} ${t.note ?? ''} ${(t.tags ?? []).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export type WorkloadRow = {
  u: string; name: string;
  open: number; doing: number; overdue: number; done: number;
};

export type TodoStats = {
  total: number; open: number; doing: number; overdue: number; done: number;
  doneRate: number;                       // % việc đã xong trên tổng (0..100)
  workload: WorkloadRow[];                // theo người được giao, sắp theo quá hạn↓ rồi mở↓
};

/**
 * Thống kê tổng quan + tải công việc theo người. `done` chỉ tính việc HOÀN THÀNH trong
 * `recentDays` gần đây (mặc định 30) để phản ánh năng suất gần đây, không phồng theo lịch sử.
 */
export function todoStats(
  todos: Todo[],
  users: { u: string; name: string }[],
  now = Date.now(),
  recentDays = 30,
): TodoStats {
  const recentMs = now - recentDays * 86400000;
  const isOverdue = (t: Todo) => t.status !== 'done' && !!t.dueDate && new Date(t.dueDate).getTime() < now;
  const recentDone = (t: Todo) => t.status === 'done' && (!t.completedAt || new Date(t.completedAt).getTime() >= recentMs);

  const open = todos.filter((t) => t.status !== 'done').length;
  const doing = todos.filter((t) => t.status === 'doing').length;
  const overdue = todos.filter(isOverdue).length;
  const done = todos.filter(recentDone).length;
  const total = todos.length;

  const nameOf = (u: string) => users.find((x) => x.u === u)?.name ?? u;
  const byUser = new Map<string, WorkloadRow>();
  const bump = (u: string, k: 'open' | 'doing' | 'overdue' | 'done') => {
    const row = byUser.get(u) ?? { u, name: nameOf(u), open: 0, doing: 0, overdue: 0, done: 0 };
    row[k] += 1;
    byUser.set(u, row);
  };
  for (const t of todos) {
    // Người chịu trách nhiệm: người được giao, hoặc người tạo nếu việc không giao ai.
    const owners = t.assignees.length ? t.assignees : [t.createdBy];
    for (const u of owners) {
      if (t.status !== 'done') bump(u, 'open');
      if (t.status === 'doing') bump(u, 'doing');
      if (isOverdue(t)) bump(u, 'overdue');
      if (recentDone(t)) bump(u, 'done');
    }
  }
  const workload = [...byUser.values()].sort((a, b) => b.overdue - a.overdue || b.open - a.open);

  return { total, open, doing, overdue, done, doneRate: total ? Math.round((done / total) * 100) : 0, workload };
}
