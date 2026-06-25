import { daysUntil } from '@/lib/dateUtils';
import { normalizeVN } from '@/lib/search';
import type {
  ApplicantDoc, User, VisaApplicant, VisaApplicantMilestone, VisaApplicantStatus, VisaFee,
  VisaMilestone, VisaProcDoc, VisaProcField, VisaProcKind, VisaProcRow, VisaProcSection,
  VisaProduct, VisaProjectDoc, VisaProjectStatus,
} from '@/types';

// Source: public/legacy.html:7573-7576.
export const VISAP_TYPES = [
  'Evisa', 'Visa lẻ', 'Visa đoàn', 'Công tác', 'Du lịch',
  'Thăm thân', 'Online', 'Nộp qua đối tác',
] as const;

export const VISA_VALIDITY = [
  '1 lần', 'Nhập cảnh nhiều lần', 'Multi 1 năm',
  'Multi 2 năm', 'Multi 5 năm', 'Multi 10 năm',
] as const;

export const VISA_LOCS = ['HCM', 'HAN', 'DAD', 'Toàn quốc'] as const;

// Gợi ý quốc gia hay xin visa (Autocomplete freeSolo — vẫn nhập tự do được).
export const VISA_COUNTRIES = [
  'Hàn Quốc', 'Nhật Bản', 'Đài Loan', 'Trung Quốc', 'Mỹ', 'Canada', 'Úc',
  'Anh', 'Schengen (EU)', 'Pháp', 'Đức', 'Ý', 'Hà Lan', 'Tây Ban Nha',
  'New Zealand', 'Ấn Độ', 'Nga', 'Dubai (UAE)', 'Singapore', 'Thái Lan',
] as const;

// ── Dự án visa ──────────────────────────────────────────────────────────────

export const VISA_STATUS_META: Record<VisaProjectStatus, { label: string; color: string }> = {
  planning:    { label: 'Lên kế hoạch',    color: '#64748b' },
  in_progress: { label: 'Đang triển khai', color: '#2563eb' },
  reviewing:   { label: 'Đang xét visa',   color: '#f5a623' },
  completed:   { label: 'Hoàn tất',        color: '#27ae60' },
  pending:     { label: 'Pending',         color: '#a855f7' },
  cancelled:   { label: 'Huỷ',             color: '#dc3250' },
};

export const VISA_STATUS_ORDER: VisaProjectStatus[] =
  ['planning', 'in_progress', 'reviewing', 'pending', 'completed', 'cancelled'];

// Các mốc timeline mặc định (customizable — thêm/xoá/đổi tên/đổi ngày).
export const DEFAULT_VISA_MILESTONES: string[] = [
  'Xác nhận tour',
  'Nhận danh sách đoàn',
  'Triển khai liên hệ & hướng dẫn thủ tục',
  'Deadline nộp hồ sơ đoàn',
  'Deadline nộp hồ sơ công ty',
  'Submit hồ sơ',
  'Phỏng vấn / Sinh trắc học',
  'Dự kiến có visa',
  'Khởi hành',
];

/** Mẫu quy trình thủ tục visa theo khu vực/nước. Mỗi mẫu là danh sách BƯỚC chuẩn
 *  phản ánh đúng thủ tục từng loại visa; áp vào dự án sẽ thay danh sách mốc. */
