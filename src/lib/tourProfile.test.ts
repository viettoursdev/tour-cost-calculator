import { describe, it, expect } from 'vitest';
import {
  generateTourCode, tourPrefix, tourDatePart, canViewTourProfile, visibleTourProfiles, nextPrimaryAfterDelete,
  categoryPrefix, categoryKind, tourCategoryOf, deleteNeedsApproval, canApproveDelete,
} from './tourProfile';
import type { Department, Role, TourCategory, TourProfile, User } from '@/types';

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

describe('phân loại hồ sơ (5 loại) — prefix & kind', () => {
  it('categoryPrefix đúng cho cả 5 loại', () => {
    const cases: [TourCategory, string][] = [
      ['incentive_domestic', 'NĐ'], ['incentive_intl', 'NN'],
      ['visa', 'VS'], ['event', 'EV'], ['other', 'DV'],
    ];
    for (const [cat, pfx] of cases) expect(categoryPrefix(cat)).toBe(pfx);
  });
  it('categoryKind: chỉ incentive_intl là intl', () => {
    expect(categoryKind('incentive_intl')).toBe('intl');
    expect(categoryKind('incentive_domestic')).toBe('domestic');
    expect(categoryKind('visa')).toBe('domestic');
    expect(categoryKind('event')).toBe('domestic');
  });
  it('tourCategoryOf suy từ kind khi thiếu category (dữ liệu cũ)', () => {
    expect(tourCategoryOf({ kind: 'domestic' })).toBe('incentive_domestic');
    expect(tourCategoryOf({ kind: 'intl' })).toBe('incentive_intl');
    expect(tourCategoryOf({ kind: 'domestic', category: 'visa' })).toBe('visa');
  });
});

describe('duyệt xoá hồ sơ — quyền theo role', () => {
  it('người dưới Trưởng Phòng phải gửi duyệt', () => {
    expect(deleteNeedsApproval(find('an'))).toBe(true);        // Sales
    expect(deleteNeedsApproval(find('cuong'))).toBe(true);     // Operations
  });
  it('Trưởng Phòng / BGĐ / CEO xoá trực tiếp', () => {
    expect(deleteNeedsApproval(find('tp_noidia'))).toBe(false);
    expect(deleteNeedsApproval(find('bgd'))).toBe(false);
  });
  it('không có user → không cần duyệt (không xoá được)', () => {
    expect(deleteNeedsApproval(null)).toBe(false);
  });
  it('canApproveDelete: người được chọn hoặc approver bất kỳ', () => {
    const p = profile({ deleteRequest: { byU: 'an', byName: 'AN', approverU: 'tp_noidia', approverName: 'TP', requestedAt: '2026-06-26T00:00:00Z' } });
    expect(canApproveDelete(find('tp_noidia'), p)).toBe(true);   // được chọn
    expect(canApproveDelete(find('bgd'), p)).toBe(true);          // approver khác
    expect(canApproveDelete(find('an'), p)).toBe(false);          // người xin, không phải approver
    expect(canApproveDelete(find('tp_noidia'), profile())).toBe(false); // không có yêu cầu
  });
});

describe('canViewTourProfile — nhân sự event cũng được xem', () => {
  it('eventStaff được xem (như follower)', () => {
    const pe = profile({ createdByU: 'an', eventStaff: [{ u: 'cuong', name: 'CUONG' }] });
    expect(canViewTourProfile(find('cuong'), pe, USERS)).toBe(true);
  });
});

describe('nextPrimaryAfterDelete — chống mồ côi khi xoá báo giá', () => {
  it('xoá báo giá KHÔNG phải chính → không đổi gì', () => {
    expect(nextPrimaryAfterDelete('q1', 'q2', ['q1', 'q3'])).toBeNull();
  });
  it('xoá báo giá chính, còn báo giá khác → chuyển sang cái đầu còn lại', () => {
    expect(nextPrimaryAfterDelete('q1', 'q1', ['q2', 'q3'])).toEqual({ primaryQuoteId: 'q2', archive: false });
  });
  it('xoá báo giá chính, hết báo giá → gỡ primary + lưu trữ', () => {
    expect(nextPrimaryAfterDelete('q1', 'q1', [])).toEqual({ primaryQuoteId: undefined, archive: true });
  });
  it('hồ sơ chưa có primary, xoá báo giá bất kỳ → không đổi', () => {
    expect(nextPrimaryAfterDelete(undefined, 'q1', ['q2'])).toBeNull();
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
