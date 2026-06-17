export type CustomerContact = {
  name: string;
  phone: string;
  email: string;
  position: string;
};

/** Một lần chăm sóc / tương tác với khách (gọi, email, gặp, ghi chú). */
export type CustomerInteractionType = 'call' | 'email' | 'meeting' | 'note';
export type CustomerInteraction = {
  id: string;
  at: string;      // ISO timestamp
  byU: string;     // username
  byName: string;  // tên người ghi
  type: CustomerInteractionType;
  text: string;
};

export type Customer = {
  id: string;
  name: string;
  type: 'company' | 'individual';
  address?: string;   // địa chỉ
  taxCode?: string;   // mã số thuế
  contacts: CustomerContact[];
  note: string;
  /** Dòng thời gian chăm sóc khách (CRM) — mới nhất ở cuối. */
  interactions?: CustomerInteraction[];
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
};