export const VISA_PROC_PRESETS: { key: string; label: string; steps: string[] }[] = [
  { key: 'default', label: 'Chuẩn (mặc định)', steps: DEFAULT_VISA_MILESTONES },
  {
    key: 'schengen', label: 'Schengen (Châu Âu)',
    steps: [
      'Xác nhận tour', 'Nhận danh sách đoàn', 'Tư vấn & hướng dẫn thủ tục',
      'Thu hồ sơ tài chính & việc làm', 'Đặt lịch hẹn VFS / TLScontact',
      'Deadline nộp hồ sơ đoàn', 'Nộp hồ sơ & lấy sinh trắc học',
      'Bổ sung hồ sơ (nếu LSQ yêu cầu)', 'Dự kiến có kết quả', 'Nhận hộ chiếu / visa', 'Khởi hành',
    ],
  },
  {
    key: 'korea', label: 'Hàn Quốc',
    steps: [
      'Xác nhận tour', 'Nhận danh sách đoàn', 'Hướng dẫn & thu hồ sơ',
      'Deadline hồ sơ chứng minh tài chính', 'Deadline nộp hồ sơ đoàn',
      'Nộp hồ sơ KVAC', 'Dự kiến có visa', 'Khởi hành',
    ],
  },
  {
    key: 'japan', label: 'Nhật Bản',
    steps: [
      'Xác nhận tour', 'Nhận danh sách đoàn', 'Thu hồ sơ & giấy tờ bảo lãnh',
      'Chuẩn bị hồ sơ đại diện đoàn', 'Deadline nộp hồ sơ',
      'Nộp ĐSQ/LSQ qua đại lý uỷ thác', 'Dự kiến có visa', 'Khởi hành',
    ],
  },
  {
    key: 'usa', label: 'Mỹ (phỏng vấn)',
    steps: [
      'Xác nhận tour', 'Nhận danh sách đoàn', 'Khai DS-160',
      'Đóng phí & đặt lịch phỏng vấn', 'Chuẩn bị hồ sơ phỏng vấn',
      'Phỏng vấn tại LSQ', 'Nhận kết quả & hộ chiếu', 'Khởi hành',
    ],
  },
  {
    key: 'taiwan', label: 'Đài Loan',
    steps: [
      'Xác nhận tour', 'Nhận danh sách đoàn', 'Thu hồ sơ',
      'Xin visa Quan Hồng / eVisa', 'Dự kiến có visa', 'Khởi hành',
    ],
  },
  {
    key: 'china', label: 'Trung Quốc',
    steps: [
      'Xác nhận tour', 'Nhận danh sách đoàn', 'Thu hồ sơ & ảnh',
      'Nộp Trung tâm visa CVASC', 'Lấy sinh trắc học', 'Dự kiến có visa', 'Khởi hành',
    ],
  },
  {
    key: 'uk', label: 'Anh (UK)',
    steps: [
      'Xác nhận tour', 'Nhận danh sách đoàn', 'Tư vấn & thu hồ sơ',
      'Khai đơn online & đặt lịch VFS', 'Deadline nộp hồ sơ',
      'Nộp hồ sơ & lấy sinh trắc học', 'Dự kiến có kết quả', 'Nhận hộ chiếu / visa', 'Khởi hành',
    ],
  },
  {
    key: 'anz', label: 'Úc / New Zealand',
    steps: [
      'Xác nhận tour', 'Nhận danh sách đoàn', 'Thu hồ sơ',
      'Nộp hồ sơ online (ImmiAccount)', 'Khám sức khoẻ (nếu yêu cầu)',
      'Lấy sinh trắc học', 'Dự kiến có visa', 'Khởi hành',
    ],
  },
];

const VISA_PRESET_KEYWORDS: Record<string, string[]> = {
  schengen: ['schengen', 'chau au', 'europe', 'phap', 'france', 'duc', 'german', 'italy', 'tay ban nha', 'spain', 'ha lan', 'netherland', 'bo dao nha', 'portugal', 'thuy si', 'switzerland', 'austria', 'belgium', 'hy lap', 'greece', 'czech', 'sec'],
  korea: ['han quoc', 'korea'],
  japan: ['nhat', 'japan'],
  usa: ['my', 'hoa ky', 'usa', 'america', 'united states'],
  taiwan: ['dai loan', 'taiwan'],
  china: ['trung quoc', 'china'],
  uk: ['anh', 'uk', 'united kingdom', 'britain'],
  anz: ['uc', 'australia', 'new zealand', 'niu di lan'],
};

