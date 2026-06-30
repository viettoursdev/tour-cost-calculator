import type { PriKind, PriSeverity } from './homePriority';
import type { LeaveType } from '@/types';

/** Hằng số & hàm thuần của trang "Hôm nay" (tách khỏi homeWidgets cho hợp react-refresh). */

/** Nhãn từng thẻ trang chủ (hiển thị trong hộp thoại tùy chỉnh). */
export const SECTION_LABELS: Record<string, string> = {
  digest: '🌅 Bản tin sáng',
  kpi: '📊 Chỉ số nhanh',
  targets: '🎯 Mục tiêu tháng',
  priority: '🔥 Ưu tiên hôm nay',
  week: '🗓️ Lịch tuần',
  recent: '🕘 Vừa xem gần đây',
  notifs: '🔔 Thông báo',
  todo: '📋 Việc cần làm',
  process: '🗂️ Quy trình phòng ban',
  myRuns: '▶️ Quy trình đang chạy của tôi',
  deadlines: '⏳ Deadline công việc (2 tuần)',
  soon: '🛫 Tour sắp khởi hành (7 ngày)',
  myOverdue: '⏱ Việc quá hạn của tôi',
  nccDue: '🏦 Đến hạn trả NCC (2 tuần)',
  owing: '💰 Đã khởi hành còn nợ NCC',
  docs: '🛂 Giấy tờ khách sắp hết hạn',
  leaves: '🌴 Nghỉ phép chờ duyệt',
  myAttendance: '📋 Bảng công của tôi',
  followups: '📅 Hẹn liên hệ khách hôm nay',
};

/** Thẻ chiếm trọn chiều ngang (phần còn lại xếp lưới 2 cột). */
export const FULL_SPAN = new Set(['digest', 'kpi', 'targets', 'priority', 'week', 'todo', 'process', 'myRuns', 'deadlines']);

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  annual: 'Nghỉ phép năm', unpaid: 'Nghỉ không lương', sick: 'Nghỉ ốm', other: 'Nghỉ khác',
};

export const PRI_ICON: Record<PriKind, string> = { overdue: '⏱', deadline: '⏳', ncc: '🏦', doc: '🛂', owing: '💰' };
export const PRI_COLOR: Record<PriSeverity, string> = { overdue: '#dc3250', urgent: '#f5a623', soon: '#2563eb' };

/** Đếm ngược tới mốc `target` (ms). Trả về nhãn "còn 2 ngày 5 giờ" / "QUÁ HẠN …". */
export function countdown(target: number, now: number): { text: string; overdue: boolean; urgent: boolean } {
  const diff = target - now;
  const overdue = diff < 0;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const mins = Math.floor((abs % 3600000) / 60000);
  const core = days > 0 ? `${days} ngày ${hours} giờ` : hours > 0 ? `${hours} giờ ${mins} phút` : `${mins} phút`;
  return { text: overdue ? `QUÁ HẠN ${core}` : `còn ${core}`, overdue, urgent: !overdue && diff <= 86400000 };
}
