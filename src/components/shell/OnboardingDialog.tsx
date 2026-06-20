import { useState } from 'react';
import { Box, Button, Dialog, MobileStepper, Stack, Typography } from '@mui/material';
import KeyboardArrowLeft from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight';
import { LEGACY } from '@/theme';

const STEPS: { icon: string; title: string; body: string }[] = [
  { icon: '🏠', title: 'Trang chủ "Hôm nay"', body: 'Mở app là thấy ngay việc cần để ý: tour sắp khởi hành, việc quá hạn, công nợ và hẹn liên hệ khách.' },
  { icon: '🧭', title: 'Điều hướng gom nhóm', body: 'Tab gom theo nhóm: Hôm nay · Báo giá · Bán hàng · Vận hành · Danh mục. Bấm nhóm để mở menu các màn hình bên trong. Mẹo: Ctrl/⌘ + K để tìm nhanh / "Đi tới" màn hình.' },
  { icon: '🗂️', title: '7 loại hồ sơ', body: 'Từ Trang chủ chọn loại cần làm: Báo giá nội địa · nước ngoài · Breakdown DMC · Chương trình tour · Thư viện thực đơn · Quản lý Visa · Dịch hồ sơ. Hệ thống tự cấu hình biểu mẫu phù hợp.' },
  { icon: '💰', title: 'Bảng giá nhập như Excel', body: 'Gõ tên rồi Enter để thêm dòng; "Dán từ Excel" nhập hàng loạt; Ctrl/⌘+D điền ô phía trên xuống; số hiểu kiểu tắt (1tr5, 1500k). Rê ô STT để kéo dòng, kéo ⋮⋮ ở tiêu đề để đổi thứ tự hạng mục.' },
  { icon: '🧠', title: 'Nhập thông minh, ít lỗi', body: 'Gõ tên hạng mục → gợi ý tự hoàn thành + tự đoán đơn vị & cách tính SL. Banner đầu trang cảnh báo dòng thiếu giá/tên; khi xuất/lưu sẽ hỏi xác nhận nếu còn dòng giá 0.' },
  { icon: '💱', title: 'Tỷ giá ngoại tệ', body: 'Hàng "Tỷ giá → VND" để chỉnh tỷ giá riêng của từng báo giá; mỗi dòng chi phí chọn được ngoại tệ, tự quy đổi. CEO bấm "Đồng bộ" để áp tỷ giá cho các báo giá MỚI toàn hệ thống.' },
  { icon: '👥', title: 'Báo giá nhiều cỡ đoàn', body: 'Dải tab cỡ đoàn (20/25/30… khách) cho phép báo giá song song nhiều mức trên cùng một file; dòng tính theo khách tự nhân theo cỡ đoàn đang chọn.' },
  { icon: '🤖', title: 'AI nhập báo giá từ file', body: 'Trong tab Báo giá → "Nhập từ file (AI)": tải Excel/PDF/Word/ảnh báo giá, AI tự bóc từng dòng chi phí, phân loại vào hạng mục, đoán cách tính SL. Xem trước & sửa trước khi thêm.' },
  { icon: '📄', title: 'Xuất & hợp đồng', body: 'Nút "Xuất" cho PDF/Word/Excel báo giá (kèm bản trọn gói). Trong Hợp đồng: menu Xuất (xem trước PDF) + "AI rà soát hợp đồng" kiểm tra rủi ro & số liệu trước khi gửi.' },
  { icon: '🕐', title: 'Lịch sử & phiên bản', body: 'Mỗi lần Lưu cloud là một phiên bản — bấm 🕘 cạnh nút Lưu để xem & KHÔI PHỤC bản cũ (giữ 20 bản). Lịch sử báo giá lọc theo khách/quốc gia, ghim cột Mã + Tên khi cuộn; có thể ghi đè lên báo giá cũ.' },
  { icon: '💵', title: 'Đề nghị tạm ứng & quyết toán', body: 'Trong Danh mục → "Đề nghị tạm ứng": tính chi phí đi tour (có Rate card) + chi phí khác + số tạm ứng (hỗ trợ ngoại tệ). Chọn 2 người duyệt → gửi duyệt trong app (Duyệt/Từ chối ngay ở chuông) → xuất PDF. Sau tour làm Quyết toán để đóng case.' },
  { icon: '🗺️', title: 'Chương trình tour', body: 'Mã tự sinh, gắn khách hàng. Chọn ngày khởi hành ra đúng Thứ + tịnh tiến; kéo-thả hoạt động giữa các ngày; ô hoạt động xuống dòng / **đậm** / *nghiêng*; vận hành nhập song song theo ngày; "AI lịch trình" dựng khung + "Tạo bằng AI" thuyết minh điểm. Xuất Word. Mở nhanh từ menu Vận hành.' },
  { icon: '🍽️', title: 'Thực đơn & nhà hàng', body: 'Trình tạo Thực đơn theo ngày/bữa & set menu, bật-tắt "Kèm giá", liên kết Chương trình, xuất Word/PDF. Thư viện nhà hàng có địa chỉ/file/đánh giá, lọc theo khu vực + nút "AI từ thực đơn" để tự thêm nhà hàng & set menu từ ảnh/file.' },
  { icon: '🛂', title: 'Visa & Dịch hồ sơ', body: 'Quản lý Visa: bảng giá visa theo nước + hồ sơ thủ tục. Dịch hồ sơ: dịch giấy tờ Việt → Anh chuẩn lãnh sự, GIỮ NGUYÊN bố cục, OCR được ảnh/PDF scan.' },
  { icon: '📇', title: 'NCC & Khách hàng', body: 'Form có "AI nhập & phân tích" (dán văn bản / ảnh danh thiếp). NCC: tìm theo tên + người liên hệ, tìm THEO TOUR, tự suy Quốc gia/Châu lục từ địa điểm, GỘP NCC trùng, đánh giá dịch vụ, lĩnh vực gồm Du thuyền/Tham quan.' },
  { icon: '🗂️', title: 'Quy trình vận hành', body: 'Theo dõi tiến độ tour bằng Kanban / List / Gantt; kéo-thả bước qua các trạng thái (gồm "Không thực hiện"); nút "🔄 Đồng bộ" tự cập nhật bước từ dữ liệu thật. Hệ thống tự nhắc bước sắp/đã quá hạn.' },
  { icon: '🚌', title: 'Điều phối · Khách đoàn · Công nợ', body: 'Khách đoàn: danh sách khách + phân phòng. Điều phối & Lịch khởi hành: nhìn toàn bộ tour theo bảng/lịch. Công nợ tổng: tổng hợp phải trả NCC. Chuyến bay: dán code GDS/PNR hoặc ảnh vé → AI nhận diện chặng bay.' },
  { icon: '📈', title: 'Bán hàng & biên lợi', body: 'Pipeline bán hàng theo trạng thái deal (đã gửi / deal giá / thắng / thua + lý do); Phân tích bán hàng theo nguồn & tỷ lệ thắng; Dashboard biên lợi xem lãi gộp/biên theo báo giá.' },
  { icon: '🔐', title: 'Phân quyền theo phòng ban', body: 'Mỗi phòng chỉ TẠO/SỬA báo giá thuộc khu vực của mình (nội địa / nước ngoài…), vẫn xem được phần khác. Phòng Hướng dẫn viên (HDV) được ẩn giá để cầm chương trình mà không lộ giá vốn.' },
  { icon: '📢', title: 'Thông báo & nhắc việc', body: 'Soạn thông báo có mẫu tin, chọn nhanh người nhận theo nhóm, mức ưu tiên Khẩn/Quan trọng, đính kèm file và nhắc lặp lại tới hạn. ✨ "Có gì mới" sẽ báo khi có cập nhật.' },
  { icon: '🤖', title: 'Trợ lý ảo & 💬 Tin nhắn', body: 'Trợ lý tra cứu dữ liệu nội bộ, tư vấn & tìm NCC/đối tác (có tra web), đề xuất nháp lịch trình/báo giá mở 1 chạm. 💬 Tin nhắn để chat, thả cảm xúc, gửi & xem trước file giữa các tài khoản.' },
  { icon: '☁️', title: 'Đừng quên Lưu cloud', body: 'Chấm màu trên nút Lưu cho biết trạng thái (cam = chưa lưu, xanh = đã đồng bộ). Bấm Lưu để đồng bộ báo giá lên cloud cho cả nhóm — và sinh một phiên bản mới có thể khôi phục.' },
];

