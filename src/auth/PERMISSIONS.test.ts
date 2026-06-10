import { describe, it, expect } from 'vitest';
import { PERMISSIONS, hasPerm } from './PERMISSIONS';
import type { User } from '@/types';

function user(role: User['role']): User {
  return { u: 'x', p: 'x', role, name: 'x', color: '#000' };
}

describe('hasPerm', () => {
  it('returns false for a null user', () => {
    expect(hasPerm(null, 'manageUsers')).toBe(false);
  });

  it('returns true for CEO manageUsers', () => {
    expect(hasPerm(user('CEO'), 'manageUsers')).toBe(true);
  });

  it('returns false for Trưởng Phòng manageUsers', () => {
    expect(hasPerm(user('Trưởng Phòng'), 'manageUsers')).toBe(false);
  });
});

describe('Admin role (view-only on history and contracts)', () => {
  const admin = user('Admin');
  it('can viewHistory', () => expect(hasPerm(admin, 'viewHistory')).toBe(true));
  it('can viewContracts', () => expect(hasPerm(admin, 'viewContracts')).toBe(true));
  it('cannot manageContracts', () => expect(hasPerm(admin, 'manageContracts')).toBe(false));
  it('cannot exportQuote', () => expect(hasPerm(admin, 'exportQuote')).toBe(false));
  it('cannot editRateCard', () => expect(hasPerm(admin, 'editRateCard')).toBe(false));
});

describe('Accountant role (history-only)', () => {
  const acc = user('Accountant');
  it('can viewHistory', () => expect(hasPerm(acc, 'viewHistory')).toBe(true));
  it('cannot viewContracts', () => expect(hasPerm(acc, 'viewContracts')).toBe(false));
  it('cannot exportQuote', () => expect(hasPerm(acc, 'exportQuote')).toBe(false));
  it('cannot editRateCard', () => expect(hasPerm(acc, 'editRateCard')).toBe(false));
});

describe('Standard role', () => {
  const std = user('Standard');
  it('has no perms', () => {
    const perms = PERMISSIONS.Standard;
    for (const v of Object.values(perms)) expect(v).toBe(false);
    expect(hasPerm(std, 'viewHistory')).toBe(false);
  });
});

describe('Permission matrix shape', () => {
  it('every role has every permission key', () => {
    const keys = Object.keys(PERMISSIONS.CEO);
    for (const role of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
      expect(Object.keys(PERMISSIONS[role]).sort()).toEqual(keys.sort());
    }
  });
});
