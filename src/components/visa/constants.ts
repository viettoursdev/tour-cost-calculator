import type {
  User, VisaFee, VisaProcDoc, VisaProcField, VisaProcKind, VisaProcRow,
  VisaProcSection, VisaProduct,
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

export const VISA_LOCS = ['HCM', 'HAN', 'DAD'] as const;

export const VISA_FEE_PRESET = [
  'Chi phí lãnh sự', 'Chi phí trung tâm tiếp nhận', 'Chi phí dịch thuật',
  'Chi phí công chứng', 'Chi phí hợp pháp hoá lãnh sự', 'Chi phí chuyển phát',
  'Chi phí in ấn', 'Chi phí công ty trung gian', 'Chi phí dịch vụ', 'Chi phí khác',
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
