/**
 * Danh mục cột xuất danh sách khách xin visa — phần THUẦN (không kéo ExcelJS),
 * để picker import nhẹ. Hàm xuất Excel nặng nằm ở exportVisaApplicantList.ts.
 */
import { fmtDate } from '@/lib/dateUtils';
import {
  DEFAULT_APPLICANT_TIMELINE, VISA_APPLICANT_STATUS_META, deriveVisaStatus, isApplicantOverdue,
} from '@/components/visa/constants';
import { RELATION_LABEL, minorGuardianStatus } from '@/components/visa/guestRelations';
import { passportIssues } from '@/components/visa/passportChecks';
import type { Passenger, VisaProjectDoc } from '@/types';

/** Một cột có thể xuất: khoá ổn định + nhãn + bề rộng + cách lấy giá trị. */
export type VisaExportColumn = {
  key: string;
  label: string;
  width: number;
  align?: 'left' | 'center';
  value: (p: Passenger, index: number, project: VisaProjectDoc) => string | number;
};

const orEmpty = (s?: string | null) => (s && String(s).trim() ? String(s) : '');
const genderLabel = (g?: string) => (g === 'M' ? 'Nam' : g === 'F' ? 'Nữ' : '');
const idTypeLabel = (t?: string) => (t === 'passport' ? 'Hộ chiếu' : t === 'cccd' ? 'CCCD' : '');
const resultLabel = (r?: string) =>
  r === 'passed' ? 'Đậu' : r === 'failed' ? 'Rớt' : r === 'have_visa' ? 'Đã có visa' : r === 'pending' ? 'Đang xử lý' : '';
const statusLabel = (p: Passenger) => VISA_APPLICANT_STATUS_META[deriveVisaStatus(p)].label;
const docProgress = (p: Passenger) => {
  const docs = p.docs ?? [];
  if (!docs.length) return '';
  return `${docs.filter((d) => d.checked).length}/${docs.length}`;
};
const stdMilestone = (p: Passenger, key: string) => {
  const m = (p.visaTimeline ?? []).find((x) => x.key === key);
  return m?.date ? fmtDate(m.date) : '';
};
const relationSummary = (p: Passenger, project: VisaProjectDoc) => {
  const group = project.applicants ?? [];
  const nameOf = (id: string) => group.find((g) => g.id === id)?.name || '';
  return (p.relations ?? []).map((r) => `${RELATION_LABEL[r.type]}: ${nameOf(r.toId)}`.trim()).filter(Boolean).join('; ');
};
const minorGuardianLabel = (p: Passenger, project: VisaProjectDoc) => {
  const s = minorGuardianStatus(
    { id: p.id, dob: p.dob, relations: p.relations, guardianAuthReady: p.guardianAuthReady },
    project.applicants ?? [], project.departureDate,
  );
  if (!s.isMinor) return '';
  if (s.withParent) return `Đi cùng cha/mẹ (${s.age}t)`;
  return s.needsAuth ? `CẦN GIẤY UỶ QUYỀN (${s.age}t)` : `Có giấy uỷ quyền (${s.age}t)`;
};
const passportWarnLabel = (p: Passenger, project: VisaProjectDoc) =>
  passportIssues({ passport: p.idNo, passportIssue: p.passportIssue, passportExpiry: p.passportExpiry }, project.departureDate)
    .map((x) => x.text).join('; ');

