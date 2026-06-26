import { describe, it, expect } from 'vitest';
import { canApproveVisaShareLink, canViewVisaProject, visibleVisaProjects, canViewVisaReports } from './visaAccess';
import type { Department, Role, User, VisaProjectDoc } from '@/types';

const user = (u: string, role: Role, department?: Department): User =>
  ({ u, role, name: u, email: `${u}@viettours.com.vn`, p: '', color: '#000', department } as User);

const proj = (p: Partial<VisaProjectDoc>): VisaProjectDoc =>
  ({ createdByUsername: 'owner', mainStaff: [], supportStaff: [], collaborators: [], ...p } as VisaProjectDoc);

describe('canViewVisaProject', () => {
  it('null user can never view', () => {
    expect(canViewVisaProject(null, proj({}))).toBe(false);
  });

  it('Trưởng Phòng+ sees all projects', () => {
    const p = proj({ createdByUsername: 'someoneElse' });
    expect(canViewVisaProject(user('tp', 'Trưởng Phòng'), p)).toBe(true);
    expect(canViewVisaProject(user('bgd', 'Ban Giám Đốc'), p)).toBe(true);
    expect(canViewVisaProject(user('ceo', 'CEO'), p)).toBe(true);
  });

  it('creator always sees their own project, even below Operations', () => {
    expect(canViewVisaProject(user('sale1', 'Sales'), proj({ createdByUsername: 'sale1' }))).toBe(true);
  });

  it('anyone added can view regardless of rank', () => {
    expect(canViewVisaProject(user('op1', 'Operations'), proj({ mainStaff: ['op1'] }))).toBe(true);
    expect(canViewVisaProject(user('sale1', 'Sales'), proj({ mainStaff: ['sale1'] }))).toBe(true);
    expect(canViewVisaProject(user('mkt1', 'Marketing'), proj({ supportStaff: ['mkt1'] }))).toBe(true);
    expect(canViewVisaProject(user('acc1', 'Accountant'), proj({ collaborators: ['acc1'] }))).toBe(true);
    expect(canViewVisaProject(user('std1', 'Standard'), proj({ supportStaff: ['std1'] }))).toBe(true);
  });

  it('unrelated user (not added, below TP) cannot view', () => {
    expect(canViewVisaProject(user('op9', 'Operations'), proj({ createdByUsername: 'x' }))).toBe(false);
    expect(canViewVisaProject(user('sale9', 'Sales'), proj({ createdByUsername: 'x' }))).toBe(false);
  });
});

describe('visibleVisaProjects', () => {
  it('filters the list to viewable projects', () => {
    const projs = [
      proj({ createdByUsername: 'op1' }),
      proj({ createdByUsername: 'x', mainStaff: ['op1'] }),
      proj({ createdByUsername: 'y' }),
    ];
    expect(visibleVisaProjects(user('op1', 'Operations'), projs)).toHaveLength(2);
    expect(visibleVisaProjects(user('tp', 'Trưởng Phòng'), projs)).toHaveLength(3);
    expect(visibleVisaProjects(user('sale1', 'Sales'), projs)).toHaveLength(0);
  });
});

describe('canApproveVisaShareLink', () => {
  it('Trưởng phòng Visa duyệt được; Trưởng Phòng phòng khác thì KHÔNG', () => {
    expect(canApproveVisaShareLink(user('tpv', 'Trưởng Phòng', 'visa'))).toBe(true);
    expect(canApproveVisaShareLink(user('tpk', 'Trưởng Phòng', 'ketoan'))).toBe(false);
    expect(canApproveVisaShareLink(user('tp0', 'Trưởng Phòng'))).toBe(false);
  });
  it('CEO & Ban Giám Đốc luôn duyệt được (bất kể phòng)', () => {
    expect(canApproveVisaShareLink(user('ceo', 'CEO'))).toBe(true);
    expect(canApproveVisaShareLink(user('bgd', 'Ban Giám Đốc', 'sukien'))).toBe(true);
  });
  it('nhân viên thường & null không duyệt được', () => {
    expect(canApproveVisaShareLink(user('op', 'Operations', 'visa'))).toBe(false);
    expect(canApproveVisaShareLink(user('po', 'Phó Phòng', 'visa'))).toBe(false);
    expect(canApproveVisaShareLink(null)).toBe(false);
  });
});

describe('canViewVisaReports', () => {
  it('only Trưởng Phòng and above', () => {
    expect(canViewVisaReports(user('tp', 'Trưởng Phòng'))).toBe(true);
    expect(canViewVisaReports(user('bgd', 'Ban Giám Đốc'))).toBe(true);
    expect(canViewVisaReports(user('ceo', 'CEO'))).toBe(true);
    expect(canViewVisaReports(user('op1', 'Operations'))).toBe(false);
    expect(canViewVisaReports(user('sale1', 'Sales'))).toBe(false);
    expect(canViewVisaReports(null)).toBe(false);
  });
});
