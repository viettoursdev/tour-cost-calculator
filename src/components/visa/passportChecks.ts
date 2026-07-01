/**
 * Kiểm tra hộ chiếu của khách xin visa — tính đúng đắn + cảnh báo nghiệp vụ.
 * Nhiều lãnh sự yêu cầu hộ chiếu còn hạn ≥6 tháng SAU ngày khởi hành; hộ chiếu hết
 * hạn / ngày hết hạn ≤ ngày cấp là lỗi dữ liệu cần chặn trước khi nộp.
 */
import { daysUntil } from '@/lib/dateUtils';
import { normDob } from './applicantMatch';

export type PassportIssue = { level: 'error' | 'warn'; text: string };

/** ~6 tháng, quy ước theo ngày để so hạn hộ chiếu. */
export const PASSPORT_MIN_VALID_DAYS = 183;

export interface PassportLike {
  passport?: string;
  passportIssue?: string;
  passportExpiry?: string;
}

/**
 * Trả danh sách vấn đề hộ chiếu của một khách (rỗng = ổn). `departureDate` (ISO)
 * để áp quy tắc "còn hạn ≥6 tháng sau ngày đi"; không có thì xét theo hôm nay.
 */
export function passportIssues(a: PassportLike, departureDate?: string | null): PassportIssue[] {
  const out: PassportIssue[] = [];
  const exp = normDob(a.passportExpiry);
  const iss = normDob(a.passportIssue);
  if (!a.passport?.trim()) out.push({ level: 'warn', text: 'Chưa nhập số hộ chiếu' });
  if (!exp) {
    if (a.passport?.trim()) out.push({ level: 'warn', text: 'Chưa nhập ngày hết hạn hộ chiếu' });
    return out;
  }
  if (iss && exp <= iss) out.push({ level: 'error', text: 'Ngày hết hạn ≤ ngày cấp' });
  const dExpiry = daysUntil(exp);
  if (dExpiry != null && dExpiry < 0) {
    out.push({ level: 'error', text: 'Hộ chiếu đã hết hạn' });
    return out;
  }
  const dep = departureDate ? daysUntil(departureDate) : null;
  if (dep != null && dExpiry != null) {
    // Số ngày hộ chiếu còn hạn TÍNH TỪ ngày khởi hành = (expiry - departure).
    if (dExpiry - dep < PASSPORT_MIN_VALID_DAYS) {
      out.push({ level: 'warn', text: 'Còn hạn <6 tháng so với ngày khởi hành' });
    }
  } else if (dExpiry != null && dExpiry < PASSPORT_MIN_VALID_DAYS) {
    out.push({ level: 'warn', text: 'Hộ chiếu còn hạn <6 tháng' });
  }
  return out;
}

export function hasPassportIssue(a: PassportLike, departureDate?: string | null): boolean {
  return passportIssues(a, departureDate).length > 0;
}
