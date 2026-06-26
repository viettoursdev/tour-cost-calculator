import type { FileAttachment } from './quote';

export type NotificationType =
  | 'payment_due'
  | 'payment_approval'
  | 'delete_approval'
  | 'collab_invite'
  | 'announcement'
  | 'task'
  | 'collab_comment';

/** A link from a notification to a domain object (deep-link target). */
export type NotifLink = {
  kind: 'quote' | 'dmc' | 'contract' | 'payment' | 'itinerary' | 'menu' | 'collab' | 'tourProfile';
  id: string;       // cloudId / contract id / itinerary id … (for 'payment' use the quote cloudId)
  label: string;    // human label shown on the chip
};

/** Live status of a shared activity (request/approval). */
export type ActivityStatus =
  | 'pending'         // chờ duyệt (bước 1)
  | 'pending_stage2'  // đã duyệt bước 1, chờ bước 2
  | 'approved'        // đã duyệt
  | 'rejected'        // từ chối
  | 'paid'            // đã thanh toán
  | 'info';           // thông báo/thảo luận thường (không có quy trình duyệt)

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdBy: string;
  createdAt: string;
  read: boolean;
  link?: NotifLink;
  threadId?: string;   // shared comment thread (collaboration group)
  /** Mức ưu tiên — 'high'/'urgent' hiển thị nổi bật ở chuông & Center. */
  priority?: 'normal' | 'high' | 'urgent';
  /** File đính kèm (R2) — xem trước qua khung dùng chung. */
  attachments?: FileAttachment[];
  /** Nhắc lại lặp lại tới hạn chót (re-surface qua toast khi app mở). */
  reminder?: { every: '4h' | '8h' | '12h' | 'daily'; deadline?: string };
  data?: Record<string, unknown>;
};

/** Nhãn + màu cho mức ưu tiên (dùng chung cho composer & hiển thị). */
export const NOTIF_PRIORITY: Record<'high' | 'urgent', { label: string; color: string }> = {
  urgent: { label: 'KHẨN', color: '#dc3250' },
  high: { label: 'Quan trọng', color: '#d18a13' },
};

/** A single comment in a shared notification thread. */
export type NotifComment = {
  id: string;
  by: string;       // username
  byName: string;
  text: string;
  at: string;       // ISO
};

/**
 * A shared comment thread, visible only to its members (the collaboration
 * group of a project). Stored in `notification_threads/{id}`.
 */
export type NotifThread = {
  id: string;
  title: string;
  members: string[];   // usernames allowed to view/comment
  link?: NotifLink;
  comments: NotifComment[];
  createdAt: string;
  createdBy: string;
  /** Loại hoạt động (đồng bộ với notification type) — vd 'payment_approval'. */
  actType?: NotificationType;
  /** Trạng thái sống của yêu cầu (chờ/đã duyệt/từ chối/đã chi). Cả các bên cùng thấy. */
  status?: ActivityStatus;
  /** Thời điểm cập nhật trạng thái gần nhất. */
  updatedAt?: string;
  /** Người cập nhật trạng thái gần nhất (tên hiển thị). */
  updatedByName?: string;
  /** Dữ liệu nghiệp vụ kèm theo (approvalKey, amount, approver…). */
  data?: Record<string, unknown>;
};
