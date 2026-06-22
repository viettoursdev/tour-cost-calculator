import type { ProcessRef, ProcessRun, ProcessTemplate, User, WorkflowStep } from '@/types';
import { newProcessId } from '@/stores/processStore';
import { workflowProgress } from '@/components/quote/workflowConstants';

/** Tuỳ chọn khi khởi tạo 1 phiên chạy từ template. */
export type RunInit = {
  title: string;
  ref?: ProcessRef;
  assignee?: string;
  startDate?: string;
  dueDate?: string;
};

/** Dựng phiên chạy mới từ template: snapshot các bước (id mới, trạng thái reset). */
export function createRunFromTemplate(t: ProcessTemplate, init: RunInit, user: User): ProcessRun {
  const now = new Date().toISOString();
  const steps: WorkflowStep[] = t.steps.map((s, i) => ({
    ...s,
    id: `rs${Date.now().toString(36)}_${i}`,
    status: 'todo',
    doneDate: null,
    log: undefined,
  }));
  return {
    id: newProcessId('pr'),
    templateId: t.isSeed ? undefined : t.id,
    department: t.department,
    title: init.title.trim() || t.name,
    ref: init.ref,
    steps,
    status: 'active',
    assignee: init.assignee || user.u,
    startDate: init.startDate || undefined,
    dueDate: init.dueDate || undefined,
    createdByUsername: user.u,
    createdByName: user.name,
    createdAt: now,
  };
}

/** Tiến độ phiên chạy (đếm + % có trọng số), tái dùng logic workflow. */
export const runProgress = (run: ProcessRun) => workflowProgress(run.steps);

/** Bước "hiện tại" = bước chưa hoàn tất đầu tiên (bỏ qua skipped). */
export const currentStep = (run: ProcessRun): WorkflowStep | undefined =>
  run.steps.find((s) => s.status !== 'done' && s.status !== 'skipped');

/** Mọi bước (không skipped) đã hoàn tất? → phiên có thể đóng. */
export const isRunComplete = (run: ProcessRun): boolean => {
  const applicable = run.steps.filter((s) => s.status !== 'skipped');
  return applicable.length > 0 && applicable.every((s) => s.status === 'done');
};
