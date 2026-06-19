import { canManageArea, type DeptArea } from './departments';
import type { Template, User } from '@/types';

/** Template báo giá → khu vực phòng ban (alt template: null = không ràng buộc). */
export function quoteAreaForTemplate(t: Template | null | undefined): DeptArea | null {
  if (t === 'domestic') return 'quote_domestic';
  if (t === 'intl' || t === 'dmc') return 'quote_intl';
  return null;
}

/** Được TẠO/SỬA báo giá template này không (theo phòng ban). */
export function canEditQuote(user: User | null, t: Template | null | undefined): boolean {
  const area = quoteAreaForTemplate(t);
  return area === null || canManageArea(user, area);
}

/** Được xem GIÁ không. Phòng HDV bị ẩn giá; còn lại (kể cả chưa gán phòng / CEO) thấy. */
export function canSeePrices(user: User | null): boolean {
  return user?.department !== 'hdv';
}
