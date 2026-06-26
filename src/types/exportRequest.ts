/**
 * Yêu cầu DUYỆT XUẤT FILE (Excel) — dùng cho các bản xuất nhạy cảm cần Trưởng Phòng
 * trở lên (CEO / Ban Giám Đốc / Trưởng Phòng) chấp thuận. Nhân viên dưới quyền gửi
 * yêu cầu (`pending`); người duyệt chuyển `approved`/`rejected`. Khi đã `approved`,
 * người gửi tải file một lần rồi yêu cầu được tiêu thụ (xoá).
 */
export type ExportRequestStatus = 'pending' | 'approved' | 'rejected';

/** Phạm vi xuất — hiện chỉ có danh sách hồ sơ tour; để mở rộng về sau. */
export type ExportScope = 'tour_profiles';

export type ExportRequest = {
  id: string;
  scope: ExportScope;
  /** Mô tả ngắn nội dung xuất (vd "10 hồ sơ tour"). */
  detail?: string;
  status: ExportRequestStatus;
  requestedByU?: string;
  requestedByName?: string;
  requestedAt: string;
  decidedByName?: string;
  decidedAt?: string;
  rejectReason?: string;
};
