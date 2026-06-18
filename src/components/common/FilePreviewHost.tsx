import { useFilePreviewStore } from '@/stores/filePreviewStore';
import { FilePreviewDialog } from './FilePreviewDialog';

/** Mount 1 lần (AppShell) — hiển thị khung xem trước cho mọi nơi gọi openFilePreview. */
export function FilePreviewHost() {
  const file = useFilePreviewStore((s) => s.file);
  const close = useFilePreviewStore((s) => s.close);
  return <FilePreviewDialog open={!!file} onClose={close} file={file} />;
}
