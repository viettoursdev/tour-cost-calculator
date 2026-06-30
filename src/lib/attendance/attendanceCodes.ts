import type { AttendanceCodeDef } from '@/types';

/**
 * Từ điển MÃ CÔNG — số hoá từ legend bảng chấm công Viettours
 * (`CHAM CONG T6.2026 - TEAMS.xlsx`). Đây là NGUỒN CHÂN LÝ cho cách quy đổi công &
 * tô màu lưới Gantt. Giá trị `work` (số công) phản ánh nghiệp vụ lương; HR có thể
 * tinh chỉnh khi quy ước thay đổi — phần tính toán (`attendanceCalc.ts`) chỉ cộng `work`.
 *
 * Lưu ý: vài mã mang sắc thái lương tinh tế (XC/2, KC/2…) — giá trị dưới đây là quy ước
 * hợp lý ban đầu, cần HR xác nhận/điều chỉnh khi triển khai thực tế.
 */
export const ATTENDANCE_CODES: AttendanceCodeDef[] = [
  // ── Đi làm / công tác (tính công) ──────────────────────────────────────────
  { code: 'X',      label: 'Đi làm đủ',                          work: 1,   paid: true,  category: 'work',         color: '#0d7a6a' },
  { code: 'C',      label: 'Công việc công ty / họp (có báo)',   work: 1,   paid: true,  category: 'work',         color: '#2e8b8b' },
  { code: 'T',      label: 'Đi tour / công tác (T)',             work: 1,   paid: true,  category: 'work',         color: '#3a9bd4' },
  { code: 'ONLINE', label: 'Làm online',                         work: 1,   paid: true,  category: 'work',         color: '#5fa8d3' },
  { code: 'XC',     label: 'Không chấm công (trừ phép, tính lương)', work: 1, paid: true, category: 'work',       color: '#7fb069' },

  // ── Nghỉ hưởng lương ───────────────────────────────────────────────────────
  { code: 'P',      label: 'Nghỉ phép hưởng nguyên lương',       work: 1,   paid: true,  category: 'leave_paid',   color: '#f4a259' },
  { code: 'NB',     label: 'Nghỉ bù',                            work: 1,   paid: true,  category: 'leave_paid',   color: '#e8c468' },

  // ── Nửa làm nửa nghỉ ───────────────────────────────────────────────────────
  { code: 'XP',     label: 'Làm nửa ngày + nghỉ nửa ngày phép',  work: 1,   paid: true,  category: 'half',         color: '#f6c177' },
  { code: 'XT',     label: 'Làm nửa ngày + nửa ngày nghỉ T (tính lương)', work: 1, paid: true, category: 'half', color: '#f6c177' },
  { code: 'XB',     label: 'Làm nửa công',                       work: 0.5, paid: true,  category: 'half',         color: '#f6c177' },
  { code: 'P/2',    label: 'Nghỉ phép nửa ngày, nửa ngày không lương', work: 0.5, paid: true, category: 'half',  color: '#f0b27a' },
  { code: 'XC/2',   label: 'Không chấm công ½ ngày (trừ phép, tính lương)', work: 1, paid: true, category: 'half', color: '#f0b27a' },
  { code: 'KC/2',   label: 'Không chấm công ½ ngày (trừ phép, trừ lương)',  work: 0.5, paid: false, category: 'half', color: '#e0a3a3' },

  // ── Nghỉ không lương ───────────────────────────────────────────────────────
  { code: 'CP',     label: 'Nghỉ không lương (có xin phép)',     work: 0,   paid: false, category: 'leave_unpaid', color: '#c97b7b' },
  { code: 'KP',     label: 'Nghỉ không lương (KHÔNG xin phép)',  work: 0,   paid: false, category: 'leave_unpaid', color: '#b23b3b' },

  // ── Ốm đau / thai sản (BHXH) ───────────────────────────────────────────────
  { code: 'O',      label: 'Nghỉ ốm đau',                        work: 0,   paid: false, category: 'sick',         color: '#9b8bd4' },
  { code: 'TS',     label: 'Nghỉ thai sản',                      work: 0,   paid: false, category: 'sick',         color: '#b39ddb' },

  // ── Lễ / tết ───────────────────────────────────────────────────────────────
  { code: 'Lễ',     label: 'Nghỉ lễ',                            work: 1,   paid: true,  category: 'holiday',      color: '#9e9e9e' },

  // ── Khác (chưa phân loại rõ — HR bổ sung) ──────────────────────────────────
  { code: 'B',      label: 'Khác (B)',                           work: 0,   paid: false, category: 'other',        color: '#cfcfcf' },
  { code: 'K',      label: 'Khác (K)',                           work: 0,   paid: false, category: 'other',        color: '#cfcfcf' },
];

/** Tra cứu nhanh theo mã (chuẩn hoá hoa/thường + bỏ khoảng trắng). */
const CODE_INDEX: Map<string, AttendanceCodeDef> = new Map(
  ATTENDANCE_CODES.map((d) => [normalizeCode(d.code), d]),
);

/** Chuẩn hoá mã để tra cứu: bỏ khoảng trắng 2 đầu, gộp khoảng trắng, viết HOA. */
export function normalizeCode(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Lấy định nghĩa mã, hoặc `undefined` nếu không nhận diện. */
export function lookupCode(
  raw: string | null | undefined,
  codes: AttendanceCodeDef[] = ATTENDANCE_CODES,
): AttendanceCodeDef | undefined {
  if (raw == null) return undefined;
  const key = normalizeCode(String(raw));
  if (!key) return undefined;
  if (codes === ATTENDANCE_CODES) return CODE_INDEX.get(key);
  return codes.find((d) => normalizeCode(d.code) === key);
}

/** Màu mặc định cho ô có mã lạ (không có trong từ điển). */
export const UNKNOWN_CODE_COLOR = '#ffe0b2';
/** Màu nền cho ngày trống (cuối tuần / chưa chấm). */
export const EMPTY_CELL_COLOR = '#f5f5f5';
