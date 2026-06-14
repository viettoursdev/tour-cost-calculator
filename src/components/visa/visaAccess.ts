import { ROLE_RANK } from '@/auth/ROLES';
import type { User, VisaProjectDoc } from '@/types';

/** Rank tối thiểu để xem TOÀN BỘ dự án visa (Trưởng Phòng trở lên: TP, BGĐ, CEO). */
const RANK_VIEW_ALL = ROLE_RANK['Trưởng Phòng'];
/** Rank tối thiểu để được tính là phụ trách/hỗ trợ/cộng tác hợp lệ (Operations trở lên). */
const RANK_ASSIGNABLE = ROLE_RANK.Operations;

type ProjAccess = Pick<VisaProjectDoc, 'createdByUsername' | 'mainStaff' | 'supportStaff' | 'collaborators'>;

/**
 * Ai được xem (và do đó mở/sửa) một dự án visa:
 *  1. Trưởng Phòng trở lên → xem tất cả dự án.
 *  2. Người tạo trực tiếp → luôn xem dự án của mình.
 *  3. Người được phân công phụ trách / hỗ trợ / cộng tác, NHƯNG chỉ khi role từ
 *     Operations trở lên. Dưới Operations dù được add cũng không xem được.
 *  4. Còn lại → không thấy dự án.
 */
export function canViewVisaProject(user: User | null, p: ProjAccess): boolean {
  if (!user) return false;
  const rank = ROLE_RANK[user.role] ?? 0;
  if (rank >= RANK_VIEW_ALL) return true;              // (1)
  if (p.createdByUsername === user.u) return true;     // (2)
  if (rank >= RANK_ASSIGNABLE) {                        // (3)
    if ((p.mainStaff ?? []).includes(user.u)) return true;
    if ((p.supportStaff ?? []).includes(user.u)) return true;
    if ((p.collaborators ?? []).includes(user.u)) return true;
  }
  return false;                                         // (4)
}

/** Lọc danh sách dự án visa theo quyền xem của user hiện tại. */
export function visibleVisaProjects<T extends ProjAccess>(user: User | null, projects: T[]): T[] {
  return projects.filter((p) => canViewVisaProject(user, p));
}
