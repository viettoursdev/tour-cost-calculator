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

/** Một bản lưu lịch sử của bảng giá visa (snapshot products tại thời điểm lưu). */
export interface VisaProductVersion {
  versionNo: number;
  savedAt: string;
  savedBy: string;
  products: VisaProduct[];
}

export interface VisaProductsDoc {
  products: VisaProduct[];
  rates: Record<string, number>;
  updatedAt?: string;
  updatedBy?: string;
  versions?: VisaProductVersion[];
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
/** Một mục trong checklist hồ sơ của khách (mở rộng được). */
export interface ApplicantDoc {
  id: string;
  label: string;
  checked: boolean;
}

/** Một bản ghi hộ chiếu cũ (lưu lại khi khách đổi hộ chiếu mới). */
export interface PassportRecord {
  passport?: string;
  issue?: string;      // Ngày cấp
  expiry?: string;     // Ngày hết hạn
  replacedAt: string;  // Thời điểm bị thay bằng hộ chiếu mới
}

export interface VisaApplicant {
  id: string;
  name: string;                 // Họ tên (có dấu)
  nameNoAccent?: string;        // Họ tên (không dấu) — tự sinh từ name, sửa tay được
  gender?: 'Nam' | 'Nữ' | 'Khác' | '';
  dob?: string;                 // Ngày sinh (YYYY-MM-DD)
  passport?: string;            // Số hộ chiếu
  passportIssue?: string;       // Ngày cấp
  passportExpiry?: string;      // Ngày hết hạn
  countriesVisited?: string;    // Các quốc gia đã từng đi
  docStatus: 'missing' | 'submitted' | 'complete';
  result: 'pending' | 'passed' | 'failed' | 'have_visa';
  failReason?: string;          // Lý do rớt (khi result = failed)
  docs?: ApplicantDoc[];        // Checklist hồ sơ
  passportHistory?: PassportRecord[];   // Hộ chiếu cũ đã thay
  note?: string;                // Lưu ý khác
  // ── Bổ sung dùng chung Visa ↔ Báo giá ──
  company?: string;             // Công ty / đơn vị
  phone?: string;               // Số điện thoại
  departurePoint?: string;      // Địa điểm khởi hành
  otherFlight?: string;         // Chuyến bay khác (khách bay riêng)
  // Sắp xếp phòng (đồng bộ với báo giá)
  roomType?: 'single' | 'double' | 'twin' | 'triple' | 'vip' | 'upgrade' | '';
  roomNo?: string;              // Nhãn/số phòng để ghép khách ở chung
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
  tourProfileId?: string | null;      // gắn TRỰC TIẾP vào hồ sơ tour (id)
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
  departureDate?: string | null;     // Ngày khởi hành chương trình (gom thống kê theo tháng/năm)
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
