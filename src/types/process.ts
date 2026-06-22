import type { Department } from './user';
import type { WorkflowStep } from './quote';

// ── Quy trình phòng ban (SOP) ───────────────────────────────────────────────
// Hai lớp:
//  • ProcessTemplate — định nghĩa chuẩn 1 nghiệp vụ của 1 phòng ban (1 lần, dùng
//    nhiều lần). Bản dựng sẵn trong code có `isSeed = true` (chỉ đọc cho tới khi
//    người dùng "Dùng mẫu" → clone vào DB).
//  • ProcessRun — phiên chạy 1 template cho 1 việc thật, theo dõi tiến độ.
//    Mỗi bước tái dùng nguyên `WorkflowStep` (status/assignee/dueDate/log…).

/** Đối tượng thật mà 1 phiên chạy quy trình gắn vào. */
export type ProcessRefKind = 'quote' | 'customer' | 'visa';
export type ProcessRef = {
  kind: ProcessRefKind;
  id: string;     // cloudId báo giá / id khách / id hồ sơ visa
  label: string;  // nhãn hiển thị trên chip
};

/** Trạng thái 1 phiên chạy quy trình. */
export type ProcessRunStatus = 'active' | 'done' | 'archived';

/** Một quy trình chuẩn (template) của 1 phòng ban. */
export type ProcessTemplate = {
  id: string;
  department: Department;
  name: string;
  description?: string;
  icon?: string;            // emoji nhỏ minh hoạ
  color?: string;           // màu nhấn (hex)
  steps: WorkflowStep[];
  version: number;
  isPublished: boolean;
  /** true = bản mẫu dựng sẵn trong code (chỉ đọc), CHƯA lưu DB. */
  isSeed?: boolean;
  createdByUsername?: string;
  createdByName?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
};

/** Một phiên chạy quy trình cho 1 việc cụ thể. */
export type ProcessRun = {
  id: string;
  templateId?: string;      // template gốc (nếu tạo từ thư viện)
  department: Department;
  title: string;            // VD "Visa Schengen — KH Nguyễn Văn A"
  ref?: ProcessRef;         // gắn báo giá / khách / hồ sơ visa
  steps: WorkflowStep[];    // snapshot các bước + trạng thái riêng của phiên
  status: ProcessRunStatus;
  assignee?: string;        // username phụ trách chính
  startDate?: string;       // ISO yyyy-mm-dd
  dueDate?: string;
  createdByUsername?: string;
  createdByName?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
};
