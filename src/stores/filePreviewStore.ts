import { create } from 'zustand';
import type { PreviewFile } from '@/components/common/FilePreviewDialog';

/** Khung xem trước file dùng chung toàn app (mount 1 lần qua FilePreviewHost). */
type FilePreviewState = {
  file: PreviewFile | null;
  open: (f: PreviewFile) => void;
  close: () => void;
};

export const useFilePreviewStore = create<FilePreviewState>((set) => ({
  file: null,
  open: (f) => set({ file: f }),
  close: () => set({ file: null }),
}));

/** Mở xem trước 1 file đã lưu (gọi từ bất kỳ chỗ đính kèm nào). */
export const openFilePreview = (f: PreviewFile) => useFilePreviewStore.getState().open(f);