/** Danh mục TẤT CẢ cột có thể xuất — nguồn duy nhất cho cả picker lẫn file. */
export const VISA_EXPORT_COLUMNS: VisaExportColumn[] = [
  { key: 'stt', label: 'STT', width: 6, align: 'center', value: (_p, i) => i + 1 },
  { key: 'name', label: 'Họ và tên', width: 26, value: (p) => orEmpty(p.name) },
  { key: 'nameNoAccent', label: 'Họ tên (không dấu)', width: 26, value: (p) => orEmpty(p.nameNoAccent) },
  { key: 'gender', label: 'Giới tính', width: 10, align: 'center', value: (p) => genderLabel(p.gender) },
  { key: 'dob', label: 'Ngày sinh', width: 14, align: 'center', value: (p) => orEmpty(p.dob) },
  { key: 'nationality', label: 'Quốc tịch', width: 14, value: (p) => orEmpty(p.nationality) },
  { key: 'idType', label: 'Loại giấy tờ', width: 13, align: 'center', value: (p) => idTypeLabel(p.idType) },
  { key: 'idNo', label: 'Số hộ chiếu / CCCD', width: 18, value: (p) => orEmpty(p.idNo) },
  { key: 'passportIssue', label: 'Ngày cấp', width: 14, align: 'center', value: (p) => orEmpty(p.passportIssue) },
  { key: 'passportExpiry', label: 'Ngày hết hạn', width: 14, align: 'center', value: (p) => orEmpty(p.passportExpiry) },
  { key: 'phone', label: 'Điện thoại', width: 15, value: (p) => orEmpty(p.phone) },
  { key: 'company', label: 'Công ty / Đơn vị', width: 22, value: (p) => orEmpty(p.company) },
  { key: 'departurePoint', label: 'Điểm khởi hành', width: 16, value: (p) => orEmpty(p.departurePoint) },
  { key: 'countriesVisited', label: 'Quốc gia đã đi', width: 24, value: (p) => orEmpty(p.countriesVisited) },
  { key: 'visaStatus', label: 'Tình trạng visa', width: 18, align: 'center', value: (p) => statusLabel(p) },
  { key: 'result', label: 'Kết quả', width: 13, align: 'center', value: (p) => resultLabel(p.result) },
  { key: 'docProgress', label: 'Hồ sơ (đã/đủ)', width: 12, align: 'center', value: (p) => docProgress(p) },
  { key: 'failReason', label: 'Lý do rớt', width: 28, value: (p) => orEmpty(p.failReason) },
  { key: 'roomType', label: 'Loại phòng', width: 12, align: 'center', value: (p) => orEmpty(p.roomType) },
  { key: 'roomNo', label: 'Số phòng', width: 10, align: 'center', value: (p) => orEmpty(p.roomNo) },
  { key: 'dietary', label: 'Ăn kiêng / Dị ứng', width: 18, value: (p) => orEmpty(p.dietary) },
  { key: 'emergency', label: 'Liên hệ khẩn cấp', width: 22, value: (p) => orEmpty(p.emergency) },
  { key: 'note', label: 'Ghi chú', width: 28, value: (p) => orEmpty(p.note) },
  { key: 'relations', label: 'Quan hệ trong đoàn', width: 26, value: (p, _i, project) => relationSummary(p, project) },
  { key: 'minorGuardian', label: 'Trẻ <14 / Giấy uỷ quyền', width: 24, value: (p, _i, project) => minorGuardianLabel(p, project) },
  { key: 'passportWarn', label: 'Cảnh báo hộ chiếu', width: 30, value: (p, _i, project) => passportWarnLabel(p, project) },
  { key: 'overdue', label: 'Quá hạn', width: 10, align: 'center', value: (p) => (isApplicantOverdue(p) ? 'Quá hạn' : '') },
  // Các mốc timeline chuẩn
  ...DEFAULT_APPLICANT_TIMELINE.map((m) => ({
    key: `ms_${m.key}`, label: m.label, width: 16, align: 'center' as const,
    value: (p: Passenger) => stdMilestone(p, m.key),
  })),
];

/** Bộ cột mặc định — gọn gàng, hợp gửi khách. */
export const DEFAULT_VISA_EXPORT_COLS: string[] = [
  'stt', 'name', 'gender', 'dob', 'nationality', 'idNo', 'passportIssue', 'passportExpiry', 'visaStatus',
];

/** Preset chọn nhanh bộ cột (1 chạm) — chọn xong vẫn tinh chỉnh tiếp được. */
export const VISA_EXPORT_PRESETS: { id: string; label: string; keys: string[] }[] = [
  { id: 'default', label: 'Mặc định', keys: DEFAULT_VISA_EXPORT_COLS },
  {
    id: 'timeline', label: 'Tình trạng & timeline',
    keys: ['stt', 'name', 'visaStatus', ...DEFAULT_APPLICANT_TIMELINE.map((m) => `ms_${m.key}`), 'overdue'],
  },
  {
    id: 'ops', label: 'Điều hành (quan hệ · hộ chiếu)',
    keys: ['stt', 'name', 'dob', 'idNo', 'passportExpiry', 'relations', 'minorGuardian', 'passportWarn', 'visaStatus'],
  },
  { id: 'full', label: 'Đầy đủ', keys: VISA_EXPORT_COLUMNS.map((c) => c.key) },
];
