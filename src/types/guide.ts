/**
 * Lịch đi tour của Hướng dẫn viên (HDV). Kho dữ liệu RIÊNG (`viettours/guide_schedule`)
 * — không nằm trong báo giá. Lịch bay seed từ chuyến bay của báo giá rồi CHỈNH được
 * theo thực tế (override). Hỗ trợ HDV freelance ngoài danh sách nhân sự + bắt trùng lịch.
 */

/** Một HDV: nhân sự nội bộ (`u` = username) hoặc freelance (id tự sinh). */
export type GuideRef = {
  kind: 'staff' | 'freelance';
  id: string;   // staff: user.u · freelance: id nội bộ
  name: string;
};

/** HDV freelance (không có trong danh sách tài khoản). */
export type FreelanceGuide = {
  id: string;
  name: string;
  phone?: string;
  note?: string;
  createdAt?: string;
  createdBy?: string;
};

/** Một chặng bay của HDV trong lịch. `source`='quote' seed từ báo giá; sửa tay → edited. */
export type GuideFlightLeg = {
  id: string;
  guideId: string;       // GuideRef.id
  tourCloudId: string;   // báo giá nguồn
  flightNo?: string;
  depAirport?: string;
  arrAirport?: string;
  /** Mốc cất cánh / hạ cánh đầy đủ (ISO, đã neo năm từ ngày khởi hành tour). */
  startISO: string;
  endISO: string;
  source: 'quote' | 'manual';
  edited?: boolean;      // đã chỉnh tay so với bản seed từ báo giá
  note?: string;
};

/** Phân công HDV cho một tour + các chặng bay của họ. */
export type TourGuideAssignment = {
  tourCloudId: string;
  tourName: string;
  /** Ngày khởi hành tour (ISO yyyy-mm-dd) — để neo năm khi seed lịch bay. */
  departDate?: string;
  guides: GuideRef[];
  legs: GuideFlightLeg[];
  updatedAt?: string;
  updatedBy?: string;
};

/** Toàn bộ kho lịch HDV (1 doc Firestore). */
export type GuideScheduleDoc = {
  freelancers: FreelanceGuide[];
  /** keyed theo tourCloudId. */
  assignments: Record<string, TourGuideAssignment>;
  updatedAt?: string;
  updatedBy?: string;
};

/** Một cặp chặng bay bị trùng của cùng một HDV (theo thời gian + đệm tối thiểu). */
export type GuideConflict = {
  guideId: string;
  legA: GuideFlightLeg;
  legB: GuideFlightLeg;
  /** 'overlap' = giao thời gian thật; 'buffer' = cách nhau dưới thời gian đệm. */
  kind: 'overlap' | 'buffer';
  /** Số phút giữa kết thúc chặng trước và bắt đầu chặng sau (âm = chồng nhau). */
  gapMins: number;
};
