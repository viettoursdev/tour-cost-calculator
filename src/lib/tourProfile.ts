// ════════════════════════════════════════════════════════════════════════
//  Hàm THUẦN cho Hồ sơ tour (Tour Profile) — dễ test, không đụng store/IO.
//   • generateTourCode: mã `NĐ.DD.MM.YY.NN` / `NN.DD.MM.YY.NN` (fallback client;
//     đường thật dùng RPC `next_tour_code` atomic ở DB — xem sbNextTourCode).
//   • canViewTourProfile / visibleTourProfiles: quyền XEM = quyền bản ghi
//     (recordAccess) HOẶC là follower (theo dõi → cũng được xem).
// ════════════════════════════════════════════════════════════════════════
import type { AuditEntry, CloudQuoteEntry, TourCategory, TourKind, TourProfile, User } from '@/types';
import { canViewRecord } from '@/auth/recordAccess';
import { isApprover } from '@/auth/ROLES';

/** Tiền tố mã theo loại: nội địa → NĐ, nước ngoài → NN. */
export const tourPrefix = (kind: TourKind): string => (kind === 'intl' ? 'NN' : 'NĐ');

/** Metadata 5 loại hồ sơ: nhãn VN + tiền tố mã + màu + emoji (dùng chung UI/lọc). */
export const TOUR_CATEGORIES: { key: TourCategory; label: string; short: string; prefix: string; color: string; icon: string }[] = [
  { key: 'incentive_domestic', label: 'Tour incentive nội địa', short: 'Incentive NĐ', prefix: 'NĐ', color: '#0d7a6a', icon: '🏕️' },
  { key: 'incentive_intl',     label: 'Tour incentive nước ngoài', short: 'Incentive NN', prefix: 'NN', color: '#2563eb', icon: '🌏' },
  { key: 'visa',               label: 'Visa', short: 'Visa', prefix: 'VS', color: '#7c3aed', icon: '🛂' },
  { key: 'event',              label: 'Event', short: 'Event', prefix: 'EV', color: '#d97706', icon: '🎫' },
  { key: 'other',              label: 'Dịch vụ khác', short: 'Dịch vụ', prefix: 'DV', color: '#64748b', icon: '🧩' },
];

/** Suy loại hồ sơ (fallback từ `kind` cho dữ liệu cũ chưa có `category`). */
export function tourCategoryOf(p: Pick<TourProfile, 'category' | 'kind'>): TourCategory {
  return p.category ?? (p.kind === 'intl' ? 'incentive_intl' : 'incentive_domestic');
}

/** Tiền tố mã theo category. */
export function categoryPrefix(cat: TourCategory): string {
  return TOUR_CATEGORIES.find((c) => c.key === cat)?.prefix ?? 'NĐ';
}

/** `kind` (NĐ/NN) suy từ category — để tương thích template báo giá tiêu chuẩn. */
export function categoryKind(cat: TourCategory): TourKind {
  return cat === 'incentive_intl' ? 'intl' : 'domestic';
}

/** Meta hiển thị của một category (nhãn/màu/emoji). */
export const categoryMeta = (cat: TourCategory) =>
  TOUR_CATEGORIES.find((c) => c.key === cat) ?? TOUR_CATEGORIES[0];

/** Phần ngày `DD.MM.YY` của mã (theo `now`, mặc định hôm nay). */
export function tourDatePart(now: Date = new Date()): string {
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}

/**
 * Sinh mã hồ sơ tour `NĐ.DD.MM.YY.NN` — STT đếm theo prefix + ngày trong `existing`.
 * Chỉ là FALLBACK/đoán phía client; nguồn chuẩn duy nhất là RPC atomic ở DB.
 */
export function generateTourCode(kind: TourKind, existing: TourProfile[], now: Date = new Date()): string {
  const prefix = tourPrefix(kind);
  const date = tourDatePart(now);
  // Mã dạng `NĐ.DD.MM.YY.NN` — ngày ở GIỮA, STT ở cuối → khớp theo tiền tố prefix+ngày.
  const head = `${prefix}.${date}.`;
  const sameDay = existing.filter((p) => p.code?.startsWith(head)).length;
  const seq = String(sameDay + 1).padStart(2, '0');
  return `${prefix}.${date}.${seq}`;
}

