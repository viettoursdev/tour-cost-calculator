/**
 * Tích hợp email Outlook / Microsoft 365 (giai đoạn DỰNG KHUNG — provider giả lập).
 * Khi có App Registration Azure, thay `mockProvider` bằng `graphProvider` (MSAL),
 * còn data model + UI giữ nguyên. Liên kết email lưu ở doc `viettours/email_links`.
 */
export interface EmailAccount {
  name: string;
  address: string;
}

export interface EmailMessage {
  id: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  toAddress?: string;
  receivedAt: string;   // ISO
  preview: string;
  webLink?: string;     // mở email gốc trong Outlook Web
}

export type EmailLinkTarget = 'customer' | 'quote';

/** Một email được GẮN vào khách hàng / báo giá (lưu chung cho cả nhóm). */
export interface EmailLink {
  id: string;
  emailId: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  receivedAt: string;
  webLink?: string;
  targetType: EmailLinkTarget;
  targetId: string;
  targetName?: string;
  linkedBy: string;
  linkedAt: string;
}

export interface EmailLinksDoc {
  links: EmailLink[];
  updatedAt?: string;
  updatedBy?: string;
}
