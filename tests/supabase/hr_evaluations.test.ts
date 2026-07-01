import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbUpsertHrEvaluation, sbDeleteHrEvaluation, sbSubscribeHrEvaluations } from '../../src/lib/supabase';
import type { HrEvaluation } from '../../src/types';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

const evalOf = (over: Partial<HrEvaluation>): HrEvaluation => ({
  id: 'ev-x', employeeId: 'emp-1', period: '2026-Q2', reviewerName: 'QA',
  competencies: [], kpis: [], strengths: '', improvements: '', nextGoals: '', promotion: '',
  status: 'draft' as HrEvaluation['status'], createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'tester', ...over,
});

describe('hr_evaluations gateway', () => {
  beforeEach(async () => { await truncate(['hr_evaluations']); });

  it('sbUpsertHrEvaluation per-row: sửa 1 đánh giá KHÔNG đụng đánh giá khác (chống wipe song song)', async () => {
    const c = await getViettoursClient();
    await sbUpsertHrEvaluation(evalOf({ id: 'ev-a', reviewerName: 'A' }), { name: 'QA', role: 'Trưởng Phòng' }, c);
    await sbUpsertHrEvaluation(evalOf({ id: 'ev-b', reviewerName: 'B' }), { name: 'QA', role: 'Trưởng Phòng' }, c);
    // Sửa chỉ ev-a — ev-b PHẢI còn nguyên (trước đây full-overwrite theo danh sách cũ sẽ xoá ev-b).
    await sbUpsertHrEvaluation(evalOf({ id: 'ev-a', reviewerName: 'A2' }), { name: 'QA', role: 'Trưởng Phòng' }, c);
    let list = await once<HrEvaluation[]>((cb) => sbSubscribeHrEvaluations(cb, c));
    expect(list.map((e) => e.id).sort()).toEqual(['ev-a', 'ev-b']);
    expect(list.find((e) => e.id === 'ev-a')!.reviewerName).toBe('A2');

    // Xoá thật qua targeted sbDeleteHrEvaluation.
    await sbDeleteHrEvaluation('ev-b', c);
    list = await once<HrEvaluation[]>((cb) => sbSubscribeHrEvaluations(cb, c));
    expect(list.map((e) => e.id)).toEqual(['ev-a']);
  });
});
