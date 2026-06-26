import { describe, it, expect } from 'vitest';
import { buildPublicVisaList, genVisaListToken, visaListUrl } from './publicVisaList';
import type { Passenger, VisaProjectDoc } from '@/types';

const project = { id: 'p1', code: 'V.01', name: 'Đoàn Schengen', country: 'Pháp' } as VisaProjectDoc;

const pax = (over: Partial<Passenger>): Passenger =>
  ({ id: 'x', name: 'Nguyễn Văn A', docStatus: 'missing', result: 'pending', ...over } as Passenger);

describe('buildPublicVisaList', () => {
  it('renders rows aligned to the selected, ordered columns', () => {
    const doc = buildPublicVisaList({
      project,
      applicants: [pax({ name: 'A', nationality: 'Việt Nam' }), pax({ name: 'B' })],
      columnKeys: ['stt', 'name', 'nationality'],
      token: 'tok', publishedBy: 'NV1',
    });
    expect(doc.columns.map((c) => c.key)).toEqual(['stt', 'name', 'nationality']);
    expect(doc.columns.map((c) => c.label)).toEqual(['STT', 'Họ và tên', 'Quốc tịch']);
    expect(doc.rows).toEqual([[1, 'A', 'Việt Nam'], [2, 'B', '']]);
    expect(doc.count).toBe(2);
    expect(doc.projectName).toBe('Đoàn Schengen');
    expect(doc.country).toBe('Pháp');
  });

  it('drops unknown column keys (reconcile with catalog)', () => {
    const doc = buildPublicVisaList({
      project, applicants: [pax({ name: 'A' })],
      columnKeys: ['name', 'totally_made_up', 'gender'], token: 't', publishedBy: 'NV1',
    });
    expect(doc.columns.map((c) => c.key)).toEqual(['name', 'gender']);
    expect(doc.rows[0]).toHaveLength(2);
  });

  it('trims empty note to undefined', () => {
    const doc = buildPublicVisaList({ project, applicants: [], columnKeys: ['stt'], token: 't', publishedBy: 'NV1', note: '   ' });
    expect(doc.note).toBeUndefined();
  });
});

describe('token + url', () => {
  it('token is a non-empty hex-ish string', () => {
    expect(genVisaListToken().length).toBeGreaterThan(8);
  });
  it('url carries the ?visa= token', () => {
    expect(visaListUrl('abc')).toContain('?visa=abc');
  });
});
