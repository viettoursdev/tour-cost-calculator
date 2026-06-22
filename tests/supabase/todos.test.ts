import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbSubscribeTodos, sbPushTodos } from '../../src/lib/supabase';
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

  it('push then subscribe round-trips the list', async () => {
    const c = await getViettoursClient();
    await sbPushTodos([mk('1'), mk('2')], { name: 'Admin', role: 'CEO' }, c);
    const got = await once<Todo[]>((cb) => sbSubscribeTodos(cb, c));
    expect(got).toHaveLength(2);
    expect(got[0].title).toBe('Task 1');
  });

  it('subscribe on empty table yields []', async () => {
    const c = await getViettoursClient();
    const got = await once<Todo[]>((cb) => sbSubscribeTodos(cb, c));
    expect(got).toEqual([]);
  });
});
