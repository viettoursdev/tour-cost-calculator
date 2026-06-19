import type { Department, User } from '@/types';

/** Khu vực chức năng để phân quyền theo phòng ban. */
export type DeptArea =
  | 'quote_domestic'   // Báo giá nội địa
  | 'quote_intl'       // Báo giá quốc tế / DMC
  | 'customers'        // Khách hàng
  | 'ncc'              // NCC + Rate card
  | 'contracts'        // Hợp đồng
  | 'payments'         // Thanh toán
  | 'visa'             // Visa
  | 'itinerary'        // Chương trình / Lịch trình
  | 'restaurant'       // Nhà hàng / Thực đơn
  | 'event';           // Sự kiện / Venue

export type AccessLevel = 'manage' | 'view' | 'none';

export const DEPARTMENTS: { id: Department; label: string; icon: string }[] = [
  { id: 'dh_noidia', label: 'Điều hành nội địa', icon: '🏠' },
  { id: 'dh_nuocngoai', label: 'Điều hành nước ngoài', icon: '🌏' },
  { id: 'ketoan', label: 'Kế toán', icon: '🧮' },
  { id: 'visa', label: 'Visa', icon: '🛂' },
  { id: 'hdv', label: 'Hướng dẫn viên', icon: '🧭' },
  { id: 'muahang', label: 'Mua hàng', icon: '🛒' },
  { id: 'sukien', label: 'Sự kiện', icon: '🎉' },
];

export const DEPT_LABEL: Record<Department, string> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.id, d.label]),
) as Record<Department, string>;

const M: AccessLevel = 'manage';
const V: AccessLevel = 'view';
const N: AccessLevel = 'none';

/** Ma trận phòng ban → mức quyền theo khu vực. (✅ manage · 👁 view · — none) */
export const DEPARTMENT_AREAS: Record<Department, Record<DeptArea, AccessLevel>> = {
  dh_noidia:    { quote_domestic: M, quote_intl: V, customers: M, ncc: V, contracts: M, payments: V, visa: N, itinerary: M, restaurant: M, event: N },
  dh_nuocngoai: { quote_domestic: V, quote_intl: M, customers: M, ncc: V, contracts: M, payments: V, visa: V, itinerary: M, restaurant: V, event: V },
  ketoan:       { quote_domestic: V, quote_intl: V, customers: V, ncc: V, contracts: V, payments: M, visa: N, itinerary: N, restaurant: N, event: N },
  visa:         { quote_domestic: N, quote_intl: V, customers: V, ncc: N, contracts: N, payments: N, visa: M, itinerary: N, restaurant: N, event: N },
  hdv:          { quote_domestic: V, quote_intl: V, customers: N, ncc: N, contracts: N, payments: N, visa: N, itinerary: V, restaurant: V, event: N },
  muahang:      { quote_domestic: N, quote_intl: N, customers: N, ncc: M, contracts: V, payments: V, visa: N, itinerary: N, restaurant: M, event: V },
  sukien:       { quote_domestic: N, quote_intl: M, customers: M, ncc: V, contracts: M, payments: V, visa: N, itinerary: M, restaurant: V, event: M },
};

/**
 * Mức quyền của user ở 1 khu vực theo phòng ban. Quy ước:
 *  - CEO / Ban Giám Đốc: 'manage' tất cả (cấp cao trùm phòng ban).
 *  - User CHƯA gán phòng: 'manage' tất cả (giữ nguyên hành vi cũ, không phá dữ liệu).
 *  - Còn lại: tra ma trận.
 */
export function deptAccess(user: User | null, area: DeptArea): AccessLevel {
  if (!user) return 'none';
  if (user.role === 'CEO' || user.role === 'Ban Giám Đốc') return 'manage';
  if (!user.department) return 'manage';
  return DEPARTMENT_AREAS[user.department]?.[area] ?? 'none';
}

/** Được TẠO/SỬA khu vực này không (theo phòng ban). Kết hợp với hasPerm ở nơi gọi. */
export const canManageArea = (user: User | null, area: DeptArea): boolean => deptAccess(user, area) === 'manage';

/** Được XEM khu vực này không (mô hình hỗn hợp: xem rộng). */
export const canViewAreaByDept = (user: User | null, area: DeptArea): boolean => deptAccess(user, area) !== 'none';
