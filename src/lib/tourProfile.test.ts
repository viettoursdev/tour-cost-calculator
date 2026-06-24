import { describe, it, expect } from 'vitest';
import { generateTourCode, tourPrefix, tourDatePart, canViewTourProfile, visibleTourProfiles } from './tourProfile';
import type { Department, Role, TourProfile, User } from '@/types';

const user = (u: string, role: Role, department?: Department): User =>
  ({ u, name: u.toUpperCase(), role, department, color: '#000' });

const USERS: User[] = [
  user('an', 'Sales', 'dh_noidia'),
  user('binh', 'Sales', 'dh_noidia'),
  user('cuong', 'Operations', 'dh_nuocngoai'),
  user('tp_noidia', 'Trưởng Phòng', 'dh_noidia'),
  user('bgd', 'Ban Giám Đốc'),
];
const find = (u: string) => USERS.find((x) => x.u === u)!;

const profile = (over: Partial<TourProfile> = {}): TourProfile => ({
  id: 'tp1', code: 'NĐ.25.06.26.01', kind: 'domestic', name: 'Tour A',
  status: 'open', createdAt: '2026-06-25T00:00:00.000Z', createdByU: 'an', createdBy: 'AN',
  collaborators: [], followers: [], ...over,
});

const NOW = new Date('2026-06-25T08:00:00+07:00'); // 25/06/26 giờ VN

describe('generateTourCode — mã NĐ/NN.DD.MM.YY.NN', () => {
  it('prefix theo loại', () => {
    expect(tourPrefix('domestic')).toBe('NĐ');
    expect(tourPrefix('intl')).toBe('NN');
  });
  it('phần ngày DD.MM.YY', () => {
    expect(tourDatePart(NOW)).toBe('25.06.26');
  });
  it('hồ sơ đầu ngày → STT 01', () => {
    expect(generateTourCode('domestic', [], NOW)).toBe('NĐ.25.06.26.01');
    expect(generateTourCode('intl', [], NOW)).toBe('NN.25.06.26.01');
  });
  it('STT tăng theo số hồ sơ CÙNG prefix + CÙNG ngày', () => {
    const existing: TourProfile[] = [
      profile({ code: 'NĐ.25.06.26.01' }),
      profile({ code: 'NĐ.25.06.26.02' }),
      profile({ code: 'NN.25.06.26.01' }),       // khác prefix → không tính
      profile({ code: 'NĐ.24.06.26.01' }),       // khác ngày → không tính
    ];
    expect(generateTourCode('domestic', existing, NOW)).toBe('NĐ.25.06.26.03');
    expect(generateTourCode('intl', existing, NOW)).toBe('NN.25.06.26.02');
  });
});

describe('visibleTourProfiles — quyền xem (recordAccess + follower)', () => {
  const p = profile({ createdByU: 'an', collaborators: [{ u: 'binh', name: 'BINH' }] });

  it('người tạo & collaborator thấy', () => {
    expect(canViewTourProfile(find('an'), p, USERS)).toBe(true);
    expect(canViewTourProfile(find('binh'), p, USERS)).toBe(true);
  });
  it('người ngoài, khác phòng → không thấy', () => {
    expect(canViewTourProfile(find('cuong'), p, USERS)).toBe(false);
  });
  it('FOLLOWER cũng được xem', () => {
    const pf = profile({ createdByU: 'an', followers: [{ u: 'cuong', name: 'CUONG' }] });
    expect(canViewTourProfile(find('cuong'), pf, USERS)).toBe(true);
  });
  it('Trưởng phòng cùng phòng người tạo → thấy', () => {
    expect(canViewTourProfile(find('tp_noidia'), p, USERS)).toBe(true);
  });
  it('Ban Giám Đốc thấy tất cả', () => {
    expect(canViewTourProfile(find('bgd'), p, USERS)).toBe(true);
  });
  it('visibleTourProfiles lọc đúng cho user thường', () => {
    const list = [
      profile({ id: 'a', createdByU: 'an' }),
      profile({ id: 'b', createdByU: 'cuong' }),
      profile({ id: 'c', createdByU: 'cuong', followers: [{ u: 'an', name: 'AN' }] }),
    ];
    const seen = visibleTourProfiles(find('an'), list, USERS).map((x) => x.id);
    expect(seen).toEqual(['a', 'c']);
  });
  it('không có user → rỗng', () => {
    expect(visibleTourProfiles(null, [p], USERS)).toEqual([]);
  });
});
