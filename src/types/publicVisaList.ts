/**
 * Link công khai để KHÁCH xem danh sách & tình trạng xin visa (không cần đăng nhập).
 * Bản "đã xuất bản" lưu ở `public_visa_lists/{token}` — chỉ chứa các cột HƯỚNG KHÁCH
 * mà nhân viên chọn, KHÔNG kéo nguyên hồ sơ nội bộ. Link chỉ hoạt động sau khi
 * Trưởng phòng Visa (hoặc CEO / BGĐ) DUYỆT.
 */

/** Trạng thái phê duyệt của một link xem danh sách visa. */
export type PublicVisaListStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

/** Một cột hiển thị cho khách (khoá ổn định + nhãn). */
export interface PublicVisaColumn {
  key: string;
  label: string;
  align?: 'left' | 'center';
}

/** Bản HƯỚNG KHÁCH: tiêu đề + cột + dòng đã render sẵn (chuỗi/số). */
export interface PublicVisaListDoc {
  token: string;
  projectId: string;
  projectName: string;
  country?: string;
  columns: PublicVisaColumn[];
  /** Mỗi dòng = mảng ô theo đúng thứ tự `columns`. */
  rows: (string | number)[][];
  count: number;
  note?: string;
  publishedBy: string;
  publishedAt: string;
}

/** Bản ghi đầy đủ phía công ty (kèm trạng thái duyệt + người yêu cầu/duyệt). */
export interface PublicVisaListRecord {
  token: string;
  projectId: string;
  payload: PublicVisaListDoc;
  columns: string[];
  note?: string;
  status: PublicVisaListStatus;
  requestedByUsername?: string;
  requestedByName?: string;
  requestedAt?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectReason?: string;
}
