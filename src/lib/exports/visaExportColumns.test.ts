import { describe, expect, it } from 'vitest';
import { VISA_EXPORT_COLUMNS } from './visaExportColumns';
import type { Passenger, VisaProjectDoc } from '@/types';

const col = (key: string) => VISA_EXPORT_COLUMNS.find((c) => c.key === key)!;

// Nhóm khách chỉ cần id/name/dob/relations cho các cột điều hành → cast an toàn.
const group = (rows: Passenger[]) => rows as unknown as VisaProjectDoc['applicants'];

const project = (rows: Passenger[]): VisaProjectDoc => ({
  id: 'v1', code: 'V1', name: 'Nhật', country: 'Nhật Bản', status: 'planning',
  mainStaff: [], supportStaff: [], documentsSummary: '', linkedQuoteId: null, linkedQuoteName: '',
  linkedProcIds: [], attachments: [], applyCount: 0, passedCount: 0, failedCount: 0, haveVisaCount: 0,
  pendingCount: 0, startDate: null, endDate: null, milestones: [], collaborators: [],
  createdByUsername: 'u', createdByName: 'U',
  departureDate: '2030-06-01', applicants: group(rows),
});

describe('visa export — operational columns', () => {
  const kid: Passenger = { id: 'kid', name: 'Bé An', dob: '2020-01-01', relations: [{ toId: 'mom', type: 'parent' }] };
  const mom: Passenger = { id: 'mom', name: 'Chị Lan', dob: '1990-01-01', relations: [{ toId: 'kid', type: 'child' }] };
  const proj = project([kid, mom]);

  it('summarizes relations with the other guest name', () => {
    expect(col('relations').value(kid, 0, proj)).toBe('Cha/Mẹ: Chị Lan');
  });

  it('marks a minor travelling with a parent', () => {
    expect(String(col('minorGuardian').value(kid, 0, proj))).toContain('Đi cùng cha/mẹ');
  });

  it('flags a minor without a parent as needing authorization', () => {
    const orphan: Passenger = { id: 'o', name: 'Bé Bo', dob: '2020-01-01' };
    const p = project([orphan]);
    expect(String(col('minorGuardian').value(orphan, 0, p))).toContain('CẦN GIẤY UỶ QUYỀN');
  });

  it('reports passport warnings', () => {
    const expired: Passenger = { id: 'e', name: 'X', idNo: 'C1', passportExpiry: '2000-01-01' };
    expect(String(col('passportWarn').value(expired, 0, proj))).toContain('hết hạn');
  });

  it('leaves operational columns blank when not applicable', () => {
    const adult: Passenger = { id: 'a', name: 'Ông A', dob: '1980-01-01', idNo: 'C9', passportExpiry: '2035-01-01' };
    expect(col('minorGuardian').value(adult, 0, proj)).toBe('');
    expect(col('passportWarn').value(adult, 0, proj)).toBe('');
    expect(col('relations').value(adult, 0, proj)).toBe('');
  });
});