/**
 * Quyết định báo giá chính kế tiếp khi XOÁ một báo giá khỏi hồ sơ (hàm thuần).
 *  - Xoá báo giá KHÔNG phải chính → không cần đổi gì (null).
 *  - Xoá báo giá chính, còn báo giá khác → chuyển primary sang cái đầu tiên còn lại.
 *  - Xoá báo giá chính, hết báo giá → gỡ primary + lưu trữ hồ sơ (chống mồ côi).
 */
export function nextPrimaryAfterDelete(
  currentPrimaryId: string | undefined,
  deletedCloudId: string,
  remainingCloudIds: string[],
): { primaryQuoteId: string | undefined; archive: boolean } | null {
  if (currentPrimaryId !== deletedCloudId) return null;
  if (remainingCloudIds.length > 0) return { primaryQuoteId: remainingCloudIds[0], archive: false };
  return { primaryQuoteId: undefined, archive: true };
}

/** Quyền XEM một hồ sơ: theo recordAccess HOẶC là follower / nhân sự event. */
export function canViewTourProfile(user: User | null | undefined, p: TourProfile, users: User[]): boolean {
  if (!user) return false;
  if (canViewRecord(user, p, users)) return true;
  return [...(p.followers ?? []), ...(p.eventStaff ?? [])].some((f) => f.u === user.u);
}

/**
 * Quy tắc duyệt XOÁ hồ sơ tour:
 *  - Trưởng Phòng / BGĐ / CEO (isApprover) → xoá trực tiếp.
 *  - Người dưới Trưởng Phòng → phải GỬI yêu cầu cho một người duyệt.
 */
export function deleteNeedsApproval(user: User | null | undefined): boolean {
  return !!user && !isApprover(user.role);
}

/** User này có quyền DUYỆT yêu cầu xoá không (là người được chọn HOẶC là approver). */
export function canApproveDelete(user: User | null | undefined, p: TourProfile): boolean {
  if (!user || !p.deleteRequest) return false;
  return p.deleteRequest.approverU === user.u || isApprover(user.role);
}

/** Lọc danh sách hồ sơ theo quyền xem của user. */
export function visibleTourProfiles(
  user: User | null | undefined,
  list: TourProfile[],
  users: User[],
): TourProfile[] {
  if (!user) return [];
  return list.filter((p) => canViewTourProfile(user, p, users));
}

// ════════════════════════════════════════════════════════════════════════
//  Thẻ "Cần chú ý" (A2) + Dòng thời gian hoạt động (A1) — hàm THUẦN.
// ════════════════════════════════════════════════════════════════════════

/** Nhãn entity trong audit_log cho hồ sơ tour (lọc dòng thời gian theo đây). */
export const TOUR_AUDIT_ENTITY = 'Hồ sơ tour';

const DAY = 86_400_000;
const days = (a: number, b: number) => Math.round((a - b) / DAY);

export type TourRiskLevel = 'urgent' | 'warn';
export type TourRisk = { key: string; level: TourRiskLevel; label: string };

/** Giai đoạn được coi là "đã thắng/đang chạy" (đã có cam kết với khách). */
const WON_STAGES = new Set(['won', 'contract', 'operating', 'acceptance', 'closed']);
/** Giai đoạn đã đóng (không còn rủi ro tác nghiệp). */
const DONE_STAGES = new Set(['closed', 'lost']);

/**
 * Suy ra các cảnh báo "cần chú ý" của một hồ sơ từ báo giá chính + số hợp đồng +
 * giai đoạn. HÀM THUẦN (truyền `now` để test). Trả [] nếu không có rủi ro.
 *  - Báo giá quá hạn deadline (khi chưa chốt).
 *  - Bước quy trình vận hành quá hạn.
 *  - Sắp tới hạn / quá hạn trả NCC.
 *  - Sắp khởi hành mà CHƯA có hợp đồng (deal đã thắng).
 *  - Còn công nợ NCC khi sắp khởi hành.
 *  - Đã qua ngày khởi hành mà CHƯA quyết toán.
 */
