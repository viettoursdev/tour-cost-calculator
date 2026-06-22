// ════════════════════════════════════════════════════════════════════════
//  Máy trạng thái "Hồ sơ tour" (Deal) — trục CRM nối Yêu cầu → Báo giá →
//  Chốt → Hợp đồng → Vận hành → Nghiệm thu → Đóng hồ sơ.
//
//  NGUYÊN TẮC: giai đoạn KHÔNG được lưu thành "sự thật thứ hai". Nó được SUY RA
//  thuần từ dữ liệu đã có (`QuoteStatus`, các bước `WorkflowStep`, hợp đồng liên
//  kết) nên không bao giờ lệch khỏi thực tế. Module này KHÔNG đụng store/IO —
//  chỉ là hàm thuần, dễ test, tái dùng cho cả Cockpit lẫn Pipeline board sau này.
//
//  Các cổng chặn (gate) là PREDICATE thuần trả về { ok, reason }. Tầng UI tự
//  quyết định chặn cứng (disable nút) hay chỉ cảnh báo — module không ép.
// ════════════════════════════════════════════════════════════════════════
import type { Contract, QuoteStatus, WorkflowStatus, WorkflowStep } from '@/types';
import { keyOf, type WorkflowStepKey } from './workflowConstants';

/** Giai đoạn trong đường dây CRM. 7 giai đoạn xuôi + 1 nhánh kết thúc 'lost'. */
export type DealStage =
  | 'request' // ① Yêu cầu — vừa nhận, đang dựng báo giá
  | 'quoting' // ② Báo giá — đã gửi khách / đang deal
  | 'won' // ③ Chốt deal — khách đồng ý, chờ lên hợp đồng
  | 'contract' // ④ Hợp đồng — đã lập (chờ ký / đã ký)
  | 'operating' // ⑤ Vận hành — đặt dịch vụ → khởi hành
  | 'acceptance' // ⑥ Nghiệm thu — sau tour, đối soát & thanh toán cuối
  | 'closed' // ⑦ Đóng hồ sơ — hoàn tất
  | 'lost'; // ✗ Thua / Huỷ — nhánh kết thúc ngoài đường dây

/** Trạng thái hợp đồng liên kết, đã rút gọn về các cờ máy trạng thái cần. */
export interface DealContractFlags {
  signed?: boolean; // contractStatus ∈ {signed, active, completed}
  completed?: boolean; // contractStatus === 'completed'
  cancelled?: boolean; // contractStatus === 'cancelled'
  hasAcceptance?: boolean; // đã có biên bản nghiệm thu
}

/** Rút cờ máy trạng thái từ một hợp đồng (null nếu chưa có hợp đồng liên kết). */
export function contractFlags(
  c: Pick<Contract, 'contractStatus' | 'hasAcceptance'> | null | undefined,
): DealContractFlags | null {
  if (!c) return null;
  const s = c.contractStatus;
  return {
    signed: s === 'signed' || s === 'active' || s === 'completed',
    completed: s === 'completed',
    cancelled: s === 'cancelled',
    hasAcceptance: !!c.hasAcceptance,
  };
}

/** Đầu vào thuần cho máy trạng thái — decoupled khỏi store/Supabase. */
export interface DealInput {
  status?: QuoteStatus; // trạng thái pipeline bán của báo giá
  workflow?: WorkflowStep[]; // 13 bước vận hành của báo giá
  contract?: DealContractFlags | null; // hợp đồng liên kết (null = chưa có)
  departureISO?: string | null; // ngày khởi hành (yyyy-mm-dd)
  todayISO?: string; // ghi đè "hôm nay" cho test
}

/** Kết quả một cổng chặn. `ok=false` kèm `reason` để hiển thị tooltip/cảnh báo. */
export interface Gate {
  ok: boolean;
  reason?: string;
}

/** Hành động kế tiếp đề xuất cho Cockpit (nút CTA của giai đoạn hiện tại). */
export type DealActionKey =
  | 'send_quote'
  | 'mark_won'
  | 'make_contract'
  | 'sign_contract'
  | 'acceptance'
  | 'close'
  | 'done';

export interface NextAction {
  stage: DealStage;
  action: DealActionKey;
  label: string;
  gate: Gate;
}

