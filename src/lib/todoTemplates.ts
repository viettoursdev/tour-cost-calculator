import type { Todo } from '@/types';

/** Một mục trong bộ việc chuẩn tự sinh khi báo giá CHỐT (won). */
export type QuoteTaskTemplate = {
  title: string;
  /** Lệch ngày so với NGÀY KHỞI HÀNH (âm = trước khởi hành). */
  offsetFromDepart: number;
  /** Lệch ngày so với HÔM NAY khi báo giá chưa có ngày khởi hành. */
  offsetFromNow: number;
  priority: Todo['priority'];
};

/**
 * Bộ việc vận hành chuẩn cho một tour ĐÃ CHỐT. Hạn suy theo ngày khởi hành nếu có,
 * nếu không thì theo hôm nay. Sửa danh sách này = đổi quy trình mặc định toàn công ty.
 */
export const QUOTE_WON_TASKS: QuoteTaskTemplate[] = [
  { title: 'Soạn & ký hợp đồng với khách', offsetFromDepart: -21, offsetFromNow: 2, priority: 'high' },
  { title: 'Thu tiền đặt cọc của khách', offsetFromDepart: -18, offsetFromNow: 3, priority: 'high' },
  { title: 'Đặt & cọc dịch vụ NCC (khách sạn/vận chuyển/vé)', offsetFromDepart: -14, offsetFromNow: 5, priority: 'normal' },
  { title: 'Chốt danh sách khách & phân phòng (rooming)', offsetFromDepart: -7, offsetFromNow: 7, priority: 'normal' },
  { title: 'Phân công HDV & bàn giao hồ sơ đoàn', offsetFromDepart: -3, offsetFromNow: 9, priority: 'normal' },
  { title: 'Tất toán công nợ NCC & quyết toán tour', offsetFromDepart: 7, offsetFromNow: 14, priority: 'normal' },
];

/** ISO hạn cho một mục: base (khởi hành 17:00 nếu có, không thì hôm nay) + lệch ngày. */
export function quoteTaskDue(tpl: QuoteTaskTemplate, departDate?: string, now = Date.now()): string {
  const base = departDate ? new Date(departDate + 'T17:00:00') : new Date(now);
  if (isNaN(base.getTime())) return new Date(now + tpl.offsetFromNow * 86400000).toISOString();
  const days = departDate ? tpl.offsetFromDepart : tpl.offsetFromNow;
  base.setDate(base.getDate() + days);
  return base.toISOString();
}