export function tourProfileRisks(args: {
  primary?: Pick<CloudQuoteEntry, 'deadline' | 'departDate' | 'workflowDue' | 'nccDue' | 'paymentSummary' | 'settlementSummary'>;
  stage: string;
  contractCount: number;
  now?: Date;
}): TourRisk[] {
  const { primary, stage, contractCount } = args;
  const now = (args.now ?? new Date()).getTime();
  const risks: TourRisk[] = [];
  if (!primary || DONE_STAGES.has(stage)) {
    // Đã đóng/thua → không còn rủi ro tác nghiệp (trừ "lost" hiển nhiên).
    if (!primary) return risks;
    if (stage === 'closed' || stage === 'lost') return risks;
  }
  if (!primary) return risks;

  const won = WON_STAGES.has(stage);
  const dep = primary.departDate ? new Date(primary.departDate).getTime() : null;

  // 1) Báo giá quá hạn (chỉ khi chưa chốt).
  if (primary.deadline && !won && new Date(primary.deadline).getTime() < now) {
    risks.push({ key: 'quote_overdue', level: 'urgent', label: 'Báo giá quá hạn' });
  }
  // 2) Bước quy trình vận hành quá hạn.
  const overdueSteps = (primary.workflowDue ?? []).filter((w) => new Date(w.dueDate).getTime() < now).length;
  if (overdueSteps > 0) {
    risks.push({ key: 'workflow_overdue', level: 'urgent', label: `${overdueSteps} bước quy trình quá hạn` });
  }
  // 3) Tới hạn / quá hạn trả NCC (trong 7 ngày).
  const nccSoon = (primary.nccDue ?? []).filter((d) => days(new Date(d.dueDate).getTime(), now) <= 7).length;
  if (nccSoon > 0) {
    risks.push({ key: 'ncc_due', level: 'warn', label: `${nccSoon} khoản NCC tới hạn` });
  }
  // 4) Sắp khởi hành mà chưa có hợp đồng (deal đã thắng).
  if (won && dep !== null && contractCount === 0 && days(dep, now) <= 14 && dep >= now) {
    risks.push({ key: 'no_contract', level: 'urgent', label: 'Sắp khởi hành chưa có hợp đồng' });
  }
  // 5) Còn công nợ NCC khi sắp khởi hành (≤7 ngày).
  if (dep !== null && (primary.paymentSummary?.remaining ?? 0) > 0 && days(dep, now) <= 7 && dep >= now) {
    risks.push({ key: 'payable_remaining', level: 'warn', label: 'Còn công nợ NCC sắp khởi hành' });
  }
  // 6) Đã qua khởi hành mà chưa quyết toán.
  if (dep !== null && dep < now && !primary.settlementSummary && (won || stage === 'operating' || stage === 'acceptance')) {
    risks.push({ key: 'no_settlement', level: 'warn', label: 'Đã khởi hành chưa quyết toán' });
  }
  return risks;
}

/** Mức cao nhất trong danh sách rủi ro (urgent > warn > null). */
export function topRiskLevel(risks: TourRisk[]): TourRiskLevel | null {
  if (risks.some((r) => r.level === 'urgent')) return 'urgent';
  if (risks.length > 0) return 'warn';
  return null;
}

/**
 * Dòng thời gian hoạt động của MỘT hồ sơ — lọc audit_log theo entity + mã/tên.
 * Khớp cả entry cũ (name = tên hồ sơ) lẫn mới (name = mã code, ổn định/duy nhất).
 * Trả về mới-nhất-trước.
 */
export function tourProfileTimeline(
  entries: AuditEntry[],
  profile: Pick<TourProfile, 'code' | 'name'>,
): AuditEntry[] {
  return entries
    .filter((e) => e.entity === TOUR_AUDIT_ENTITY && (e.name === profile.code || (!!profile.name && e.name === profile.name)))
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
}

