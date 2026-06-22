import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbSubscribeTodos, sbUpsertTodos, sbUpsertTodo, sbDeleteTodo } from '../../src/lib/supabase';
import type { Todo } from '@/types';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

const mk = (id: string): Todo => ({
  id, title: 'Task ' + id, status: 'todo', priority: 'normal',
  createdBy: 'admin', createdByName: 'Admin', createdAt: '2026-01-01T00:00:00.000Z',
  assignees: [],
});

describe('todos gateway', () => {
  beforeEach(async () => { await truncate(['todos']); });

  it('upsert then subscribe round-trips the rows', async () => {
    const c = await getViettoursClient();
    await sbUpsertTodos([mk('1'), mk('2')], c);
    const got = await once<Todo[]>((cb) => sbSubscribeTodos(cb, c));
    expect(got).toHaveLength(2);
    expect(got.map((t) => t.title).sort()).toEqual(['Task 1', 'Task 2']);
  });

  it('upsert updates a single row without touching others', async () => {
    const c = await getViettoursClient();
    await sbUpsertTodos([mk('1'), mk('2')], c);
    await sbUpsertTodo({ ...mk('1'), status: 'done' }, c);
    const got = await once<Todo[]>((cb) => sbSubscribeTodos(cb, c));
    expect(got).toHaveLength(2);
    expect(got.find((t) => t.id === '1')?.status).toBe('done');
    expect(got.find((t) => t.id === '2')?.status).toBe('todo');
  });

  it('delete removes only the targeted row', async () => {
    const c = await getViettoursClient();
    await sbUpsertTodos([mk('1'), mk('2')], c);
    await sbDeleteTodo('1', c);
    const got = await once<Todo[]>((cb) => sbSubscribeTodos(cb, c));
    expect(got.map((t) => t.id)).toEqual(['2']);
  });

  it('subscribe on empty table yields []', async () => {
    const c = await getViettoursClient();
    const got = await once<Todo[]>((cb) => sbSubscribeTodos(cb, c));
    expect(got).toEqual([]);
  });
});
