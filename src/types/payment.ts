import type { CategoryId, FileAttachment } from './quote';

export type InstallmentStatus = 'paid' | 'unpaid';

export interface Installment {
  label: string;
  amount: number;
  status: InstallmentStatus;
  paidDate: string;
  /** Hạn phải thanh toán NCC (ISO yyyy-mm-dd) — để nhắc đến hạn trả NCC. */
  dueDate?: string;
}

/** Tóm tắt một đợt thanh toán NCC sắp/đã đến hạn — index vào lịch sử báo giá. */
export interface NccDueItem {
  supplier?: string;
  label: string;
  amount: number;
  dueDate: string;
}

export interface PaymentRecord {
  supplier?: string;
  tracked?: boolean;
  /** Số tiền hạng mục đã chỉnh tay. Diễn giải theo `cur` (VND nếu `cur` trống). */
  customAmount?: number;
  /** Mã ngoại tệ của `customAmount` (vd USD). Trống = VND. Quy đổi qua draft.rates. */
  cur?: string;
  installments?: Installment[];
  note?: string;
}

export interface CustomCostItem {
  key: string;
  catId: CategoryId;
  catLabel: string;
  catIcon: string;
  catColor: string;
  name: string;
  /** Số tiền theo `cur` (VND nếu `cur` trống). */
  amount: number;
  /** Mã ngoại tệ của `amount` (vd USD). Trống = VND. Quy đổi qua draft.rates. */
  cur?: string;
}

/** Ảnh chụp đông cứng các số quyết toán tại thời điểm CHỐT (để kế toán dùng làm căn cứ). */
export interface SettlementSnapshot {
  budgetCost: number;
  actualCost: number;
  paidCost: number;
  netRevenue: number;
  actualRevenue: number;
  plannedProfit: number;
  actualProfit: number;
  plannedMarginPct: number;
  actualMarginPct: number;
}

/** Trạng thái quyết toán của 1 tour: doanh thu thực (tuỳ chọn) + chốt/khoá. */
export interface SettlementMeta {
  /** Doanh thu thuần THỰC (VND) — ghi đè giá bán báo giá khi đối chiếu. Trống = dùng giá báo giá. */
  actualRevenue?: number;
  /** Đã chốt quyết toán lúc nào (ISO). Có giá trị = đang khoá. */
  lockedAt?: string;
  /** Người chốt. */
  lockedBy?: string;
  /** Số liệu đông cứng tại thời điểm chốt. */
  frozen?: SettlementSnapshot;
}

export interface TourPayments {
  payments: Record<string, PaymentRecord>;
  customItems: CustomCostItem[];
  /** Quyết toán: doanh thu thực + chốt/khoá. Tuỳ chọn, có thể chưa có. */
  settlement?: SettlementMeta;
}

export interface PaymentItem {
  key: string;
  catId: CategoryId;
  catLabel: string;
  catIcon: string;
  catColor: string;
  name: string;
  /** Giá vốn dự toán (VND). */
  sourceAmount: number;
  /** Số tiền hạng mục đã quy về VND (dùng cho mọi tổng hợp). */
  amount: number;
  /** Mã ngoại tệ đang nhập cho hạng mục (trống = VND). */
  cur?: string;
  /** Số tiền theo `cur` khi `cur` là ngoại tệ (để hiển thị/sửa). */
  foreignAmount?: number;
  tracked: boolean;
  custom: boolean;
  isOverridden: boolean;
}

export interface PaymentApprovalStage {
  status: 'approved' | 'rejected';
  approverUsername: string;
  approverName: string;
  note: string;
  updatedAt: string;
}

export interface PaymentApprovalEntry {
  stage1?: PaymentApprovalStage;
  stage2?: PaymentApprovalStage;
  currentStage?: 1 | 2;
  finalStatus?: 'approved' | 'rejected' | 'pending_stage2' | 'pending';
  intendedApprover1Name?: string;
  intendedApprover2Name?: string;
}

export type PaymentApprovalDoc = Record<string, PaymentApprovalEntry>;

export interface TourPaymentApprovalData {
  approvalKey: string;
  approvalStage: 1 | 2;
  requestedBy: string;
  requestedByName: string;
  tourName: string;
  tourKey: string;
  catName: string;
  ciKey: string;
  instIdx: number;
  supplier: string;
  amount: number;
  content: string;
  approver1Username: string;
  approver1Name: string;
  approver2Username: string;
  approver2Name: string;
  /** Tài liệu đính kèm phiếu đề nghị (lưu trên R2 qua AI Worker). */
  attachments?: FileAttachment[];
  /** Activity/thread chung của phiếu (để cập nhật trạng thái 2 chiều + comment). */
  threadId?: string;
  /** cloudId của báo giá liên quan — dùng deep-link mở tab Thanh toán. */
  quoteCloudId?: string;
}
