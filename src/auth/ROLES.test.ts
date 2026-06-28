import { describe, it, expect } from 'vitest';
import { ROLES, DEFAULT_USERS, USER_COLORS, canReceivePush, isBoard, isApprover, BOARD_ROLES } from './ROLES';
import type { Role, User } from '@/types';

const user = (role: Role): User => ({ u: 'x', email: 'x@viettours.com.vn', role, name: 'X', color: '#000000' });

describe('ROLES', () => {
  it('matches the documented hierarchy order', () => {
    expect(ROLES).toEqual([
      'CEO',
      'Ban Giám Đốc',
      'Trợ lý Giám Đốc',
      'Trưởng Phòng',
      'Phó Phòng',
      'Sales',
      'Operations',
      'Marketing',
      'Admin',
      'Accountant',
      'NV Thử việc',
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
    for (const r of ['Operations', 'Trưởng Phòng', 'Trợ lý Giám Đốc', 'Ban Giám Đốc', 'CEO'] as Role[]) {
      expect(canReceivePush(user(r))).toBe(true);
    }
  });

  it('chặn cấp dưới Operations', () => {
    for (const r of ['Sales', 'Marketing', 'Admin', 'Accountant', 'NV Thử việc'] as Role[]) {
      expect(canReceivePush(user(r))).toBe(false);
    }
  });

  it('false khi không có user', () => {
    expect(canReceivePush(null)).toBe(false);
    expect(canReceivePush(undefined)).toBe(false);
  });
});

describe('Trợ lý Giám Đốc (role tương tự Ban Giám Đốc)', () => {
  it('thuộc cấp Ban Giám Đốc (isBoard) — phụ trách toàn bộ phòng ban', () => {
    expect(isBoard('Trợ lý Giám Đốc')).toBe(true);
    expect(BOARD_ROLES).toEqual(['CEO', 'Ban Giám Đốc', 'Trợ lý Giám Đốc']);
  });
  it('là cấp duyệt (isApprover)', () => {
    expect(isApprover('Trợ lý Giám Đốc')).toBe(true);
  });
});

describe('USER_COLORS', () => {
  it('is a non-empty list of hex strings', () => {
    expect(USER_COLORS.length).toBeGreaterThan(0);
    for (const c of USER_COLORS) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
