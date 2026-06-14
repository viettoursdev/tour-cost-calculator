import { describe, it, expect } from 'vitest';
import { canViewVisaProject, visibleVisaProjects } from './visaAccess';
import type { Role, User, VisaProjectDoc } from '@/types';

const user = (u: string, role: Role): User =>
  ({ u, role, name: u, email: `${u}@viettours.com.vn`, p: '', color: '#000' } as User);

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

  it('assigned Operations+ staff can view', () => {
    expect(canViewVisaProject(user('op1', 'Operations'), proj({ mainStaff: ['op1'] }))).toBe(true);
    expect(canViewVisaProject(user('op2', 'Operations'), proj({ supportStaff: ['op2'] }))).toBe(true);
    expect(canViewVisaProject(user('op3', 'Operations'), proj({ collaborators: ['op3'] }))).toBe(true);
  });

  it('assigned but BELOW Operations cannot view', () => {
    expect(canViewVisaProject(user('sale1', 'Sales'), proj({ mainStaff: ['sale1'] }))).toBe(false);
    expect(canViewVisaProject(user('mkt1', 'Marketing'), proj({ supportStaff: ['mkt1'] }))).toBe(false);
    expect(canViewVisaProject(user('acc1', 'Accountant'), proj({ collaborators: ['acc1'] }))).toBe(false);
  });

  it('unrelated user cannot view', () => {
    expect(canViewVisaProject(user('op9', 'Operations'), proj({ createdByUsername: 'x' }))).toBe(false);
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
