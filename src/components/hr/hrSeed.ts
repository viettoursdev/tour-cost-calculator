import type { Department } from '@/types';

/** Mẫu khung năng lực dựng sẵn — chọn để prefill nhanh trong kỳ đánh giá. */
export type CompetencyTemplate = { id: string; name: string; competencies: string[] };

export const COMPETENCY_TEMPLATES: CompetencyTemplate[] = [
  {
    id: 'general', name: 'Năng lực chung',
    competencies: ['Giao tiếp & phối hợp', 'Tinh thần trách nhiệm', 'Chủ động & cầu tiến', 'Giải quyết vấn đề', 'Tuân thủ quy trình'],
  },
  {
    id: 'guide', name: 'Hướng dẫn viên',
    competencies: ['Kiến thức tuyến điểm', 'Ngoại ngữ', 'Thuyết minh & dẫn đoàn', 'Xử lý sự cố', 'Chăm sóc khách hàng'],
  },
  {
    id: 'operations', name: 'Điều hành tour',
    competencies: ['Lập kế hoạch & điều phối', 'Quản lý nhà cung cấp', 'Kiểm soát chi phí', 'Xử lý phát sinh', 'Phối hợp đa phòng ban'],
  },
  {
    id: 'sales', name: 'Sales / Kinh doanh',
    competencies: ['Tư vấn & nắm nhu cầu', 'Kỹ năng chốt deal', 'Đàm phán', 'Chăm sóc & giữ khách', 'Đạt chỉ tiêu doanh số'],
  },
  {
    id: 'visa', name: 'Visa',
    competencies: ['Nghiệp vụ hồ sơ visa', 'Cập nhật quy định lãnh sự', 'Tỉ mỉ & chính xác', 'Tư vấn khách', 'Tỷ lệ đậu visa'],
  },
  {
    id: 'accounting', name: 'Kế toán',
    competencies: ['Nghiệp vụ kế toán', 'Chính xác & cẩn thận', 'Tuân thủ thuế/quy định', 'Báo cáo đúng hạn', 'Đối soát công nợ'],
  },
];

/** Lộ trình thăng tiến (career ladder) theo phòng ban — từ thấp → cao. */
export const CAREER_LADDERS: Partial<Record<Department, string[]>> = {
  dh_noidia: ['Điều hành viên', 'Điều hành Senior', 'Trưởng nhóm Điều hành', 'Trưởng phòng Điều hành'],
  dh_nuocngoai: ['Điều hành viên', 'Điều hành Senior', 'Trưởng nhóm Điều hành', 'Trưởng phòng Điều hành'],
  ketoan: ['Kế toán viên', 'Kế toán tổng hợp', 'Kế toán trưởng'],
  visa: ['Nhân viên Visa', 'Chuyên viên Visa', 'Trưởng nhóm Visa', 'Trưởng phòng Visa'],
  hdv: ['HDV tập sự', 'HDV chính thức', 'HDV cao cấp', 'Trưởng đoàn / Đào tạo HDV'],
  muahang: ['Nhân viên Mua hàng', 'Chuyên viên Mua hàng', 'Trưởng phòng Mua hàng'],
  sukien: ['Nhân viên Sự kiện', 'Chuyên viên Sự kiện', 'Trưởng nhóm Sự kiện', 'Trưởng phòng Sự kiện'],
};

/** Các bước onboarding chuẩn cho nhân viên mới (sinh Run quy trình khi tuyển). */
export const ONBOARDING_STEPS: { label: string; output?: string }[] = [
  { label: 'Chuẩn bị email + chỗ làm việc + tài khoản hệ thống', output: 'Email & tài khoản đã cấp' },
  { label: 'Ký hợp đồng lao động + hoàn thiện hồ sơ nhân sự', output: 'HĐLĐ + hồ sơ đủ' },
  { label: 'Đào tạo hội nhập (văn hoá, nội quy, quy trình)', output: 'Đã tham gia buổi hội nhập' },
  { label: 'Bàn giao công cụ & tài liệu phòng ban', output: 'Biên bản bàn giao' },
  { label: 'Phân công người kèm cặp (buddy)', output: 'Đã có buddy' },
  { label: 'Đánh giá kết thúc thử việc', output: 'Biên bản đánh giá thử việc' },
];
