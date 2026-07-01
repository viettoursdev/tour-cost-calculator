import { describe, it, expect } from 'vitest';
import {
  defaultWorkflow, workflowProgress, setStepStatus, newWorkflowStep, ganttBounds,
  workflowSignals, applySignals, fillDueDates, parseDueRuleOffset, keyByLabel, keyOf, suggestionFor, workflowDueSummary,
  appendLog, roleOfStep, workflowBoardSummary, cycleTimeMs,
  isGate, gateStatus, approvalOf, unmetDeps, APPROVE_ACTION,
  nextActionableStep, playbookNotices, subtaskProgress,
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
  it('counts done steps with WEIGHTED percentage', () => {
    const w = defaultWorkflow();
    w[0].status = 'done'; w[1].status = 'done'; w[2].status = 'doing';
    // done = receive(w1) + quote(w2) = 3 / tổng trọng số 23 ≈ 13%
    expect(workflowProgress(w)).toEqual({ done: 2, total: 13, pct: 13 });
  });
  it('handles empty', () => expect(workflowProgress([])).toEqual({ done: 0, total: 0, pct: 0 }));
  it('bỏ bước "Không thực hiện" (skipped) khỏi tổng/percent', () => {
    const w = [newWorkflowStep('A'), newWorkflowStep('B'), newWorkflowStep('C')];
    w[0].status = 'done'; w[1].status = 'skipped'; // C còn 'todo'
    // applicable = A,C → done 1/2 = 50%; total (không tính skipped) = 2
    expect(workflowProgress(w)).toEqual({ done: 1, total: 2, pct: 50 });
  });
});

