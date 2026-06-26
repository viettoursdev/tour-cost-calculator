import type {
  TrainingProgram, TrainingModule, TrainingEnrollment, ModuleProgress,
  TrainingPhase, QuizQuestion, HrEvaluation, HrEmployee, User, Department,
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

export type TrainingAnalytics = {
  totalLearners: number;
  active: number;
  certified: number;
  certRate: number;                       // %
  avgProgress: number;                    // % tiến độ trung bình (học viên đang học)
  avgDaysToCert: number | null;           // ngày trung bình từ bắt đầu → chứng nhận
  byDept: { dept: Department; total: number; certified: number; avgProgress: number }[];
  mentorLoad: { mentor: string; count: number }[];
  bottlenecks: { code: string; title: string; stuck: number }[];   // module nhiều người chưa qua
};

/** Tổng hợp số liệu đào tạo cho dashboard (Kirkpatrick L4). `programs` nên gồm cả
 *  seed để tra cứu được mọi enrollment. Thuần → test được. */
export function trainingAnalytics(
  programs: TrainingProgram[], enrollments: TrainingEnrollment[],
): TrainingAnalytics {
  const byId = (id?: string) => programs.find((p) => p.id === id);
  const totalLearners = enrollments.length;
  const certified = enrollments.filter((e) => e.status === 'certified').length;
  const active = enrollments.filter((e) => e.status === 'active').length;

  // Tiến độ trung bình của học viên đang học.
  const activeProgs = enrollments
    .filter((e) => e.status === 'active')
    .map((e) => { const p = byId(e.programId); return p ? programProgressPct(p, e) : null; })
    .filter((x): x is number => x != null);
  const avgProgress = activeProgs.length
    ? Math.round(activeProgs.reduce((a, b) => a + b, 0) / activeProgs.length) : 0;

  // Ngày trung bình đạt chứng nhận.
  const spans = enrollments
    .filter((e) => e.status === 'certified' && e.startDate && e.certifiedAt)
    .map((e) => (new Date(e.certifiedAt as string).getTime() - new Date(e.startDate as string).getTime()) / 86400000)
    .filter((d) => d >= 0);
  const avgDaysToCert = spans.length ? Math.round(spans.reduce((a, b) => a + b, 0) / spans.length) : null;

  // Theo phòng ban.
  const deptMap = new Map<Department, { total: number; certified: number; sumProg: number; nProg: number }>();
  for (const e of enrollments) {
    const d = e.department;
    if (!deptMap.has(d)) deptMap.set(d, { total: 0, certified: 0, sumProg: 0, nProg: 0 });
    const row = deptMap.get(d)!;
    row.total += 1;
    if (e.status === 'certified') row.certified += 1;
    const p = byId(e.programId);
    if (p) { row.sumProg += programProgressPct(p, e); row.nProg += 1; }
  }
  const byDept = [...deptMap.entries()].map(([dept, r]) => ({
    dept, total: r.total, certified: r.certified,
    avgProgress: r.nProg ? Math.round(r.sumProg / r.nProg) : 0,
  })).sort((a, b) => b.total - a.total);

  // Tải mentor (chỉ học viên đang học).
  const mentorMap = new Map<string, number>();
  for (const e of enrollments) {
    if (e.status === 'active' && e.mentorUsername) {
      mentorMap.set(e.mentorUsername, (mentorMap.get(e.mentorUsername) ?? 0) + 1);
    }
  }
  const mentorLoad = [...mentorMap.entries()].map(([mentor, count]) => ({ mentor, count }))
    .sort((a, b) => b.count - a.count);

  // Module "kẹt": học viên đang học chưa hoàn tất module đó.
  const stuckMap = new Map<string, { code: string; title: string; stuck: number }>();
  for (const e of enrollments) {
    if (e.status !== 'active') continue;
    const p = byId(e.programId);
    if (!p) continue;
    for (const m of p.modules) {
      if (isModuleComplete(m, e.progress[m.id])) continue;
      const key = `${p.id}:${m.id}`;
      const cur = stuckMap.get(key) ?? { code: m.code, title: m.title, stuck: 0 };
      cur.stuck += 1;
      stuckMap.set(key, cur);
    }
  }
  const bottlenecks = [...stuckMap.values()].sort((a, b) => b.stuck - a.stuck).slice(0, 6);

  return {
    totalLearners, active, certified,
    certRate: totalLearners ? Math.round((certified / totalLearners) * 100) : 0,
    avgProgress, avgDaysToCert, byDept, mentorLoad, bottlenecks,
  };
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

/** Chương trình phù hợp nhất để tự ghi danh theo phòng ban: ưu tiên bản đã lưu &
 *  published của phòng, rồi đến mẫu dựng sẵn. */
export function pickProgramForDept(programs: TrainingProgram[], dept: Department): TrainingProgram | undefined {
  return programs.find((p) => p.department === dept && p.isPublished && !p.isSeed)
    ?? programs.find((p) => p.department === dept);
}

/** Khớp hồ sơ nhân sự → tài khoản đăng nhập qua email (để học viên tự thấy lộ
 *  trình). Không khớp được thì dùng email/id làm định danh tạm. */
export function resolveLearner(emp: HrEmployee, users: User[]): { u: string; name: string } {
  const email = (emp.profileEmail || emp.email || '').toLowerCase();
  const u = email ? users.find((x) => (x.email || '').toLowerCase() === email) : undefined;
  return u ? { u: u.u, name: u.name } : { u: email || emp.id, name: emp.fullName };
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
