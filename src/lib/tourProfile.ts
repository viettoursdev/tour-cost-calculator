// ════════════════════════════════════════════════════════════════════════
//  Hàm THUẦN cho Hồ sơ tour (Tour Profile) — dễ test, không đụng store/IO.
//   • generateTourCode: mã `NĐ.DD.MM.YY.NN` / `NN.DD.MM.YY.NN` (fallback client;
//     đường thật dùng RPC `next_tour_code` atomic ở DB — xem sbNextTourCode).
//   • canViewTourProfile / visibleTourProfiles: quyền XEM = quyền bản ghi
//     (recordAccess) HOẶC là follower (theo dõi → cũng được xem).
// ════════════════════════════════════════════════════════════════════════
import type { TourKind, TourProfile, User } from '@/types';
import { canViewRecord } from '@/auth/recordAccess';

/** Tiền tố mã theo loại: nội địa → NĐ, nước ngoài → NN. */
export const tourPrefix = (kind: TourKind): string => (kind === 'intl' ? 'NN' : 'NĐ');

/** Phần ngày `DD.MM.YY` của mã (theo `now`, mặc định hôm nay). */
export function tourDatePart(now: Date = new Date()): string {
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}

/**
 * Sinh mã hồ sơ tour `NĐ.DD.MM.YY.NN` — STT đếm theo prefix + ngày trong `existing`.
 * Chỉ là FALLBACK/đoán phía client; nguồn chuẩn duy nhất là RPC atomic ở DB.
 */
export function generateTourCode(kind: TourKind, existing: TourProfile[], now: Date = new Date()): string {
  const prefix = tourPrefix(kind);
  const date = tourDatePart(now);
  // Mã dạng `NĐ.DD.MM.YY.NN` — ngày ở GIỮA, STT ở cuối → khớp theo tiền tố prefix+ngày.
  const head = `${prefix}.${date}.`;
  const sameDay = existing.filter((p) => p.code?.startsWith(head)).length;
  const seq = String(sameDay + 1).padStart(2, '0');
  return `${prefix}.${date}.${seq}`;
}

/**
 * Quyết định báo giá chính kế tiếp khi XOÁ một báo giá khỏi hồ sơ (hàm thuần).
 *  - Xoá báo giá KHÔNG phải chính → không cần đổi gì (null).
 *  - Xoá báo giá chính, còn báo giá khác → chuyển primary sang cái đầu tiên còn lại.
 *  - Xoá báo giá chính, hết báo giá → gỡ primary + lưu trữ hồ sơ (chống mồ côi).
 */
export function nextPrimaryAfterDelete(
  currentPrimaryId: string | undefined,
  deletedCloudId: string,
  remainingCloudIds: string[],
): { primaryQuoteId: string | undefined; archive: boolean } | null {
  if (currentPrimaryId !== deletedCloudId) return null;
  if (remainingCloudIds.length > 0) return { primaryQuoteId: remainingCloudIds[0], archive: false };
  return { primaryQuoteId: undefined, archive: true };
}

/** Quyền XEM một hồ sơ: theo recordAccess HOẶC là người theo dõi (follower). */
export function canViewTourProfile(user: User | null | undefined, p: TourProfile, users: User[]): boolean {
  if (!user) return false;
  if (canViewRecord(user, p, users)) return true;
  return (p.followers ?? []).some((f) => f.u === user.u);
}

/** Lọc danh sách hồ sơ theo quyền xem của user. */
export function visibleTourProfiles(
  user: User | null | undefined,
  list: TourProfile[],
  users: User[],
): TourProfile[] {
  if (!user) return [];
  return list.filter((p) => canViewTourProfile(user, p, users));
}
