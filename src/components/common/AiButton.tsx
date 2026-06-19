import { Button, type ButtonProps } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

/**
 * Nút tính năng AI dùng chung cho toàn app (nhập từ file/AI, AI quét, AI phân
 * tích…). Thiết kế thống nhất, chuyên nghiệp: nền gradient indigo→violet, chữ
 * trắng, biểu tượng ✦. Truyền `startIcon` để thay (vd spinner khi đang chạy).
 */
export function AiButton({ children, sx, startIcon, ...props }: ButtonProps) {
  return (
    <Button
      variant="contained"
      startIcon={startIcon ?? <AutoAwesomeIcon />}
      {...props}
      sx={{
        textTransform: 'none',
        fontWeight: 700,
        borderRadius: 2,
        color: '#fff',
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        boxShadow: '0 2px 8px rgba(99,102,241,0.30)',
        '&:hover': {
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          boxShadow: '0 4px 14px rgba(99,102,241,0.42)',
        },
        '&.Mui-disabled': { background: 'rgba(99,102,241,0.30)', color: 'rgba(255,255,255,0.85)' },
        ...sx,
      }}
    >
      {children}
    </Button>
  );
}
