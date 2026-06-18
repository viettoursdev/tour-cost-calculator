import { useState } from 'react';
import { Box, Button, Dialog, MobileStepper, Stack, Typography } from '@mui/material';
import KeyboardArrowLeft from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight';
import { LEGACY } from '@/theme';

const STEPS: { icon: string; title: string; body: string }[] = [
  { icon: '🏠', title: 'Trang chủ "Hôm nay"', body: 'Mở app là thấy ngay việc cần để ý: tour sắp khởi hành, việc quá hạn, công nợ và hẹn liên hệ khách.' },
  { icon: '🧭', title: 'Thanh điều hướng gom nhóm', body: 'Tab gom theo nhóm: 🧲 Bán hàng · 🗂️ Vận hành · 📇 Danh mục. Bấm nhóm để mở menu các màn hình bên trong.' },
  { icon: '⌨️', title: 'Tìm nhanh — Ctrl/⌘ + K', body: 'Nhấn Ctrl+K (Mac: ⌘K) để tìm báo giá/khách/hợp đồng, hoặc gõ tên màn hình để "Đi tới" ngay.' },
  { icon: '🤖', title: 'Trợ lý ảo & 💬 Tin nhắn', body: 'Trợ lý tra cứu dữ liệu nội bộ, tư vấn & tìm NCC/đối tác (có tra web). 💬 Tin nhắn để chat + gửi file giữa các tài khoản.' },
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
        <Typography color="text.secondary" sx={{ mt: 1, minHeight: 64 }}>{s.body}</Typography>
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
