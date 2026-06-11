import type { CategoryId } from './quote';

export type InstallmentStatus = 'paid' | 'unpaid';

export interface Installment {
  label: string;
  amount: number;
  status: InstallmentStatus;
  paidDate: string;
}

export interface PaymentRecord {
  supplier?: string;
  tracked?: boolean;
  customAmount?: number;
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
  amount: number;
}

export interface TourPayments {
  payments: Record<string, PaymentRecord>;
  customItems: CustomCostItem[];
}

export interface PaymentItem {
  key: string;
  catId: CategoryId;
  catLabel: string;
  catIcon: string;
  catColor: string;
  name: string;
  sourceAmount: number;
  amount: number;
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
  attachments?: { key: string; name: string }[];
}
