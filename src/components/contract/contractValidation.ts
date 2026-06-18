import type { Contract } from '@/types';

/**
 * Kiểm tra hồ sơ hợp đồng trước khi xuất bản chính thức (PDF/Word).
 * Trả về danh sách điểm thiếu/cần xem lại; rỗng = đủ. KHÔNG chặn — chỉ cảnh báo.
 */
export function contractIssues(c: Contract): string[] {
  const w: string[] = [];
  if (!c.contractNo?.trim()) w.push('Chưa có số hợp đồng');
  if (!c.partyB?.name?.trim()) w.push('Thiếu tên Bên B');
  if (!c.partyB?.address?.trim()) w.push('Thiếu địa chỉ Bên B');
  if (!c.partyB?.rep?.trim()) w.push('Thiếu người đại diện Bên B');
  if (!c.partyB?.taxCode?.trim()) w.push('Thiếu mã số thuế Bên B');
  if (!c.tourStartDate) w.push('Chưa có ngày khởi hành');
  if (!(c.contractPax > 0)) w.push('Số khách = 0');
  if (!(c.pricePerPax > 0)) w.push('Đơn giá/khách = 0');
  if (!c.payments || c.payments.length === 0) w.push('Chưa có điều khoản thanh toán');
  return w;
}
