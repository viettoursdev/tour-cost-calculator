import type {
  TrainingProgram, TrainingModule, TrainingEnrollment, ModuleProgress,
  TrainingPhase, QuizQuestion, HrEvaluation,
} from '@/types';
import { TRAINING_PHASES, QUIZ_PASS_PCT } from '@/types';

// ── Logic thuần cho đào tạo (không phụ thuộc React/DB → test được) ───────────

/** Chấm 1 bài quiz: trả về % đúng (0–100). Mảng rỗng → 100 (không có câu hỏi). */
export function scoreQuiz(questions: QuizQuestion[], answers: Record<string, number>): number {
  if (!questions.length) return 100;
  let correct = 0;
  for (const q of questions) {
    if (answers[q.id] === q.answer) correct += 1;
  }
  return Math.round((correct / questions.length) * 100);
}

/** Một module coi là ĐẠT khi: đậu quiz (nếu có), xong thực hành (nếu có), và
 *  đã được mentor ký (nếu module yêu cầu). */
export function isModuleComplete(m: TrainingModule, p: ModuleProgress | undefined): boolean {
  if (!p) return false;
  const quizOk = !m.quiz?.length || (p.quizScore ?? 0) >= QUIZ_PASS_PCT;
  const practiceOk = !m.practice?.length || !!p.practiceDone;
  const signoffOk = !m.requiresMentorSignoff || !!p.signoffBy;
  return quizOk && practiceOk && signoffOk;
}

/** Các module thuộc 1 giai đoạn, giữ nguyên thứ tự trong program. */
export function modulesOfPhase(program: TrainingProgram, phase: TrainingPhase): TrainingModule[] {
  return program.modules.filter((m) => m.phase === phase);
}

/** Gate 1 giai đoạn ĐẬU khi mọi module của giai đoạn đó hoàn tất. Giai đoạn
 *  không có module nào → coi như đậu (bỏ qua). */
export function isPhasePassed(
  program: TrainingProgram, enrollment: TrainingEnrollment, phase: TrainingPhase,
): boolean {
  const mods = modulesOfPhase(program, phase);
  if (!mods.length) return true;
  return mods.every((m) => isModuleComplete(m, enrollment.progress[m.id]));
}

/** % tiến độ toàn chương trình = số module hoàn tất / tổng module. */
export function programProgressPct(program: TrainingProgram, enrollment: TrainingEnrollment): number {
  const total = program.modules.length;
  if (!total) return 0;
  const done = program.modules.filter((m) => isModuleComplete(m, enrollment.progress[m.id])).length;
  return Math.round((done / total) * 100);
}

/** Đủ điều kiện chứng nhận khi MỌI giai đoạn đều đậu gate. */
export function isCertEligible(program: TrainingProgram, enrollment: TrainingEnrollment): boolean {
  return TRAINING_PHASES.every((ph) => isPhasePassed(program, enrollment, ph.id));
}

/** Giai đoạn hiện tại của học viên = giai đoạn đầu tiên CHƯA đậu gate; nếu xong
 *  hết → 'gd3'. */
export function currentPhase(program: TrainingProgram, enrollment: TrainingEnrollment): TrainingPhase {
  for (const ph of TRAINING_PHASES) {
    if (!isPhasePassed(program, enrollment, ph.id)) return ph.id;
  }
  return 'gd3';
}

/** Đếm module theo trạng thái (cho dashboard). */
export function progressStats(program: TrainingProgram, enrollment: TrainingEnrollment): {
  total: number; done: number; pct: number;
} {
  const total = program.modules.length;
  const done = program.modules.filter((m) => isModuleComplete(m, enrollment.progress[m.id])).length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** Điểm quiz trung bình của học viên (chỉ tính module có quiz). undefined nếu chưa
 *  có module quiz nào được làm. */
export function averageQuizScore(program: TrainingProgram, enrollment: TrainingEnrollment): number | undefined {
  const scores = program.modules
    .filter((m) => m.quiz?.length)
    .map((m) => enrollment.progress[m.id]?.quizScore)
    .filter((s): s is number => typeof s === 'number');
  if (!scores.length) return undefined;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/** Dựng một bản đánh giá HR (đã chốt) khi cấp chứng nhận đào tạo. Học viên phải
 *  được liên kết với một hồ sơ nhân sự (employeeId) thì mới ghi được. */
export function buildCertEvaluation(
  program: TrainingProgram,
  enrollment: TrainingEnrollment,
  opts: { employeeId: string; evalId: string; reviewerName: string; nowISO: string },
): HrEvaluation {
  const avg = averageQuizScore(program, enrollment);
  // Đã đủ điều kiện qua mọi gate → mặc định 4/5, cộng theo điểm quiz nếu cao.
  const overall = avg != null ? Math.max(4, Math.round((avg / 100) * 5)) : 4;
  const cert = program.certTitle ?? `${program.name} (${program.roleTarget ?? 'L2'})`;
  return {
    id: opts.evalId,
    employeeId: opts.employeeId,
    period: opts.nowISO.slice(0, 4),
    reviewDate: opts.nowISO.slice(0, 10),
    reviewerName: opts.reviewerName,
    competencies: [],
    kpis: [],
    overallScore: overall,
    strengths: `Hoàn tất lộ trình đào tạo "${program.name}" — đạt mọi gate 30-60-90.`,
    improvements: '',
    nextGoals: `Củng cố thực chiến ở cấp ${program.roleTarget ?? 'L2'}, hướng tới cấp tiếp theo.`,
    promotion: `Đạt chứng nhận: ${cert}${enrollment.certCode ? ` · Mã ${enrollment.certCode}` : ''}`,
    status: 'finalized',
    createdAt: opts.nowISO,
    createdBy: opts.reviewerName,
  };
}
