import type { Collaborator, FileAttachment } from './quote';
import type { BankInfo } from './ncc';

/** Hồ sơ giấy tờ của MỘT người thuộc khách hàng (hộ chiếu + visa + file scan).
 *  Dữ liệu nhạy cảm (PII) — chỉ hiển thị cho người tạo khách + quản lý + phòng Visa/
 *  Operations (xem `canViewTravelerDocs`). */
export type TravelerDoc = {
  id: string;
  fullName: string;
  gender?: 'M' | 'F' | '';
  dob?: string;                 // ngày sinh (ISO yyyy-mm-dd)
  nationality?: string;
  // Hộ chiếu
  passportNo?: string;
  passportIssueDate?: string;   // ngày cấp (ISO)
  passportExpiry?: string;      // ngày hết hạn (ISO)
  passportIssuePlace?: string;  // nơi cấp
  passportFiles?: FileAttachment[];
  // Visa
  visaType?: string;
  visaCountry?: string;
  visaNo?: string;
  visaIssueDate?: string;
  visaExpiry?: string;
  visaEntries?: string;         // số lần nhập cảnh (1 / nhiều lần)
  visaStatus?: string;          // trạng thái (đang xử lý / đã cấp / từ chối…)
  visaFiles?: FileAttachment[];
  note?: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type CustomerContact = {
  name: string;
  phone: string;
  email: string;
  position: string;
  birthday?: string;   // sinh nhật người liên hệ (ISO yyyy-mm-dd) — để chăm sóc
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
  /** Hồ sơ hộ chiếu/visa của khách (PII — quyền xem siết chặt). */
  travelers?: TravelerDoc[];
  /** Sales phụ trách khách (account owner). */
  ownerU?: string;
  ownerName?: string;
  /** Kênh liên lạc ưa thích (Zalo / Email / Điện thoại…). */
  preferredChannel?: string;
  /** Sinh nhật khách cá nhân (ISO yyyy-mm-dd). */
  birthday?: string;
  /** Điều khoản thanh toán & hạn mức công nợ (khách B2B). */
  paymentTerms?: string;
  creditLimit?: number;
  /** TK ngân hàng hoàn tiền (tuỳ chọn). */
  refundBank?: BankInfo;
  /** File đính kèm: hợp đồng, ĐKKD, giấy tờ doanh nghiệp… (R2). */
  files?: FileAttachment[];
  createdAt: string;
  createdBy: string;
  /** Username người tạo (để phân quyền xem theo phòng ban; dữ liệu cũ chỉ có tên). */
  createdByU?: string;
  /** Người được chia sẻ cùng xem (collab) — ngoài người tạo. */
  collaborators?: Collaborator[];
  updatedAt?: string;
  updatedBy?: string;
};
