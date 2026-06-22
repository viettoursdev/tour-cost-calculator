import { describe, it, expect } from 'vitest';
import {
  dealStage,
  nextAction,
  canMarkWon,
  canMakeContract,
  canStartOperations,
  canDoAcceptance,
  canClose,
  dealGates,
  isTerminalStage,
  DEAL_STAGES,
  type DealInput,
} from './dealStage';
import { defaultWorkflow, setStepStatus, type WorkflowStepKey } from './workflowConstants';
import type { WorkflowStep } from '@/types';

// Đặt trạng thái 1 bước theo khoá ổn định (dùng key, không phụ thuộc nhãn).
const setKey = (wf: WorkflowStep[], key: WorkflowStepKey, status: WorkflowStep['status']): WorkflowStep[] => {
  const s = wf.find((x) => x.key === key);
  return s ? setStepStatus(wf, s.id, status) : wf;
};
const wf = () => defaultWorkflow('standard');
const TODAY = '2026-06-22';

describe('dealStage — suy giai đoạn từ dữ liệu thật', () => {
  it('báo giá mới (in_progress, chưa gửi) → request', () => {
    expect(dealStage({ status: 'in_progress' })).toBe('request');
    expect(dealStage({})).toBe('request');
  });

  it('đã gửi / đang deal → quoting', () => {
    expect(dealStage({ status: 'sent' })).toBe('quoting');
    expect(dealStage({ status: 'negotiating' })).toBe('quoting');
  });

  it('bước quote done (dù status chưa đổi) cũng đẩy lên quoting', () => {
    expect(dealStage({ status: 'in_progress', workflow: setKey(wf(), 'quote', 'done') })).toBe('quoting');
  });

  it('won (chưa có hợp đồng) → won', () => {
    expect(dealStage({ status: 'won' })).toBe('won');
  });

  it('có hợp đồng liên kết → contract (kể cả khi status vẫn won)', () => {
    expect(dealStage({ status: 'won', contract: {} })).toBe('contract');
  });

  it('hợp đồng đã ký HOẶC có bước vận hành → operating', () => {
    expect(dealStage({ status: 'won', contract: { signed: true } })).toBe('operating');
    expect(dealStage({ status: 'won', contract: {}, workflow: setKey(wf(), 'deposit_ncc', 'doing') })).toBe('operating');
  });

  it('tour đã khởi hành (ngày đã qua) → operating dù chưa tick bước', () => {
    expect(dealStage({ status: 'won', contract: { signed: true }, departureISO: '2026-06-01', todayISO: TODAY })).toBe(
      'operating',
    );
  });

  it('có nghiệm thu → acceptance', () => {
    expect(dealStage({ status: 'won', contract: { signed: true, hasAcceptance: true } })).toBe('acceptance');
    expect(dealStage({ status: 'won', contract: { signed: true }, workflow: setKey(wf(), 'acceptance', 'done') })).toBe(
      'acceptance',
    );
  });

  it('thanh toán cuối done cũng đẩy lên acceptance', () => {
    expect(dealStage({ status: 'won', contract: { signed: true }, workflow: setKey(wf(), 'final_payment', 'done') })).toBe(
      'acceptance',
    );
  });

  it('hợp đồng completed HOẶC bước close done → closed', () => {
    expect(dealStage({ status: 'won', contract: { signed: true, completed: true, hasAcceptance: true } })).toBe('closed');
    expect(dealStage({ status: 'won', contract: { signed: true }, workflow: setKey(wf(), 'close', 'done') })).toBe(
      'closed',
    );
  });

  it('not_selected / cancelled / hợp đồng huỷ → lost (ưu tiên tuyệt đối)', () => {
    expect(dealStage({ status: 'not_selected' })).toBe('lost');
    expect(dealStage({ status: 'cancelled' })).toBe('lost');
    // Dù đã đi xa trong workflow, huỷ vẫn là lost.
    expect(dealStage({ status: 'cancelled', contract: { signed: true }, workflow: setKey(wf(), 'departure', 'done') })).toBe(
      'lost',
    );
    expect(dealStage({ status: 'won', contract: { cancelled: true } })).toBe('lost');
  });

  it('đơn điệu: bằng chứng giai đoạn sau luôn hàm ý giai đoạn đó (không tụt)', () => {
    // Chỉ có mỗi acceptance done, status vẫn in_progress, không hợp đồng:
    const d: DealInput = { status: 'in_progress', workflow: setKey(wf(), 'acceptance', 'done') };
    expect(dealStage(d)).toBe('acceptance');
  });
});

