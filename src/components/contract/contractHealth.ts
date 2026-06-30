import type { Contract } from '@/types';
import { contractIssues } from './contractValidation';
import { numericChecks } from './contractReview';

export type HealthLevel = 'good' | 'warn' | 'risk';

export type ContractHealth = {
  level: HealthLevel;
  /** Điểm thiếu hồ sơ (số HĐ, Bên B, ngày khởi hành…). */
  issues: string[];
  /** Cảnh báo số liệu tất định (lệch tổng thanh toán, hạn TT sau khởi hành…). */
  numericWarnings: string[];
  label: string;
  icon: string;
  color: string;
};

/**
 * Gộp 3 nguồn "rà soát" tất định thành MỘT điểm sức khoẻ hợp đồng:
 * contractIssues (thiếu hồ sơ) + numericChecks (lệch số liệu). KHÔNG gọi AI —
 * chạy ngay, không tốn token. AI review là lớp bổ sung trong dialog.
 *
 * - risk : có lệch số liệu (mức nghiêm trọng, dễ sai tiền)
 * - warn : đủ số liệu nhưng còn thiếu trường hồ sơ
 * - good : đủ cả hai
 */
export function contractHealth(c: Contract): ContractHealth {
  const issues = contractIssues(c);
  const numericWarnings = numericChecks(c).filter((n) => n.level === 'warn').map((n) => `${n.label}: ${n.detail}`);

  let level: HealthLevel;
  let label: string;
  let icon: string;
  let color: string;
  if (numericWarnings.length > 0) {
    level = 'risk';
    label = `${numericWarnings.length} cảnh báo số liệu`;
    icon = '⚠';
    color = '#dc3250';
  } else if (issues.length > 0) {
    level = 'warn';
    label = `Thiếu ${issues.length} mục`;
    icon = '◐';
    color = '#d18a13';
  } else {
    level = 'good';
    label = 'Hồ sơ đủ';
    icon = '✓';
    color = '#0d7a6a';
  }
  return { level, issues, numericWarnings, label, icon, color };
}
