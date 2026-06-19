import { describe, it, expect } from 'vitest';
import { deptAccess, canManageArea, DEPARTMENT_AREAS, DEPARTMENTS } from './departments';
import type { User } from '@/types';

const u = (over: Partial<User>): User => ({ u: 'x', role: 'Operations', name: 'X', color: '#000', ...over });

describe('deptAccess', () => {
  it('CEO / Ban Giám Đốc → manage mọi khu vực', () => {
    expect(deptAccess(u({ role: 'CEO', department: 'visa' }), 'payments')).toBe('manage');
    expect(deptAccess(u({ role: 'Ban Giám Đốc' }), 'ncc')).toBe('manage');
  });
  it('chưa gán phòng → manage (giữ hành vi cũ)', () => {
    expect(deptAccess(u({ department: undefined }), 'contracts')).toBe('manage');
  });
  it('theo ma trận phòng ban', () => {
    expect(deptAccess(u({ role: 'Operations', department: 'ketoan' }), 'payments')).toBe('manage');
    expect(deptAccess(u({ role: 'Operations', department: 'ketoan' }), 'ncc')).toBe('view');
    expect(deptAccess(u({ role: 'Operations', department: 'visa' }), 'ncc')).toBe('none');
  });
  it('null user → none', () => {
    expect(deptAccess(null, 'ncc')).toBe('none');
  });
});

describe('canManageArea', () => {
  it('chỉ true khi mức = manage', () => {
    expect(canManageArea(u({ role: 'Operations', department: 'muahang' }), 'ncc')).toBe(true);
    expect(canManageArea(u({ role: 'Operations', department: 'muahang' }), 'contracts')).toBe(false); // view
    expect(canManageArea(u({ role: 'Operations', department: 'muahang' }), 'visa')).toBe(false); // none
  });
});

describe('ma trận đầy đủ', () => {
  it('mỗi phòng có đủ mọi khu vực', () => {
    const areas = Object.keys(DEPARTMENT_AREAS.dh_noidia);
    for (const d of DEPARTMENTS) {
      expect(Object.keys(DEPARTMENT_AREAS[d.id])).toEqual(areas);
    }
  });
});