// ════════════════════════════════════════════════════════════════════════
//  Cổng đóng hồ sơ (B1) + Mốc thời gian & đếm ngược (B2) — hàm THUẦN.
// ════════════════════════════════════════════════════════════════════════

/** Tiền tố tên bản sao khi nhân bản hồ sơ/báo giá làm tour mẫu. */
export const CLONE_PREFIX = '(Bản sao) ';

/** Tên bản sao — không nhân đôi tiền tố nếu đã là bản sao. */
export function clonedQuoteName(name: string): string {
  const n = (name ?? '').trim();
  return n.startsWith(CLONE_PREFIX.trim()) ? n : `${CLONE_PREFIX}${n}`.trim();
}

export type ClosingItem = { key: string; label: string; done: boolean };

/**
 * Checklist ĐÓNG (lưu trữ) hồ sơ — chỉ áp cho deal ĐÃ THẮNG/đang chạy (mới có gì
 * để đối soát). Hàm THUẦN. Trả [] với deal chưa thắng / đã thua → lưu trữ tự do.
 *  - Đã có hợp đồng · Đã quyết toán · Hết công nợ NCC · Quy trình không còn việc tới hạn.
 */
export function tourProfileClosingChecklist(args: {
  primary?: Pick<CloudQuoteEntry, 'settlementSummary' | 'paymentSummary' | 'workflowDue'>;
  stage: string;
  contractCount: number;
}): ClosingItem[] {
  const { primary, stage, contractCount } = args;
  if (!primary || !WON_STAGES.has(stage)) return [];
  return [
    { key: 'contract', label: 'Đã có hợp đồng', done: contractCount > 0 },
    { key: 'settlement', label: 'Đã quyết toán', done: !!primary.settlementSummary },
    { key: 'ncc_paid', label: 'Hết công nợ NCC', done: (primary.paymentSummary?.remaining ?? 0) <= 0 },
    { key: 'workflow', label: 'Quy trình không còn việc tới hạn', done: (primary.workflowDue?.length ?? 0) === 0 },
  ];
}

/** Còn mục nào CHƯA xong trong checklist đóng hồ sơ không (rỗng = sẵn sàng đóng). */
export function closingPending(items: ClosingItem[]): ClosingItem[] {
  return items.filter((i) => !i.done);
}

export type MilestoneLevel = 'overdue' | 'soon' | 'upcoming' | 'done';
export type Milestone = { key: string; label: string; date: string; daysTo: number; level: MilestoneLevel };

const milestoneLevel = (date: number, now: number, done: boolean): MilestoneLevel => {
  if (done) return 'done';
  const d = days(date, now);
  if (d < 0) return 'overdue';
  if (d <= 3) return 'soon';
  return 'upcoming';
};

/**
 * Mốc thời gian của hồ sơ (suy từ báo giá chính) — đếm ngược + mức độ gấp.
 * HÀM THUẦN. Mới-tới-trước (sắp xếp theo ngày tăng dần), bỏ mốc không có ngày.
 *  - Khởi hành · Hạn báo giá (chưa chốt) · Bước quy trình gần nhất · Trả NCC gần nhất · Quyết toán.
 */
