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
};
