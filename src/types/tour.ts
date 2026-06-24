import type { Collaborator } from './quote';

/** Phân loại hồ sơ tour → tiền tố mã code. */
export type TourKind = 'domestic' | 'intl';

/** Cờ trạng thái THỦ CÔNG của hồ sơ (KHÔNG phải giai đoạn deal — giai đoạn vẫn
 *  suy ra từ báo giá chính qua `dealStage`). */
export type TourProfileStatus = 'open' | 'archived';

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
  createdAt: string;
  updatedAt?: string;
  updatedBy?: string;
};
