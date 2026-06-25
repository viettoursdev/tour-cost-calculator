/**
 * Báo giá chia sẻ công khai cho khách (link không cần đăng nhập). Bản đã "xuất bản"
 * lưu ở `public_quotes/{token}` — chỉ chứa thông tin HƯỚNG KHÁCH (giá bán, điều khoản,
 * lịch trình tóm tắt), KHÔNG có giá vốn/breakdown nội bộ. Token trong URL là khoá truy cập.
 */
export interface PublicQuoteItinDay {
  day: number;
  title?: string;
  lines: string[];
}

export interface PublicQuotePayment {
  label: string;
  amount: number;
  note: string;
}

export interface PublicQuoteCancel {
  when: string;
  penalty: number;
}

export interface PublicQuoteAcceptance {
  name?: string;
  contact?: string;
  note?: string;
  at: string; // ISO
}

export interface PublicQuoteDoc {
  token: string;
  quoteCloudId: string;
  quoteCode?: string;
  tourName: string;
  dest?: string;
  customerName?: string;
  pax: number;
  days: number;
  nights: number;
  startDate?: string | null;
  /** Giá bán / khách (VND). */
  pricePerPax: number;
  /** Tổng giá (VND). */
  totalPrice: number;
  /** Hiệu lực báo giá đến HẾT ngày này (ISO 'YYYY-MM-DD'). */
  validUntil?: string;
  /** Dòng đóng dấu tỷ giá áp dụng (dựng sẵn cho khách); trống nếu báo giá toàn VND. */
  rateNote?: string;
  inclusions: string[];
  exclusions: string[];
  cancellation?: PublicQuoteCancel[];
  payments: PublicQuotePayment[];
  itinerary?: PublicQuoteItinDay[];
  note?: string;
  publishedAt: string;
  publishedBy: string;
  acceptance?: PublicQuoteAcceptance;
}

/** Tóm tắt chia sẻ gắn vào index báo giá (để biết đã xuất bản + nhắc khi khách đồng ý). */
export interface QuoteShareInfo {
  token: string;
  publishedAt: string;
}
