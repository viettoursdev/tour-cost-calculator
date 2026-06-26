import { describe, it, expect } from 'vitest';
import {
  scoreQuiz, isModuleComplete, isPhasePassed, programProgressPct,
  isCertEligible, currentPhase, averageQuizScore, buildCertEvaluation,
  pickProgramForDept, resolveLearner, trainingAnalytics,
} from './training';
import type {
  TrainingProgram, TrainingModule, TrainingEnrollment, QuizQuestion, ModuleProgress,
  HrEmployee, User,
} from '@/types';

const q = (id: string, answer: number): QuizQuestion => ({ id, q: id, options: ['a', 'b', 'c'], answer });

const mod = (id: string, phase: TrainingModule['phase'], extra: Partial<TrainingModule> = {}): TrainingModule => ({
  id, code: id.toUpperCase(), phase, title: id, objective: 'obj', ...extra,
});

const program = (modules: TrainingModule[]): TrainingProgram => ({
  id: 'p1', department: 'dh_nuocngoai', name: 'Test', modules, version: 1, isPublished: true,
});

const enroll = (progress: Record<string, ModuleProgress>): TrainingEnrollment => ({
  id: 'e1', learnerUsername: 'an', department: 'dh_nuocngoai', status: 'active', progress, gates: {},
});

describe('scoreQuiz', () => {
  it('empty quiz scores 100', () => {
    expect(scoreQuiz([], {})).toBe(100);
  });
  it('counts correct answers as percentage', () => {
    const qs = [q('a', 0), q('b', 1), q('c', 2), q('d', 0)];
    expect(scoreQuiz(qs, { a: 0, b: 1, c: 2, d: 0 })).toBe(100);
    expect(scoreQuiz(qs, { a: 0, b: 1, c: 0, d: 0 })).toBe(75);
    expect(scoreQuiz(qs, {})).toBe(0);
  });
});

describe('isModuleComplete', () => {
  it('needs passing quiz score', () => {
    const m = mod('m1', 'gd1', { quiz: [q('a', 0)] });
    expect(isModuleComplete(m, { status: 'done', quizScore: 79 })).toBe(false);
    expect(isModuleComplete(m, { status: 'done', quizScore: 80 })).toBe(true);
  });
  it('needs practice tick when practice exists', () => {
    const m = mod('m1', 'gd1', { practice: ['do x'] });
    expect(isModuleComplete(m, { status: 'done' })).toBe(false);
    expect(isModuleComplete(m, { status: 'done', practiceDone: true })).toBe(true);
  });
  it('needs mentor signoff when required', () => {
    const m = mod('m1', 'gd2', { requiresMentorSignoff: true });
    expect(isModuleComplete(m, { status: 'done' })).toBe(false);
    expect(isModuleComplete(m, { status: 'done', signoffBy: 'mentor' })).toBe(true);
  });
  it('a module with no requirements is complete once progress exists', () => {
    const m = mod('m1', 'gd0');
    expect(isModuleComplete(m, undefined)).toBe(false);
    expect(isModuleComplete(m, { status: 'done' })).toBe(true);
  });
});

describe('phase gates & cert', () => {
  const p = program([
    mod('a', 'gd1', { quiz: [q('x', 0)] }),
    mod('b', 'gd1'),
    mod('c', 'gd2', { requiresMentorSignoff: true }),
  ]);

  it('empty phase passes (gd0/gd3 have no modules)', () => {
    const e = enroll({});
    expect(isPhasePassed(p, e, 'gd0')).toBe(true);
    expect(isPhasePassed(p, e, 'gd3')).toBe(true);
  });
  it('phase passes only when all its modules complete', () => {
    expect(isPhasePassed(p, enroll({ a: { status: 'done', quizScore: 90 } }), 'gd1')).toBe(false);
    expect(isPhasePassed(p, enroll({
      a: { status: 'done', quizScore: 90 }, b: { status: 'done' },
    }), 'gd1')).toBe(true);
  });
  it('programProgressPct reflects completed modules', () => {
    expect(programProgressPct(p, enroll({}))).toBe(0);
    expect(programProgressPct(p, enroll({ b: { status: 'done' } }))).toBe(33);
  });
  it('cert needs every phase passed; currentPhase tracks the first open gate', () => {
    const partial = enroll({ a: { status: 'done', quizScore: 90 }, b: { status: 'done' } });
    expect(isCertEligible(p, partial)).toBe(false);
    expect(currentPhase(p, partial)).toBe('gd2');
    const full = enroll({
      a: { status: 'done', quizScore: 90 }, b: { status: 'done' },
      c: { status: 'done', signoffBy: 'mentor' },
    });
    expect(isCertEligible(p, full)).toBe(true);
    expect(currentPhase(p, full)).toBe('gd3');
  });
});

