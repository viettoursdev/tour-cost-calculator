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

export type EmailLinkTarget = 'customer' | 'quote' | 'todo';

/** Một email được GẮN vào khách hàng / báo giá (lưu chung cho cả nhóm). */
export interface EmailLink {
  id: string;
  emailId: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  toAddress?: string;
  receivedAt: string;
  webLink?: string;
  /** 'in' = email nhận về & gắn thủ công; 'out' = báo giá/hợp đồng gửi đi từ app. Mặc định 'in'. */
  direction?: 'in' | 'out';
  targetType: EmailLinkTarget;
  targetId: string;
  targetName?: string;
  linkedBy: string;
  linkedAt: string;
}

/** Tệp đính kèm khi gửi (vd PDF báo giá/hợp đồng). `contentBytes` là base64 KHÔNG có prefix `data:`. */
export interface SendAttachment {
  filename: string;
  contentType: string;
  contentBytes: string;
}

/** Đầu vào để gửi một email từ trong app qua Microsoft Graph (hoặc mock). */
export interface SendEmailInput {
  to: string[];
  cc?: string[];
  subject: string;
  /** Nội dung HTML. */
  bodyHtml: string;
  attachments?: SendAttachment[];
}

export interface SentEmailResult {
  /** id message Graph nếu có; mock trả id giả lập. */
  messageId?: string;
  sentAt: string; // ISO
}

export interface EmailLinksDoc {
  links: EmailLink[];
  updatedAt?: string;
  updatedBy?: string;
}
