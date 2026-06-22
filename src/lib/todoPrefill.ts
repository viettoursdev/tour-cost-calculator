import type { Notification, Todo } from '@/types';

/** Bỏ emoji/biểu tượng ở ĐẦU chuỗi (vd "📋 Bạn được giao việc" → "Bạn được giao việc"). */
const stripLeadIcon = (s: string): string =>
  s.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim() || s.trim();

/** Mức ưu tiên thông báo → ưu tiên việc (To-Do). */
const priorityOf = (n: Notification): Todo['priority'] =>
  n.priority === 'urgent' ? 'urgent' : n.priority === 'high' ? 'high' : 'normal';

/**
 * Dựng giá trị điền sẵn cho một việc (To-Do) MỚI từ một thông báo.
 * Giữ nguyên `link` (báo giá/thanh toán/hợp đồng…) để mở 1 chạm từ việc.
 */
export function todoFromNotification(n: Notification): Partial<Todo> {
  return {
    title: stripLeadIcon(n.title),
    note: n.message?.trim() || undefined,
    priority: priorityOf(n),
    ...(n.link ? { link: n.link } : {}),
  };
}
