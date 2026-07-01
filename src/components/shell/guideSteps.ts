/**
 * Nội dung "Hướng dẫn nhanh" — gắn `tags` để mở guide NGỮ CẢNH theo màn hình
 * đang xem (vd đang ở Chương trình tour thì chỉ hiện các bước tag 'itinerary').
 *
 * `image` (tuỳ chọn): tên file ảnh minh hoạ đặt trong `public/guide/` (vd
 * 'cost-entry.png'). Chưa có file thì guide hiện khung placeholder; thả ảnh vào
 * thư mục đó là tự hiển thị (xem public/guide/README.md).
 */
export type GuideStep = { icon: string; title: string; body: string; tags: string[]; image?: string };

export const GUIDE_STEPS: GuideStep[] = [
  { icon: '🏠', title: 'Màn hình "Hôm nay"', tags: ['home'], image: 'home.png', body: 'Mở app là thấy ngay việc cần để ý: tour sắp khởi hành, việc quá hạn, công nợ và hẹn liên hệ khách.' },
  { icon: '🧭', title: 'Điều hướng gom nhóm', tags: ['home'], image: 'nav.png', body: 'Tab gom theo nhóm: Hôm nay · Báo giá · Bán hàng · Vận hành · Danh mục. Bấm nhóm để mở menu các màn hình bên trong. Mẹo: Ctrl/⌘ + K để tìm nhanh / "Đi tới" màn hình.' },
  { icon: '🗂️', title: '7 loại hồ sơ', tags: ['home'], image: 'templates.png', body: 'Từ Trang chủ chọn loại cần làm: Báo giá nội địa · nước ngoài · Breakdown DMC · Chương trình tour · Thư viện thực đơn · Quản lý Visa · Dịch hồ sơ. Hệ thống tự cấu hình biểu mẫu phù hợp.' },
  { icon: '💰', title: 'Bảng giá nhập như Excel', tags: ['cost'], image: 'cost-entry.png', body: 'Gõ tên rồi Enter để thêm dòng; "Dán từ Excel" nhập hàng loạt; Ctrl/⌘+D điền ô phía trên xuống; số hiểu kiểu tắt (1tr5, 1500k). Rê ô STT để kéo dòng, kéo ⋮⋮ ở tiêu đề để đổi thứ tự hạng mục.' },
  { icon: '🧠', title: 'Nhập thông minh, ít lỗi', tags: ['cost'], image: 'cost-smart.png', body: 'Gõ tên hạng mục → gợi ý tự hoàn thành + tự đoán đơn vị & cách tính SL. Banner đầu trang cảnh báo dòng thiếu giá/tên; khi xuất/lưu sẽ hỏi xác nhận nếu còn dòng giá 0.' },
  { icon: '💱', title: 'Tỷ giá ngoại tệ', tags: ['cost', 'advance'], image: 'fx-rates.png', body: 'Hàng "Tỷ giá → VND" để chỉnh tỷ giá riêng của từng báo giá; mỗi dòng chi phí chọn được ngoại tệ, tự quy đổi. CEO bấm "Đồng bộ" để áp tỷ giá cho các báo giá MỚI toàn hệ thống.' },
  { icon: '👥', title: 'Báo giá nhiều cỡ đoàn', tags: ['cost'], image: 'group-size.png', body: 'Dải tab cỡ đoàn (20/25/30… khách) cho phép báo giá song song nhiều mức trên cùng một file; dòng tính theo khách tự nhân theo cỡ đoàn đang chọn.' },
  { icon: '🤖', title: 'AI nhập báo giá từ file', tags: ['cost'], image: 'ai-import.png', body: 'Trong tab Báo giá → "Nhập từ file (AI)": tải Excel/PDF/Word/ảnh báo giá, AI tự bóc từng dòng chi phí, phân loại vào hạng mục, đoán cách tính SL. Xem trước & sửa trước khi thêm.' },
  { icon: '📄', title: 'Xuất & hợp đồng', tags: ['cost', 'contract'], image: 'export.png', body: 'Nút "Xuất" cho PDF/Word/Excel báo giá (kèm bản trọn gói). Trong Hợp đồng: menu Xuất (xem trước PDF) + "AI rà soát hợp đồng" kiểm tra rủi ro & số liệu trước khi gửi.' },
  { icon: '🕐', title: 'Lịch sử & phiên bản', tags: ['history', 'cost'], image: 'history.png', body: 'Mỗi lần Lưu cloud là một phiên bản — bấm 🕘 cạnh nút Lưu để xem & KHÔI PHỤC, ĐỔI TÊN & XOÁ bản cũ (giữ 30 bản). Lịch sử báo giá lọc theo khách/quốc gia, ghim cột Mã + Tên khi cuộn; có thể ghi đè lên báo giá cũ.' },
  { icon: '💵', title: 'Đề nghị tạm ứng & quyết toán', tags: ['advance', 'advsettle'], image: 'advance.png', body: 'Trong Danh mục → "Tạm ứng - Quyết toán": tính chi phí đi tour (có Rate card) + chi phí khác + số tạm ứng (hỗ trợ ngoại tệ). Chọn 2 người duyệt → gửi duyệt trong app (Duyệt/Từ chối ngay ở chuông) → xuất PDF. Sau tour làm Quyết toán để đóng case.' },
  { icon: '🗺️', title: 'Chương trình tour', tags: ['itinerary'], image: 'itinerary.png', body: 'Mã tự sinh, gắn khách hàng. Chọn ngày khởi hành ra đúng Thứ + tịnh tiến; kéo-thả hoạt động giữa các ngày; ô hoạt động xuống dòng / **đậm** / *nghiêng*; vận hành nhập song song theo ngày; "AI lịch trình" dựng khung + "Tạo bằng AI" thuyết minh điểm. Xuất Word. Mở nhanh từ menu Vận hành.' },
  { icon: '🍽️', title: 'Thực đơn & nhà hàng', tags: ['menu'], image: 'menu.png', body: 'Trình tạo Thực đơn theo ngày/bữa & set menu, bật-tắt "Kèm giá", liên kết Chương trình, xuất Word/PDF. Thư viện nhà hàng có địa chỉ/file/đánh giá, lọc theo khu vực + nút "AI từ thực đơn" để tự thêm nhà hàng & set menu từ ảnh/file.' },
  { icon: '🛂', title: 'Visa & Dịch hồ sơ', tags: ['visa', 'doctranslate'], image: 'visa.png', body: 'Quản lý Visa: bảng giá visa theo nước + hồ sơ thủ tục. Dịch hồ sơ: dịch giấy tờ Việt → Anh chuẩn lãnh sự, GIỮ NGUYÊN bố cục, OCR được ảnh/PDF scan.' },
  { icon: '📇', title: 'NCC & Khách hàng', tags: ['ncc', 'customer'], image: 'ncc.png', body: 'Form có "AI nhập & phân tích" (dán văn bản / ảnh danh thiếp). NCC: tìm theo tên + người liên hệ, tìm THEO TOUR, tự suy Quốc gia/Châu lục từ địa điểm, GỘP NCC trùng, đánh giá dịch vụ, lĩnh vực gồm Du thuyền/Tham quan.' },
  { icon: '🚦', title: 'Quy trình điều hành', tags: ['workflow'], image: 'workflow.png', body: 'Theo dõi tiến độ tour bằng Kanban / List / Gantt; kéo-thả bước qua các trạng thái (gồm "Không thực hiện"); nút "🔄 Đồng bộ" tự cập nhật bước từ dữ liệu thật. Hệ thống tự nhắc bước sắp/đã quá hạn.' },
  { icon: '🚌', title: 'Điều phối · Khách đoàn · Công nợ', tags: ['opsboard', 'passengers', 'payboard', 'departures', 'payment', 'flights'], image: 'ops.png', body: 'Khách đoàn: danh sách khách + phân phòng. Điều phối & Lịch khởi hành: nhìn toàn bộ tour theo bảng/lịch. Công nợ tổng: tổng hợp phải trả NCC. Chuyến bay: dán code GDS/PNR hoặc ảnh vé → AI nhận diện chặng bay.' },
  { icon: '📈', title: 'Bán hàng & biên lợi', tags: ['pipeline', 'salesanalytics', 'dashboard', 'summary'], image: 'sales.png', body: 'Pipeline bán hàng theo trạng thái deal (đã gửi / deal giá / thắng / thua + lý do); Phân tích bán hàng theo nguồn & tỷ lệ thắng; Dashboard biên lợi xem lãi gộp/biên theo báo giá.' },
  { icon: '🧭', title: 'Hồ sơ tour làm trung tâm', tags: ['cockpit'], image: 'cockpit.png', body: 'Mỗi tour có MỘT Hồ sơ tour (mã tự sinh) gom mọi báo giá, hợp đồng, visa, lịch trình, thực đơn liên quan. Phân loại 5 loại + 3 mốc giá trị (hiện tại/hợp đồng/nghiệm thu); thêm Cộng tác viên & Người theo dõi; Cockpit điều hành + thẻ "Cần chú ý" + dòng thời gian & thảo luận; lịch khởi hành theo tháng, so sánh phương án, xuất PDF, nhân bản làm tour mẫu.' },
  { icon: '📋', title: 'Việc cần làm (To-Do)', tags: ['todo', 'home'], image: 'todo.png', body: 'Quản lý công việc đội nhóm: thêm nhanh, ưu tiên/deadline, giao việc, checklist, lặp lại; nhắc trước hạn ở chuông. Không gian làm việc gồm List/Kanban/Dashboard, gắn nhãn & lọc. Deal thắng tự sinh bộ việc vận hành. Gắn việc vào báo giá để mở 1 chạm.' },
  { icon: '🔗', title: 'Đường dây CRM (Deal pipeline)', tags: ['pipeline', 'execboard', 'cockpit'], image: 'crm.png', body: 'Nối Yêu cầu → Báo giá → Chốt → Hợp đồng → Vận hành → Nghiệm thu. Deal Cockpit gom cả vòng đời một hồ sơ; bàn giao 1 chạm báo giá → hợp đồng; Pipeline board 7 giai đoạn; CEO có Tổng quan điều hành & Phân tích bán hàng.' },
  { icon: '🗂️', title: 'Quy trình phòng ban (SOP)', tags: ['process'], image: 'process.png', body: 'Thư viện quy trình chuẩn (SOP) cho 5 phòng + chạy phiên thực tế theo timeline; AI gợi ý bước; tự nhắc deadline từng bước. Khác với "Quy trình điều hành" (theo từng tour) — đây là quy trình nghiệp vụ của phòng ban.' },
  { icon: '🧾', title: 'Quyết toán tour', tags: ['settlement', 'advsettle'], image: 'settlement.png', body: 'Đối chiếu dự toán giá vốn ↔ chi thực tế ra biên lợi THẬT; chốt khoá & ghi nhận doanh thu thực. Lấy được cả giá vốn kho. Riêng "Quyết toán CP tạm ứng" (đa ngoại tệ/đa phương thức) nằm trong tab "Tạm ứng - Quyết toán".' },
  { icon: '👥', title: 'Nhân sự (HRM/ATS)', tags: ['hr'], image: 'hr.png', body: 'Hồ sơ nhân sự + org chart + giấy tờ nhắc hạn; pool HDV cộng tác viên; đánh giá/KPI/lộ trình; tuyển dụng ATS (Kanban ứng viên, "Nhận việc" tạo nhân sự); nghỉ phép & duyệt phép + lịch khả dụng; hồ sơ 360, khung năng lực & lộ trình thăng tiến. Mở từ thẻ Trang chủ (theo quyền).' },
  { icon: '🎓', title: 'Đào tạo nhân viên mới', tags: ['training'], image: 'training.png', body: 'Lộ trình onboarding 30-60-90 ngày cho 4 phòng: trình soạn chương trình, dashboard báo cáo, cấp chứng nhận PDF, nhắc deadline/sign-off; tùy chọn tự ghi danh khi tạo nhân sự + AI tạo câu hỏi luyện tập.' },
  { icon: '📦', title: 'Quản lý kho', tags: ['inventory'], image: 'inventory.png', body: 'Vật tư theo lô FIFO + tài sản theo từng cái; cảnh báo tồn thấp, dashboard, xuất Excel; nối kho ↔ tour để đưa giá vốn kho vào quyết toán; in phiếu Nhập/Xuất PDF và báo cáo Nhập-Xuất-Tồn.' },
  { icon: '🛂', title: 'Visa của tour', tags: ['tourvisa'], image: 'tourvisa.png', body: 'Với báo giá nước ngoài: theo dõi tình trạng & timeline xin visa từng khách (tự tính ngược từ ngày khởi hành, cảnh báo trễ mốc); AI quét hộ chiếu tự điền khách; dự toán chi phí visa đoàn ↔ thực chi; xuất Excel/PDF & checklist hồ sơ.' },
  { icon: '📤', title: 'Chia sẻ link cho khách', tags: ['cost', 'visa', 'tourvisa'], image: 'share.png', body: 'Tạo link công khai để khách tự xem: báo giá (token bảo mật) và danh sách & tình trạng xin visa của đoàn (chọn trường hiển thị). Link visa phải được Trưởng phòng Visa/BGĐ-CEO DUYỆT mới hoạt động.' },
  { icon: '🎛️', title: 'Tùy biến giao diện', tags: ['home'], image: 'customize.png', body: 'Trang Hôm nay: kéo-thả/ẩn-hiện/thu gọn từng thẻ, lưu nhiều bố cục, đồng bộ đa thiết bị, lọc Của tôi/Cả phòng/Tất cả. Thanh điều hướng: nút ⚙️ (cạnh Đăng xuất) để kéo-thả, gom/tách, ẩn/hiện tab theo từng người dùng.' },
  { icon: '🔐', title: 'Phân quyền theo phòng ban', tags: ['home'], image: 'permissions.png', body: 'Mỗi phòng chỉ TẠO/SỬA báo giá thuộc khu vực của mình (nội địa / nước ngoài…), vẫn xem được phần khác. Phòng Hướng dẫn viên (HDV) được ẩn giá để cầm chương trình mà không lộ giá vốn.' },
  { icon: '📢', title: 'Thông báo & nhắc việc', tags: ['home'], image: 'notifications.png', body: 'Soạn thông báo có mẫu tin, chọn nhanh người nhận theo nhóm, mức ưu tiên Khẩn/Quan trọng, đính kèm file và nhắc lặp lại tới hạn. ✨ "Có gì mới" sẽ báo khi có cập nhật.' },
  { icon: '🤖', title: 'Trợ lý ảo & 💬 Tin nhắn', tags: ['home'], image: 'assistant.png', body: 'Trợ lý tra cứu dữ liệu nội bộ, tư vấn & tìm NCC/đối tác (có tra web), đề xuất nháp lịch trình/báo giá mở 1 chạm. 💬 Tin nhắn để chat, thả cảm xúc, gửi & xem trước file giữa các tài khoản.' },
  { icon: '☁️', title: 'Đừng quên Lưu cloud', tags: ['cost', 'home'], image: 'cloud-save.png', body: 'Chấm màu trên nút Lưu cho biết trạng thái (cam = chưa lưu, xanh = đã đồng bộ). Bấm Lưu để đồng bộ báo giá lên cloud cho cả nhóm — và sinh một phiên bản mới có thể khôi phục.' },
];

