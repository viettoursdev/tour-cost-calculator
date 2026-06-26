import { describe, it, expect } from 'vitest';
import {
  scoreQuiz, isModuleComplete, isPhasePassed, programProgressPct,
  isCertEligible, currentPhase,
} from './training';
import type {
  TrainingProgram, TrainingModule, TrainingEnrollment, QuizQuestion, ModuleProgress,
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
