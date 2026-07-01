import { describe, it, expect } from 'vitest';
import { PROCESS_SEED, seedTemplatesFor, DEPT_COLOR, DEPT_ICON } from './processSeed';
import type { Department } from '@/types';

const REQUIRED_DEPTS: Department[] = ['dh_noidia', 'dh_nuocngoai', 'hdv', 'visa', 'ketoan'];

describe('PROCESS_SEED', () => {
  it('covers all 5 target departments', () => {
    for (const d of REQUIRED_DEPTS) {
      expect(seedTemplatesFor(d).length).toBeGreaterThan(0);
    }
  });

  it('every seed template is read-only, published, with non-empty steps', () => {
    for (const t of PROCESS_SEED) {
      expect(t.isSeed).toBe(true);
      expect(t.isPublished).toBe(true);
      expect(t.steps.length).toBeGreaterThan(0);
      expect(t.icon).toBe(DEPT_ICON[t.department]);
      expect(t.color).toBe(DEPT_COLOR[t.department]);
    }
  });

  it('all step ids are globally unique and carry SOP fields', () => {
    const ids = new Set<string>();
    for (const t of PROCESS_SEED) {
      for (const s of t.steps) {
        expect(ids.has(s.id)).toBe(false);
        ids.add(s.id);
        expect(s.status).toBe('todo');
        expect(s.ownerDept).toBe(t.department);
        expect(s.output).toBeTruthy();
        expect(s.dueRule).toBeTruthy();
        // dueOffset chỉ có khi dueRule là T±N / "Ngày khởi hành"; luôn là number khi có.
        if (s.dueOffset != null) expect(typeof s.dueOffset).toBe('number');
      }
    }
  });

  it('derives numeric dueOffset for T±N rules so runs can auto-fill Hạn', () => {
    const steps = seedTemplatesFor('ketoan')[0].steps;
    // "T+3 sau tour" → -3 (sau mốc); ít nhất 1 bước có dueOffset để nhắc hạn chạy được.
    expect(steps.some((s) => s.dueOffset != null)).toBe(true);
    const t3 = steps.find((s) => s.dueRule === 'T+3 sau tour');
    expect(t3?.dueOffset).toBe(-3);
  });
});
