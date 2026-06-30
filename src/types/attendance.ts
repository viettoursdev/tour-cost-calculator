/**
 * Chấm công theo NGÀY bằng mã công (timesheet) — 1 bản ghi = 1 nhân viên × 1 tháng.
 * Giữ đúng quy ước file Excel của bộ phận nhân sự Viettours (mã `X`, `P`, `NB`…).
 * KHÔNG chấm công theo giờ vào/ra.
 */

/** Phân loại nghiệp vụ của một mã công (quyết định cách cộng dồn & màu hiển thị). */
export type AttendanceCategory =
  | 'work'          // đi làm / công tác (tính công)
  | 'leave_paid'    // nghỉ hưởng lương (phép năm, nghỉ bù)
  | 'leave_unpaid'  // nghỉ không lương
  | 'sick'          // ốm đau / thai sản (BHXH)
  | 'holiday'       // lễ / tết
  | 'half'          // nửa làm nửa nghỉ (giá trị công 0.5–1)
  | 'other';        // khác / chưa phân loại

/** Định nghĩa một mã công. `attendanceCodes.ts` là nguồn chân lý, HR tinh chỉnh được. */
export type AttendanceCodeDef = {
  code: string;               // mã hiển thị trong ô (vd "X", "P", "XC/2")
  label: string;              // diễn giải tiếng Việt
  work: number;               // số công quy đổi (0, 0.5, 1) — cộng vào "SỐ NGÀY HC"
  worked: number;             // phần ĐI LÀM THẬT (0, 0.5, 1) — cho dải phân bổ; mã nghỉ = 0
  paid: boolean;              // có hưởng lương công ty hay không
  category: AttendanceCategory;
  color: string;              // màu nền ô trên lưới Gantt (hex)
};

/** Một ô chấm công của một ngày cụ thể. */
export type AttendanceCell = {
  code: string;               // mã công (khoá vào AttendanceCodeDef.code)
  note?: string;              // ghi chú riêng cho ngày (vd "Quên chấm công có báo")
};

/** Bản đồ ngày → ô. Khoá là ISO `YYYY-MM-DD`. Ngày trống = không có khoá. */
export type AttendanceDays = Record<string, AttendanceCell>;

/** Tổng hợp một tháng công của một nhân viên (tính sẵn từ `days`). */
export type AttendanceSummary = {
  totalHC: number;            // SỐ NGÀY HC = Σ work của các ô
  present: number;            // số ngày đi làm/công tác (category 'work' + phần làm của 'half')
  paidLeave: number;          // số ngày nghỉ hưởng lương (phép/nghỉ bù)
  unpaidLeave: number;        // số ngày nghỉ không lương
  sick: number;               // số ngày ốm/thai sản
  holiday: number;            // số ngày lễ
  byCode: Record<string, number>; // phân bổ theo mã (cho biểu đồ donut)
  unknownCodes: string[];     // các mã không nhận diện (distinct) — cần HR bổ sung từ điển
};

/** Trạng thái kỳ công. */
export type AttendanceStatus = 'draft' | 'published' | 'locked';

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  draft: 'Nháp',
  published: 'Đã công bố',
  locked: 'Đã khoá',
};

/** Trạng thái xác nhận của nhân viên với bảng công của mình. */
export type AttendanceConfirmStatus = 'pending' | 'confirmed' | 'disputed';

export const ATTENDANCE_CONFIRM_LABEL: Record<AttendanceConfirmStatus, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  disputed: 'Báo sai sót',
};

/** Kết quả xác nhận của nhân viên (gắn trực tiếp trên bản ghi). */
export type AttendanceConfirmation = {
  status: AttendanceConfirmStatus;
  at?: string;                // ISO thời điểm xác nhận/phản hồi gần nhất
  note?: string;              // ghi chú khi báo sai sót
};

/** Một phản hồi của nhân viên gửi bộ phận nhân sự. */
export type AttendanceFeedback = {
  id: string;
  at: string;                 // ISO
  byName: string;             // tên nhân viên gửi
  type: 'confirm' | 'dispute';
  note: string;
};

/** Nguồn nhập một bản ghi công. */
export type AttendanceSource = 'excel' | 'manual' | 'self';

/** Một bảng công tháng của một nhân viên (1 dòng / NV × tháng). */
export type HrAttendance = {
  id: string;                 // legacy_id (ổn định cho client)
  employeeLegacyId: string;   // → HrEmployee.id (legacy_id)
  employeeCode: string;       // mã NV nội bộ (khớp cột "MÃ NV" trong file)
  fullName: string;           // tên (snapshot để hiển thị/đối chiếu khi import)
  department: string;         // phòng ban (để scope theo phòng)
  period: string;             // kỳ công "YYYY-MM"
  days: AttendanceDays;
  summary: AttendanceSummary;
  status: AttendanceStatus;
  confirmation: AttendanceConfirmation;
  feedback: AttendanceFeedback[];
  source: AttendanceSource;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
};
