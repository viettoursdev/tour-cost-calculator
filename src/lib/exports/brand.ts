/**
 * Thương hiệu dùng chung cho MỌI file xuất (PDF/DOCX) — nguồn DUY NHẤT để
 * đồng bộ màu Teal chuẩn Viettours + kích thước logo. Sửa ở đây = đổi toàn bộ.
 */
import type { jsPDF } from 'jspdf';
import { VTE_LOGO } from './vteLogo';

export type RGB = [number, number, number];

/** Teal chữ ký Viettours — #0d7a6a (trùng màu logo wordmark & primary brand). */
export const BRAND_TEAL: RGB = [13, 122, 106];
/** Cùng màu, dạng hex KHÔNG '#' — cho DOCX (docx dùng "RRGGBB"). */
export const BRAND_TEAL_HEX = '0D7A6A';
/** Cùng màu, dạng ARGB — cho ExcelJS (fgColor.argb = "AARRGGBB"). */
export const BRAND_TEAL_ARGB = 'FF0D7A6A';

/** Logo chuẩn: 4.65cm × 1.25cm (tỉ lệ thật ≈ 3.72:1, không méo). */
export const LOGO_W_MM = 46.5;
export const LOGO_H_MM = 12.5;
/** Cùng kích thước cho DOCX (px @96dpi): 4.65cm≈176px, 1.25cm≈47px. */
export const LOGO_W_PX = 176;
export const LOGO_H_PX = 47;

/**
 * Vẽ logo Viettours ở (x, y) theo kích thước chuẩn. Trả về Y mép DƯỚI của logo
 * để nội dung kế tiếp đặt bên dưới, tránh đè lên nhau. Không vỡ nếu logo lỗi.
 */
export function drawLogo(pdf: jsPDF, x: number, y: number): number {
  try { pdf.addImage(VTE_LOGO, 'PNG', x, y, LOGO_W_MM, LOGO_H_MM, undefined, 'FAST'); } catch { /* ignore */ }
  return y + LOGO_H_MM;
}