describe('cycleTimeMs', () => {
  it('measures from first Đang làm to last Hoàn tất in the log', () => {
    const step = {
      ...newWorkflowStep('X'),
      log: [
        { at: '2026-06-01T00:00:00.000Z', by: 'A', action: 'Trạng thái → Đang làm' },
        { at: '2026-06-03T00:00:00.000Z', by: 'A', action: 'Trạng thái → Hoàn tất' },
      ],
    };
    expect(cycleTimeMs(step)).toBe(2 * 24 * 3600 * 1000);
  });
  it('returns null without both milestones', () => {
    expect(cycleTimeMs(newWorkflowStep('X'))).toBeNull();
  });
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

describe('dependencies + approval gate', () => {
  it('isGate/gateStatus theo khoá bước', () => {
    const std = defaultWorkflow('standard');
    const contract = std.find((s) => s.key === 'contract')!;
    const receive = std.find((s) => s.key === 'receive')!;
    expect(isGate(contract)).toBe(true);
    expect(isGate(receive)).toBe(false);
    expect(gateStatus(contract)).toBe('pending'); // là cổng, chưa duyệt
    expect(gateStatus(receive)).toBe('none');
  });

  it('approvalOf đọc lần duyệt mới nhất từ nhật ký', () => {
    let s = defaultWorkflow('standard').find((x) => x.key === 'contract')!;
    expect(approvalOf(s)).toBeNull();
    s = appendLog(s, [APPROVE_ACTION], 'Sếp A');
    const a = approvalOf(s);
    expect(a?.by).toBe('Sếp A');
    expect(gateStatus(s)).toBe('approved');
  });

  it('unmetDeps liệt kê prereq chưa xong ĐANG có trong quy trình', () => {
    const std = defaultWorkflow('standard');
    const contract = std.find((s) => s.key === 'contract')!;
    // 'contract' phụ thuộc 'quote' (chưa done) → cảnh báo
    expect(unmetDeps(contract, std)).toContain('Triển khai báo giá');
    // đánh dấu quote done → hết cảnh báo
    const done = std.map((s) => (s.key === 'quote' ? { ...s, status: 'done' as const } : s));
    expect(unmetDeps(done.find((s) => s.key === 'contract')!, done)).toEqual([]);
  });

  it('unmetDeps bỏ qua prereq không có trong quy trình (vd nội địa bỏ visa)', () => {
    const dom = defaultWorkflow('domestic'); // không có bước visa
    const dep = dom.find((s) => s.key === 'departure')!;
    // departure phụ thuộc final_service + deposit_pretrip (đều có trong domestic)
    const labels = unmetDeps(dep, dom);
    expect(labels.length).toBeGreaterThan(0);
    // bước tự thêm (không khoá) → không ràng buộc
    expect(unmetDeps({ id: 'x', label: 'Tự thêm', status: 'todo' }, dom)).toEqual([]);
  });
});

describe('subtaskProgress', () => {
  it('đếm việc con đã xong / tổng', () => {
    expect(subtaskProgress({ id: 'a', label: 'A', status: 'todo' })).toEqual({ done: 0, total: 0 });
    expect(subtaskProgress({ id: 'a', label: 'A', status: 'todo', subtasks: [
      { id: '1', label: 'x', done: true }, { id: '2', label: 'y', done: false },
    ] })).toEqual({ done: 1, total: 2 });
  });
});

describe('playbook (chuyền gậy)', () => {
  const mk = (): WorkflowStep[] => [
    { id: 'a', label: 'Bước A', status: 'done' },
    { id: 'b', label: 'Bước B', status: 'todo', assignee: 'bob' },
    { id: 'c', label: 'Bước C', status: 'todo', assignee: 'carol' },
  ];

  it('nextActionableStep = bước todo/doing đầu tiên phía sau', () => {
    const s = mk();
    expect(nextActionableStep(s, 'a')?.id).toBe('b');
    // bỏ qua skipped
    s[1].status = 'skipped';
    expect(nextActionableStep(s, 'a')?.id).toBe('c');
    expect(nextActionableStep(s, 'c')).toBeUndefined();
  });

  it('nhắc người phụ trách bước kế khi hoàn tất', () => {
    const notices = playbookNotices(mk(), 'a', 'done', 'alice', 'Đà Nẵng 3N2Đ');
    expect(notices).toHaveLength(1);
    expect(notices[0].to).toBe('bob');
    expect(notices[0].message).toContain('Bước B');
    expect(notices[0].message).toContain('Đà Nẵng 3N2Đ');
  });

  it('không nhắc khi: không phải done · không có người phụ trách · tự mình', () => {
    expect(playbookNotices(mk(), 'a', 'doing', 'alice', 'T')).toEqual([]);
    const noAssignee = mk(); noAssignee[1].assignee = undefined;
    expect(playbookNotices(noAssignee, 'a', 'done', 'alice', 'T')).toEqual([]);
    // người vừa thao tác chính là người phụ trách bước kế → khỏi tự nhắc
    expect(playbookNotices(mk(), 'a', 'done', 'bob', 'T')).toEqual([]);
  });
});

describe('parseDueRuleOffset', () => {
  it('parses T-N (trước) and T+N (sau) — kể cả có khoảng trắng / hậu tố', () => {
    expect(parseDueRuleOffset('T-7')).toBe(7);
    expect(parseDueRuleOffset('T-30 trước khởi hành')).toBe(30);
    expect(parseDueRuleOffset('T+7 sau tour')).toBe(-7);
    expect(parseDueRuleOffset('T + 3')).toBe(-3);
  });
  it('maps "Ngày khởi hành" → 0', () => {
    expect(parseDueRuleOffset('Ngày khởi hành')).toBe(0);
  });
  it('returns undefined for non-numeric / non-anchored rules', () => {
    expect(parseDueRuleOffset('T-X trước khởi hành')).toBeUndefined();
    expect(parseDueRuleOffset('Trong 24h nhận booking')).toBeUndefined();
    expect(parseDueRuleOffset('Theo deadline NCC')).toBeUndefined();
    expect(parseDueRuleOffset('Suốt tour')).toBeUndefined();
    expect(parseDueRuleOffset(undefined)).toBeUndefined();
    expect(parseDueRuleOffset('')).toBeUndefined();
  });
});

describe('workflowDueSummary', () => {
  it('includes only steps with dueDate & not done; carries assignee', () => {
    const w: WorkflowStep[] = [
      { id: 'a', label: 'A', status: 'todo', dueDate: '2026-06-10', assignee: 'op1' },
      { id: 'b', label: 'B', status: 'done', dueDate: '2026-06-11' },     // done → bỏ
      { id: 'c', label: 'C', status: 'doing' },                            // không hạn → bỏ
    ];
    expect(workflowDueSummary(w)).toEqual([{ label: 'A', dueDate: '2026-06-10', assignee: 'op1' }]);
  });
});

describe('status meta', () => {
  it('covers all 5 statuses with label + hex color', () => {
    expect(WORKFLOW_STATUS_ORDER).toHaveLength(5);
    expect(WORKFLOW_STATUS_ORDER).toContain('skipped');
    for (const s of WORKFLOW_STATUS_ORDER) {
      expect(WORKFLOW_STATUS_META[s].label).toBeTruthy();
      expect(WORKFLOW_STATUS_META[s].color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('appendLog', () => {
  it('appends entries newest-last and stamps by/at', () => {
    const s0 = newWorkflowStep('X');
    const s1 = appendLog(s0, ['Trạng thái → Hoàn tất'], 'Mai');
    expect(s1.log).toHaveLength(1);
    expect(s1.log?.[0]).toMatchObject({ by: 'Mai', action: 'Trạng thái → Hoàn tất' });
    expect(s1.log?.[0].at).toBeTruthy();
    const s2 = appendLog(s1, ['Đính kèm file'], 'Mai');
    expect(s2.log?.map((l) => l.action)).toEqual(['Trạng thái → Hoàn tất', 'Đính kèm file']);
  });
  it('no-op when actions empty; caps history at 50', () => {
    const s0 = newWorkflowStep('X');
    expect(appendLog(s0, [], 'Mai')).toBe(s0);
    let s = s0;
    for (let i = 0; i < 60; i++) s = appendLog(s, [`a${i}`], 'Mai');
    expect(s.log).toHaveLength(50);
    expect(s.log?.[49].action).toBe('a59');
  });
});

describe('workflowBoardSummary', () => {
  const mk = (over: Partial<WorkflowStep>): WorkflowStep => ({ ...newWorkflowStep('x'), ...over });
  it('reports current step, assignee, progress and overdue count', () => {
    const steps: WorkflowStep[] = [
      mk({ label: 'A', status: 'done' }),
      mk({ label: 'B', status: 'doing', assignee: 'sale1', dueDate: '2026-01-01' }),
      mk({ label: 'C', status: 'todo', dueDate: '2030-01-01' }),
      mk({ label: 'D', status: 'todo' }),
    ];
    const sum = workflowBoardSummary(steps, '2026-06-17');
    expect(sum.current).toBe('B');
    expect(sum.currentAssignee).toBe('sale1');
    expect(sum.total).toBe(4);
    expect(sum.donePct).toBe(25);
    expect(sum.overdue).toBe(1); // chỉ B (đã qua hạn & chưa xong)
  });
  it('100% done leaves current undefined', () => {
    const sum = workflowBoardSummary([newWorkflowStep('a', 'done')], '2026-06-17');
    expect(sum.donePct).toBe(100);
    expect(sum.current).toBeUndefined();
  });
});

describe('defaultWorkflow presets', () => {
  it('standard = 13 bước; domestic bỏ visa; mice thêm 3 bước riêng', () => {
    expect(defaultWorkflow()).toHaveLength(13);
    const dom = defaultWorkflow('domestic');
    expect(dom).toHaveLength(12);
    expect(dom.some((s) => s.key === 'visa')).toBe(false);
    const mice = defaultWorkflow('mice');
    expect(mice).toHaveLength(16);
    expect(mice.some((s) => s.label.includes('Khảo sát địa điểm'))).toBe(true);
    expect(mice.filter((s) => !s.key)).toHaveLength(3); // 3 bước riêng không có khoá
  });
});

describe('roleOfStep', () => {
  it('maps default steps to a department, undefined for custom steps', () => {
    const wf = defaultWorkflow();
    expect(roleOfStep(wf[3])).toBe('Operations'); // visa
    expect(roleOfStep(wf[5])).toBe('Accountant'); // deposit_ncc
    expect(roleOfStep(newWorkflowStep('Bước tự thêm'))).toBeUndefined();
  });
});
