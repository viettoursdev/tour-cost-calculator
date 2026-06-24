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

// ── Đợt 3: Đánh giá / KPI / Lộ trình ──────────────────────────────────────────

/** Một tiêu chí năng lực được chấm điểm trong kỳ đánh giá. */
export type EvalCompetency = {
  id: string;
  name: string;       // tên năng lực (vd "Kỹ năng điều hành tour")
  score: number;      // 0–5
  weight?: number;    // trọng số (%) — tùy chọn
  comment?: string;
};

/** Một chỉ tiêu KPI: mục tiêu vs thực đạt. */
export type EvalKpi = {
  id: string;
  name: string;
  target: string;     // mục tiêu (số/chuỗi)
  actual: string;     // thực đạt
  score?: number;     // 0–5 quy đổi
  comment?: string;
};

export type EvalStatus = 'draft' | 'finalized';

export const EVAL_STATUS_LABEL: Record<EvalStatus, string> = {
  draft: 'Nháp',
  finalized: 'Đã chốt',
};

/** Một kỳ đánh giá nhân sự (quý/năm). Gắn vào một `HrEmployee` qua employeeId. */
export type HrEvaluation = {
  id: string;            // legacy_id
  employeeId: string;    // HrEmployee.id (legacy_id)
  period: string;        // vd "2026-Q2" hoặc "2026"
  reviewDate?: string;   // ISO
  reviewerName: string;  // người đánh giá
  competencies: EvalCompetency[];
  kpis: EvalKpi[];
  overallScore?: number; // 0–5 tổng hợp
  strengths: string;     // điểm mạnh
  improvements: string;  // cần cải thiện
  nextGoals: string;     // mục tiêu kỳ tới
  promotion: string;     // đề xuất thăng tiến / lộ trình
  status: EvalStatus;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
};

// ── Đợt 7: Nghỉ phép ──────────────────────────────────────────────────────────

export type LeaveType = 'annual' | 'unpaid' | 'sick' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  annual: 'Phép năm',
  unpaid: 'Không lương',
  sick: 'Nghỉ ốm',
  other: 'Khác',
};

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  cancelled: 'Đã huỷ',
};

/** Một đơn nghỉ phép của nhân viên. */
export type HrLeave = {
  id: string;            // legacy_id
  employeeId: string;    // HrEmployee.id
  type: LeaveType;
  startDate?: string;    // ISO
  endDate?: string;      // ISO
  days: number;          // số ngày nghỉ (0.5 = nửa ngày)
  reason: string;
  status: LeaveStatus;
  approverName: string;
  decidedAt?: string;
  decisionNote: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
};

// ── Đợt 4: Tuyển dụng (ATS) ───────────────────────────────────────────────────

export type JobStatus = 'open' | 'onhold' | 'closed';

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  open: 'Đang tuyển',
  onhold: 'Tạm dừng',
  closed: 'Đã đóng',
};

/** Tin tuyển dụng (job requisition). */
export type HrJobPosting = {
  id: string;            // legacy_id
  title: string;
  department: Department | '';
  level: string;
  headcount: number;     // số lượng cần tuyển
  salaryRange: string;   // mức lương dự kiến (chuỗi tự do)
  status: JobStatus;
  description: string;   // JD / mô tả
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
};

/** Giai đoạn của ứng viên trong pipeline (Kanban). */
export type CandidateStage = 'new' | 'screening' | 'interview1' | 'interview2' | 'offer' | 'hired' | 'rejected';

export const CANDIDATE_STAGE_ORDER: CandidateStage[] = ['new', 'screening', 'interview1', 'interview2', 'offer', 'hired', 'rejected'];

export const CANDIDATE_STAGE_LABEL: Record<CandidateStage, string> = {
  new: 'Mới',
  screening: 'Sàng lọc CV',
  interview1: 'Phỏng vấn 1',
  interview2: 'Phỏng vấn 2',
  offer: 'Offer',
  hired: 'Nhận việc',
  rejected: 'Loại',
};

/** Một ghi chú đánh giá theo vòng phỏng vấn. */
export type CandidateNote = {
  id: string;
  at: string;        // ISO
  byName: string;
  stage: CandidateStage;
  text: string;
};

/** Hồ sơ ứng viên trong ATS. */
export type HrCandidate = {
  id: string;            // legacy_id
  postingId?: string;    // HrJobPosting.id (legacy_id) — tùy chọn
  fullName: string;
  phone: string;
  email: string;
  source: string;        // nguồn ứng tuyển
  position: string;      // vị trí ứng tuyển (free text nếu không gắn posting)
  department: Department | '';
  cvUrl?: string;        // link CV (R2/ngoài)
  stage: CandidateStage;
  rating?: number;       // 0–5
  appliedDate?: string;  // ISO
  notes: string;
  interviewNotes: CandidateNote[];
  convertedEmployeeId?: string; // HrEmployee.id sau khi "Nhận việc"
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
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
