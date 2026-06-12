import type { FileAttachment } from './quote';

export interface VisaFee {
  id: string;
  name: string;
  amount: number;
  cur: string;
  perPax: boolean;
}

export type VisaMarkupType = 'percent' | 'fixed';

export interface VisaProduct {
  id: string;
  country: string;
  visaType: string;
  validity: string;
  location: string;
  fees: VisaFee[];
  markupType: VisaMarkupType;
  markupValue: number;
  markupCur: string;
  note: string;
  active: boolean;
}

export interface VisaProductsDoc {
  products: VisaProduct[];
  rates: Record<string, number>;
  updatedAt?: string;
  updatedBy?: string;
}

export type VisaProcKind = 'enterprise' | 'applicant' | 'content' | 'relative' | 'custom';

export interface VisaProcField {
  id: string;
  label: string;
}

export interface VisaProcRow {
  id: string;
  values: Record<string, string>;
}

export interface VisaProcSection {
  id: string;
  kind: VisaProcKind;
  title: string;
  repeatable: boolean;
  fieldDefs: VisaProcField[];
  rows: VisaProcRow[];
}

export interface VisaProcVersion {
  versionNo: number;
  savedAt: string;
  savedBy: string;
  sections: VisaProcSection[];
}

export interface VisaProcDoc {
  id: string;
  code: string;
  title: string;
  country: string;
  visaType?: string;                  // loại hình visa (Evisa, Visa đoàn…)
  isTemplate?: boolean;               // dùng làm template mẫu theo quốc gia/loại
  attachments?: FileAttachment[];     // file hồ sơ sao lưu (R2)
  linkedQuoteId: string | null;
  linkedQuoteName: string;
  createdByUsername: string;
  createdByName: string;
  collaborators: string[];
  sections: VisaProcSection[];
  versions: VisaProcVersion[];
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface VisaProcIndexEntry {
  id: string;
  code: string;
  title: string;
  country: string;
  visaType?: string;
  isTemplate?: boolean;
  linkedQuoteName: string;
  collaborators: string[];
  createdByUsername: string;
  createdByName: string;
  createdAt?: string;
  updatedAt: string;
  updatedBy: string;
}

// ── Dự án visa (Visa Projects) ──────────────────────────────────────────────

export type VisaProjectStatus =
  | 'planning'      // Lên kế hoạch
  | 'in_progress'   // Đang triển khai
  | 'reviewing'     // Đang xét visa
  | 'completed'     // Hoàn tất
  | 'pending'       // Pending
  | 'cancelled';    // Huỷ

/** Một mốc thời gian trong timeline của dự án (Đợt 2). */
export interface VisaMilestone {
  id: string;
  label: string;
  date: string | null;   // ISO yyyy-mm-dd
  done: boolean;
  note?: string;
}

/** Hồ sơ từng khách trong đoàn (Đợt 4 — checklist). */
export interface VisaApplicant {
  id: string;
  name: string;
  passport?: string;
  docStatus: 'missing' | 'submitted' | 'complete';
  result: 'pending' | 'passed' | 'failed' | 'have_visa';
  note?: string;
}

export interface VisaProjectDoc {
  id: string;
  code: string;
  name: string;                       // Tên chương trình
  country: string;
  status: VisaProjectStatus;
  mainStaff: string[];                // usernames — phụ trách chính
  supportStaff: string[];             // usernames — hỗ trợ
  documentsSummary: string;           // hồ sơ bao gồm (mô tả ngắn)
  linkedQuoteId: string | null;       // link báo giá tour
  linkedQuoteName: string;
  linkedProcIds: string[];            // hồ sơ VisaProc liên kết (Đợt 3)
  attachments: FileAttachment[];      // hồ sơ sao lưu (Đợt 3)
  // Số liệu khách
  applyCount: number;
  passedCount: number;
  failedCount: number;
  haveVisaCount: number;
  pendingCount: number;
  // Timeline (Đợt 2)
  startDate: string | null;
  endDate: string | null;
  milestones: VisaMilestone[];
  // Checklist (Đợt 4)
  applicants?: VisaApplicant[];
  // Quyền xem / meta
  collaborators: string[];
  createdByUsername: string;
  createdByName: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}
