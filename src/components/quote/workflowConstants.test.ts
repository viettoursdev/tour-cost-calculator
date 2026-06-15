import { describe, it, expect } from 'vitest';
import {
  defaultWorkflow, workflowProgress, setStepStatus, newWorkflowStep, ganttBounds,
  workflowSignals, applySignals, fillDueDates, keyByLabel, keyOf, suggestionFor,
  WORKFLOW_DEFAULT_STEPS, WORKFLOW_STATUS_ORDER, WORKFLOW_STATUS_META,
} from './workflowConstants';
import type { WorkflowStep } from '@/types';

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

describe('ganttBounds', () => {
  it('returns null when no dates set', () => {
    expect(ganttBounds(defaultWorkflow())).toBeNull();
  });
  it('spans min/max of step dates and includes today', () => {
    const today = Date.parse('2026-06-15');
    const w = [newWorkflowStep('A'), newWorkflowStep('B')];
    w[0].startDate = '2026-06-10'; w[0].dueDate = '2026-06-12';
    w[1].dueDate = '2026-06-20';
    const b = ganttBounds(w, today)!;
    expect(b.min).toBe(Date.parse('2026-06-10'));
    expect(b.max).toBe(Date.parse('2026-06-20'));
  });
});

describe('keys', () => {
  it('default steps carry stable keys + dueOffset; keyByLabel/keyOf resolve', () => {
    const w = defaultWorkflow();
    expect(w[1].key).toBe('quote');
    expect(w[4].key).toBe('contract');
    expect(typeof w[0].dueOffset).toBe('number');
    expect(keyByLabel('Ký kết hợp đồng')).toBe('contract');
    expect(keyOf({ id: 'x', label: 'Khởi hành', status: 'todo' } as WorkflowStep)).toBe('departure'); // suy từ nhãn (không key)
  });
});

describe('workflowSignals', () => {
  it('maps quote status, contract, visa, payment, departure', () => {
    const s = workflowSignals({
      quoteStatus: 'won', hasContract: true, hasVisa: true, visaCompleted: false,
      paymentPaid: 5, paymentRemaining: 0, paymentCost: 10,
      departureDate: '2026-01-01', todayISO: '2026-06-15',
    });
    expect(s.quote).toBe('done');
    expect(s.contract).toBe('done');
    expect(s.visa).toBe('doing');
    expect(s.deposit_ncc).toBe('doing');
    expect(s.final_payment).toBe('done');
    expect(s.departure).toBe('done');
  });
  it('no departure signal before the date', () => {
    expect(workflowSignals({ departureDate: '2026-12-31', todayISO: '2026-06-15' }).departure).toBeUndefined();
  });
});

describe('applySignals (advance-only)', () => {
  it('advances but never downgrades and skips blocked', () => {
    const w = defaultWorkflow();
    const contractStep = w.find((s) => s.key === 'contract')!;
    const quoteStep = w.find((s) => s.key === 'quote')!;
    quoteStep.status = 'done';          // đã done → tín hiệu 'done' không hạ
    contractStep.status = 'blocked';    // blocked → bỏ qua
    const out = applySignals(w, { contract: 'done', quote: 'doing', departure: 'done' });
    expect(out.find((s) => s.key === 'contract')!.status).toBe('blocked');
    expect(out.find((s) => s.key === 'quote')!.status).toBe('done');
    expect(out.find((s) => s.key === 'departure')!.status).toBe('done');
  });
  it('suggestionFor only when higher than current', () => {
    const step = { id: 'x', label: 'Ký kết hợp đồng', status: 'todo', key: 'contract' } as WorkflowStep;
    expect(suggestionFor(step, { contract: 'done' })).toBe('done');
    expect(suggestionFor({ ...step, status: 'done' }, { contract: 'done' })).toBeNull();
  });
});

describe('fillDueDates', () => {
  it('fills only empty due dates from departure − offset; negative = after', () => {
    const w: WorkflowStep[] = [
      { id: 'a', label: 'A', status: 'todo', dueOffset: 7 },
      { id: 'b', label: 'B', status: 'todo', dueOffset: -7 },
      { id: 'c', label: 'C', status: 'todo', dueOffset: 3, dueDate: '2026-01-01' },
    ];
    const out = fillDueDates(w, '2026-06-15');
    expect(out[0].dueDate).toBe('2026-06-08');  // D-7
    expect(out[1].dueDate).toBe('2026-06-22');  // D+7 (sau)
    expect(out[2].dueDate).toBe('2026-01-01');  // không ghi đè
  });
  it('no-op without departure', () => {
    const w: WorkflowStep[] = [{ id: 'a', label: 'A', status: 'todo', dueOffset: 7 }];
    expect(fillDueDates(w, null)).toBe(w);
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