/** Gợi ý khoá mẫu quy trình theo tên quốc gia (heuristic; user vẫn đổi tay được). */
export function visaPresetKeyForCountry(country: string | undefined | null): string {
  const c = normalizeVN(country);
  if (!c) return 'default';
  for (const [key, kws] of Object.entries(VISA_PRESET_KEYWORDS)) {
    if (kws.some((k) => c.includes(k))) return key;
  }
  return 'default';
}

/** Nhãn + màu đếm ngược/quá hạn cho một mốc deadline. */
export function deadlineMeta(date: string | null, done: boolean): { text: string; color: string } {
  if (done) return { text: '✓ Hoàn tất', color: '#27ae60' };
  const d = daysUntil(date);
  if (d == null) return { text: 'Chưa đặt ngày', color: '#94a3b8' };
  if (d < 0) return { text: `Quá hạn ${Math.abs(d)} ngày`, color: '#dc3250' };
  if (d === 0) return { text: 'Hôm nay', color: '#f5a623' };
  if (d <= 7) return { text: `Còn ${d} ngày`, color: '#f5a623' };
  return { text: `Còn ${d} ngày`, color: '#2563eb' };
}

let milestoneSeq = 0;
export function newVisaMilestone(label = 'Mốc mới'): VisaMilestone {
  return {
    id: 'vm' + Date.now().toString(36) + (milestoneSeq++).toString(36) + Math.random().toString(36).slice(2, 5),
    label,
    date: null,
    done: false,
  };
}

