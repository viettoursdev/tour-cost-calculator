// ════════════════════════════════════════════════════════════════════════
//  Quyền xem dữ liệu KH / NCC theo NGUYÊN TẮC VẬN HÀNH (hàm thuần, dễ test):
//    1) Chỉ người TẠO mới thấy bản ghi.
//    2) Người được chia sẻ (collaborator) cũng thấy.
//    3) Trưởng phòng thấy dữ liệu do user TRONG PHÒNG BAN của mình tạo.
//    4) Ban Giám Đốc & CEO thấy TOÀN BỘ.
//  Áp cho khách hàng (Customer) và nhà cung cấp (Ncc) — cả hai có createdBy/
//  createdByU/collaborators.
// ════════════════════════════════════════════════════════════════════════
import type { Collaborator, Department, User } from '@/types';
import { isBoard } from './ROLES';

/** Hình dạng tối thiểu của một bản ghi có chủ sở hữu + chia sẻ. */
export interface OwnedRecord {
  createdBy?: string;          // tên người tạo (dữ liệu cũ luôn có)
  createdByU?: string;         // username người tạo (bản ghi mới)
  collaborators?: Collaborator[];
}

/** Phòng ban của người tạo — suy từ danh sách user (ưu tiên username, rồi tên). */
function creatorDepartment(rec: OwnedRecord, users: User[]): Department | undefined {
  const byU = rec.createdByU ? users.find((x) => x.u === rec.createdByU) : undefined;
  const creator = byU ?? users.find((x) => x.name === rec.createdBy);
  return creator?.department;
}

/** Người dùng có phải người tạo bản ghi không (theo username, fallback theo tên). */
export function isRecordOwner(user: User, rec: OwnedRecord): boolean {
  return rec.createdByU ? rec.createdByU === user.u : rec.createdBy === user.name;
}

/** Cấp Ban Giám Đốc (CEO + BGĐ + Trợ lý Giám Đốc) — phụ trách toàn bộ phòng ban, thấy tất cả. */
const seesEverything = (user: User): boolean => isBoard(user.role);
/** Cấp quản lý phòng (thấy dữ liệu cả phòng ban mình): Trưởng Phòng + Phó Phòng. */
const isDeptManager = (user: User): boolean => user.role === 'Trưởng Phòng' || user.role === 'Phó Phòng';

/** Quyền XEM một bản ghi theo 4 tầng nguyên tắc vận hành. */
export function canViewRecord(user: User | null | undefined, rec: OwnedRecord, users: User[]): boolean {
  if (!user) return false;
  if (seesEverything(user)) return true;                                   // (4)
  if (isRecordOwner(user, rec)) return true;                               // (1)
  if ((rec.collaborators ?? []).some((c) => c.u === user.u)) return true;  // (2)
  if (isDeptManager(user) && user.department && creatorDepartment(rec, users) === user.department) {
    return true;                                                           // (3)
  }
  return false;
}

/** Lọc danh sách bản ghi theo quyền xem của user. */
export function visibleRecords<T extends OwnedRecord>(user: User | null | undefined, list: T[], users: User[]): T[] {
  if (!user) return [];
  if (seesEverything(user)) return list;
  return list.filter((r) => canViewRecord(user, r, users));
}

/** Quyền CHIA SẺ (thêm collaborator): người tạo, Trưởng phòng cùng phòng, BGĐ, CEO. */
export function canShareRecord(user: User | null | undefined, rec: OwnedRecord, users: User[]): boolean {
  if (!user) return false;
  if (seesEverything(user)) return true;
  if (isRecordOwner(user, rec)) return true;
  if (isDeptManager(user) && user.department && creatorDepartment(rec, users) === user.department) return true;
  return false;
}

// ────────────────────────────────────────────────────────────────────────
//  Quyền xem HỒ SƠ NHÂN SỰ ("job của nhân sự") theo phòng ban:
//    - Cấp Ban Giám Đốc (CEO/BGĐ/Trợ lý GĐ): thấy toàn bộ nhân sự.
//    - Trưởng/Phó Phòng: chỉ thấy nhân sự CÙNG PHÒNG mình (vd nội địa chỉ thấy
//      nhân sự nội địa, nước ngoài chỉ thấy nhân sự nước ngoài).
//    - Còn lại: theo `viewHR` ở nơi gọi; nếu không có phòng thì không lọc thêm.
// ────────────────────────────────────────────────────────────────────────

/** Hình dạng tối thiểu của một hồ sơ nhân sự để lọc theo phòng ban. */
export interface DeptScopedRecord {
  department?: Department | string;
}

/** Quyền XEM một hồ sơ nhân sự theo phòng ban của người xem. */
export function canViewEmployee(user: User | null | undefined, emp: DeptScopedRecord): boolean {
  if (!user) return false;
  if (seesEverything(user)) return true;
  // Trưởng/Phó Phòng có gán phòng → chỉ thấy nhân sự cùng phòng.
  if (isDeptManager(user) && user.department) return emp.department === user.department;
  // Không phải cấp quản lý phòng (hoặc chưa gán phòng) → không siết thêm ở tầng này.
  return true;
}

/** Lọc danh sách hồ sơ nhân sự theo quyền xem phòng ban của user. */
export function visibleEmployees<T extends DeptScopedRecord>(user: User | null | undefined, list: T[]): T[] {
  if (!user) return [];
  if (seesEverything(user)) return list;
  return list.filter((e) => canViewEmployee(user, e));
}
