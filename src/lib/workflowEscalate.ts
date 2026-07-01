// Logic thuần cho escalation đa cấp + nhắc lặp của bước quy trình quá hạn.
// Dùng bởi checkWorkflowDeadlines (notifications.ts) — tách ra để test được.

/** Cấp leo thang theo số ngày QUÁ HẠN: 0 = chưa, 1 = quản lý (Trưởng Phòng+),
 *  2 = Ban Giám Đốc. `l1`/`l2` là ngưỡng ngày (l2 > l1). */
export function escalationLevel(daysOverdue: number, l1: number, l2: number): 0 | 1 | 2 {
  if (daysOverdue >= l2) return 2;
  if (daysOverdue >= l1) return 1;
  return 0;
}

/** "Ngăn" nhắc lặp: đổi giá trị mỗi `everyDays` ngày quá hạn → khoá dedup đổi theo
 *  → nhắc LẠI định kỳ thay vì chỉ 1 lần. everyDays ≥ 1. */
export function nudgeBucket(daysOverdue: number, everyDays: number): number {
  return Math.max(0, Math.floor(Math.max(0, daysOverdue) / Math.max(1, everyDays)));
}
