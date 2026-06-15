import type { WorkflowStatus, WorkflowStep } from '@/types';

/** 13 bước quy trình vận hành mặc định (chỉnh được sau). */
export const WORKFLOW_DEFAULT_STEPS: string[] = [
  'Tiếp nhận yêu cầu',
  'Triển khai báo giá',
  'Xác nhận dịch vụ',
  'Triển khai visa, hồ sơ',
  'Ký kết hợp đồng',
  'Nhận đặt cọc & thanh toán NCC',
  'Xác nhận dịch vụ cuối cùng',
  'Truyền thông trước chuyến đi',
  'Nhận đặt cọc & thanh toán trước chuyến đi',
  'Khởi hành',
  'Nghiệm thu với KH & NCC',
  'Nhận thanh toán còn lại',
  'Kết tour, lưu trữ dữ liệu',
];

export const WORKFLOW_STATUS_META: Record<WorkflowStatus, { label: string; color: string }> = {
  todo:    { label: 'Chưa làm',  color: '#64748b' },
  doing:   { label: 'Đang làm',  color: '#2563eb' },
  done:    { label: 'Hoàn tất',  color: '#27ae60' },
  blocked: { label: 'Tạm hoãn',  color: '#dc3250' },
};

export const WORKFLOW_STATUS_ORDER: WorkflowStatus[] = ['todo', 'doing', 'done', 'blocked'];

let seq = 0;
export const newWorkflowStep = (label = 'Bước mới', status: WorkflowStatus = 'todo'): WorkflowStep => ({
  id: 'ws' + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 4),
  label,
  status,
});

/** Quy trình mặc định: 13 bước, đều "Chưa làm". */
export const defaultWorkflow = (): WorkflowStep[] => WORKFLOW_DEFAULT_STEPS.map((l) => newWorkflowStep(l));

/** Tiến độ: số bước hoàn tất / tổng + phần trăm. */
export function workflowProgress(steps: WorkflowStep[]): { done: number; total: number; pct: number } {
  const total = steps.length;
  const done = steps.filter((s) => s.status === 'done').length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** Đổi trạng thái một bước (set/clear doneDate). Thuần — dùng cho kéo-thả Kanban. */
export function setStepStatus(steps: WorkflowStep[], id: string, status: WorkflowStatus): WorkflowStep[] {
  const today = new Date().toISOString().slice(0, 10);
  return steps.map((s) => (s.id === id
    ? { ...s, status, doneDate: status === 'done' ? (s.doneDate ?? today) : null }
    : s));
}
