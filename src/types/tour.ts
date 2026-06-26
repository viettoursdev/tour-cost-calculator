import type { Collaborator } from './quote';

/** Phân loại hồ sơ tour → tiền tố mã code. */
export type TourKind = 'domestic' | 'intl';

/**
 * Phân loại NGHIỆP VỤ của hồ sơ (5 loại) — giàu hơn `kind` (chỉ NĐ/NN).
 * Quyết định tiền tố mã: incentive nội địa → NĐ, incentive nước ngoài → NN,
 * visa → VS, event → EV, dịch vụ khác → DV.
 */
export type TourCategory =
  | 'incentive_domestic'
  | 'incentive_intl'
  | 'visa'
  | 'event'
  | 'other';

/** Cờ trạng thái THỦ CÔNG của hồ sơ (KHÔNG phải giai đoạn deal — giai đoạn vẫn
 *  suy ra từ báo giá chính qua `dealStage`). */
export type TourProfileStatus = 'open' | 'archived';

/** Yêu cầu duyệt XOÁ hồ sơ — người dưới Trưởng Phòng phải gửi cho 1 người duyệt. */
export type DeleteRequest = {
  /** Người gửi yêu cầu. */
  byU: string;
  byName: string;
  /** Người được chọn để duyệt (username + tên). */
  approverU: string;
  approverName: string;
  reason?: string;
  requestedAt: string;
};

/**
 * Hồ sơ tour (Tour Profile) — aggregate root MỎNG làm trung tâm liên kết.
 *
 * Sở hữu DANH TÍNH (mã `code`), CHỦ SỞ HỮU + cộng tác viên (Collab, sửa được) +
 * người theo dõi (Follow, chỉ xem + nhận thông báo), và con trỏ tới BÁO GIÁ CHÍNH.
 * KHÔNG lưu giai đoạn/tổng tiền — những thứ đó luôn được suy ra từ các báo giá /
 * hợp đồng liên kết (xem `dealStage.ts`) để tránh "sự thật thứ hai" gây lệch.
 *
 * Một hồ sơ : NHIỀU báo giá (option A/B, gửi lại lần 2…), nhưng chỉ một khách,
 * một ngày khởi hành, một hợp đồng, một quyết toán, một lịch HDV.
 */
export type TourProfile = {
  id: string;
  /** Mã hồ sơ: `NĐ.DD.MM.YY.NN` (nội địa) / `NN.DD.MM.YY.NN` (nước ngoài). Duy nhất. */
  code: string;
  kind: TourKind;
  /** Phân loại nghiệp vụ (5 loại). Hồ sơ cũ suy từ `kind` khi thiếu. */
  category?: TourCategory;
  name: string;
  customerId?: string;
  customerName?: string;
  dest?: string;
  /** Ngày khởi hành (yyyy-mm-dd) — đồng bộ từ báo giá chính. */
  startDate?: string | null;
  /** Số lượng khách — đồng bộ từ báo giá chính. */
  pax?: number;
  /** cloudId của BÁO GIÁ CHÍNH → Cockpit suy giai đoạn/tổng từ đây. */
  primaryQuoteId?: string;
  status: TourProfileStatus;
  note?: string;
  // ── Chủ sở hữu & chia sẻ (khớp OwnedRecord ở recordAccess.ts) ──
  createdByU?: string;      // username người tạo
  createdBy?: string;       // tên người tạo
  collaborators?: Collaborator[]; // đồng sở hữu — SỬA được
  followers?: Collaborator[];     // theo dõi — chỉ XEM + nhận thông báo
  eventStaff?: Collaborator[];    // Nhân sự event — XEM + nhận thông báo (vai trò riêng)
  /** Yêu cầu duyệt xoá đang chờ (người dưới Trưởng Phòng gửi). */
  deleteRequest?: DeleteRequest | null;
  createdAt: string;
  updatedAt?: string;
  updatedBy?: string;
};
