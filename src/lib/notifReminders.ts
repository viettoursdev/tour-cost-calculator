import { toast } from '@/stores/toastStore';
import type { Notification } from '@/types';

const INTERVAL_MS: Record<'4h' | '8h' | '12h' | 'daily', number> = {
  '4h': 4 * 3600e3, '8h': 8 * 3600e3, '12h': 12 * 3600e3, daily: 24 * 3600e3,
};

/** Nhãn cho ô chọn "Nhắc lại" trong composer. */
export const REMINDER_OPTIONS: { value: 'off' | '4h' | '8h' | '12h' | 'daily'; label: string }[] = [
  { value: 'off', label: 'Không nhắc lại' },
  { value: '4h', label: 'Mỗi 4 giờ' },
  { value: '8h', label: 'Mỗi 8 giờ' },
  { value: '12h', label: 'Mỗi 12 giờ' },
  { value: 'daily', label: 'Mỗi ngày' },
];

/**
 * Re-surface (toast) các thông báo có cấu hình nhắc lại khi tới chu kỳ, cho tới
 * hạn chót (hoặc tối đa 3 ngày nếu không đặt hạn). Dedup theo localStorage
 * `vte_notif_remind_{username}` — chỉ chạy khi app đang mở (không cần backend).
 */
export function checkNotifReminders(notifs: Notification[], username: string): void {
  const KEY = `vte_notif_remind_${username}`;
  let state: Record<string, string> = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { state = {}; }
  const now = Date.now();
  let changed = false;

  for (const n of notifs) {
    const r = n.reminder;
    if (!r) continue;
    const created = new Date(n.createdAt).getTime();
    const cap = r.deadline ? new Date(r.deadline + 'T23:59:59').getTime() : created + 3 * 86400e3;
    if (now > cap) continue;
    const last = state[n.id] ? new Date(state[n.id]).getTime() : created;
    if (now - last >= (INTERVAL_MS[r.every] ?? INTERVAL_MS.daily)) {
      toast(`⏰ Nhắc: ${n.title}`, n.priority === 'urgent' ? 'warning' : 'info');
      state[n.id] = new Date(now).toISOString();
      changed = true;
    }
  }
  if (changed) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota */ } }
}
