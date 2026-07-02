import { describe, expect, it } from 'vitest';
import { isModuleEnabled, normalizeModuleFlags, type ModuleFlags } from './featureFlags';
import type { User } from '@/types';

const u = (role: User['role'], department?: User['department']): User =>
  ({ u: 'x', name: 'X', role, department } as User);

describe('normalizeModuleFlags', () => {
  it('blob rỗng/sai kiểu → {}', () => {
    expect(normalizeModuleFlags(null)).toEqual({});
    expect(normalizeModuleFlags('x')).toEqual({});
  });

  it('bỏ key lạ + entry sai hình dạng, giữ entry đúng', () => {
    expect(normalizeModuleFlags({
      inventory: { off: true },
      chat: { offDepts: ['visa'] },
      unknown_module: { off: true },
      library: 'bad',
      training: { off: false, offDepts: [] }, // không có gì tắt → bỏ
    })).toEqual({
      inventory: { off: true },
      chat: { offDepts: ['visa'] },
    });
  });
});

describe('isModuleEnabled', () => {
  const flags: ModuleFlags = {
    inventory: { off: true },
    chat: { offDepts: ['visa'] },
  };

  it('không có flag → bật', () => {
    expect(isModuleEnabled(flags, 'library', u('Sales', 'dh_noidia'))).toBe(true);
    expect(isModuleEnabled({}, 'inventory', u('Sales', 'dh_noidia'))).toBe(true);
  });

  it('off toàn công ty → tắt với nhân viên thường', () => {
    expect(isModuleEnabled(flags, 'inventory', u('Sales', 'dh_noidia'))).toBe(false);
    expect(isModuleEnabled(flags, 'inventory', u('Trưởng Phòng', 'ketoan'))).toBe(false);
  });

  it('offDepts → tắt đúng phòng, phòng khác vẫn bật', () => {
    expect(isModuleEnabled(flags, 'chat', u('Sales', 'visa'))).toBe(false);
    expect(isModuleEnabled(flags, 'chat', u('Sales', 'dh_noidia'))).toBe(true);
    expect(isModuleEnabled(flags, 'chat', u('Sales'))).toBe(true); // không phòng → không gate theo phòng
  });

  it('BGĐ+ luôn thấy đủ; chưa đăng nhập không gate', () => {
    expect(isModuleEnabled(flags, 'inventory', u('CEO'))).toBe(true);
    expect(isModuleEnabled(flags, 'inventory', u('Ban Giám Đốc'))).toBe(true);
    expect(isModuleEnabled(flags, 'inventory', u('Trợ lý Giám Đốc'))).toBe(true);
    expect(isModuleEnabled(flags, 'inventory', null)).toBe(true);
  });
});
