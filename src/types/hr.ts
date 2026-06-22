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
