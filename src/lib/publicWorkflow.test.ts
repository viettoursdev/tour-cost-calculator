import { describe, it, expect } from 'vitest';
import { buildPublicWorkflow, workflowLinkUrl, genWorkflowToken } from './publicWorkflow';
import type { QuoteInfo, WorkflowStep } from '@/types';

const info = { name: 'Đà Nẵng 3N2Đ', dest: 'Đà Nẵng', startDate: '2026-08-01' } as QuoteInfo;

const steps: WorkflowStep[] = [
  { id: '1', label: 'Tiếp nhận yêu cầu', key: 'receive', status: 'done', dueDate: '2026-06-01', doneDate: '2026-06-01',
    assignee: 'bob', note: 'nội bộ', risk: 'rủi ro', log: [{ at: 'x', by: 'y', action: 'z' }], reviewer: 'carol',
    subtasks: [{ id: 's', label: 'x', done: true }] },
  { id: '2', label: 'Triển khai báo giá', key: 'quote', status: 'doing', dueDate: '2026-06-10' },
  { id: '3', label: 'Bỏ qua', key: 'visa', status: 'skipped' },
];

describe('buildPublicWorkflow', () => {
  const doc = buildPublicWorkflow({ info, steps, token: 'tok', quoteId: 'q1', publishedBy: 'NV A', note: '  ', nowISO: '2026-07-01T00:00:00Z' });

  it('chỉ giữ mốc + trạng thái + ngày; LOẠI trường nội bộ', () => {
    const first = doc.steps[0];
    expect(first.label).toBe('Tiếp nhận yêu cầu');
    expect(first.status).toBe('done');
    expect(first.dueDate).toBe('2026-06-01');
    expect(first.doneDate).toBe('2026-06-01');
    // KHÔNG được lộ trường nội bộ
    const keys = Object.keys(first);
    for (const k of ['assignee', 'note', 'risk', 'log', 'reviewer', 'informed', 'subtasks', 'ownerDept']) {
      expect(keys).not.toContain(k);
    }
    expect(JSON.stringify(doc)).not.toContain('nội bộ');
    expect(JSON.stringify(doc)).not.toContain('rủi ro');
  });

  it('bỏ bước skipped, gắn labelEn, tính progress, quoteId, note rỗng → undefined', () => {
    expect(doc.steps).toHaveLength(2); // bỏ 'skipped'
    expect(doc.steps[0].labelEn).toBe('Receive request');
    expect(doc.quoteId).toBe('q1');
    expect(doc.tourName).toBe('Đà Nẵng 3N2Đ');
    expect(doc.progress.total).toBe(2); // skipped không tính
    expect(doc.note).toBeUndefined();   // '  ' → undefined
  });
});

describe('token & url', () => {
  it('token dài, url mang ?wf=', () => {
    expect(genWorkflowToken().length).toBeGreaterThanOrEqual(20);
    expect(workflowLinkUrl('abc')).toContain('?wf=abc');
  });
});