// ── Meta hiển thị (dùng lại cho Cockpit stepper & Pipeline board sau này) ──
export const DEAL_STAGES: { key: DealStage; label: string; short: string; color: string }[] = [
  { key: 'request', label: '① Yêu cầu', short: 'Yêu cầu', color: '#64748b' },
  { key: 'quoting', label: '② Báo giá', short: 'Báo giá', color: '#2563eb' },
  { key: 'won', label: '③ Chốt deal', short: 'Chốt', color: '#7c3aed' },
  { key: 'contract', label: '④ Hợp đồng', short: 'Hợp đồng', color: '#0d7a6a' },
  { key: 'operating', label: '⑤ Vận hành', short: 'Vận hành', color: '#d97706' },
  { key: 'acceptance', label: '⑥ Nghiệm thu', short: 'Nghiệm thu', color: '#16a34a' },
  { key: 'closed', label: '⑦ Đóng hồ sơ', short: 'Đóng', color: '#334155' },
];

/** Nhánh kết thúc ngoài đường dây xuôi (hiển thị cột riêng trên board). */
export const DEAL_STAGE_LOST = { key: 'lost' as const, label: '✗ Thua / Huỷ', short: 'Thua/Huỷ', color: '#dc2626' };

/** Cấp độ tiến triển của từng giai đoạn xuôi (để lấy MAX bằng chứng). */
const STAGE_LEVEL: Record<Exclude<DealStage, 'lost'>, number> = {
  request: 0,
  quoting: 1,
  won: 2,
  contract: 3,
  operating: 4,
  acceptance: 5,
  closed: 6,
};
const LEVEL_STAGE = (Object.keys(STAGE_LEVEL) as Exclude<DealStage, 'lost'>[]).sort(
  (a, b) => STAGE_LEVEL[a] - STAGE_LEVEL[b],
);

/** Các bước thuộc khâu vận hành (giữa hợp đồng và khởi hành). */
const OPS_KEYS: WorkflowStepKey[] = [
  'confirm_service',
  'visa',
  'deposit_ncc',
  'final_service',
  'comms',
  'deposit_pretrip',
  'departure',
];

// ── Tiện ích đọc bước theo khoá ổn định ──
const stepStatus = (wf: WorkflowStep[] | undefined, key: WorkflowStepKey): WorkflowStatus | undefined =>
  wf?.find((s) => keyOf(s) === key)?.status;
const isDone = (wf: WorkflowStep[] | undefined, key: WorkflowStepKey): boolean => stepStatus(wf, key) === 'done';
const isActive = (wf: WorkflowStep[] | undefined, key: WorkflowStepKey): boolean => {
  const s = stepStatus(wf, key);
  return s === 'done' || s === 'doing';
};
const today = (d: DealInput): string => d.todayISO ?? new Date().toISOString().slice(0, 10);
/** Tour đã khởi hành chưa — theo bước departure HOẶC ngày khởi hành đã qua. */
const departed = (d: DealInput): boolean =>
  isDone(d.workflow, 'departure') || (!!d.departureISO && today(d) >= d.departureISO);
const hasAcceptance = (d: DealInput): boolean =>
  !!d.contract?.hasAcceptance || isDone(d.workflow, 'acceptance');

/**
 * Giai đoạn hiện tại của hồ sơ — SUY RA từ dữ liệu thật, lấy bằng chứng XA NHẤT.
 * Đơn điệu (monotonic): bằng chứng giai đoạn sau luôn hàm ý các giai đoạn trước,
 * nên không bao giờ "tụt" giai đoạn sai cách.
 */
export function dealStage(d: DealInput): DealStage {
  // Nhánh kết thúc: báo giá không được chọn / huỷ, hoặc hợp đồng đã huỷ.
  if (d.status === 'not_selected' || d.status === 'cancelled' || d.contract?.cancelled) return 'lost';

  const wf = d.workflow;
  const c = d.contract;
  let level = 0; // request

  const bump = (s: Exclude<DealStage, 'lost'>): void => {
    if (STAGE_LEVEL[s] > level) level = STAGE_LEVEL[s];
  };

  if (d.status === 'sent' || d.status === 'negotiating' || isActive(wf, 'quote')) bump('quoting');
  if (d.status === 'won') bump('won');
  if (c) bump('contract'); // có hợp đồng liên kết (bất kể trạng thái)
  if (c?.signed || departed(d) || OPS_KEYS.some((k) => isActive(wf, k))) bump('operating');
  if (hasAcceptance(d) || isDone(wf, 'final_payment')) bump('acceptance');
  if (c?.completed || isDone(wf, 'close')) bump('closed');

  return LEVEL_STAGE[level];
}

/** Đã ở nhánh kết thúc (đóng hoặc thua/huỷ) — không còn hành động đẩy tiếp. */
export const isTerminalStage = (s: DealStage): boolean => s === 'closed' || s === 'lost';

