import { daysUntil } from '@/lib/dateUtils';
import type {
  ApplicantDoc, User, VisaApplicant, VisaFee, VisaMilestone, VisaProcDoc, VisaProcField,
  VisaProcKind, VisaProcRow, VisaProcSection, VisaProduct, VisaProjectDoc, VisaProjectStatus,
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
