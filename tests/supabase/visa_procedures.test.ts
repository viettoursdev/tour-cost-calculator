import { describe, it, expect, beforeEach } from 'vitest';
import { getViettoursClient, truncate } from './_setup';
import {
  sbSaveVisaProc, sbGetVisaProc, sbSubscribeVisaProcs, sbDeleteVisaProc,
} from '../../src/lib/supabase';
import type { VisaProcDoc, VisaProcIndexEntry } from '../../src/types/visa';

const once = <T>(fn: (cb: (v: T) => void) => () => void) =>
  new Promise<T>((res) => { const un = fn((v) => { un(); res(v); }); });

const sampleProc = (): VisaProcDoc => ({
  id: 'proc-1',
  code: 'JP-001',
  title: 'Hồ sơ xin visa Nhật',
  country: 'Japan',
  visaType: 'Tourist',
  isTemplate: false,
  linkedQuoteId: null,
  linkedQuoteName: '',
  createdByUsername: 'tester',
  createdByName: 'QA Bot',
  collaborators: ['tester'],
  sections: [
    {
      id: 's1', kind: 'enterprise', title: 'Thông tin doanh nghiệp',
      repeatable: false,
      fieldDefs: [{ id: 'f1', label: 'Tên công ty' }],
      rows: [{ id: 'r1', values: { f1: 'Viettours' } }],
    },
  ],
  versions: [],
  attachments: [
    { key: 'r2-proc-file', name: 'checklist.pdf', uploadedBy: 'tester', uploadedAt: '2026-01-01T00:00:00.000Z' },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: undefined,
  updatedBy: undefined,
});

describe('visa_procedures gateway', () => {
  beforeEach(async () => {
    await truncate(['attachments', 'visa_procedures']);
  });

  it('save → list (index) → get (full) → delete', async () => {
    const c = await getViettoursClient();

    await sbSaveVisaProc(sampleProc(), 'tester', c);

    // List returns index entry (no sections)
    const list = await once<VisaProcIndexEntry[]>((cb) => sbSubscribeVisaProcs(cb, c));
    expect(list).toHaveLength(1);
    const entry = list[0];
    expect(entry.id).toBe('proc-1');
    expect(entry.code).toBe('JP-001');
    expect(entry.country).toBe('Japan');
    expect(entry.collaborators).toContain('tester');
    expect(entry.createdByUsername).toBe('tester');
    expect(entry).not.toHaveProperty('sections'); // metadata only

    // Get returns full doc with sections + attachments
    const full = await sbGetVisaProc('proc-1', c);
    expect(full).not.toBeNull();
    expect(full!.sections).toHaveLength(1);
    expect(full!.sections[0].rows[0].values.f1).toBe('Viettours');
    expect(full!.attachments).toHaveLength(1);
    expect(full!.attachments![0].key).toBe('r2-proc-file');
    expect(full!.collaborators).toContain('tester');
    expect(full!.createdByUsername).toBe('tester');
    expect(full!.createdByName).toBe('QA Bot');

    // Delete removes the row
    await sbDeleteVisaProc('proc-1', c);
    const listAfter = await once<VisaProcIndexEntry[]>((cb) => sbSubscribeVisaProcs(cb, c));
    expect(listAfter).toHaveLength(0);
    const gotAfter = await sbGetVisaProc('proc-1', c);
    expect(gotAfter).toBeNull();
  });
});
