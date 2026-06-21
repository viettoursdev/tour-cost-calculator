import type { EmailAccount, EmailMessage } from '@/types';

/**
 * Lớp trừu tượng cho nguồn email. Hiện dùng `mockProvider` (giả lập) để dựng khung
 * UI + luồng. Khi có Azure App Registration, viết `graphProvider` (MSAL + Microsoft
 * Graph) cài cùng interface này và đổi ở cuối file — KHÔNG phải sửa UI/store.
 */
export interface EmailProvider {
  readonly kind: 'mock' | 'graph';
  /** Đăng nhập tài khoản Outlook (mock: gán tài khoản thử nghiệm). */
  connect(): Promise<EmailAccount>;
  disconnect(): Promise<void>;
  getAccount(): EmailAccount | null;
  /** Tìm email theo từ khoá (địa chỉ khách, tên tour…). */
  search(query: string): Promise<EmailMessage[]>;
}

const ago = (days: number, h = 9) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};

// Dữ liệu mẫu cho giai đoạn dựng khung — thay bằng kết quả Graph khi tích hợp thật.
const SAMPLE: EmailMessage[] = [
  { id: 'm1', subject: 'Re: Báo giá tour Nhật Bản 5N4Đ cho đoàn 25 khách', fromName: 'Nguyễn Văn An', fromAddress: 'an.nguyen@abccorp.vn', toAddress: 'sales@viettours.com.vn', receivedAt: ago(1), preview: 'Cảm ơn anh/chị đã gửi báo giá. Bên em muốn xác nhận lịch khởi hành và xin thêm phương án khách sạn 5 sao…', webLink: 'https://outlook.office.com/mail/' },
  { id: 'm2', subject: 'Yêu cầu báo giá team building Đà Nẵng', fromName: 'Trần Thu Hà', fromAddress: 'ha.tran@deltagroup.com.vn', toAddress: 'info@viettours.com.vn', receivedAt: ago(2), preview: 'Công ty em dự kiến tổ chức team building 120 người tại Đà Nẵng cuối tháng 7, nhờ bên mình tư vấn…', webLink: 'https://outlook.office.com/mail/' },
  { id: 'm3', subject: 'Hợp đồng tour Hàn Quốc — ký xác nhận', fromName: 'Lê Minh Quân', fromAddress: 'quan.le@omegatravel.vn', toAddress: 'sales@viettours.com.vn', receivedAt: ago(3), preview: 'Gửi anh/chị bản hợp đồng đã ký đóng dấu, nhờ xác nhận đặt cọc đợt 1…', webLink: 'https://outlook.office.com/mail/' },
  { id: 'm4', subject: 'Re: Lịch trình chi tiết tour Châu Âu 9N8Đ', fromName: 'Phạm Bảo Ngọc', fromAddress: 'ngoc.pham@abccorp.vn', toAddress: 'sales@viettours.com.vn', receivedAt: ago(5), preview: 'Đoàn muốn điều chỉnh thêm 1 đêm tại Paris và đổi bữa tối ngày 4, nhờ bên mình cập nhật giúp…', webLink: 'https://outlook.office.com/mail/' },
  { id: 'm5', subject: 'Thanh toán đợt 2 tour MICE Singapore', fromName: 'Hoàng Thị Mai', fromAddress: 'mai.hoang@deltagroup.com.vn', toAddress: 'ketoan@viettours.com.vn', receivedAt: ago(8), preview: 'Bên em đã chuyển khoản đợt 2, gửi anh/chị uỷ nhiệm chi đính kèm để đối soát…', webLink: 'https://outlook.office.com/mail/' },
  { id: 'm6', subject: 'Hỏi visa Schengen cho đoàn 12 khách', fromName: 'Đỗ Quốc Khánh', fromAddress: 'khanh.do@omegatravel.vn', toAddress: 'visa@viettours.com.vn', receivedAt: ago(11), preview: 'Nhờ bên mình tư vấn hồ sơ và thời gian xử lý visa Schengen cho đoàn khởi hành tháng 9…', webLink: 'https://outlook.office.com/mail/' },
];

function createMockProvider(): EmailProvider {
  let account: EmailAccount | null = null;
  return {
    kind: 'mock',
    async connect() {
      await new Promise((r) => setTimeout(r, 300));
      account = { name: 'Tài khoản thử nghiệm', address: 'demo@viettours.com.vn' };
      return account;
    },
    async disconnect() { account = null; },
    getAccount() { return account; },
    async search(query) {
      await new Promise((r) => setTimeout(r, 250));
      const q = query.trim().toLowerCase();
      if (!q) return SAMPLE.slice(0, 8);
      return SAMPLE.filter((m) =>
        [m.subject, m.fromName, m.fromAddress, m.toAddress, m.preview].filter(Boolean).join(' ').toLowerCase().includes(q));
    },
  };
}

// TODO(graph): khi có VITE_MS_CLIENT_ID + tenant → trả về graphProvider() thay vì mock.
export const emailProvider: EmailProvider = createMockProvider();
export const isMockEmail = emailProvider.kind === 'mock';
