import type { Role, User } from '@/types';

export const ROLES: readonly Role[] = [
  'CEO',
  'Ban Giám Đốc',
  'Trưởng Phòng',
  'Phó Phòng',
  'Sales',
  'Operations',
  'Marketing',
  'Admin',
  'Accountant',
  'Standard',
];

/** Roles allowed to approve payment requests (senior management). */
export const APPROVER_ROLES: readonly Role[] = ['CEO', 'Ban Giám Đốc', 'Trưởng Phòng'];

/** True if the role can approve payment / cost requests. */
export const isApprover = (role: Role): boolean => APPROVER_ROLES.includes(role);

/** Chỉ CEO được xem chức vụ + phòng ban của nhân sự (ẩn với mọi người khác). */
export const canViewStaffRole = (viewer: User | null | undefined): boolean => viewer?.role === 'CEO';

/** Nhãn người dùng cho dropdown/hiển thị — ẩn (chức vụ) trừ khi người xem là CEO. */
export const userLabel = (u: { name: string; role: Role }, viewer: User | null | undefined): string =>
  canViewStaffRole(viewer) ? `${u.name} (${u.role})` : u.name;

/** Seniority rank (higher = more senior). Used for "from level X upward" rules. */
export const ROLE_RANK: Record<Role, number> = {
  CEO: 9,
  'Ban Giám Đốc': 8,
  'Trưởng Phòng': 7,
  'Phó Phòng': 6,   // trên Operations, dưới Trưởng Phòng
  Operations: 5,
  Sales: 4,
  Marketing: 3,
  Admin: 2,
  Accountant: 1,
  Standard: 0,
};

/**
 * True if the user is "cấp phó phòng trở lên" — rank ≥ Operations (Operations,
 * Trưởng Phòng, Ban Giám Đốc, CEO). Gates Web Push + bản tin sáng tự động.
 */
export const canReceivePush = (user: User | null | undefined): boolean =>
  !!user && ROLE_RANK[user.role] >= ROLE_RANK.Operations;

/** Shared data areas synced + permission-gated across the Báo giá workspace. */
export type SharedArea = 'contracts' | 'menu' | 'itinerary' | 'rateCard' | 'ncc' | 'customers';

/** Roles that do NOT receive the continuous sync of the shared data areas. */
export const NO_SYNC_ROLES: readonly Role[] = ['Marketing', 'Admin', 'Accountant'];

/** Whether a role gets the shared data synced at all. */
export const syncsSharedData = (role: Role): boolean => !NO_SYNC_ROLES.includes(role);

/**
 * Minimum rank required to view/manage the FULL shared list of an area.
 * Below this, a synced user only sees/edits items they created themselves.
 * (Rate Card has no threshold — everyone who syncs can use it.)
 */
const VIEW_ALL_MIN_RANK: Record<SharedArea, number> = {
  contracts: ROLE_RANK['Ban Giám Đốc'], // Ban Giám Đốc trở lên
  ncc: ROLE_RANK.Operations,            // Operations trở lên
  menu: ROLE_RANK.Operations,           // Operations trở lên
  itinerary: ROLE_RANK.Operations,      // Operations trở lên
  customers: ROLE_RANK.Sales,           // Sales trở lên
  rateCard: 0,                          // no threshold
};

/** True if the role may view/manage the entire shared list for an area. */
export const canViewAll = (role: Role, area: SharedArea): boolean =>
  ROLE_RANK[role] >= VIEW_ALL_MIN_RANK[area];

// Source: public/legacy.html:5126.
export const USER_COLORS: readonly string[] = [
  '#dc3250', '#f5a623', '#14a08c', '#1abc9c', '#3498db',
  '#9b59b6', '#e67e22', '#27ae60', '#16a085', '#8e44ad',
];

// Mirrors the seed list inside src/stores/authStore.ts. Intentionally duplicated
// so the "Reset mặc định" button can reset without depending on a store internal.
export const DEFAULT_USERS: readonly User[] = [
  { u: 'ceo',      email: 'ceo@viettours.com.vn',      role: 'CEO',          name: 'Tony',  color: '#dc3250' },
  { u: 'manager1', email: 'manager1@viettours.com.vn', role: 'Trưởng Phòng', name: 'Mai',   color: '#f5a623' },
  { u: 'sale1',    email: 'sale1@viettours.com.vn',    role: 'Sales',        name: 'Linh',  color: '#14a08c' },
  { u: 'sale2',    email: 'sale2@viettours.com.vn',    role: 'Sales',        name: 'Hùng',  color: '#1abc9c' },
  { u: 'sale3',    email: 'sale3@viettours.com.vn',    role: 'Sales',        name: 'Trang', color: '#3498db' },
  { u: 'op1',      email: 'op1@viettours.com.vn',      role: 'Operations',   name: 'Khang', color: '#9b59b6' },
];
