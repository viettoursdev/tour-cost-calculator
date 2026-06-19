import { useState } from 'react';
import { Box, Button, Dialog, MobileStepper, Stack, Typography } from '@mui/material';
import KeyboardArrowLeft from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight';
import { LEGACY } from '@/theme';

const STEPS: { icon: string; title: string; body: string }[] = [
  { icon: '🏠', title: 'Trang chủ "Hôm nay"', body: 'Mở app là thấy ngay việc cần để ý: tour sắp khởi hành, việc quá hạn, công nợ và hẹn liên hệ khách.' },
  { icon: '🧭', title: 'Điều hướng gom nhóm', body: 'Tab gom theo nhóm: 🧲 Bán hàng · 🗂️ Vận hành · 📇 Danh mục. Bấm nhóm để mở menu các màn hình bên trong. Mẹo: Ctrl/⌘ + K để tìm nhanh hoặc "Đi tới" màn hình.' },
  { icon: '💰', title: 'Bảng giá nhập như Excel', body: 'Gõ tên rồi Enter để thêm dòng; "Dán từ Excel" nhập hàng loạt; Ctrl/⌘+D điền ô phía trên xuống; số hiểu kiểu tắt (1tr5, 1500k). Rê ô STT để kéo dòng, kéo ⋮⋮ ở tiêu đề để đổi thứ tự hạng mục.' },
  { icon: '🧠', title: 'Nhập thông minh, ít lỗi', body: 'Gõ tên hạng mục → gợi ý tự hoàn thành + tự đoán đơn vị & cách tính SL. Banner đầu trang cảnh báo dòng thiếu giá/tên; khi xuất/lưu sẽ hỏi xác nhận nếu còn dòng giá 0.' },
  { icon: '🤖', title: 'AI nhập báo giá từ file', body: 'Trong tab Chi phí → "🤖 Nhập từ file (AI)": tải Excel/PDF/Word/ảnh báo giá, AI tự bóc từng dòng chi phí, phân loại vào hạng mục, đoán cách tính SL. Xem trước & sửa trước khi thêm.' },
  { icon: '📄', title: 'Xuất & hợp đồng', body: 'Nút "Xuất" cho PDF/Word/Excel báo giá. Trong Hợp đồng: menu Xuất (xem trước PDF) + "🤖 AI rà soát hợp đồng" kiểm tra rủi ro & số liệu trước khi gửi.' },
  { icon: '📇', title: 'NCC & Khách hàng', body: 'Form NCC/Khách hàng có "AI nhập & phân tích" — dán văn bản hoặc kéo-thả/dán ảnh danh thiếp để AI điền. NCC có đánh giá dịch vụ, lọc theo châu lục/quốc gia.' },
  { icon: '🏪', title: 'Nhà hàng & thực đơn', body: 'Thư viện nhà hàng có địa chỉ/ghi chú/file đính kèm, lọc theo khu vực & đánh giá. Nút "AI từ thực đơn" tải file/ảnh menu để AI tự thêm nhà hàng + set menu.' },
  { icon: '🗂️', title: 'Quy trình vận hành', body: 'Theo dõi tiến độ tour bằng Kanban / List / Gantt; kéo-thả bước qua các trạng thái (gồm "Không thực hiện"). Hệ thống tự nhắc các bước sắp/đã quá hạn.' },
  { icon: '📢', title: 'Thông báo & nhắc việc', body: 'Soạn thông báo có mẫu tin, chọn nhanh người nhận theo nhóm, mức ưu tiên Khẩn/Quan trọng, đính kèm file và nhắc lặp lại tới hạn. ✨ "Có gì mới" sẽ báo khi có cập nhật.' },
  { icon: '🤖', title: 'Trợ lý ảo & 💬 Tin nhắn', body: 'Trợ lý tra cứu dữ liệu nội bộ, tư vấn & tìm NCC/đối tác (có tra web). 💬 Tin nhắn để chat, thả cảm xúc, gửi & xem trước file giữa các tài khoản.' },
  { icon: '☁️', title: 'Đừng quên Lưu cloud', body: 'Chấm "● Chưa lưu / Đã lưu" cạnh nút Lưu cho biết trạng thái. Bấm Lưu để đồng bộ báo giá lên cloud cho cả nhóm.' },
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
