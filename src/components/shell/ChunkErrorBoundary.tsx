import { Component, type ReactNode } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { LEGACY } from '@/theme';

/**
 * Bọc các view nạp động (lazy). Nếu chunk nạp lỗi/hết giờ (xem `lazyView`), thay
 * vì để trang KẸT ở vòng xoay mãi mãi, hiện thông báo + nút "Tải lại trang".
 * `installChunkReload` vẫn tự reload khi deploy mới đổi hash; boundary này là lưới
 * an toàn cho khi reload tự động bị chặn (guard 15s) hoặc request bị treo.
 */
export class ChunkErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    // Ghi log để chẩn đoán (mạng treo / chunk 404 / lỗi render view).
    console.error('[ChunkErrorBoundary] view load failed:', error);
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240, p: 2 }}>
          <Stack spacing={1.5} alignItems="center" sx={{ maxWidth: 440, textAlign: 'center' }}>
            <Typography fontWeight={800}>Không tải được nội dung</Typography>
            <Typography variant="body2" color="text.secondary">
              Có thể do bản cập nhật mới hoặc mạng chập chờn. Hãy tải lại trang để lấy bản mới nhất.
            </Typography>
            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={() => window.location.reload()}
              sx={{ background: LEGACY.headerGradient }}
            >
              Tải lại trang
            </Button>
          </Stack>
        </Box>
      );
    }
    return this.props.children;
  }
}
