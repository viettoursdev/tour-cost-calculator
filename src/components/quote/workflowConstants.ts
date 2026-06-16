import type { Role, WorkflowStatus, WorkflowStep } from '@/types';

/** 13 bước quy trình vận hành mặc định (chỉnh được sau). */
export const WORKFLOW_DEFAULT_STEPS: string[] = [
  'Tiếp nhận yêu cầu',
  'Triển khai báo giá',
  'Xác nhận dịch vụ',
  'Triển khai visa, hồ sơ',
  'Ký kết hợp đồng',
  'Nhận đặt cọc và thanh toán NCC',
  'Xác nhận dịch vụ cuối cùng',
  'Truyền thông trước chuyến đi',
  'Nhận đặt cọc và thanh toán trước chuyến đi',
  'Khởi hành',
  'Nghiệm thu với KH và NCC',
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

/** Khoá ổn định cho 13 bước mặc định (cùng thứ tự WORKFLOW_DEFAULT_STEPS). */
export const WORKFLOW_STEP_KEYS = [
  'receive', 'quote', 'confirm_service', 'visa', 'contract', 'deposit_ncc',
  'final_service', 'comms', 'deposit_pretrip', 'departure', 'acceptance',
  'final_payment', 'close',
] as const;
export type WorkflowStepKey = (typeof WORKFLOW_STEP_KEYS)[number];

/** Hạn mặc định = N ngày TRƯỚC khởi hành (âm = sau khởi hành). */
export const WORKFLOW_OFFSETS: Record<WorkflowStepKey, number> = {
  receive: 45, quote: 35, confirm_service: 28, visa: 35, contract: 21, deposit_ncc: 18,
  final_service: 10, comms: 7, deposit_pretrip: 5, departure: 0, acceptance: -1,
  final_payment: -7, close: -10,
};

/** Phòng/bộ phận phụ trách mặc định mỗi bước — để gợi ý gán người phụ trách. */
export const WORKFLOW_STEP_ROLE: Record<WorkflowStepKey, Role> = {
  receive: 'Sales', quote: 'Sales', confirm_service: 'Operations', visa: 'Operations',
  contract: 'Sales', deposit_ncc: 'Accountant', final_service: 'Operations', comms: 'Marketing',
  deposit_pretrip: 'Accountant', departure: 'Operations', acceptance: 'Operations',
  final_payment: 'Accountant', close: 'Operations',
};

/** Phòng phụ trách gợi ý của 1 bước (theo khoá ổn định). */
export const roleOfStep = (s: WorkflowStep): Role | undefined => {
  const k = keyOf(s);
  return k ? WORKFLOW_STEP_ROLE[k] : undefined;
};

const LABEL_TO_KEY = new Map<string, WorkflowStepKey>(WORKFLOW_DEFAULT_STEPS.map((l, i) => [l, WORKFLOW_STEP_KEYS[i]]));
// Nhãn CŨ (dùng "&") — để workflow đã lưu trước đây vẫn suy đúng khoá khi thiếu key.
LABEL_TO_KEY.set('Nhận đặt cọc & thanh toán NCC', 'deposit_ncc');
LABEL_TO_KEY.set('Nhận đặt cọc & thanh toán trước chuyến đi', 'deposit_pretrip');
LABEL_TO_KEY.set('Nghiệm thu với KH & NCC', 'acceptance');
/** Suy khoá từ nhãn mặc định (cho workflow cũ chưa có key). */
export const keyByLabel = (label: string): WorkflowStepKey | undefined => LABEL_TO_KEY.get(label);
/** Khoá hiệu lực của bước: key đã lưu, hoặc suy từ nhãn. */
export const keyOf = (s: WorkflowStep): WorkflowStepKey | undefined => (s.key as WorkflowStepKey | undefined) ?? keyByLabel(s.label);

/** Quy trình mặc định: 13 bước (todo), kèm khoá + hạn mặc định. */
export const defaultWorkflow = (): WorkflowStep[] => WORKFLOW_DEFAULT_STEPS.map((l, i) => {
  const key = WORKFLOW_STEP_KEYS[i];
  return { ...newWorkflowStep(l), key, dueOffset: WORKFLOW_OFFSETS[key] };
});

// ── Tự đồng bộ trạng thái từ dữ liệu thật ──
export interface WorkflowSignalCtx {
  quoteStatus?: string;
  hasContract?: boolean;
  hasVisa?: boolean;
  visaCompleted?: boolean;
  paymentPaid?: number;
  paymentRemaining?: number;
  paymentCost?: number;
  departureDate?: string | null;
  todayISO?: string;
}

/** Tín hiệu trạng thái gợi ý theo khoá bước (chỉ 'doing'/'done'). */
export function workflowSignals(ctx: WorkflowSignalCtx): Partial<Record<WorkflowStepKey, WorkflowStatus>> {
  const out: Partial<Record<WorkflowStepKey, WorkflowStatus>> = {};
  const st = ctx.quoteStatus;
  if (st === 'sent' || st === 'negotiating' || st === 'won') out.quote = 'done';
  else if (st === 'in_progress') out.quote = 'doing';
  if (ctx.hasContract) out.contract = 'done';
  if (ctx.hasVisa) out.visa = ctx.visaCompleted ? 'done' : 'doing';
  if ((ctx.paymentPaid ?? 0) > 0) { out.deposit_ncc = 'doing'; out.deposit_pretrip = 'doing'; }
  if ((ctx.paymentCost ?? 0) > 0 && (ctx.paymentRemaining ?? 1) <= 0) out.final_payment = 'done';
  const today = ctx.todayISO ?? new Date().toISOString().slice(0, 10);
  if (ctx.departureDate && today >= ctx.departureDate) out.departure = 'done';
  return out;
}

const RANK: Record<WorkflowStatus, number> = { todo: 0, doing: 1, done: 2, blocked: -1 };
/** Gợi ý cho 1 bước nếu tín hiệu CAO HƠN trạng thái hiện tại (và không bị Tạm hoãn). */
export function suggestionFor(step: WorkflowStep, signals: Partial<Record<WorkflowStepKey, WorkflowStatus>>): WorkflowStatus | null {
  const k = keyOf(step);
  const sig = k ? signals[k] : undefined;
  if (!sig || step.status === 'blocked') return null;
  return RANK[sig] > RANK[step.status] ? sig : null;
}

/** Áp tín hiệu (advance-only): chỉ nâng cấp, không hạ cấp, bỏ qua 'blocked'. */
export function applySignals(steps: WorkflowStep[], signals: Partial<Record<WorkflowStepKey, WorkflowStatus>>): WorkflowStep[] {
  let next = steps;
  for (const s of steps) {
    const sig = suggestionFor(s, signals);
    if (sig) next = setStepStatus(next, s.id, sig);
  }
  return next;
}

/** Tóm tắt bước CÓ HẠN & CHƯA hoàn tất — để index vào lịch sử báo giá cho nhắc việc. */
export function workflowDueSummary(steps: WorkflowStep[]): { label: string; dueDate: string; assignee?: string }[] {
  return steps
    .filter((s) => s.dueDate && s.status !== 'done')
    .map((s) => ({ label: s.label, dueDate: s.dueDate as string, ...(s.assignee ? { assignee: s.assignee } : {}) }));
}

/** Tự điền Hạn cho bước có dueOffset & dueDate đang TRỐNG (= khởi hành − dueOffset ngày). */
export function fillDueDates(steps: WorkflowStep[], departureISO?: string | null): WorkflowStep[] {
  if (!departureISO) return steps;
  const base = Date.parse(departureISO);
  if (Number.isNaN(base)) return steps;
  return steps.map((s) => {
    if (s.dueOffset == null || s.dueDate) return s;
    return { ...s, dueDate: new Date(base - s.dueOffset * 86400000).toISOString().slice(0, 10) };
  });
}

/** Tiến độ: số bước hoàn tất / tổng + phần trăm. */
export function workflowProgress(steps: WorkflowStep[]): { done: number; total: number; pct: number } {
  const total = steps.length;
  const done = steps.filter((s) => s.status === 'done').length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** Khoảng thời gian (ms) bao toàn bộ ngày của workflow (gồm hôm nay) cho Gantt. */
export function ganttBounds(steps: WorkflowStep[], todayMs = Date.now()): { min: number; max: number } | null {
  const ms: number[] = [];
  for (const s of steps) {
    for (const d of [s.startDate, s.dueDate, s.doneDate]) {
      if (d) { const t = Date.parse(d); if (!Number.isNaN(t)) ms.push(t); }
    }
  }
  if (!ms.length) return null;
  ms.push(todayMs);
  return { min: Math.min(...ms), max: Math.max(...ms) };
}

/** Đổi trạng thái một bước (set/clear doneDate). Thuần — dùng cho kéo-thả Kanban. */
export function setStepStatus(steps: WorkflowStep[], id: string, status: WorkflowStatus): WorkflowStep[] {
  const today = new Date().toISOString().slice(0, 10);
  return steps.map((s) => (s.id === id
    ? { ...s, status, doneDate: status === 'done' ? (s.doneDate ?? today) : null }
    : s));
}
