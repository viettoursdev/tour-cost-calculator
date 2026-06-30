/**
 * Thương hiệu dùng chung cho MỌI file xuất (PDF/DOCX) — nguồn DUY NHẤT để
 * đồng bộ màu Teal chuẩn Viettours + kích thước logo. Sửa ở đây = đổi toàn bộ.
 */
import type { jsPDF } from 'jspdf';
import type { Workbook, Worksheet } from 'exceljs';
import { VTE_LOGO } from './vteLogo';

export type RGB = [number, number, number];

/** Teal chữ ký Viettours — #0d7a6a (trùng màu logo wordmark & primary brand). */
export const BRAND_TEAL: RGB = [13, 122, 106];
/** Cùng màu, dạng hex KHÔNG '#' — cho DOCX (docx dùng "RRGGBB"). */
export const BRAND_TEAL_HEX = '0D7A6A';
/** Cùng màu, dạng ARGB — cho ExcelJS (fgColor.argb = "AARRGGBB"). */
export const BRAND_TEAL_ARGB = 'FF0D7A6A';

/** Hotline thương hiệu Viettours — NGUỒN DUY NHẤT, đổi ở đây = đổi mọi file xuất. */
export const BRAND_HOTLINE = '091 951 7777';

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

/**
 * Gắn logo Viettours (wordmark teal) vào góc trên-trái của một worksheet ExcelJS.
 *
 * KÍCH THƯỚC CHUẨN: ExcelJS nhận `ext` theo pixel @96dpi → 176×47px = ĐÚNG
 * 4.65cm × 1.25cm (= LOGO_W_MM × LOGO_H_MM), y hệt file PDF/DOCX. ĐỪNG đổi sang
 * số khác hay để Excel tự co theo ô.
 * `editAs: 'oneCell'` giữ NGUYÊN kích thước tuyệt đối (ảnh chỉ trôi theo ô, KHÔNG
 * giãn/méo khi resize cột-dòng); KHÔNG dùng mặc định 'twoCell' (kéo méo theo ô).
 *
 * Gọi NGAY sau khi tạo worksheet (trước khi ghi tiêu đề ở cột C) để logo nằm gọn
 * ở vùng A1 mà không đè lên chữ. Không vỡ nếu logo lỗi.
 */
export function addExcelLogo(wb: Workbook, ws: Worksheet, col = 0, row = 0): void {
  try {
    const imageId = wb.addImage({ base64: VTE_LOGO.split(',')[1] ?? VTE_LOGO, extension: 'png' });
    ws.addImage(imageId, {
      tl: { col, row },
      ext: { width: LOGO_W_PX, height: LOGO_H_PX }, // 176×47px @96dpi = 4.65×1.25cm
      editAs: 'oneCell',
    });
  } catch { /* ignore */ }
}
