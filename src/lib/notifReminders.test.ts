import { describe, it, expect, vi, beforeEach } from 'vitest';

const toasts: string[] = [];
vi.mock('@/stores/toastStore', () => ({ toast: (m: string) => { toasts.push(m); } }));

import { checkNotifReminders } from './notifReminders';
import type { Notification } from '@/types';

const mk = (over: Partial<Notification>): Notification => ({
  id: 'n1', type: 'task', title: 'Nộp hồ sơ', message: '', createdBy: 'me', createdAt: new Date().toISOString(), read: false, ...over,
});

describe('checkNotifReminders', () => {
  beforeEach(() => { localStorage.clear(); toasts.length = 0; });

  it('nhắc khi đã quá 1 chu kỳ kể từ khi tạo, rồi dedup trong chu kỳ', () => {
    const created = new Date(Date.now() - 5 * 3600e3).toISOString(); // 5h trước
    const n = mk({ createdAt: created, reminder: { every: '4h' } });
    checkNotifReminders([n], 'ceo');
    expect(toasts).toHaveLength(1);          // 5h ≥ 4h → nhắc
    checkNotifReminders([n], 'ceo');
    expect(toasts).toHaveLength(1);          // chưa đủ 4h nữa → không nhắc lại
  });

  it('không nhắc tin mới (chưa đủ chu kỳ)', () => {
    checkNotifReminders([mk({ reminder: { every: '4h' } })], 'ceo');
    expect(toasts).toHaveLength(0);
  });

  it('ngừng nhắc sau hạn chót', () => {
    const n = mk({ createdAt: new Date(Date.now() - 10 * 3600e3).toISOString(), reminder: { every: '4h', deadline: '2000-01-01' } });
    checkNotifReminders([n], 'ceo');
    expect(toasts).toHaveLength(0);          // hạn chót đã qua
  });

  it('bỏ qua tin không có reminder', () => {
    checkNotifReminders([mk({ createdAt: new Date(Date.now() - 99 * 3600e3).toISOString() })], 'ceo');
    expect(toasts).toHaveLength(0);
  });
});
