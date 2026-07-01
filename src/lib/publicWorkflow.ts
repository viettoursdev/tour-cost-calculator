import { workflowProgress, stepLabelEn } from '@/components/quote/workflowConstants';
import type { PublicWorkflowDoc, PublicWorkflowStep, QuoteInfo, WorkflowStep } from '@/types';

/** Token ngẫu nhiên cho link tiến độ (khó đoán). */
export function genWorkflowToken(): string {
  try {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    const rnd = () => Math.random().toString(36).slice(2);
    return (rnd() + rnd() + rnd()).slice(0, 24);
  }
}

/** URL link tiến độ cho khách (tôn trọng base path GitHub Pages). */
export function workflowLinkUrl(token: string): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`;
  return `${base.replace(/\/$/, '/')}?wf=${token}`;
}

/**
 * Dựng bản HƯỚNG KHÁCH từ thông tin tour + các bước. CHỈ giữ mốc + trạng thái +
 * ngày (hạn/hoàn thành); LOẠI trường nội bộ (assignee/note/risk/log/subtasks/NCC).
 * Bỏ bước "Không thực hiện" (skipped) khỏi bản khách xem.
 */
export function buildPublicWorkflow(opts: {
  info: QuoteInfo;
  steps: WorkflowStep[];
  token: string;
  quoteId: string;
  publishedBy: string;
  note?: string;
  nowISO?: string;
}): PublicWorkflowDoc {
  const { info, steps, token, quoteId } = opts;
  const visible = steps.filter((s) => s.status !== 'skipped');
  const pubSteps: PublicWorkflowStep[] = visible.map((s) => ({
    label: s.label,
    labelEn: stepLabelEn(s),
    status: s.status,
    ...(s.dueDate ? { dueDate: s.dueDate } : {}),
    ...(s.doneDate ? { doneDate: s.doneDate } : {}),
  }));
  const prog = workflowProgress(steps);
  return {
    token,
    quoteId,
    tourName: info.name || 'Chương trình tour',
    dest: info.dest || undefined,
    departDate: info.startDate || undefined,
    progress: { done: prog.done, total: prog.total, pct: prog.pct },
    steps: pubSteps,
    note: opts.note?.trim() || undefined,
    publishedBy: opts.publishedBy,
    publishedAt: opts.nowISO ?? new Date().toISOString(),
  };
}
