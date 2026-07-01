import { describe, it, expect } from 'vitest';
import { computeIndexUpdate } from './workflowBackfill';
import type { QuoteDraft, WorkflowStep } from '@/types';

const draft = (workflow?: WorkflowStep[], startDate?: string): QuoteDraft =>
  ({ info: { name: 'T', ...(startDate ? { startDate } : {}) }, workflow } as unknown as QuoteDraft);

describe('computeIndexUpdate', () => {
  it('suy summary + due + departDate từ state có quy trình', () => {
    const steps: WorkflowStep[] = [
      { id: 'a', label: 'A', status: 'done' },
      { id: 'b', label: 'B', status: 'todo', dueDate: '2026-06-10', assignee: 'bob' },
    ];
    const u = computeIndexUpdate(draft(steps, '2026-08-01'));
    expect(u.workflowSummary?.total).toBe(2);
    expect(u.workflowDue?.some((w) => w.label === 'B')).toBe(true);
    expect(u.departDate).toBe('2026-08-01');
  });

  it('state không có quy trình → vẫn trả workflowSummary total 0 (đánh dấu đã quét)', () => {
    const u = computeIndexUpdate(draft(undefined));
    expect(u.workflowSummary).toBeTruthy();
    expect(u.workflowSummary?.total).toBe(0);
    expect(u.workflowDue).toEqual([]);
    expect(u.departDate).toBeUndefined();
  });

  it('state undefined → an toàn', () => {
    const u = computeIndexUpdate(undefined);
    expect(u.workflowSummary?.total).toBe(0);
  });
});
