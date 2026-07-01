import { describe, it, expect } from 'vitest';
import { mergeWorkflowExtras } from './quoteMap';
import type { WorkflowStep } from '@/types/quote';

describe('mergeWorkflowExtras', () => {
  it('giữ field không-shred (subtasks/output) từ JSON, cột thắng field trùng', () => {
    const prev: WorkflowStep[] = [
      { id: 'a', label: 'Cũ A', status: 'todo', output: 'bằng chứng', subtasks: [{ id: 's1', label: 'x', done: true }] },
    ];
    const assembled: WorkflowStep[] = [
      { id: 'a', label: 'Mới A', status: 'done', dueDate: '2026-06-01' }, // cột: label/status mới, không có subtasks
    ];
    const out = mergeWorkflowExtras(prev, assembled)!;
    expect(out[0].label).toBe('Mới A');        // cột thắng
    expect(out[0].status).toBe('done');        // cột thắng
    expect(out[0].dueDate).toBe('2026-06-01'); // cột thắng
    expect(out[0].output).toBe('bằng chứng');  // giữ từ JSON
    expect(out[0].subtasks).toHaveLength(1);   // giữ từ JSON
  });

  it('bước chỉ có ở assembled → giữ nguyên; không có prev → trả assembled', () => {
    const assembled: WorkflowStep[] = [{ id: 'b', label: 'B', status: 'todo' }];
    expect(mergeWorkflowExtras(undefined, assembled)).toBe(assembled);
    expect(mergeWorkflowExtras([], assembled)).toBe(assembled);
    const merged = mergeWorkflowExtras([{ id: 'z', label: 'Z', status: 'todo' }], assembled)!;
    expect(merged[0].id).toBe('b');
  });

  it('assembled undefined → trả undefined', () => {
    expect(mergeWorkflowExtras([{ id: 'a', label: 'A', status: 'todo' }], undefined)).toBeUndefined();
  });
});
