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
    id: '2026-07-01f', date: '01/07/2026', title: 'Bản bàn giao quy trình song ngữ (EN)',
    items: [
      { icon: '🌐', title: 'Xuất PDF quy trình tiếng Anh', desc: 'Nút "Xuất PDF" trong Quy trình điều hành giờ cho chọn Tiếng Việt hoặc English — bản EN dùng nhãn bước tiếng Anh chuẩn, tiện bàn giao cho đối tác/DMC nước ngoài. Mỗi bước còn nhập được nhãn EN riêng.' },
    ],
  },
  {
    id: '2026-07-01e', date: '01/07/2026', title: 'Phân vai RACI cho từng bước',
    items: [
      { icon: '👥', title: 'Người rà soát (A) & người cần thông báo (I)', desc: 'Mỗi bước quy trình giờ gán được thêm Người rà soát và nhiều Người cần thông báo, bên cạnh Người phụ trách. Khi bước hoàn tất, họ tự nhận thông báo tương ứng (nhờ rà soát / nắm tin).' },
    ],
  },
  {
    id: '2026-07-01d', date: '01/07/2026', title: 'Việc con (checklist) trong mỗi bước',
    items: [
      { icon: '☑️', title: 'Chia nhỏ mỗi bước thành việc con', desc: 'Mở chi tiết một bước quy trình để thêm các việc con và tick hoàn tất từng việc; thẻ Kanban/Checklist hiện tiến độ ☑ x/y. Áp cho cả Quy trình điều hành lẫn Quy trình phòng ban.' },
    ],
  },
  {
    id: '2026-07-01c', date: '01/07/2026', title: 'Quy trình tự "chuyền gậy"',
    items: [
      { icon: '▶️', title: 'Tự nhắc người phụ trách bước kế', desc: 'Khi một bước quy trình điều hành được đánh dấu Hoàn tất, người phụ trách bước tiếp theo tự nhận thông báo "đến lượt bạn" (kèm hạn nếu có) — không cần nhắc tay.' },
    ],
  },
  {
    id: '2026-07-01b', date: '01/07/2026', title: 'Cổng phê duyệt & phụ thuộc bước',
    items: [
      { icon: '🛡️', title: 'Cổng phê duyệt tại mốc tiền', desc: 'Bước cọc NCC · ký hợp đồng · cọc trước đi · thanh toán cuối · nghiệm thu chỉ được đánh dấu Hoàn tất sau khi CEO/BGĐ/Trưởng Phòng bấm "Phê duyệt" (ghi rõ người & thời điểm).' },
      { icon: '🔒', title: 'Phụ thuộc giữa các bước', desc: 'Quy trình điều hành cảnh báo khi hoàn tất một bước trong khi bước phía trước chưa xong (vd chốt cọc khi chưa ký hợp đồng) — hiện huy hiệu 🔒 trên thẻ.' },
    ],
  },
  {
    id: '2026-07-01a', date: '01/07/2026', title: 'Phân tích SLA & nút thắt vận hành',
    items: [
      { icon: '📊', title: 'SLA & nút thắt trong Điều phối', desc: 'Trong view "Điều phối" có nút chuyển "📊 SLA & nút thắt": xem tức thì tour đang kẹt ở bước nào, bước nào hay quá hạn nhất trên toàn hệ thống.' },
      { icon: '⏱', title: 'Thời gian xử lý mỗi bước', desc: 'Nút "Quét sâu" tính thời gian xử lý trung bình/median và tỷ lệ đúng hạn của từng bước quy trình — biết bước nào đang làm chậm cả tour.' },
      { icon: '🚦', title: 'Quy trình điều hành gọn hơn', desc: 'Đổi icon 🚦 để khỏi nhầm với "Quy trình phòng ban"; checklist phân biệt rõ bước Đang làm/Tạm hoãn; nhắc hạn Quy trình phòng ban chạy đúng.' },
    ],
  },
  {
    id: '2026-06-26c', date: '26/06/2026', title: 'Hồ sơ tour — bản nâng cấp lớn',
    items: [
      { icon: '🗂️', title: 'Phân loại & 3 mốc giá trị', desc: 'Hồ sơ tour chia 5 loại (tour/sự kiện/dịch vụ…) có tiền tố mã riêng; theo dõi 3 mốc giá trị: hiện tại (báo giá) · hợp đồng · nghiệm thu để nhìn chênh lệch thật.' },
      { icon: '🔔', title: 'Cảnh báo "Cần chú ý" + thảo luận', desc: 'Thẻ "Cần chú ý" tự nổi việc cần xử lý; đánh dấu cảnh báo sẽ báo cho follower/cộng tác viên. Mỗi hồ sơ có dòng thời gian (timeline) và khung thảo luận riêng.' },
      { icon: '📅', title: 'Lịch khởi hành & so sánh phương án', desc: 'Xem lịch khởi hành các hồ sơ theo tháng; so sánh nhiều phương án báo giá của cùng một tour cạnh nhau.' },
      { icon: '📄', title: 'Xuất PDF, tài liệu, tour mẫu', desc: 'Xuất hồ sơ tour ra PDF 1 trang; trung tâm tài liệu cấp hồ sơ (đính kèm file); nhân bản hồ sơ làm "tour mẫu" cho chương trình lặp lại hằng năm; cổng duyệt khi biên lợi thấp.' },
    ],
  },
  {
    id: '2026-06-26b', date: '26/06/2026', title: 'Trang Hôm nay — phiên bản Pro',
    items: [
      { icon: '🎛️', title: 'Tùy biến thẻ & đồng bộ đa thiết bị', desc: 'Kéo-thả, ẩn/hiện và thu gọn từng thẻ trên trang Hôm nay theo ý bạn; bố cục tự đồng bộ qua các thiết bị. Có bộ lọc Của tôi / Cả phòng / Tất cả.' },
      { icon: '📊', title: 'KPI, Ưu tiên hôm nay & thao tác nhanh', desc: 'Dải KPI tổng quan, hộp "Ưu tiên hôm nay" và các nút thao tác nhanh ngay trên thẻ; lưu được nhiều bố cục đặt tên (preset).' },
      { icon: '📰', title: 'Bản tin sáng, lịch tuần, mục tiêu tháng', desc: 'Bản tin sáng tóm tắt việc cần để ý; lịch tuần kèm sparkline; đặt mục tiêu tháng; "vừa xem gần đây" và xuất trang Hôm nay ra PDF.' },
    ],
  },
  {
    id: '2026-06-26a', date: '26/06/2026', title: 'Đào tạo nhân viên & Link visa cho khách',
    items: [
      { icon: '🎓', title: 'Đào tạo nhân viên mới', desc: 'Lộ trình onboarding 30-60-90 ngày cho 4 phòng: trình soạn chương trình, dashboard báo cáo, cấp chứng nhận PDF, nhắc deadline/sign-off, tùy chọn tự ghi danh khi tạo nhân sự + AI tạo câu hỏi luyện tập.' },
      { icon: '🔗', title: 'Link khách xem tình trạng visa', desc: 'Tạo link công khai cho khách tự xem danh sách & tình trạng xin visa của đoàn (chọn trường hiển thị). Phải được Trưởng phòng Visa hoặc BGĐ/CEO duyệt thì link mới hoạt động.' },
      { icon: '📤', title: 'Tải danh sách khách visa ra Excel', desc: 'Xuất danh sách khách xin visa ra Excel mẫu đẹp, tự chọn & sắp xếp cột (nhớ theo máy); có cổng mật khẩu Trưởng Phòng để bảo vệ dữ liệu nhạy cảm.' },
    ],
  },
  {
    id: '2026-06-25b', date: '25/06/2026', title: 'Hồ sơ tour làm trung tâm',
    items: [
      { icon: '🧭', title: 'Một hồ sơ gom mọi thứ', desc: 'Mỗi tour có một Hồ sơ tour (mã tự sinh) gom mọi báo giá, hợp đồng, visa, lịch trình, thực đơn liên quan — nhìn toàn cảnh một chỗ. Tạo nhanh bằng "Tạo báo giá và tour mới".' },
      { icon: '👥', title: 'Cộng tác viên & người theo dõi', desc: 'Thêm cộng tác viên và người theo dõi cho từng hồ sơ; có cập nhật quan trọng là họ được thông báo.' },
      { icon: '🎮', title: 'Cockpit & Dashboard theo hồ sơ', desc: 'Màn Cockpit điều hành theo từng hồ sơ tour; Dashboard tổng hợp và xuất Excel cấp hồ sơ.' },
    ],
  },
  {
    id: '2026-06-25a', date: '25/06/2026', title: 'Quản lý kho · Visa của tour · Nav tùy biến',
    items: [
      { icon: '📦', title: 'Quản lý kho (Inventory)', desc: 'Quản lý vật tư theo lô FIFO và tài sản theo từng cái; cảnh báo tồn thấp, dashboard, xuất Excel; nối kho ↔ tour để đưa giá vốn kho vào quyết toán; in phiếu Nhập/Xuất PDF và báo cáo Nhập-Xuất-Tồn.' },
      { icon: '🛂', title: 'Visa của tour (báo giá nước ngoài)', desc: 'Tab "Visa của tour": theo dõi tình trạng & timeline xin visa từng khách (tự tính ngược từ ngày khởi hành, cảnh báo trễ mốc), AI quét hộ chiếu tự điền khách, dự toán chi phí visa đoàn ↔ thực chi, xuất Excel/PDF.' },
      { icon: '🧰', title: 'Thanh điều hướng tùy biến', desc: 'Nút tùy chỉnh (cạnh nút Đăng xuất): kéo-thả, gom/tách, ẩn/hiện các tab điều hướng theo từng người dùng.' },
    ],
  },
  {
    id: '2026-06-24b', date: '24/06/2026', title: 'Tài chính: ngoại tệ, lợi nhuận, quyết toán',
    items: [
      { icon: '💱', title: 'Thanh toán đa ngoại tệ', desc: 'Mỗi hạng mục chi phí nhập được theo ngoại tệ riêng (USD/EUR…) và tự quy đổi VND theo tỷ giá của báo giá.' },
      { icon: '💰', title: 'Lợi nhuận thực', desc: 'Lợi nhuận = Tổng báo giá − Tổng phải thanh toán, có bù trừ chéo chênh lệch giữa các hạng mục.' },
      { icon: '🧾', title: 'Quyết toán CP tạm ứng', desc: 'Tab "Quyết toán CP tạm ứng" trong "Tạm ứng - Quyết toán": quyết toán đa ngoại tệ & đa phương thức (tiền mặt/thẻ…); dư thì hoàn lại, thiếu thì ghi công nợ.' },
      { icon: '📑', title: 'Hiệu lực báo giá & biên lợi', desc: 'Báo giá có hạn hiệu lực + đóng dấu tỷ giá áp dụng trên bản in/link khách; hiện markup & biên lợi gộp + chính sách huỷ.' },
    ],
  },
  {
    id: '2026-06-24a', date: '24/06/2026', title: 'Nhân sự hoàn thiện & Danh sách khách hợp nhất',
    items: [
      { icon: '👥', title: 'Nhân sự đầy đủ', desc: 'Nghỉ phép + duyệt phép & lịch khả dụng, hồ sơ nhân viên 360, xuất Excel, onboarding tự động, khung năng lực mẫu và lộ trình thăng tiến (career ladder).' },
      { icon: '🧳', title: 'Danh sách khách hợp nhất', desc: 'Gộp danh sách khách giữa Visa và Báo giá; sắp phòng (VIP/Upgrade) và dashboard nam/nữ & số phòng.' },
      { icon: '🪪', title: 'Cấp "Phó Phòng"', desc: 'Bổ sung cấp Phó Phòng (trên Operations, dưới Trưởng Phòng) — thấy dữ liệu phòng như Trưởng Phòng.' },
    ],
  },
  {
    id: '2026-06-23', date: '23/06/2026', title: 'Nhân sự, Quy trình phòng ban, Quy trình Visa',
    items: [
      { icon: '👥', title: 'Module Nhân sự (HRM/ATS)', desc: 'Hồ sơ nhân sự + org chart + giấy tờ nhắc hạn; pool HDV cộng tác viên; đánh giá/KPI/lộ trình; tuyển dụng ATS (Kanban ứng viên, "Nhận việc" tạo nhân sự).' },
      { icon: '🗂️', title: 'Quy trình phòng ban (SOP)', desc: 'Thư viện template quy trình cho 5 phòng + chạy phiên thực tế: timeline, AI gợi ý bước, nhắc deadline.' },
      { icon: '🛂', title: 'Quản lý quy trình visa', desc: 'Nối dự án visa vào Hồ sơ tour; bảng điều phối Kanban; mẫu thủ tục theo từng nước; nhắc hạn & cảnh báo thông minh.' },
      { icon: '🧾', title: 'Quyết toán tour + Web Push', desc: 'Quyết toán tour đối chiếu dự toán giá vốn ↔ chi thực tế ra biên lợi thật, chốt khoá. Thêm Web Push + bản tin sáng tự động.' },
    ],
  },
  {
    id: '2026-06-22', date: '22/06/2026', title: 'Đường dây CRM, Trợ lý ảo, Việc cần làm',
    items: [
      { icon: '🔗', title: 'Đường dây CRM (Deal pipeline)', desc: 'Máy trạng thái hồ sơ tour; Deal Cockpit gom cả vòng đời; bàn giao 1 chạm báo giá → hợp đồng; Pipeline board 7 giai đoạn.' },
      { icon: '🤖', title: 'Trợ lý ảo nâng cấp', desc: 'Phản hồi trôi chảy (streaming), đọc được ảnh/PDF đính kèm và phản hồi nhanh hơn nhờ bộ nhớ đệm.' },
      { icon: '📋', title: 'Việc cần làm — không gian làm việc', desc: 'To-Do nâng cấp: bảng Kanban + dashboard, gắn nhãn, lọc/tìm; tự sinh bộ việc vận hành khi deal thắng.' },
    ],
  },
  {
    id: '2026-06-21e', date: '21/06/2026', title: 'Việc cần làm (To-Do) trên Trang Hôm nay',
    items: [
      { icon: '📋', title: 'Quản lý công việc ngay ở Hôm nay', desc: 'Thẻ "Việc cần làm": thêm nhanh, đặt ưu tiên/deadline, giao cho đội nhóm, việc con (checklist), lặp lại (ngày/tuần/tháng); nhóm theo Quá hạn/Hôm nay/Sắp tới và lọc của tôi/tất cả.' },
      { icon: '⏰', title: 'Nhắc việc theo giờ', desc: 'Nhắc trước hạn (1 ngày/1 giờ…) và theo khung giờ cố định; thông báo hiện ở chuông. Giao việc cho ai sẽ tự gửi thông báo "Bạn được giao việc".' },
      { icon: '🔗', title: 'Liên kết báo giá', desc: 'Gắn việc với một báo giá (mở thẳng tab Báo giá hoặc Thanh toán chỉ với 1 chạm từ thẻ việc).' },
    ],
  },
  {
    id: '2026-06-21d', date: '21/06/2026', title: 'Bổ sung hồ sơ NCC & Khách hàng',
    items: [
      { icon: '🏦', title: 'NCC: thanh toán, điều khoản, file', desc: 'Hồ sơ NCC thêm: tài khoản ngân hàng (kèm SWIFT/IBAN), MST, điều khoản thanh toán/cọc, hoa hồng, hạn mức công nợ, trạng thái hợp tác, website/địa chỉ và file đính kèm (hợp đồng nguyên tắc, bảng giá năm…).' },
      { icon: '👤', title: 'Khách hàng: file, công nợ, phụ trách', desc: 'Hồ sơ khách thêm: file đính kèm (hợp đồng, ĐKKD), điều khoản thanh toán & hạn mức công nợ, TK hoàn tiền, Sales phụ trách, sinh nhật & kênh liên lạc ưa thích.' },
    ],
  },
  {
    id: '2026-06-21c', date: '21/06/2026', title: '3 cách tạo báo giá + cột Excel',
    items: [
      { icon: '📝', title: '3 cách tạo báo giá mới', desc: 'Khi tạo báo giá mới chọn: (1) Tạo trên app như cũ; (2) Upload Excel — chỉ xem file, trang nhập liệu bị khoá; (3) Upload Excel + AI — AI tự phân tích file và điền vào bảng giá.' },
      { icon: '📊', title: 'Cột "Báo giá Excel" ở lịch sử', desc: 'Lịch sử báo giá có thêm cột Báo giá Excel — bấm để mở file gốc đã upload (từ cách 2 & 3).' },
    ],
  },
  {
    id: '2026-06-21b', date: '21/06/2026', title: 'Lịch đi tour HDV',
    items: [
      { icon: '🧭', title: 'Lịch đi tour Hướng dẫn viên', desc: 'Thẻ mới trên Trang chủ (và menu Vận hành): xếp lịch HDV theo tour hoặc theo từng HDV, mỗi tour/HDV một màu riêng. Lịch bay tự lấy từ chuyến bay của báo giá, chỉnh tay được theo thực tế.' },
      { icon: '⚠️', title: 'Tự bắt trùng lịch HDV', desc: 'Hệ thống cảnh báo khi một HDV bị xếp 2 chuyến chồng giờ hoặc quá sát nhau (thời gian đệm cấu hình được), kể cả trùng giữa các tour khác nhau.' },
      { icon: '🧑‍✈️', title: 'Thêm HDV freelance', desc: 'Thêm Hướng dẫn viên freelance ngoài danh sách nhân sự để xếp vào lịch.' },
    ],
  },
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
