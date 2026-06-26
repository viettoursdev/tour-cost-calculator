import { describe, it, expect } from 'vitest';
import {
  generateTourCode, tourPrefix, tourDatePart, canViewTourProfile, visibleTourProfiles, nextPrimaryAfterDelete,
  categoryPrefix, categoryKind, tourCategoryOf, deleteNeedsApproval, canApproveDelete,
  tourProfileRisks, topRiskLevel, tourProfileTimeline,
  tourProfileClosingChecklist, closingPending, tourProfileMilestones,
  clonedQuoteName,
} from './tourProfile';
import type { AuditEntry, Department, Role, TourCategory, TourProfile, User } from '@/types';

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

describe('tourProfileRisks — thẻ "cần chú ý"', () => {
  const NOW = new Date('2026-06-26T00:00:00Z');
  const iso = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * 86_400_000).toISOString();

  it('không có báo giá chính → không rủi ro', () => {
    expect(tourProfileRisks({ stage: 'request', contractCount: 0, now: NOW })).toEqual([]);
  });
  it('báo giá quá hạn (chưa chốt) → urgent', () => {
    const r = tourProfileRisks({ primary: { deadline: iso(-1) }, stage: 'quoted', contractCount: 0, now: NOW });
    expect(r.map((x) => x.key)).toContain('quote_overdue');
    expect(topRiskLevel(r)).toBe('urgent');
  });
  it('đã chốt thì KHÔNG cảnh báo báo giá quá hạn', () => {
    const r = tourProfileRisks({ primary: { deadline: iso(-1) }, stage: 'won', contractCount: 1, now: NOW });
    expect(r.map((x) => x.key)).not.toContain('quote_overdue');
  });
  it('bước quy trình quá hạn → đếm đúng', () => {
    const r = tourProfileRisks({
      primary: { workflowDue: [{ label: 'A', dueDate: iso(-2) }, { label: 'B', dueDate: iso(3) }] },
      stage: 'operating', contractCount: 1, now: NOW,
    });
    expect(r.find((x) => x.key === 'workflow_overdue')?.label).toContain('1 bước');
  });
  it('sắp khởi hành (≤14 ngày) đã thắng mà CHƯA có hợp đồng → urgent', () => {
    const r = tourProfileRisks({ primary: { departDate: iso(10) }, stage: 'won', contractCount: 0, now: NOW });
    expect(r.map((x) => x.key)).toContain('no_contract');
  });
  it('có hợp đồng thì KHÔNG cảnh báo thiếu hợp đồng', () => {
    const r = tourProfileRisks({ primary: { departDate: iso(10) }, stage: 'won', contractCount: 1, now: NOW });
    expect(r.map((x) => x.key)).not.toContain('no_contract');
  });
  it('còn công nợ NCC khi sắp khởi hành (≤7 ngày) → warn', () => {
    const r = tourProfileRisks({ primary: { departDate: iso(3), paymentSummary: { payable: 10, paid: 5, remaining: 5 } }, stage: 'operating', contractCount: 1, now: NOW });
    expect(r.map((x) => x.key)).toContain('payable_remaining');
  });
  it('đã qua khởi hành mà chưa quyết toán → warn', () => {
    const r = tourProfileRisks({ primary: { departDate: iso(-3) }, stage: 'acceptance', contractCount: 1, now: NOW });
    expect(r.map((x) => x.key)).toContain('no_settlement');
  });
  it('đã quyết toán thì KHÔNG cảnh báo', () => {
    const r = tourProfileRisks({ primary: { departDate: iso(-3), settlementSummary: { budgetCost: 1, actualCost: 1, actualProfit: 0, actualMarginPct: 0, plannedMarginPct: 0 } }, stage: 'acceptance', contractCount: 1, now: NOW });
    expect(r.map((x) => x.key)).not.toContain('no_settlement');
  });
  it('giai đoạn đã đóng/thua → bỏ qua rủi ro tác nghiệp', () => {
    expect(tourProfileRisks({ primary: { deadline: iso(-5) }, stage: 'closed', contractCount: 1, now: NOW })).toEqual([]);
    expect(tourProfileRisks({ primary: { deadline: iso(-5) }, stage: 'lost', contractCount: 0, now: NOW })).toEqual([]);
  });
  it('topRiskLevel: rỗng → null', () => {
    expect(topRiskLevel([])).toBeNull();
  });
});

describe('clonedQuoteName — đặt tên bản sao', () => {
  it('thêm tiền tố cho tên thường', () => {
    expect(clonedQuoteName('Đà Lạt – Đoàn ABC')).toBe('(Bản sao) Đà Lạt – Đoàn ABC');
  });
  it('KHÔNG nhân đôi tiền tố nếu đã là bản sao', () => {
    expect(clonedQuoteName('(Bản sao) Đà Lạt')).toBe('(Bản sao) Đà Lạt');
  });
  it('tên rỗng → chỉ tiền tố (trim)', () => {
    expect(clonedQuoteName('')).toBe('(Bản sao)');
    expect(clonedQuoteName('   ')).toBe('(Bản sao)');
  });
});

