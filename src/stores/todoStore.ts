import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { fbSubscribeTodos, fbPushTodos, fbSendNotification } from '@/lib/dataBackend';
import { useAuthStore } from './authStore';
import type { Todo, TodoRecurring, TodoStatus } from '@/types';
import type { Unsubscribe } from 'firebase/firestore';

const newId = () => 'td' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Dời mốc thời gian theo chu kỳ lặp (cho việc recurring). */
export function shiftRecurring(iso: string, every: TodoRecurring): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  if (every === 'daily') d.setDate(d.getDate() + 1);
  else if (every === 'weekly') d.setDate(d.getDate() + 7);
  else if (every === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

type State = {
  todos: Todo[];
  loading: boolean;
  init: () => Unsubscribe;
  add: (t: Partial<Todo> & { title: string }) => Promise<Todo | null>;
  update: (id: string, patch: Partial<Todo>) => Promise<void>;
  setStatus: (id: string, status: TodoStatus) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export const useTodoStore = create<State>()(
  subscribeWithSelector((set, get) => ({
    todos: [],
    loading: true,

    init: () => fbSubscribeTodos((todos) => set({ todos, loading: false })),

    add: async (t) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return null;
      const now = new Date().toISOString();
      const todo: Todo = {
        id: newId(),
        title: t.title.trim(),
        note: t.note,
        status: t.status ?? 'todo',
        priority: t.priority ?? 'normal',
        createdBy: u.u, createdByName: u.name, createdAt: now,
        assignees: t.assignees ?? [],
        dueDate: t.dueDate, remindAt: t.remindAt, remindLead: t.remindLead,
        link: t.link, checklist: t.checklist, recurring: t.recurring ?? 'none', tags: t.tags,
      };
      await persist([todo, ...get().todos], u);
      notifyAssign(todo, todo.assignees.filter((a) => a !== u.u), u.name);
      return todo;
    },

    update: async (id, patch) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const old = get().todos.find((x) => x.id === id);
      const next = get().todos.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString(), updatedBy: u.name } : x));
      await persist(next, u);
      // Người MỚI được giao → gửi thông báo "được giao việc".
      if (patch.assignees && old) {
        const had = new Set(old.assignees);
        const added = patch.assignees.filter((a) => !had.has(a) && a !== u.u);
        if (added.length) notifyAssign({ ...old, ...patch } as Todo, added, u.name);
      }
    },

    setStatus: async (id, status) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const now = new Date().toISOString();
      const cur = get().todos.find((x) => x.id === id);
      let next = get().todos.map((x) => (x.id === id
        ? { ...x, status, completedAt: status === 'done' ? now : undefined, completedBy: status === 'done' ? u.name : undefined, updatedAt: now, updatedBy: u.name }
        : x));
      // Việc LẶP LẠI khi hoàn thành → sinh việc kế tiếp (dời hạn + mốc nhắc).
      if (status === 'done' && cur && cur.recurring && cur.recurring !== 'none') {
        const spawn: Todo = {
          ...cur, id: newId(), status: 'todo', createdAt: now, completedAt: undefined, completedBy: undefined, updatedAt: undefined, updatedBy: undefined,
          dueDate: cur.dueDate ? shiftRecurring(cur.dueDate, cur.recurring) : undefined,
          remindAt: cur.remindAt?.map((r) => shiftRecurring(r, cur.recurring!)),
          checklist: cur.checklist?.map((c) => ({ ...c, done: false })),
        };
        next = [spawn, ...next];
      }
      await persist(next, u);
    },

    remove: async (id) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      await persist(get().todos.filter((x) => x.id !== id), u);
    },
  })),
);

/** Gửi thông báo "Bạn được giao việc" tới các assignee. */
function notifyAssign(todo: Todo, recipients: string[], byName: string): void {
  for (const r of recipients) {
    void fbSendNotification(r, {
      type: 'task',
      title: '📋 Bạn được giao việc',
      message: `${todo.title}${todo.dueDate ? ` · hạn ${new Date(todo.dueDate).toLocaleString('vi-VN')}` : ''}`,
      createdBy: byName,
      ...(todo.link ? { link: todo.link } : {}),
    }).catch(() => { /* không chặn UI */ });
  }
}

async function persist(next: Todo[], u: { name: string; role: string }): Promise<void> {
  useTodoStore.setState({ todos: next });
  try { await fbPushTodos(next, { name: u.name, role: u.role }); }
  catch (e) { window.alert('❌ Lỗi đồng bộ công việc: ' + (e as Error).message); }
}

/** Việc liên quan tới user (người tạo hoặc được giao). */
export const isMyTodo = (t: Todo, username: string) => t.createdBy === username || t.assignees.includes(username);
