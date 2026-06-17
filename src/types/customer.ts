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
  /** Nguồn khách (giới thiệu/web/hội chợ…) — cho phân tích & lọc. */
  source?: string;
  /** Nhãn phân loại (VIP, doanh nghiệp lớn…). */
  tags?: string[];
  /** Dòng thời gian chăm sóc khách (CRM) — mới nhất ở cuối. */
  interactions?: CustomerInteraction[];
  /** Lịch hẹn liên hệ lại đang chờ (next action). */
  nextFollowUp?: { date: string; note: string; byU: string; byName: string };
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
};
