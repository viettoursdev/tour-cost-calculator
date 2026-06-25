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
