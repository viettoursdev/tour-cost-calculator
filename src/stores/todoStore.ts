import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { sbSubscribeTodos, sbUpsertTodo, sbUpsertTodos, sbDeleteTodo, sbSendNotification } from '@/lib/supabase';
import { useAuthStore } from './authStore';
import { QUOTE_WON_TASKS, quoteTaskDue } from '@/lib/todoTemplates';
import type { Todo, TodoRecurring, TodoStatus } from '@/types';
import type { Unsubscribe } from '@/lib/supabase/helpers';

/** Nguồn tự sinh cho việc tạo khi báo giá chốt (dùng để dedup). */
export const AUTO_QUOTE_WON = 'quote_won';

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
  /** Người được giao phản hồi việc (xác nhận/từ chối + comment) → báo người tạo. */
  respond: (id: string, accepted: boolean, comment?: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Tự sinh bộ việc vận hành chuẩn khi báo giá CHỐT. Idempotent (không sinh trùng). */
  spawnQuoteTasks: (q: { quoteId: string; quoteName: string; departDate?: string }) => Promise<number>;
};

export const useTodoStore = create<State>()(
  subscribeWithSelector((set, get) => ({
    todos: [],
    loading: true,

    init: () => sbSubscribeTodos((todos) => set({ todos, loading: false })),

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
      const prev = get().todos;
      set({ todos: [todo, ...prev] });
      const ok = await save(() => sbUpsertTodo(todo), prev);
      if (!ok) return null;
      notifyAssign(todo, todo.assignees.filter((a) => a !== u.u), u.u, u.name);
      return todo;
    },

    update: async (id, patch) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const prev = get().todos;
      const old = prev.find((x) => x.id === id);
      if (!old) return;
      const next = { ...old, ...patch, updatedAt: new Date().toISOString(), updatedBy: u.name } as Todo;
      set({ todos: prev.map((x) => (x.id === id ? next : x)) });
      const ok = await save(() => sbUpsertTodo(next), prev);
      // Người MỚI được giao → gửi thông báo "được giao việc".
      if (ok && patch.assignees) {
        const had = new Set(old.assignees);
        const added = patch.assignees.filter((a) => !had.has(a) && a !== u.u);
        if (added.length) notifyAssign(next, added, u.u, u.name);
      }
    },

    setStatus: async (id, status) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const now = new Date().toISOString();
      const prev = get().todos;
      const cur = prev.find((x) => x.id === id);
      if (!cur) return;
      const updated: Todo = { ...cur, status, completedAt: status === 'done' ? now : undefined, completedBy: status === 'done' ? u.name : undefined, updatedAt: now, updatedBy: u.name };
      // Việc LẶP LẠI khi hoàn thành → sinh việc kế tiếp (dời hạn + mốc nhắc).
      let spawn: Todo | null = null;
      if (status === 'done' && cur.recurring && cur.recurring !== 'none') {
        spawn = {
          ...cur, id: newId(), status: 'todo', createdAt: now, completedAt: undefined, completedBy: undefined, updatedAt: undefined, updatedBy: undefined,
          dueDate: cur.dueDate ? shiftRecurring(cur.dueDate, cur.recurring) : undefined,
          remindAt: cur.remindAt?.map((r) => shiftRecurring(r, cur.recurring!)),
          checklist: cur.checklist?.map((c) => ({ ...c, done: false })),
        };
      }
      set({ todos: [...(spawn ? [spawn] : []), ...prev.map((x) => (x.id === id ? updated : x))] });
      await save(() => (spawn ? sbUpsertTodos([updated, spawn]) : sbUpsertTodo(updated)), prev);
    },

    respond: async (id, accepted, comment) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const prev = get().todos;
      const t = prev.find((x) => x.id === id);
      if (!t) return;
      const resp = { u: u.u, name: u.name, accepted, comment: comment?.trim() || undefined, at: new Date().toISOString() };
      const responses = [...(t.responses ?? []).filter((r) => r.u !== u.u), resp];
      const next = { ...t, responses };
      set({ todos: prev.map((x) => (x.id === id ? next : x)) });
      const ok = await save(() => sbUpsertTodo(next), prev);
      // Báo người tạo việc.
      if (ok && t.createdBy && t.createdBy !== u.u) {
        void sbSendNotification(t.createdBy, {
          type: 'task',
          title: accepted ? '✅ Đã xác nhận việc' : '❌ Đã từ chối việc',
          message: `${u.name} ${accepted ? 'xác nhận' : 'từ chối'}: "${t.title}"${resp.comment ? ` — “${resp.comment}”` : ''}`,
          createdBy: u.name,
          ...(t.link ? { link: t.link } : {}),
        }).catch(() => { /* không chặn UI */ });
      }
    },

    remove: async (id) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return;
      const prev = get().todos;
      set({ todos: prev.filter((x) => x.id !== id) });
      await save(() => sbDeleteTodo(id), prev);
    },

    spawnQuoteTasks: async ({ quoteId, quoteName, departDate }) => {
      const u = useAuthStore.getState().currentUser;
      if (!u) return 0;
      const prev = get().todos;
      // Dedup: đã sinh bộ việc cho báo giá này rồi → bỏ qua.
      if (prev.some((t) => t.auto === AUTO_QUOTE_WON && t.link?.id === quoteId)) return 0;
      const now = new Date().toISOString();
      const link = { kind: 'quote' as const, id: quoteId, label: quoteName };
      const spawned: Todo[] = QUOTE_WON_TASKS.map((tpl) => ({
        id: newId(),
        title: tpl.title,
        status: 'todo',
        priority: tpl.priority,
        createdBy: u.u, createdByName: u.name, createdAt: now,
        assignees: [],
        dueDate: quoteTaskDue(tpl, departDate),
        remindLead: [1440],
        link, tags: ['tour'], recurring: 'none', auto: AUTO_QUOTE_WON,
      }));
      set({ todos: [...spawned, ...prev] });
      await save(() => sbUpsertTodos(spawned), prev);
      return spawned.length;
    },
  })),
);

/** Gửi thông báo "Bạn được giao việc" (kèm nút xác nhận/từ chối) tới assignee. */
function notifyAssign(todo: Todo, recipients: string[], byU: string, byName: string): void {
  for (const r of recipients) {
    void sbSendNotification(r, {
      type: 'task',
      title: '📋 Bạn được giao việc',
      message: `${todo.title}${todo.dueDate ? ` · hạn ${new Date(todo.dueDate).toLocaleString('vi-VN')}` : ''}`,
      createdBy: byName,
      ...(todo.link ? { link: todo.link } : {}),
      data: { todoAssign: true, todoId: todo.id, byU, byName },
    }).catch(() => { /* không chặn UI */ });
  }
}

/**
 * Chạy thao tác ghi Supabase; nếu lỗi thì KHÔI PHỤC state về `prev` (rollback lạc quan)
 * và báo lỗi. Trả về true nếu thành công.
 */
async function save(op: () => Promise<void>, prev: Todo[]): Promise<boolean> {
  try { await op(); return true; }
  catch (e) {
    useTodoStore.setState({ todos: prev });
    window.alert('❌ Lỗi đồng bộ công việc: ' + (e as Error).message);
    return false;
  }
}

/** Việc liên quan tới user (người tạo hoặc được giao). */
export const isMyTodo = (t: Todo, username: string) => t.createdBy === username || t.assignees.includes(username);
