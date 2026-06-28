import type { SxProps, Theme } from '@mui/material';

/**
 * Kiểu dùng chung cho các ô tìm kiếm / bộ lọc trong toàn app — gọn, đồng đều,
 * chuyên nghiệp: cao 38px, bo nhẹ, nền trắng, viền mảnh trung tính, hover/focus
 * teal. Dùng `filterFieldSx` cho TextField (gồm TextField select); `filterSelectSx`
 * cho `<Select>` đơn lẻ (root chính là OutlinedInput).
 */
const OUTLINE = 'rgba(15,58,74,0.16)';
const HOVER = 'rgba(20,150,140,0.5)';
const FOCUS = '#14a08c';

export const filterFieldSx: SxProps<Theme> = {
  '& .MuiOutlinedInput-root': { height: 38, borderRadius: 2, bgcolor: '#fff', fontSize: 13.5 },
  // Đồng bộ cỡ chữ nhãn nổi với input (13.5) để KHE NOTCH của viền khớp đúng bề
  // rộng nhãn — nếu để mặc định (16px) nhãn rộng hơn khe → viền kẻ qua đuôi chữ.
  '& .MuiInputLabel-root': { fontSize: 13.5 },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: OUTLINE },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: HOVER },
  '& .Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: FOCUS, borderWidth: 1.5 },
};

export const filterSelectSx: SxProps<Theme> = {
  height: 38, borderRadius: 2, bgcolor: '#fff', fontSize: 13.5,
  '& .MuiOutlinedInput-notchedOutline': { borderColor: OUTLINE },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: HOVER },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: FOCUS, borderWidth: 1.5 },
};
