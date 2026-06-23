import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import {
  sbSaveProcessTemplate, sbSubscribeProcessTemplates, sbDeleteProcessTemplate,
  sbSaveProcessRun, sbSubscribeProcessRuns, sbDeleteProcessRun,
} from '../../src/lib/supabase';
import type { ProcessRun, ProcessTemplate } from '../../src/types';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

const sampleTemplate = (): ProcessTemplate => ({
  id: 'pt-1',
  department: 'visa',
  name: 'Xử lý hồ sơ visa',
  description: '7 bước chuẩn',
  icon: '🛂',
  color: '#7c3aed',
  version: 1,
  isPublished: true,
  steps: [
    {
      id: 'pt-1::0', label: 'Tiếp nhận yêu cầu', status: 'todo',
      ownerDept: 'visa', output: 'Phiếu thông tin khách', risk: 'Xác định sai loại visa', dueRule: 'Trong ngày',
    },
  ],
  createdByUsername: 'tester',
  createdByName: 'QA Bot',
  createdAt: '2026-01-01T00:00:00.000Z',
});

const sampleRun = (): ProcessRun => ({
  id: 'pr-1',
  templateId: 'pt-1',
  department: 'visa',
  title: 'Visa Schengen — KH Nguyễn Văn A',
  ref: { kind: 'customer', id: 'cust-1', label: 'Nguyễn Văn A' },
  steps: [
    { id: 'rs-0', label: 'Tiếp nhận yêu cầu', status: 'done', ownerDept: 'visa', output: 'Phiếu thông tin khách' },
    { id: 'rs-1', label: 'Đánh giá khả năng đậu', status: 'doing', ownerDept: 'visa' },
  ],
  status: 'active',
  assignee: 'tester',
  startDate: '2026-01-02',
  dueDate: '2026-01-20',
  createdByUsername: 'tester',
  createdByName: 'QA Bot',
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('process_templates gateway', () => {
  beforeEach(async () => {
    await truncate(['process_templates']);
  });

  it('save → list (full, kèm steps) → delete', async () => {
    const c = await getViettoursClient();

    await sbSaveProcessTemplate(sampleTemplate(), 'tester', c);

    const list = await once<ProcessTemplate[]>((cb) => sbSubscribeProcessTemplates(cb, c));
    expect(list).toHaveLength(1);
    const t = list[0];
    expect(t.id).toBe('pt-1');
    expect(t.department).toBe('visa');
    expect(t.name).toBe('Xử lý hồ sơ visa');
    expect(t.isPublished).toBe(true);
    // Các bước (gồm field SOP) round-trip nguyên vẹn qua jsonb.
    expect(t.steps).toHaveLength(1);
    expect(t.steps[0].output).toBe('Phiếu thông tin khách');
    expect(t.steps[0].risk).toBe('Xác định sai loại visa');
    expect(t.steps[0].ownerDept).toBe('visa');
    expect(t.steps[0].dueRule).toBe('Trong ngày');

    await sbDeleteProcessTemplate('pt-1', c);
    const after = await once<ProcessTemplate[]>((cb) => sbSubscribeProcessTemplates(cb, c));
    expect(after).toHaveLength(0);
  });
});

describe('process_runs gateway', () => {
  beforeEach(async () => {
    await truncate(['process_runs']);
  });

  it('save → list (kèm ref + steps trạng thái) → delete', async () => {
    const c = await getViettoursClient();

    await sbSaveProcessRun(sampleRun(), 'tester', c);

    const list = await once<ProcessRun[]>((cb) => sbSubscribeProcessRuns(cb, c));
    expect(list).toHaveLength(1);
    const r = list[0];
    expect(r.id).toBe('pr-1');
    expect(r.templateId).toBe('pt-1');
    expect(r.title).toContain('Visa Schengen');
    expect(r.status).toBe('active');
    expect(r.assignee).toBe('tester');
    expect(r.startDate).toBe('2026-01-02');
    expect(r.dueDate).toBe('2026-01-20');
    // ref (gắn báo giá/khách/visa) round-trip.
    expect(r.ref).toEqual({ kind: 'customer', id: 'cust-1', label: 'Nguyễn Văn A' });
    // steps giữ trạng thái riêng của phiên.
    expect(r.steps).toHaveLength(2);
    expect(r.steps[0].status).toBe('done');
    expect(r.steps[1].status).toBe('doing');

    await sbDeleteProcessRun('pr-1', c);
    const after = await once<ProcessRun[]>((cb) => sbSubscribeProcessRuns(cb, c));
    expect(after).toHaveLength(0);
  });
});
