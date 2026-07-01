/**
 * Link công khai để KHÁCH xem TIẾN ĐỘ vận hành tour (Quy trình điều hành) — không
 * cần đăng nhập. Bản "đã xuất bản" ở `public_workflow_links/{token}` CHỈ chứa mốc +
 * trạng thái + % + ngày, KHÔNG kéo trường nội bộ (người phụ trách/ghi chú/rủi ro/
 * nhật ký). Link chỉ hoạt động sau khi người có quyền DUYỆT.
 */
import type { WorkflowStatus } from './quote';

export type PublicWorkflowStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

/** Một mốc hướng khách (đã lọc — không kèm trường nội bộ). */
export interface PublicWorkflowStep {
  label: string;
  labelEn?: string;
  status: WorkflowStatus;
  dueDate?: string;
  doneDate?: string;
}

/** Bản HƯỚNG KHÁCH: tên tour + tiến độ + các mốc. */
export interface PublicWorkflowDoc {
  token: string;
  quoteId: string;
  tourName: string;
  dest?: string;
  departDate?: string;
  progress: { done: number; total: number; pct: number };
  steps: PublicWorkflowStep[];
  note?: string;
  publishedBy: string;
  publishedAt: string;
}

/** Bản ghi đầy đủ phía công ty (kèm trạng thái duyệt). */
export interface PublicWorkflowRecord {
  token: string;
  quoteId: string;
  payload: PublicWorkflowDoc;
  note?: string;
  status: PublicWorkflowStatus;
  requestedByUsername?: string;
  requestedByName?: string;
  requestedAt?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectReason?: string;
}