export function OnboardingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const last = i === STEPS.length - 1;
  const s = STEPS[i];
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography sx={{ fontSize: 52, lineHeight: 1 }}>{s.icon}</Typography>
        <Typography fontWeight={900} fontSize={19} sx={{ mt: 1.5, color: LEGACY.navy }}>{s.title}</Typography>
        <Typography color="text.secondary" sx={{ mt: 1, minHeight: 110 }}>{s.body}</Typography>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>{i + 1}/{STEPS.length}</Typography>
      </Box>
      <MobileStepper variant="dots" steps={STEPS.length} position="static" activeStep={i}
        sx={{ background: 'transparent', '& .MuiMobileStepper-dotActive': { bgcolor: LEGACY.teal } }}
        nextButton={
          last
            ? <Button variant="contained" onClick={onClose} sx={{ background: LEGACY.headerGradient, fontWeight: 800 }}>Bắt đầu</Button>
            : <Button size="small" onClick={() => setI((v) => v + 1)}>Tiếp<KeyboardArrowRight /></Button>
        }
        backButton={<Button size="small" disabled={i === 0} onClick={() => setI((v) => v - 1)}><KeyboardArrowLeft />Trước</Button>}
      />
      <Stack alignItems="center" sx={{ pb: 1.5 }}>
        {!last && <Button size="small" color="inherit" onClick={onClose} sx={{ color: 'text.disabled' }}>Bỏ qua</Button>}
      </Stack>
    </Dialog>
  );
}
