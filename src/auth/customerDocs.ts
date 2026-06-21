import { ROLE_RANK } from './ROLES';
import type { Customer, User } from '@/types';

/**
 * Ai được XEM hồ sơ hộ chiếu/visa của khách (PII — siết chặt): người TẠO khách,
 * quản lý (Trưởng Phòng trở lên), phòng Visa, hoặc vai trò Operations. Người khác
 * vẫn thấy khách hàng nhưng KHÔNG thấy phần giấy tờ (ẩn ở giao diện).
 *
 * Lưu ý: đây là kiểm soát mức GIAO DIỆN cho công cụ nội bộ; Firestore vẫn cho mọi
 * nhân viên @viettours đọc (chưa mã hoá/tách kho riêng).
 */
export function canViewTravelerDocs(user: User | null | undefined, customer: Customer): boolean {
  if (!user) return false;
  if (ROLE_RANK[user.role] >= ROLE_RANK['Trưởng Phòng']) return true; // quản lý
  if (user.role === 'Operations') return true;
  if (user.department === 'visa') return true;
  return customer.createdBy === user.name; // người tạo khách
}
