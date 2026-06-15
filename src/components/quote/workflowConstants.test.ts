import { describe, it, expect } from 'vitest';
import {
  defaultWorkflow, workflowProgress, setStepStatus, newWorkflowStep,
  WORKFLOW_DEFAULT_STEPS, WORKFLOW_STATUS_ORDER, WORKFLOW_STATUS_META,
} from './workflowConstants';

describe('defaultWorkflow', () => {
  it('creates the 13 default steps, all todo, with unique ids', () => {
    const w = defaultWorkflow();
    expect(w).toHaveLength(13);
    expect(w[0].label).toBe('Tiếp nhận yêu cầu');
    expect(w[12].label).toBe('Kết tour, lưu trữ dữ liệu');
    expect(w.every((s) => s.status === 'todo')).toBe(true);
    expect(new Set(w.map((s) => s.id)).size).toBe(13);
  });
  it('matches WORKFLOW_DEFAULT_STEPS labels', () => {
    expect(defaultWorkflow().map((s) => s.label)).toEqual(WORKFLOW_DEFAULT_STEPS);
  });
});

describe('workflowProgress', () => {
  it('counts done steps and percentage', () => {
    const w = defaultWorkflow();
    w[0].status = 'done'; w[1].status = 'done'; w[2].status = 'doing';
    expect(workflowProgress(w)).toEqual({ done: 2, total: 13, pct: 15 });
  });
  it('handles empty', () => expect(workflowProgress([])).toEqual({ done: 0, total: 0, pct: 0 }));
});

describe('setStepStatus', () => {
  it('sets doneDate when moving to done, clears when leaving', () => {
    const w = [newWorkflowStep('A')];
    const id = w[0].id;
    const done = setStepStatus(w, id, 'done');
    expect(done[0].status).toBe('done');
    expect(done[0].doneDate).toBeTruthy();
    const back = setStepStatus(done, id, 'todo');
    expect(back[0].doneDate).toBeNull();
  });
  it('does not touch other steps', () => {
    const w = [newWorkflowStep('A'), newWorkflowStep('B')];
    const out = setStepStatus(w, w[0].id, 'doing');
    expect(out[1]).toBe(w[1]);
  });
});

describe('status meta', () => {
  it('covers all 4 statuses with label + hex color', () => {
    expect(WORKFLOW_STATUS_ORDER).toHaveLength(4);
    for (const s of WORKFLOW_STATUS_ORDER) {
      expect(WORKFLOW_STATUS_META[s].label).toBeTruthy();
      expect(WORKFLOW_STATUS_META[s].color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