export function generateVisaProjectCode(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `DAV-${p(d.getDate())}${p(d.getMonth() + 1)}${String(d.getFullYear()).slice(2)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

export const APPLICANT_DOC_META: Record<VisaApplicant['docStatus'], { label: string; color: string }> = {
  missing:   { label: 'Thiếu hồ sơ', color: '#dc3250' },
  submitted: { label: 'Đã nộp',      color: '#f5a623' },
  complete:  { label: 'Đủ hồ sơ',    color: '#27ae60' },
};

export const APPLICANT_RESULT_META: Record<VisaApplicant['result'], { label: string; color: string }> = {
  pending:   { label: 'Chờ kết quả', color: '#a855f7' },
  passed:    { label: 'Đậu',         color: '#27ae60' },
  failed:    { label: 'Rớt',         color: '#dc3250' },
  have_visa: { label: 'Đã có visa',  color: '#2563eb' },
};

// ── Tình trạng xin visa của TỪNG khách (8 mốc vòng đời hồ sơ) ────────────────
export const VISA_APPLICANT_STATUS_META: Record<VisaApplicantStatus, { label: string; color: string }> = {
  deployed:   { label: 'Đã triển khai',       color: '#2563eb' },
  collecting: { label: 'Đang thu hồ sơ',      color: '#f5a623' },
  collected:  { label: 'Đã thu đủ hồ sơ',     color: '#0d9488' },
  biometrics: { label: 'Đã SLTH / phỏng vấn', color: '#a855f7' },
  passed:     { label: 'Đậu visa',            color: '#27ae60' },
  failed:     { label: 'Rớt visa',            color: '#dc3250' },
  have_visa:  { label: 'Đã có sẵn visa',      color: '#0369a1' },
  cancelled:  { label: 'Huỷ',                 color: '#64748b' },
};

export const VISA_APPLICANT_STATUS_ORDER: VisaApplicantStatus[] =
  ['deployed', 'collecting', 'collected', 'biometrics', 'passed', 'failed', 'have_visa', 'cancelled'];

/** Suy tình trạng visa hợp nhất từ dữ liệu cũ (docStatus + result) khi chưa có
 *  `visaStatus`. Giúp hồ sơ tạo trước khi có trường mới vẫn hiển thị đúng. */
export function deriveVisaStatus(a: { visaStatus?: VisaApplicantStatus; docStatus?: VisaApplicant['docStatus']; result?: VisaApplicant['result'] }): VisaApplicantStatus {
  if (a.visaStatus) return a.visaStatus;
  switch (a.result) {
    case 'passed': return 'passed';
    case 'failed': return 'failed';
    case 'have_visa': return 'have_visa';
    default: break;
  }
  switch (a.docStatus) {
    case 'complete': return 'collected';
    case 'submitted': return 'collecting';
    default: return 'deployed';
  }
}

/** Đồng bộ NGƯỢC về docStatus + result để các chỗ cũ (đếm số liệu/dashboard/cảnh
 *  báo) tiếp tục chạy đúng khi user đổi `visaStatus`. */
export function legacyFromVisaStatus(s: VisaApplicantStatus): { docStatus: VisaApplicant['docStatus']; result: VisaApplicant['result'] } {
  switch (s) {
    case 'passed':     return { docStatus: 'complete', result: 'passed' };
    case 'failed':     return { docStatus: 'complete', result: 'failed' };
    case 'have_visa':  return { docStatus: 'complete', result: 'have_visa' };
    case 'collected':  return { docStatus: 'complete', result: 'pending' };
    case 'biometrics': return { docStatus: 'complete', result: 'pending' };
    case 'collecting': return { docStatus: 'submitted', result: 'pending' };
    case 'cancelled':  return { docStatus: 'missing', result: 'pending' };
    case 'deployed':
    default:           return { docStatus: 'missing', result: 'pending' };
  }
}

/** Trạng thái đã "chốt" — không còn coi là trễ hạn. */
const RESOLVED_APPLICANT_STATUS: VisaApplicantStatus[] = ['passed', 'have_visa', 'cancelled'];

/** Khách có mốc timeline đã QUÁ HẠN mà hồ sơ chưa chốt (đậu/đã có/huỷ)? */
export function isApplicantOverdue(a: {
  visaStatus?: VisaApplicantStatus; docStatus?: VisaApplicant['docStatus']; result?: VisaApplicant['result'];
  timeline?: VisaApplicantMilestone[]; visaTimeline?: VisaApplicantMilestone[];
}): boolean {
  if (RESOLVED_APPLICANT_STATUS.includes(deriveVisaStatus(a))) return false;
  const tl = a.timeline ?? a.visaTimeline ?? [];
  return tl.some((m) => { const d = daysUntil(m.date ?? null); return d != null && d < 0; });
}

// ── Timeline RIÊNG của từng khách ────────────────────────────────────────────
/** Các mốc timeline chuẩn cho mỗi khách (thêm mốc tuỳ biến được). */
export const DEFAULT_APPLICANT_TIMELINE: { key: string; label: string }[] = [
  { key: 'deploy', label: 'Ngày triển khai hồ sơ' },
  { key: 'doc_deadline', label: 'Deadline nhận hồ sơ' },
  { key: 'biometrics', label: 'Ngày SLTH / phỏng vấn' },
  { key: 'expected', label: 'Ngày dự kiến có visa' },
  { key: 'departure', label: 'Ngày khởi hành' },
];

/** Màu cho từng mốc chuẩn trên biểu đồ timeline (mốc tuỳ biến dùng màu xám). */
export const APPLICANT_MILESTONE_COLOR: Record<string, string> = {
  deploy: '#2563eb',
  doc_deadline: '#f5a623',
  biometrics: '#a855f7',
  expected: '#0d9488',
  departure: '#dc3250',
};
export const APPLICANT_MILESTONE_CUSTOM_COLOR = '#64748b';

let applicantMsSeq = 0;
export function newApplicantMilestone(label = 'Mốc mới', key?: string, date: string | null = null): VisaApplicantMilestone {
  return {
    id: 'am' + Date.now().toString(36) + (applicantMsSeq++).toString(36) + Math.random().toString(36).slice(2, 4),
    label,
    date,
    ...(key ? { key } : {}),
  };
}

/** Bộ mốc chuẩn ban đầu cho khách mới (ngày khởi hành có thể seed từ dự án). */
export function defaultApplicantTimeline(departureDate?: string | null): VisaApplicantMilestone[] {
  return DEFAULT_APPLICANT_TIMELINE.map((m) =>
    newApplicantMilestone(m.label, m.key, m.key === 'departure' ? (departureDate ?? null) : null));
}

// Checklist hồ sơ mặc định cho mỗi khách (thêm loại khác được).
export const DEFAULT_APPLICANT_DOCS = [
  'Hộ chiếu (bản gốc)', 'Hình thẻ', 'Hồ sơ công việc',
  'Hồ sơ nhân thân', 'Hồ sơ tài chính', 'Hồ sơ tài sản',
] as const;

let applicantDocSeq = 0;
export function newApplicantDoc(label = 'Hồ sơ khác'): ApplicantDoc {
  return {
    id: 'ad' + Date.now().toString(36) + (applicantDocSeq++).toString(36) + Math.random().toString(36).slice(2, 4),
    label,
    checked: false,
  };
}

let applicantSeq = 0;
export function newVisaApplicant(): VisaApplicant {
  return {
    id: 'va' + Date.now().toString(36) + (applicantSeq++).toString(36) + Math.random().toString(36).slice(2, 5),
    name: '',
    nameNoAccent: '',
    gender: '',
    dob: '',
    passport: '',
    passportIssue: '',
    passportExpiry: '',
    countriesVisited: '',
    docStatus: 'missing',
    result: 'pending',
    visaStatus: 'deployed',
    timeline: defaultApplicantTimeline(),
    failReason: '',
    docs: DEFAULT_APPLICANT_DOCS.map((l) => newApplicantDoc(l)),
    note: '',
  };
}

/** Tổng hợp 5 ô số liệu từ danh sách khách (checklist). */
export function countsFromApplicants(applicants: VisaApplicant[]): Pick<
  VisaProjectDoc, 'applyCount' | 'passedCount' | 'failedCount' | 'haveVisaCount' | 'pendingCount'
> {
  return {
    applyCount: applicants.length,
    passedCount: applicants.filter((a) => a.result === 'passed').length,
    failedCount: applicants.filter((a) => a.result === 'failed').length,
    haveVisaCount: applicants.filter((a) => a.result === 'have_visa').length,
    pendingCount: applicants.filter((a) => a.result === 'pending').length,
  };
}

export function newVisaProject(user: User | null): VisaProjectDoc {
  return {
    id: 'vproj' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    code: generateVisaProjectCode(),
    name: '',
    country: '',
    status: 'planning',
    mainStaff: user?.u ? [user.u] : [],
    supportStaff: [],
    documentsSummary: '',
    linkedQuoteId: null,
    linkedQuoteName: '',
    linkedProcIds: [],
    attachments: [],
    applyCount: 0,
    passedCount: 0,
    failedCount: 0,
    haveVisaCount: 0,
    pendingCount: 0,
    startDate: null,
    departureDate: null,
    endDate: null,
    milestones: DEFAULT_VISA_MILESTONES.map((l) => newVisaMilestone(l)),
    applicants: [],
    collaborators: [],
    createdByUsername: user?.u ?? '',
    createdByName: user?.name ?? '',
  };
}

export const VISA_FEE_PRESET = [
  'Chi phí lãnh sự', 'Chi phí trung tâm tiếp nhận', 'Chi phí dịch thuật',
  'Chi phí công chứng', 'Chi phí hợp pháp hoá lãnh sự', 'Chi phí chuyển phát',
  'Chi phí in ấn', 'Chi phí công ty trung gian', 'Chi phí dịch vụ',
  'Phí thanh toán thẻ', 'Chi phí khác',
] as const;

export const PROC_KIND_ICON: Record<VisaProcKind, string> = {
  enterprise: '🏢',
  applicant: '🧑‍✈️',
  content: '📝',
  relative: '👪',
  custom: '📋',
};

// Source: legacy 7577.
export function newVisaFee(name = 'Chi phí dịch vụ'): VisaFee {
  return {
    id: 'vf' + Date.now() + Math.random().toString(36).slice(2, 5),
    name,
    amount: 0,
    cur: 'VND',
    perPax: true,
  };
}

// Source: legacy 7578.
export function newVisaProduct(): VisaProduct {
  return {
    id: 'vp' + Date.now() + Math.random().toString(36).slice(2, 5),
    country: '',
    visaType: 'Evisa',
    validity: '1 lần',
    location: 'HCM',
    fees: VISA_FEE_PRESET.map((n) => newVisaFee(n)),
    markupType: 'percent',
    markupValue: 0,
    markupCur: 'VND',
    note: '',
    active: true,
  };
}

// Source: legacy 7935-7937.
export function newProcField(label = 'Trường mới'): VisaProcField {
  return {
    id: 'pf' + Date.now() + Math.random().toString(36).slice(2, 6),
    label,
  };
}

export function newProcRow(fieldDefs: VisaProcField[]): VisaProcRow {
  const values: Record<string, string> = {};
  fieldDefs.forEach((f) => { values[f.id] = ''; });
  return {
    id: 'pr' + Date.now() + Math.random().toString(36).slice(2, 6),
    values,
  };
}

export function newProcSection(
  kind: VisaProcKind = 'custom',
  title = 'Mục mới',
  labels: string[] = ['Trường mới'],
  repeatable = false,
): VisaProcSection {
  const fieldDefs = labels.map((l) => newProcField(l));
  return {
    id: 'ps' + Date.now() + Math.random().toString(36).slice(2, 6),
    kind,
    title,
    repeatable,
    fieldDefs,
    rows: [newProcRow(fieldDefs)],
  };
}

// Source: legacy 7938.
export function generateVisaProcCode(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `HSV-${p(d.getDate())}${p(d.getMonth() + 1)}${String(d.getFullYear()).slice(2)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

// Source: legacy 7939-7954.
export function newVisaProcDoc(user: User | null): VisaProcDoc {
  return {
    id: 'vproc' + Date.now() + Math.random().toString(36).slice(2, 6),
    code: generateVisaProcCode(),
    title: 'Hồ sơ thủ tục visa',
    country: '',
    visaType: '',
    isTemplate: false,
    attachments: [],
    linkedQuoteId: null,
    linkedQuoteName: '',
    createdByUsername: user?.u ?? '',
    createdByName: user?.name ?? '',
    collaborators: [],
    sections: [
      newProcSection('enterprise', 'Thông tin Doanh nghiệp bảo lãnh',
        ['Tên doanh nghiệp', 'Mã số thuế', 'Địa chỉ', 'Người đại diện',
         'Chức vụ', 'Điện thoại', 'Email', 'Ngành nghề'], false),
      newProcSection('applicant', 'Khách tham dự',
        ['Họ và tên', 'Giới tính', 'Ngày sinh', 'Số hộ chiếu',
         'Ngày cấp HC', 'Ngày hết hạn HC', 'Chức vụ', 'Quốc tịch'], true),
      newProcSection('content', 'Nội dung xin visa',
        ['Mục đích nhập cảnh', 'Số lần nhập cảnh', 'Thời gian lưu trú',
         'Ngày nhập cảnh', 'Ngày xuất cảnh', 'Nơi lưu trú', 'Đơn vị mời / đối tác'], false),
      newProcSection('relative', 'Thân nhân',
        ['Họ và tên', 'Quan hệ', 'Ngày sinh', 'Nghề nghiệp',
         'Địa chỉ', 'Cùng đi (Có/Không)'], true),
    ],
    versions: [],
  };
}
