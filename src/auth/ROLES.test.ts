import { describe, it, expect } from 'vitest';
import { ROLES, DEFAULT_USERS, USER_COLORS, canReceivePush } from './ROLES';
import type { Role, User } from '@/types';

const user = (role: Role): User => ({ u: 'x', email: 'x@viettours.com.vn', role, name: 'X', color: '#000000' });

describe('ROLES', () => {
  it('matches the documented hierarchy order', () => {
    expect(ROLES).toEqual([
      'CEO',
      'Ban Giám Đốc',
      'Trưởng Phòng',
      'Phó Phòng',
      'Sales',
      'Operations',
      'Marketing',
      'Admin',
      'Accountant',
      'Standard',
    ]);
  });
});

describe('DEFAULT_USERS', () => {
  it('has unique usernames', () => {
    const us = DEFAULT_USERS.map((u) => u.u);
    expect(new Set(us).size).toBe(us.length);
  });

  it('seeds at least one CEO', () => {
    expect(DEFAULT_USERS.some((u) => u.role === 'CEO')).toBe(true);
  });

  it('every seed has a role that exists in ROLES', () => {
    for (const u of DEFAULT_USERS) {
      expect(ROLES).toContain(u.role);
    }
  });

  it('every seed has a non-empty name and no plaintext password', () => {
    for (const u of DEFAULT_USERS) {
      expect(u.name.trim().length).toBeGreaterThan(0);
      expect(u.p).toBeUndefined(); // mật khẩu plaintext đã loại bỏ
    }
  });

  it('every seed has a @viettours.com.vn email', () => {
    for (const u of DEFAULT_USERS) {
      expect(u.email).toBeDefined();
      expect(u.email!.toLowerCase()).toMatch(/@viettours\.com\.vn$/);
    }
  });
});

describe('canReceivePush', () => {
  it('cho phép cấp ≥ Operations (phó phòng trở lên)', () => {
    for (const r of ['Operations', 'Trưởng Phòng', 'Ban Giám Đốc', 'CEO'] as Role[]) {
      expect(canReceivePush(user(r))).toBe(true);
    }
  });

  it('chặn cấp dưới Operations', () => {
    for (const r of ['Sales', 'Marketing', 'Admin', 'Accountant', 'Standard'] as Role[]) {
      expect(canReceivePush(user(r))).toBe(false);
    }
  });

  it('false khi không có user', () => {
    expect(canReceivePush(null)).toBe(false);
    expect(canReceivePush(undefined)).toBe(false);
  });
});

describe('USER_COLORS', () => {
  it('is a non-empty list of hex strings', () => {
    expect(USER_COLORS.length).toBeGreaterThan(0);
    for (const c of USER_COLORS) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
