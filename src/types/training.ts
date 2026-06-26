import type { Department } from './user';

// ── Đào tạo nhân viên mới (Training / Onboarding) ───────────────────────────
// Hai lớp, đối xứng với Quy trình phòng ban (`process`):
//  • TrainingProgram — curriculum chuẩn của 1 phòng/cấp (1 lần, dùng nhiều lần).
//    Bản dựng sẵn trong code có `isSeed = true` (chỉ đọc tới khi "Dùng mẫu"
//    → clone vào DB). Modules nhúng trực tiếp dạng mảng (giống ProcessTemplate.steps).
//  • TrainingEnrollment — 1 học viên ghi danh 1 program, theo dõi tiến độ từng
//    module + gate + chứng nhận.

/** 4 giai đoạn theo khung 30-60-90 (GĐ0 hội nhập → GĐ3 tự chủ). */
export type TrainingPhase = 'gd0' | 'gd1' | 'gd2' | 'gd3';

export const TRAINING_PHASES: { id: TrainingPhase; label: string; hint: string }[] = [
  { id: 'gd0', label: 'GĐ0 · Hội nhập', hint: 'Tuần 1 — văn hoá, bảo mật, hệ thống' },
  { id: 'gd1', label: 'GĐ1 · Nền tảng', hint: 'Ngày 8–30 — nghiệp vụ lõi' },
  { id: 'gd2', label: 'GĐ2 · Có giám sát', hint: 'Ngày 31–60 — áp dụng dưới giám sát' },
  { id: 'gd3', label: 'GĐ3 · Tự chủ', hint: 'Ngày 61–90 — độc lập & chứng nhận' },
];

/** Một câu hỏi trắc nghiệm (1 đáp án đúng). */
export type QuizQuestion = {
  id: string;
  q: string;
  options: string[];
  answer: number;     // chỉ số đáp án đúng trong options
  explain?: string;
};

/** Một module học (bài học có mục tiêu + nội dung + thực hành + quiz). */
export type TrainingModule = {
  id: string;
  code: string;                 // VD "OB-202"
  phase: TrainingPhase;
  title: string;
  objective: string;            // learning objective — "Sau bài này bạn làm được X"
  contentMd?: string;           // nội dung (markdown nhẹ, render qua richText)
  resources?: { label: string; url?: string }[];
  practice?: string[];          // việc thực hành (70-20-10)
  quiz?: QuizQuestion[];
  requiresMentorSignoff?: boolean;
  estimateDays?: number;
};

/** Curriculum chuẩn của 1 phòng/cấp. */
export type TrainingProgram = {
  id: string;
  department: Department;
  roleTarget?: string;          // cấp đầu ra, VD "L2"
  name: string;
  description?: string;
  certTitle?: string;           // "Qualified Outbound Operator (L2)"
  icon?: string;
  color?: string;
  modules: TrainingModule[];
  version: number;
  isPublished: boolean;
  /** true = bản mẫu dựng sẵn trong code (chỉ đọc), CHƯA lưu DB. */
  isSeed?: boolean;
  createdByUsername?: string;
  createdByName?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type ModuleStatus = 'todo' | 'in_progress' | 'done';

/** Tiến độ học viên ở 1 module. */
export type ModuleProgress = {
  status: ModuleStatus;
  quizScore?: number;           // % đúng (0–100)
  practiceDone?: boolean;       // đã tick hoàn thành thực hành
  signoffBy?: string;           // username mentor đã ký
  signoffAt?: string;           // ISO
  completedAt?: string;         // ISO
};

export type GateState = 'open' | 'pass';

export type EnrollmentStatus = 'active' | 'certified' | 'paused' | 'dropped';

/** 1 học viên ghi danh 1 program. */
export type TrainingEnrollment = {
  id: string;
  programId?: string;
  employeeId?: string;          // FK hr_employees (uuid) — tuỳ chọn ở Đợt 1
  learnerUsername: string;      // học viên (để tự xem)
  learnerName?: string;
  mentorUsername?: string;      // người ký sign-off
  department: Department;
  status: EnrollmentStatus;
  startDate?: string;           // ISO yyyy-mm-dd
  progress: Record<string, ModuleProgress>;   // moduleId → tiến độ
  gates: Partial<Record<TrainingPhase, GateState>>;
  certifiedAt?: string;
  certCode?: string;
  createdByUsername?: string;
  createdByName?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
};

/** Ngưỡng đậu quiz mặc định (Kirkpatrick cấp 2). */
export const QUIZ_PASS_PCT = 80;