describe('tourProfileClosingChecklist — cổng đóng hồ sơ', () => {
  it('deal chưa thắng / thua → không cần checklist (rỗng)', () => {
    expect(tourProfileClosingChecklist({ primary: {}, stage: 'quoted', contractCount: 0 })).toEqual([]);
    expect(tourProfileClosingChecklist({ primary: {}, stage: 'lost', contractCount: 0 })).toEqual([]);
  });
  it('deal đã thắng → 4 mục, đánh dấu done đúng', () => {
    const items = tourProfileClosingChecklist({
      primary: { settlementSummary: { budgetCost: 1, actualCost: 1, actualProfit: 0, actualMarginPct: 0, plannedMarginPct: 0 }, paymentSummary: { payable: 5, paid: 5, remaining: 0 }, workflowDue: [] },
      stage: 'acceptance', contractCount: 1,
    });
    expect(items.map((i) => i.key)).toEqual(['contract', 'settlement', 'ncc_paid', 'workflow']);
    expect(items.every((i) => i.done)).toBe(true);
    expect(closingPending(items)).toEqual([]);
  });
  it('còn thiếu → closingPending liệt kê đúng mục chưa xong', () => {
    const items = tourProfileClosingChecklist({
      primary: { paymentSummary: { payable: 5, paid: 2, remaining: 3 }, workflowDue: [{ label: 'X', dueDate: '2026-06-30' }] },
      stage: 'won', contractCount: 0,
    });
    expect(closingPending(items).map((i) => i.key).sort()).toEqual(['contract', 'ncc_paid', 'settlement', 'workflow']);
  });
});

describe('tourProfileMilestones — mốc thời gian & đếm ngược', () => {
  const NOW = new Date('2026-06-26T00:00:00Z');
  const iso = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

  it('không có báo giá chính → rỗng', () => {
    expect(tourProfileMilestones({ stage: 'won', now: NOW })).toEqual([]);
  });
  it('khởi hành tương lai → upcoming với daysTo đúng; sắp xếp theo ngày', () => {
    const ms = tourProfileMilestones({
      primary: { departDate: iso(10), nccDue: [{ label: 'A', amount: 1, dueDate: iso(2) }] },
      stage: 'won', now: NOW,
    });
    expect(ms[0].key).toBe('ncc');          // ngày sớm hơn đứng trước
    expect(ms.find((m) => m.key === 'depart')?.daysTo).toBe(10);
    expect(ms.find((m) => m.key === 'depart')?.level).toBe('upcoming');
  });
  it('mốc ≤3 ngày → soon; quá hạn → overdue', () => {
    const ms = tourProfileMilestones({ primary: { departDate: iso(2) }, stage: 'won', now: NOW });
    expect(ms.find((m) => m.key === 'depart')?.level).toBe('soon');
    const ms2 = tourProfileMilestones({ primary: { deadline: iso(-1) }, stage: 'quoted', now: NOW });
    expect(ms2.find((m) => m.key === 'quote_deadline')?.level).toBe('overdue');
  });
  it('đã quyết toán → mốc quyết toán = done', () => {
    const ms = tourProfileMilestones({
      primary: { departDate: iso(-5), settlementSummary: { budgetCost: 1, actualCost: 1, actualProfit: 0, actualMarginPct: 0, plannedMarginPct: 0 } },
      stage: 'acceptance', now: NOW,
    });
    expect(ms.find((m) => m.key === 'settlement')?.level).toBe('done');
  });
});

describe('tourProfileTimeline — lọc audit_log theo hồ sơ', () => {
  const e = (over: Partial<AuditEntry>): AuditEntry =>
    ({ id: 'x', at: '2026-06-26T00:00:00Z', byU: 'an', byName: 'AN', action: 'update', entity: 'Hồ sơ tour', name: 'NĐ.26.06.26.01', ...over });
  const entries: AuditEntry[] = [
    e({ id: '1', at: '2026-06-26T03:00:00Z', name: 'NĐ.26.06.26.01' }),
    e({ id: '2', at: '2026-06-26T01:00:00Z', name: 'NĐ.26.06.26.01' }),
    e({ id: '3', name: 'NĐ.26.06.26.02' }),                 // hồ sơ khác
    e({ id: '4', entity: 'Báo giá', name: 'NĐ.26.06.26.01' }), // entity khác
    e({ id: '5', at: '2026-06-25T00:00:00Z', name: 'Tour ABC' }), // entry CŨ theo tên
  ];
  it('lọc theo mã + tên, mới nhất trước', () => {
    const out = tourProfileTimeline(entries, { code: 'NĐ.26.06.26.01', name: 'Tour ABC' });
    expect(out.map((x) => x.id)).toEqual(['1', '2', '5']);
  });
  it('không khớp hồ sơ khác / entity khác', () => {
    const out = tourProfileTimeline(entries, { code: 'NĐ.26.06.26.01', name: '' });
    expect(out.map((x) => x.id)).toEqual(['1', '2']);
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
