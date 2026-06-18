import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import { sbPushVisaProjects, sbSubscribeVisaProjects } from '../../src/lib/supabase';
import type { VisaProjectDoc } from '../../src/types/visa';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

const sampleProject = (): VisaProjectDoc => ({
  id: 'proj-1',
  code: 'VISA-2026-001',
  name: 'Đoàn Nhật Bản tháng 3',
  country: 'Japan',
  status: 'in_progress',
  mainStaff: ['tester'],
  supportStaff: [],
  documentsSummary: 'Passport + đơn xin visa',
  linkedQuoteId: null,
  linkedQuoteName: '',
  linkedProcIds: ['proc-1'],
  attachments: [
    { key: 'r2-proj-file', name: 'danh-sach.xlsx', uploadedBy: 'tester', uploadedAt: '2026-01-01T00:00:00.000Z' },
  ],
  applyCount: 12,
  passedCount: 10,
  failedCount: 1,
  haveVisaCount: 1,
  pendingCount: 0,
  startDate: '2026-03-01',
  departureDate: '2026-03-05',
  endDate: '2026-03-15',
  milestones: [
    { id: 'm1', label: 'Nộp hồ sơ', date: '2026-02-15', done: true, note: 'Đã nộp' },
    { id: 'm2', label: 'Nhận visa', date: '2026-03-01', done: false },
  ],
  applicants: [
    {
      id: 'a1', name: 'Nguyễn Văn A', gender: 'Nam', dob: '1990-01-01',
      passport: 'B123456', passportIssue: '2020-01-01', passportExpiry: '2030-01-01',
      docStatus: 'complete', result: 'passed',
    },
  ],
  collaborators: ['tester'],
  createdByUsername: 'tester',
  createdByName: 'QA Bot',
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('visa_projects gateway', () => {
  beforeEach(async () => {
    await truncate(['attachments', 'visa_projects']);
  });

  it('round-trips a project with milestones, applicants, and staff arrays', async () => {
    const c = await getViettoursClient();

    await sbPushVisaProjects([sampleProject()], { name: 'QA Bot', role: 'Operations' }, c);

    const list = await once<VisaProjectDoc[]>((cb) => sbSubscribeVisaProjects(cb, c));
    expect(list).toHaveLength(1);
    const p = list[0];

    // Identity + scalar fields
    expect(p.id).toBe('proj-1');
    expect(p.code).toBe('VISA-2026-001');
    expect(p.name).toBe('Đoàn Nhật Bản tháng 3');
    expect(p.country).toBe('Japan');
    expect(p.status).toBe('in_progress');
    expect(p.applyCount).toBe(12);
    expect(p.passedCount).toBe(10);
    expect(p.startDate).toBe('2026-03-01');
    expect(p.departureDate).toBe('2026-03-05');
    expect(p.linkedProcIds).toEqual(['proc-1']);
    expect(p.documentsSummary).toBe('Passport + đơn xin visa');

    // Username arrays (returned from *_usernames columns)
    expect(p.mainStaff).toContain('tester');
    expect(p.collaborators).toContain('tester');

    // JSONB round-trips
    expect(p.milestones).toHaveLength(2);
    expect(p.milestones[0].label).toBe('Nộp hồ sơ');
    expect(p.milestones[0].done).toBe(true);
    expect(p.milestones[1].done).toBe(false);
    expect(p.applicants).toHaveLength(1);
    expect(p.applicants![0].name).toBe('Nguyễn Văn A');
    expect(p.applicants![0].docStatus).toBe('complete');
    expect(p.applicants![0].result).toBe('passed');

    // Attachments
    expect(p.attachments).toHaveLength(1);
    expect(p.attachments[0].key).toBe('r2-proj-file');

    // createdByUsername distinct from createdByName
    expect(p.createdByUsername).toBe('tester');
    expect(p.createdByName).toBe('QA Bot');
    expect(p.createdByUsername).not.toBe(p.createdByName);

    // Full-overwrite: push empty list removes the project
    await sbPushVisaProjects([], { name: 'QA Bot', role: 'Operations' }, c);
    const listAfter = await once<VisaProjectDoc[]>((cb) => sbSubscribeVisaProjects(cb, c));
    expect(listAfter).toHaveLength(0);
  });
});