// ════════════════════════════════════════════════════════════════════════
//  CỔNG CHẶN — predicate thuần. UI tự quyết chặn cứng hay cảnh báo mềm.
// ════════════════════════════════════════════════════════════════════════

/** Đánh dấu Thành công (chốt) — nên đã gửi báo giá cho khách. */
export function canMarkWon(d: DealInput): Gate {
  if (d.status === 'won' || d.status === 'sent' || d.status === 'negotiating') return { ok: true };
  return { ok: false, reason: 'Nên gửi báo giá cho khách trước khi đánh dấu Thành công.' };
}

/** Lập hợp đồng — báo giá BẮT BUỘC đã chốt (won). Cổng cứng then chốt. */
export function canMakeContract(d: DealInput): Gate {
  if (d.status === 'won') return { ok: true };
  return { ok: false, reason: 'Báo giá phải ở trạng thái "Thành công (chốt)" trước khi lập hợp đồng.' };
}

/** Bắt đầu vận hành (đặt dịch vụ, đặt cọc NCC) — cần hợp đồng đã KÝ. */
export function canStartOperations(d: DealInput): Gate {
  if (d.contract?.signed) return { ok: true };
  if (d.contract) return { ok: false, reason: 'Hợp đồng cần được KÝ trước khi đặt dịch vụ & thanh toán NCC.' };
  return { ok: false, reason: 'Chưa có hợp đồng. Lập & ký hợp đồng trước khi vận hành.' };
}

/** Nghiệm thu — chỉ sau khi tour đã khởi hành. */
export function canDoAcceptance(d: DealInput): Gate {
  if (departed(d)) return { ok: true };
  return { ok: false, reason: 'Chỉ nghiệm thu sau khi tour đã khởi hành.' };
}

/** Đóng hồ sơ — cần đã nghiệm thu VÀ đã thu nốt thanh toán cuối. */
export function canClose(d: DealInput): Gate {
  const acc = hasAcceptance(d);
  const paid = isDone(d.workflow, 'final_payment');
  if (acc && paid) return { ok: true };
  const miss: string[] = [];
  if (!acc) miss.push('nghiệm thu');
  if (!paid) miss.push('thanh toán cuối');
  return { ok: false, reason: `Cần hoàn tất ${miss.join(' & ')} trước khi đóng hồ sơ.` };
}

/** Gom mọi cổng chặn — tiện cho UI lấy một lượt. */
export function dealGates(d: DealInput): {
  markWon: Gate;
  makeContract: Gate;
  startOperations: Gate;
  acceptance: Gate;
  close: Gate;
} {
  return {
    markWon: canMarkWon(d),
    makeContract: canMakeContract(d),
    startOperations: canStartOperations(d),
    acceptance: canDoAcceptance(d),
    close: canClose(d),
  };
}

/**
 * Hành động kế tiếp đề xuất cho Cockpit — nút CTA đẩy hồ sơ sang giai đoạn sau,
 * kèm cổng chặn tương ứng để UI bật/tắt hoặc cảnh báo.
 */
export function nextAction(d: DealInput): NextAction {
  const stage = dealStage(d);
  switch (stage) {
    case 'request':
      return { stage, action: 'send_quote', label: 'Hoàn thiện & gửi báo giá', gate: { ok: true } };
    case 'quoting':
      return { stage, action: 'mark_won', label: 'Đánh dấu Thành công (chốt deal)', gate: canMarkWon(d) };
    case 'won':
      return { stage, action: 'make_contract', label: 'Lập hợp đồng từ báo giá', gate: canMakeContract(d) };
    case 'contract':
      // Giai đoạn này CHỈ tồn tại khi hợp đồng chưa ký (ký → tự sang 'operating').
      return { stage, action: 'sign_contract', label: 'Ký hợp đồng', gate: { ok: true } };
    case 'operating': {
      const g = canDoAcceptance(d);
      return g.ok
        ? { stage, action: 'acceptance', label: 'Nghiệm thu tour', gate: g }
        : { stage, action: 'acceptance', label: 'Đang vận hành — chờ khởi hành', gate: g };
    }
    case 'acceptance':
      return { stage, action: 'close', label: 'Đóng hồ sơ tour', gate: canClose(d) };
    case 'closed':
      return { stage, action: 'done', label: 'Hồ sơ đã đóng', gate: { ok: true } };
    case 'lost':
    default:
      return { stage: 'lost', action: 'done', label: 'Hồ sơ đã kết thúc (thua/huỷ)', gate: { ok: true } };
  }
}
