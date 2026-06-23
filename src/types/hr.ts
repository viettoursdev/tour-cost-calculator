import type { Department } from './user';

/** Trạng thái lao động của nhân viên in-house. */
export type EmploymentStatus = 'probation' | 'official' | 'resigned';

export const EMPLOYMENT_STATUS_LABEL: Record<EmploymentStatus, string> = {
  probation: 'Thử việc',
  official: 'Chính thức',
  resigned: 'Đã nghỉ',
};

/** Một giấy tờ pháp lý của nhân viên (HĐLĐ, bằng cấp, chứng chỉ, BHXH…). */
export type HrDocument = {
  id: string;            // legacy_id (ổn định cho client)
  kind: string;          // HĐLĐ | Bằng cấp | Chứng chỉ | BHXH | CCCD…
  name: string;
  fileUrl?: string;      // R2
  issuedAt?: string;     // ISO yyyy-mm-dd
  expiresAt?: string;    // ISO yyyy-mm-dd — bỏ trống = không hết hạn
  notes?: string;
};

export type EmergencyContact = {
  name?: string;
  phone?: string;
  relation?: string;     // quan hệ (vợ/chồng/bố/mẹ…)
};

/** Trạng thái HDV cộng tác viên trong pool. */
export type GuideStatus = 'active' | 'paused' | 'blacklist';

export const GUIDE_STATUS_LABEL: Record<GuideStatus, string> = {
  active: 'Đang cộng tác',
  paused: 'Tạm dừng',
  blacklist: 'Ngừng hợp tác',
};

/** Một HDV cộng tác viên (freelance) trong pool — do điều hành quản lý, KHÔNG đăng nhập. */
export type HrGuide = {
  id: string;            // legacy_id
  fullName: string;
  phone: string;
  email: string;
  guideCardNo: string;   // số thẻ HDV
  guideCardExpires?: string; // ISO yyyy-mm-dd — nhắc hết hạn 90/30 ngày
  languages: string[];   // ngôn ngữ phục vụ
  regions: string[];     // tuyến/vùng phục vụ
  rating?: number;       // 0–5 sao
  status: GuideStatus;
  dayRate?: number;      // thù lao/ngày tham khảo (VND)
  notes: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
};

/** Hồ sơ một nhân viên in-house. KHÔNG đồng nhất với tài khoản đăng nhập (profiles). */
export type HrEmployee = {
  id: string;            // legacy_id
  employeeCode: string;  // mã NV nội bộ
  fullName: string;
  email: string;
  phone: string;
  dob?: string;          // ISO
  gender?: 'male' | 'female' | 'other' | '';
  avatarUrl?: string;
  department: Department | '';  // id phòng ban
  title: string;         // chức danh
  level: string;         // cấp bậc
  managerId?: string;    // legacy_id của quản lý trực tiếp → org chart
  status: EmploymentStatus;
  joinDate?: string;     // ISO
  resignDate?: string;   // ISO
  emergencyContact?: EmergencyContact;
  careerPathId?: string; // móc sẵn cho Đợt 3 (khung năng lực)
  profileEmail?: string; // liên kết tùy chọn tới profiles.email
  notes: string;
  documents: HrDocument[];
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
};
