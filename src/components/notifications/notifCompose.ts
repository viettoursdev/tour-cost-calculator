import type { NotificationType } from '@/types';

/** Mẫu tin soạn sẵn — chọn để tự điền loại/tiêu đề/nội dung (chỉnh lại được). */
export type NotifTemplate = { key: string; label: string; type: NotificationType; title: string; message: string };

export const NOTIF_TEMPLATES: NotifTemplate[] = [
  {
    key: 'pay', label: '💳 Nhắc thanh toán', type: 'task',
    title: 'Nhắc thanh toán',
    message: 'Kính nhắc đợt thanh toán cho [tour/hợp đồng …] đến hạn ngày [.../.../...]. Vui lòng xử lý và xác nhận. Trân trọng.',
  },
  {
    key: 'progress', label: '📊 Cập nhật tiến độ', type: 'announcement',
    title: 'Cập nhật tiến độ',
    message: 'Cập nhật tiến độ [dự án/tour …]:\n- \n- \nĐề nghị các bộ phận nắm thông tin và phối hợp.',
  },
  {
    key: 'meeting', label: '📅 Mời họp', type: 'announcement',
    title: 'Mời họp',
    message: 'Trân trọng kính mời tham dự cuộc họp [chủ đề] lúc [giờ] ngày [.../.../...] tại [địa điểm/online]. Đề nghị tham dự đầy đủ.',
  },
  {
    key: 'deadline', label: '⏰ Nhắc deadline', type: 'task',
    title: 'Nhắc deadline',
    message: 'Nhắc deadline công việc [nội dung] — hạn chót [.../.../...]. Vui lòng hoàn thành đúng hạn.',
  },
  {
    key: 'confirm', label: '✅ Xác nhận dịch vụ', type: 'task',
    title: 'Xác nhận dịch vụ',
    message: 'Đề nghị xác nhận dịch vụ [nội dung] cho đoàn [tên đoàn] trước ngày [.../.../...]. Cảm ơn.',
  },
];