describe('cổng chặn (gate)', () => {
  it('canMakeContract chặn khi chưa won', () => {
    expect(canMakeContract({ status: 'sent' }).ok).toBe(false);
    expect(canMakeContract({ status: 'sent' }).reason).toMatch(/Thành công/);
    expect(canMakeContract({ status: 'won' }).ok).toBe(true);
  });

  it('canMarkWon nhắc gửi báo giá trước', () => {
    expect(canMarkWon({ status: 'in_progress' }).ok).toBe(false);
    expect(canMarkWon({ status: 'sent' }).ok).toBe(true);
  });

  it('canStartOperations cần hợp đồng đã ký, phân biệt 2 lý do', () => {
    expect(canStartOperations({}).reason).toMatch(/Chưa có hợp đồng/);
    expect(canStartOperations({ contract: {} }).reason).toMatch(/KÝ/);
    expect(canStartOperations({ contract: { signed: true } }).ok).toBe(true);
  });

  it('canDoAcceptance chỉ mở sau khởi hành', () => {
    expect(canDoAcceptance({ departureISO: '2026-12-01', todayISO: TODAY }).ok).toBe(false);
    expect(canDoAcceptance({ departureISO: '2026-01-01', todayISO: TODAY }).ok).toBe(true);
    expect(canDoAcceptance({ workflow: setKey(wf(), 'departure', 'done') }).ok).toBe(true);
  });

  it('canClose cần cả nghiệm thu và thanh toán cuối, liệt kê phần thiếu', () => {
    expect(canClose({}).reason).toMatch(/nghiệm thu & thanh toán cuối/);
    const accOnly: DealInput = { contract: { hasAcceptance: true } };
    expect(canClose(accOnly).reason).toMatch(/thanh toán cuối/);
    const both: DealInput = { contract: { hasAcceptance: true }, workflow: setKey(wf(), 'final_payment', 'done') };
    expect(canClose(both).ok).toBe(true);
  });

  it('dealGates gom đủ 5 cổng', () => {
    const g = dealGates({ status: 'won' });
    expect(Object.keys(g)).toEqual(['markWon', 'makeContract', 'startOperations', 'acceptance', 'close']);
    expect(g.makeContract.ok).toBe(true);
  });
});

describe('nextAction — CTA theo giai đoạn', () => {
  it('request → gửi báo giá', () => {
    expect(nextAction({ status: 'in_progress' }).action).toBe('send_quote');
  });
  it('quoting → mark_won (gate ok khi đã sent)', () => {
    const na = nextAction({ status: 'sent' });
    expect(na.action).toBe('mark_won');
    expect(na.gate.ok).toBe(true);
  });
  it('won → make_contract', () => {
    expect(nextAction({ status: 'won' }).action).toBe('make_contract');
  });
  it('contract chưa ký → sign_contract; ký xong tự sang operating', () => {
    expect(nextAction({ status: 'won', contract: {} }).action).toBe('sign_contract');
    // Ký = vận hành: dealStage đẩy lên operating, CTA chuyển sang nghiệm thu/chờ.
    expect(nextAction({ status: 'won', contract: { signed: true } }).action).toBe('acceptance');
  });
  it('operating chưa khởi hành → CTA chờ; đã khởi hành → gate mở', () => {
    const waiting = nextAction({
      status: 'won',
      contract: { signed: true },
      departureISO: '2026-12-01',
      todayISO: TODAY,
    });
    expect(waiting.action).toBe('acceptance');
    expect(waiting.gate.ok).toBe(false);
    const ready = nextAction({ status: 'won', contract: { signed: true }, workflow: setKey(wf(), 'departure', 'done') });
    expect(ready.gate.ok).toBe(true);
  });
  it('acceptance → close', () => {
    expect(nextAction({ status: 'won', contract: { signed: true, hasAcceptance: true } }).action).toBe('close');
  });
  it('closed & lost là terminal', () => {
    expect(nextAction({ status: 'cancelled' }).action).toBe('done');
    expect(isTerminalStage('closed')).toBe(true);
    expect(isTerminalStage('lost')).toBe(true);
    expect(isTerminalStage('operating')).toBe(false);
  });
});

describe('DEAL_STAGES meta', () => {
  it('có đủ 7 giai đoạn xuôi đúng thứ tự', () => {
    expect(DEAL_STAGES.map((s) => s.key)).toEqual([
      'request',
      'quoting',
      'won',
      'contract',
      'operating',
      'acceptance',
      'closed',
    ]);
  });
});
