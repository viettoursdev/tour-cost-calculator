/**
 * Gộp & xếp hạng mọi cảnh báo của trang "Hôm nay" thành MỘT hàng đợi ưu tiên.
 * Thuần (chỉ thao tác mốc thời gian) để test; HomeView gắn thêm hành động mở.
 */

export type PriSeverity = 'overdue' | 'urgent' | 'soon';
export type PriKind = 'overdue' | 'deadline' | 'ncc' | 'doc' | 'owing';

export interface PriorityCore {
  /** Mốc tới hạn (ms). null = không rõ mốc (xếp cuối cùng). */
  dueTs: number | null;
  severity: PriSeverity;
}

const RANK: Record<PriSeverity, number> = { overdue: 0, urgent: 1, soon: 2 };

/** Phân loại mức khẩn theo mốc thời gian so với `now`. */
export function severityOf(dueTs: number | null, now: number): PriSeverity {
  if (dueTs == null) return 'soon';
  if (dueTs < now) return 'overdue';
  return dueTs <= now + 86400000 ? 'urgent' : 'soon';
}

/** Xếp: quá hạn → khẩn → sắp tới; cùng mức thì theo mốc tăng dần (null xếp cuối). */
export function rankPriority<T extends PriorityCore>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (RANK[a.severity] !== RANK[b.severity]) return RANK[a.severity] - RANK[b.severity];
    if (a.dueTs == null) return b.dueTs == null ? 0 : 1;
    if (b.dueTs == null) return -1;
    return a.dueTs - b.dueTs;
  });
}
