/**
 * "Có gì mới" — nhật ký cập nhật tính năng. Mỗi lần ra tính năng mới, THÊM 1 entry
 * lên ĐẦU mảng. Khi user đăng nhập lần đầu sau update, app tự hiện các entry chưa xem.
 * Trạng thái "đã xem" lưu localStorage `vte_whatsnew_seen_{username}` = id entry mới nhất đã xem.
 */
export type WhatsNewItem = { icon: string; title: string; desc: string };
export type WhatsNewEntry = { id: string; date: string; title: string; items: WhatsNewItem[] };

/** Nhật ký — MỚI NHẤT lên đầu. `id` là mốc cố định (dùng ngày). */
export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: '2026-06-21', date: '21/06/2026', title: 'Bảng nhập thông tin khi tạo báo giá',
    items: [
      { icon: '📝', title: 'Tạo báo giá mới có bảng thông tin', desc: 'Chọn báo giá Nội địa/Nước ngoài sẽ mở bảng nhập: loại yêu cầu (Request tour/Thầu), tên tour, khách hàng, số ngày/đêm, ngày khởi hành dự kiến, deadline và nhân sự collab — hệ thống tự điền sẵn khi Lưu cloud.' },
      { icon: '⏰', title: 'Tự nhắc deadline báo giá', desc: 'Đặt deadline khi tạo báo giá; sau khi lưu cloud, hệ thống tự nhắc người tạo & cộng tác viên khi còn 1 ngày và còn 6 giờ.' },
    ],
  },
  {
    id: '2026-06-20', date: '20/06/2026', title: 'AI nhập báo giá & nâng cấp Nhà hàng',
    items: [
      { icon: '🤖', title: 'AI nhập báo giá từ file', desc: 'Trong tab Chi phí → "🤖 Nhập từ file (AI)": tải Excel/PDF/Word/ảnh báo giá, AI tự bóc từng dòng chi phí, phân loại vào hạng mục và đoán cách tính SL (×khách/đoàn/phòng). Xem trước & sửa trước khi thêm.' },
      { icon: '🏪', title: 'Nhà hàng nâng cấp', desc: 'Thêm địa chỉ, ghi chú, đính kèm file; lọc theo châu lục/quốc gia/thành phố/đánh giá; nút "AI từ thực đơn" tự bóc thông tin + set menu (thêm mới hoặc điền vào nhà hàng có sẵn).' },
      { icon: '👤', title: 'Lịch sử báo giá hiện khách hàng', desc: 'Bảng lịch sử có cột "Khách hàng" kèm SĐT/email/MST tra từ danh bạ.' },
      { icon: '🗂️', title: 'Kanban thêm trạng thái "Không thực hiện"', desc: 'Bước workflow đặt "Không thực hiện" sẽ không tính vào tiến độ.' },
    ],
  },
  {
    id: '2026-06-19', date: '19/06/2026', title: 'AI danh bạ, kéo-thả & thông báo',
    items: [
      { icon: '🤖', title: 'AI nhập NCC / Khách hàng', desc: 'Trong form NCC/Khách hàng: "AI nhập & phân tích" — dán văn bản hoặc kéo-thả/dán ảnh danh thiếp, AI điền các trường + đưa nhận định.' },
      { icon: '↕️', title: 'Kéo-thả thứ tự dòng & hạng mục', desc: 'Bảng giá: rê ô STT để kéo dòng; kéo ⋮⋮ ở tiêu đề hạng mục để đổi thứ tự hạng mục (cả nội địa/quốc tế/DMC).' },
      { icon: '💬', title: 'Chat chuyên nghiệp hơn', desc: 'Trả lời/thu hồi/sửa tin, thả cảm xúc, xem trước ảnh & file (PDF/Word/Excel).' },
      { icon: '📢', title: 'Soạn thông báo mạnh hơn', desc: 'Mẫu tin soạn sẵn, chọn nhanh người nhận theo nhóm, mức ưu tiên Khẩn/Quan trọng, đính kèm file, nhắc deadline lặp lại.' },
    ],
  },
];

const seenKey = (username: string) => `vte_whatsnew_seen_${username}`;

/** Thuần: các entry user CHƯA xem (mới hơn `seenId`). seenId rỗng → tất cả. */
export function computeUnseen(entries: WhatsNewEntry[], seenId: string | null): WhatsNewEntry[] {
  if (!seenId) return entries;
  const idx = entries.findIndex((e) => e.id === seenId);
  return idx < 0 ? entries : entries.slice(0, idx);
}

export function unseenWhatsNew(username: string): WhatsNewEntry[] {
  let seen: string | null = null;
  try { seen = localStorage.getItem(seenKey(username)); } catch { /* ignore */ }
  return computeUnseen(WHATS_NEW, seen);
}

/** Đánh dấu đã xem tới entry mới nhất. */
export function markWhatsNewSeen(username: string): void {
  try { localStorage.setItem(seenKey(username), WHATS_NEW[0]?.id ?? ''); } catch { /* ignore */ }
}
