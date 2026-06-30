export type ContractPartyB = {
  name: string;
  address: string;
  tel: string;
  rep: string;
  title: string;
  taxCode: string;
  email: string;
};

export type ContractPayment = {
  id: string;
  label: string;
  mode?: 'percent' | 'fixed';   // default 'percent'; 'fixed' means amount is user-entered
  percent?: number;
  amount: number;
  dueDate: string;
  note: string;
  status: 'pending' | 'paid';
  paidDate?: string;
  receivedAmount?: number;
  approvalRequested?: boolean;
};

export type ContractCancel = {
  when: string;
  penalty: number;
};

/** Một dòng dịch vụ trong checklist nghiệm thu (seed từ includes của HĐ). */
export type AcceptanceServiceItem = {
  label: string;
  delivered: boolean;
};

/** Chi tiết biên bản nghiệm thu (BBNT hiện đại). Lưu trong cột acceptance_detail. */
export type AcceptanceRecord = {
  /** Checklist dịch vụ đã giao so với cam kết. */
  services: AcceptanceServiceItem[];
  /** Đại diện ký Bên A (Viettours). */
  repA: string;
  /** Đại diện ký Bên B (khách). */
  repB: string;
  /** Mức hài lòng của khách 1–5 (tuỳ chọn). */
  satisfaction?: number;
  /** Người phát hành + thời điểm (ISO). */
  issuedBy?: string;
  issuedAt?: string;
};

export type Contract = {
  id: string;
  contractNo: string;
  contractDate: string;
  contractStatus: 'draft' | 'signed' | 'active' | 'completed' | 'cancelled';
  tourName: string;
  tourDest: string;
  tourDays: number;
  tourNights: number;
  tourStartDate?: string;
  departure: string;
  contractPax: number;
  pricePerPax: number;
  partyB: ContractPartyB;
  includes: string[];
  excludes: string[];
  payments: ContractPayment[];
  cancels: ContractCancel[];
  bondPercent: number;
  hasAcceptance: boolean;
  acceptanceDate?: string;
  acceptanceNote?: string;
  /** Chi tiết BBNT (checklist dịch vụ, chữ ký, mức hài lòng). */
  acceptance?: AcceptanceRecord;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
  _tourKey?: string;
  /** Liên kết tới báo giá tour (cloudId) — mở chéo 2 chiều. */
  linkedQuoteId?: string | null;
  linkedQuoteName?: string;
  /** Gắn TRỰC TIẾP vào hồ sơ tour (id) — bền hơn link qua báo giá. */
  tourProfileId?: string | null;
};
