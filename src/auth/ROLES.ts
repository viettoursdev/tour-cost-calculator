import type { Role, User } from '@/types';

export const ROLES: readonly Role[] = [
  'CEO',
  'Trưởng Phòng',
  'Sales',
  'Operations',
  'Marketing',
  'Admin',
  'Accountant',
  'Standard',
];

// Source: public/legacy.html:5126.
export const USER_COLORS: readonly string[] = [
  '#dc3250', '#f5a623', '#14a08c', '#1abc9c', '#3498db',
  '#9b59b6', '#e67e22', '#27ae60', '#16a085', '#8e44ad',
];

// Mirrors the seed list inside src/stores/authStore.ts. Intentionally duplicated
// so the "Reset mặc định" button can reset without depending on a store internal.
export const DEFAULT_USERS: readonly User[] = [
  { u: 'ceo',      email: 'ceo@viettours.com.vn',      p: 'ceo123',  role: 'CEO',          name: 'Tony',  color: '#dc3250' },
  { u: 'manager1', email: 'manager1@viettours.com.vn', p: 'mgr123',  role: 'Trưởng Phòng', name: 'Mai',   color: '#f5a623' },
  { u: 'sale1',    email: 'sale1@viettours.com.vn',    p: 'sale123', role: 'Sales',        name: 'Linh',  color: '#14a08c' },
  { u: 'sale2',    email: 'sale2@viettours.com.vn',    p: 'sale123', role: 'Sales',        name: 'Hùng',  color: '#1abc9c' },
  { u: 'sale3',    email: 'sale3@viettours.com.vn',    p: 'sale123', role: 'Sales',        name: 'Trang', color: '#3498db' },
  { u: 'op1',      email: 'op1@viettours.com.vn',      p: 'op123',   role: 'Operations',   name: 'Khang', color: '#9b59b6' },
];