export function tourProfileMilestones(args: {
  primary?: Pick<CloudQuoteEntry, 'departDate' | 'deadline' | 'workflowDue' | 'nccDue' | 'settlementSummary'>;
  stage: string;
  now?: Date;
}): Milestone[] {
  const { primary, stage } = args;
  if (!primary) return [];
  const now = (args.now ?? new Date()).getTime();
  const out: Milestone[] = [];
  const push = (key: string, label: string, dateISO?: string, done = false) => {
    if (!dateISO) return;
    const t = new Date(dateISO).getTime();
    if (Number.isNaN(t)) return;
    out.push({ key, label, date: dateISO, daysTo: days(t, now), level: milestoneLevel(t, now, done) });
  };
  const won = WON_STAGES.has(stage);

  push('depart', 'Khởi hành', primary.departDate, primary.departDate ? new Date(primary.departDate).getTime() < now : false);
  if (!won) push('quote_deadline', 'Hạn báo giá', primary.deadline);
  // Bước quy trình tới hạn gần nhất.
  const wf = [...(primary.workflowDue ?? [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  if (wf) push('workflow', `Bước: ${wf.label}`, wf.dueDate);
  // Đợt trả NCC gần nhất.
  const ncc = [...(primary.nccDue ?? [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  if (ncc) push('ncc', `Trả NCC${ncc.supplier ? ' · ' + ncc.supplier : ''}`, ncc.dueDate);
  // Quyết toán: nếu đã có settlement → done (mốc theo ngày khởi hành); nếu chưa & đã đi → overdue.
  if (primary.departDate && (won || stage === 'operating' || stage === 'acceptance')) {
    push('settlement', 'Quyết toán', primary.departDate, !!primary.settlementSummary);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ════════════════════════════════════════════════════════════════════════
//  Khách hàng 360 (C1) + Biên lợi kế hoạch vs thực (C2) — hàm THUẦN.
// ════════════════════════════════════════════════════════════════════════

/** Một dòng rút gọn của hồ sơ (đã suy giai đoạn + giá trị ở tầng gọi). */
export type ProfilePortfolioRow = {
  id: string; code: string; name: string; customerName?: string;
  stage: string; value?: number; profit?: number;
};

export type CustomerPortfolio = {
  customer: string;
  count: number; won: number; lost: number;
  totalValue: number; totalProfit: number; profitN: number;
  items: ProfilePortfolioRow[];
};

const normName = (s?: string) => (s ?? '').trim().toLowerCase();

/**
 * Gom toàn bộ hồ sơ của MỘT khách hàng (theo tên, không phân biệt hoa/thường) →
 * tổng giá trị / biên lợi thực / số thắng-thua. HÀM THUẦN.
 */
export function customerPortfolio(rows: ProfilePortfolioRow[], customerName: string): CustomerPortfolio {
  const key = normName(customerName);
  const items = key ? rows.filter((r) => normName(r.customerName) === key) : [];
  let won = 0, lost = 0, totalValue = 0, totalProfit = 0, profitN = 0;
  for (const r of items) {
    if (r.stage === 'lost') lost++; else if (WON_STAGES.has(r.stage)) won++;
    totalValue += r.value ?? 0;
    if (typeof r.profit === 'number') { totalProfit += r.profit; profitN++; }
  }
  return { customer: customerName, count: items.length, won, lost, totalValue, totalProfit, profitN, items };
}

export type MarginSummary = {
  n: number;                 // số hồ sơ đã quyết toán
  plannedAvgPct: number | null;
  actualAvgPct: number | null;
  variancePct: number | null; // actual − planned (điểm %)
  totalBudgetCost: number;
  totalActualCost: number;
  totalActualProfit: number;
};

/** Tóm tắt biên lợi KẾ HOẠCH vs THỰC trên các hồ sơ đã quyết toán. HÀM THUẦN. */
export function marginSummary(
  settlements: Array<Pick<CloudQuoteEntry, 'settlementSummary'>['settlementSummary']>,
): MarginSummary {
  const ss = settlements.filter((s): s is NonNullable<typeof s> => !!s);
  const n = ss.length;
  if (n === 0) {
    return { n: 0, plannedAvgPct: null, actualAvgPct: null, variancePct: null, totalBudgetCost: 0, totalActualCost: 0, totalActualProfit: 0 };
  }
  const sum = (f: (s: NonNullable<typeof ss[number]>) => number) => ss.reduce((a, s) => a + f(s), 0);
  const plannedAvgPct = sum((s) => s.plannedMarginPct) / n;
  const actualAvgPct = sum((s) => s.actualMarginPct) / n;
  return {
    n,
    plannedAvgPct,
    actualAvgPct,
    variancePct: actualAvgPct - plannedAvgPct,
    totalBudgetCost: sum((s) => s.budgetCost),
    totalActualCost: sum((s) => s.actualCost),
    totalActualProfit: sum((s) => s.actualProfit),
  };
}