describe('averageQuizScore & buildCertEvaluation', () => {
  const p = program([
    mod('a', 'gd1', { quiz: [q('x', 0)] }),
    mod('b', 'gd1', { quiz: [q('y', 0)] }),
    mod('c', 'gd2'),
  ]);

  it('averages only modules with a recorded quiz score', () => {
    expect(averageQuizScore(p, enroll({}))).toBeUndefined();
    expect(averageQuizScore(p, enroll({
      a: { status: 'done', quizScore: 100 }, b: { status: 'done', quizScore: 80 },
    }))).toBe(90);
  });

  it('builds a finalized HR evaluation tied to an employee', () => {
    const e = enroll({ a: { status: 'done', quizScore: 100 }, b: { status: 'done', quizScore: 80 } });
    const ev = buildCertEvaluation(p, e, {
      employeeId: 'emp1', evalId: 'ev1', reviewerName: 'Sếp', nowISO: '2026-06-26T10:00:00.000Z',
    });
    expect(ev.employeeId).toBe('emp1');
    expect(ev.status).toBe('finalized');
    expect(ev.period).toBe('2026');
    expect(ev.reviewDate).toBe('2026-06-26');
    expect(ev.overallScore).toBeGreaterThanOrEqual(4);
    expect(ev.promotion).toContain('chứng nhận');
  });
});

describe('pickProgramForDept & resolveLearner', () => {
  const seed: TrainingProgram = { ...program([]), id: 's', isSeed: true, isPublished: true, department: 'visa' };
  const mine: TrainingProgram = { ...program([]), id: 'm', isSeed: false, isPublished: true, department: 'visa' };

  it('prefers a published non-seed program for the department, else seed', () => {
    expect(pickProgramForDept([seed, mine], 'visa')?.id).toBe('m');
    expect(pickProgramForDept([seed], 'visa')?.id).toBe('s');
    expect(pickProgramForDept([seed, mine], 'muahang')).toBeUndefined();
  });

  const emp = (over: Partial<HrEmployee>): HrEmployee => ({
    id: 'e1', employeeCode: 'NV1', fullName: 'Nguyễn Văn A', email: 'a@viettours.com.vn',
    phone: '', department: 'visa', title: '', level: '', status: 'official', notes: '',
    documents: [], createdAt: '', createdBy: '', ...over,
  });
  const user = (over: Partial<User>): User => ({ u: 'an', role: 'Operations', name: 'An', color: '#000', ...over });

  it('matches an employee to a login user by email, else falls back', () => {
    const users = [user({ u: 'an', email: 'a@viettours.com.vn', name: 'An VT' })];
    expect(resolveLearner(emp({}), users)).toEqual({ u: 'an', name: 'An VT' });
    expect(resolveLearner(emp({ email: 'nobody@x.com' }), users)).toEqual({ u: 'nobody@x.com', name: 'Nguyễn Văn A' });
  });
});

describe('trainingAnalytics', () => {
  const p: TrainingProgram = {
    ...program([mod('a', 'gd1'), mod('b', 'gd2')]), id: 'p1', department: 'visa',
  };
  const e = (over: Partial<TrainingEnrollment>): TrainingEnrollment => ({
    id: 'x', programId: 'p1', learnerUsername: 'u', department: 'visa', status: 'active',
    progress: {}, gates: {}, ...over,
  });

  it('summarises learners, cert rate, dept rows, mentor load and bottlenecks', () => {
    const a = trainingAnalytics([p], [
      e({ id: 'e1', status: 'certified', startDate: '2026-01-01', certifiedAt: '2026-01-11T00:00:00.000Z' }),
      e({ id: 'e2', status: 'active', mentorUsername: 'men', progress: { a: { status: 'done' } } }),
      e({ id: 'e3', status: 'active', mentorUsername: 'men' }),
    ]);
    expect(a.totalLearners).toBe(3);
    expect(a.certified).toBe(1);
    expect(a.active).toBe(2);
    expect(a.certRate).toBe(33);
    expect(a.avgDaysToCert).toBe(10);
    expect(a.byDept[0]).toMatchObject({ dept: 'visa', total: 3, certified: 1 });
    expect(a.mentorLoad[0]).toEqual({ mentor: 'men', count: 2 });
    // 'b' chưa ai làm (2 active) → kẹt nhất; 'a' chỉ 1 active chưa làm.
    expect(a.bottlenecks[0]).toMatchObject({ code: 'B', stuck: 2 });
  });

  it('handles empty input', () => {
    const a = trainingAnalytics([], []);
    expect(a.totalLearners).toBe(0);
    expect(a.certRate).toBe(0);
    expect(a.avgDaysToCert).toBeNull();
    expect(a.bottlenecks).toEqual([]);
  });
});
