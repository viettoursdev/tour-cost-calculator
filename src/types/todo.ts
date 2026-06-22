import type { NotifLink } from './notification';

/** Trạng thái công việc (To-Do). */
export type TodoStatus = 'todo' | 'doing' | 'done';
/** Lặp lại định kỳ. */
export type TodoRecurring = 'none' | 'daily' | 'weekly' | 'monthly';

export type TodoChecklistItem = { id: string; text: string; done: boolean };

/** Phản hồi của người được giao việc (xác nhận / từ chối + comment). */
export type TodoResponse = {
  u: string;        // username người phản hồi
  name: string;
  accepted: boolean;
  comment?: string;
  at: string;       // ISO
};

/**
 * Một công việc (To-Do). Kho dùng chung `viettours/todos`. Tái dùng `NotifLink` để
 * liên kết tới báo giá/thanh toán/hợp đồng… và pipeline thông báo để nhắc (Đợt 2).
 */
export type Todo = {
  id: string;
  title: string;
  note?: string;
  status: TodoStatus;
  priority: 'normal' | 'high' | 'urgent';
  createdBy: string;        // username người tạo
  createdByName: string;
  createdAt: string;
  /** Người được giao (usernames). Rỗng = việc của riêng người tạo. */
  assignees: string[];
  dueDate?: string;         // hạn (ISO datetime)
  /** Mốc nhắc tuyệt đối (khung giờ) — ISO datetime[]. */
  remindAt?: string[];
  /** Nhắc TRƯỚC hạn N phút (vd 1440 = 1 ngày, 60 = 1 giờ). */
  remindLead?: number[];
  link?: NotifLink;
  checklist?: TodoChecklistItem[];
  recurring?: TodoRecurring;
  tags?: string[];
  /** Nguồn tự sinh (vd 'quote_won') — để khỏi sinh trùng & nhận diện việc do hệ thống tạo. */
  auto?: string;
  /** Phản hồi của những người được giao (xác nhận/từ chối + comment). */
  responses?: TodoResponse[];
  completedAt?: string;
  completedBy?: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type TodosDoc = { todos: Todo[] };