/** Nhãn màn hình cho tiêu đề guide ngữ cảnh. */
export const CONTEXT_LABEL: Record<string, string> = {
  home: 'Hôm nay', cockpit: 'Hồ sơ tour', cost: 'Bảng báo giá', history: 'Lịch sử báo giá',
  advance: 'Đề nghị tạm ứng', advsettle: 'Tạm ứng - Quyết toán', settlement: 'Quyết toán tour',
  itinerary: 'Chương trình tour', menu: 'Thực đơn', visa: 'Quản lý Visa', tourvisa: 'Visa của tour',
  doctranslate: 'Dịch hồ sơ', todo: 'Việc cần làm',
  ncc: 'Nhà cung cấp', nccProducts: 'Sản phẩm NCC', customer: 'Khách hàng', contract: 'Hợp đồng',
  workflow: 'Quy trình điều hành', process: 'Quy trình phòng ban', hr: 'Nhân sự', inventory: 'Quản lý kho',
  training: 'Đào tạo', opsboard: 'Điều phối', passengers: 'Khách đoàn', payboard: 'Công nợ',
  departures: 'Lịch khởi hành', payment: 'Thanh toán', flights: 'Chuyến bay', pipeline: 'Pipeline bán hàng',
  execboard: 'Tổng quan điều hành', salesanalytics: 'Phân tích bán hàng', dashboard: 'Dashboard bán hàng',
  summary: 'Tổng kết',
};

/** Suy ra tag ngữ cảnh từ template + view hiện tại của báo giá. */
export function tagForContext(template: string | null | undefined, view: string): string {
  if (template === 'itinerary' || template === 'menu' || template === 'visa' || template === 'doctranslate') return template;
  return view || 'home';
}
