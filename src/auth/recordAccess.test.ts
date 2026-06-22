import { describe, it, expect } from 'vitest';
import { canViewRecord, visibleRecords, canShareRecord, isRecordOwner, type OwnedRecord } from './recordAccess';
import type { Department, Role, User } from '@/types';

const user = (u: string, role: Role, department?: Department): User =>
  ({ u, name: u.toUpperCase(), role, department, color: '#000' });

// Danh bạ user để suy phòng ban người tạo.
const USERS: User[] = [
  user('an', 'Sales', 'dh_noidia'),
  user('binh', 'Sales', 'dh_noidia'),
  user('cuong', 'Operations', 'dh_nuocngoai'),
  user('tp_noidia', 'Trưởng Phòng', 'dh_noidia'),
  user('tp_ngoai', 'Trưởng Phòng', 'dh_nuocngoai'),
  user('bgd', 'Ban Giám Đốc'),
  user('sep', 'CEO'),
];
const find = (u: string) => USERS.find((x) => x.u === u)!;

const rec = (createdByU: string, collab: string[] = []): OwnedRecord => ({
  createdBy: createdByU.toUpperCase(),
  createdByU,
  collaborators: collab.map((c) => ({ u: c, name: c.toUpperCase() })),
});

describe('canViewRecord — 4 tầng nguyên tắc vận hành', () => {
  const r = rec('an', ['binh']); // An tạo, chia sẻ cho Bình

  it('1) người tạo thấy', () => {
    expect(canViewRecord(find('an'), r, USERS)).toBe(true);
  });
  it('2) collaborator thấy', () => {
    expect(canViewRecord(find('binh'), r, USERS)).toBe(true);
  });
  it('người khác KHÔNG được chia sẻ, khác phòng → không thấy', () => {
    expect(canViewRecord(find('cuong'), r, USERS)).toBe(false);
  });
  it('3) Trưởng phòng CÙNG phòng người tạo → thấy', () => {
    expect(canViewRecord(find('tp_noidia'), r, USERS)).toBe(true);
  });
  it('3) Trưởng phòng KHÁC phòng → không thấy', () => {
    expect(canViewRecord(find('tp_ngoai'), r, USERS)).toBe(false);
  });
  it('4) Ban Giám Đốc & CEO thấy tất cả', () => {
    expect(canViewRecord(find('bgd'), r, USERS)).toBe(true);
    expect(canViewRecord(find('sep'), r, USERS)).toBe(true);
  });
  it('Trưởng phòng không có department → chỉ thấy của mình', () => {
    const tp = user('tp_x', 'Trưởng Phòng'); // không set department
    expect(canViewRecord(tp, r, [...USERS, tp])).toBe(false);
  });
});

describe('dữ liệu cũ (chỉ có createdBy = tên, không createdByU)', () => {
  const legacy: OwnedRecord = { createdBy: 'AN' }; // An tạo, bản ghi cũ
  it('người tạo khớp theo tên vẫn thấy', () => {
    expect(canViewRecord(find('an'), legacy, USERS)).toBe(true);
  });
  it('Trưởng phòng cùng phòng suy theo tên người tạo', () => {
    expect(canViewRecord(find('tp_noidia'), legacy, USERS)).toBe(true);
    expect(canViewRecord(find('tp_ngoai'), legacy, USERS)).toBe(false);
  });
});

describe('visibleRecords', () => {
  const list = [rec('an'), rec('cuong'), rec('binh', ['an'])];
  it('Sales chỉ thấy của mình + được chia sẻ', () => {
    const v = visibleRecords(find('an'), list, USERS);
    expect(v).toHaveLength(2); // an tạo + binh chia sẻ cho an
  });
  it('CEO thấy tất cả (trả nguyên list)', () => {
    expect(visibleRecords(find('sep'), list, USERS)).toHaveLength(3);
  });
  it('Trưởng phòng nội địa thấy của an + binh (cùng phòng), không thấy cuong', () => {
    const v = visibleRecords(find('tp_noidia'), list, USERS);
    expect(v).toHaveLength(2);
  });
  it('không có user → rỗng', () => {
    expect(visibleRecords(null, list, USERS)).toEqual([]);
  });
});

describe('canShareRecord & isRecordOwner', () => {
  const r = rec('an', ['binh']);
  it('người tạo & Trưởng phòng cùng phòng & BGĐ/CEO được share; collab thì KHÔNG', () => {
    expect(canShareRecord(find('an'), r, USERS)).toBe(true);
    expect(canShareRecord(find('tp_noidia'), r, USERS)).toBe(true);
    expect(canShareRecord(find('bgd'), r, USERS)).toBe(true);
    expect(canShareRecord(find('binh'), r, USERS)).toBe(false); // collab không được share tiếp
    expect(canShareRecord(find('cuong'), r, USERS)).toBe(false);
  });
  it('isRecordOwner theo username, fallback tên', () => {
    expect(isRecordOwner(find('an'), r)).toBe(true);
    expect(isRecordOwner(find('an'), { createdBy: 'AN' })).toBe(true);
    expect(isRecordOwner(find('binh'), r)).toBe(false);
  });
});
