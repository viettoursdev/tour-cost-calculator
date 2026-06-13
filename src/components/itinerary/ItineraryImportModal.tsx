import { type ChangeEvent, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogContent, DialogTitle, LinearProgress, Stack, Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { extractDocx, extractPdf } from '@/lib/docExtract';
import { buildItineraryFromParsed, parseItineraryText } from '@/lib/itineraryParse';
import type { Itinerary } from '@/types';

type Props = {
  open: boolean;
  onClose: () => void;
  onParsed: (it: Itinerary, pois: { place: string; commentary: string }[]) => void;
};

export function ItineraryImportModal({ open, onClose, onParsed }: Props) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      setProgress('Đang đọc nội dung file…');
      let text = '';
      if (ext === 'docx') text = await extractDocx(file);
      else if (ext === 'pdf') text = await extractPdf(file, setProgress);
      else throw new Error('Chỉ hỗ trợ file Word (.docx) hoặc PDF.');
      if (!text.trim()) throw new Error('Không trích được nội dung (file rỗng hoặc ảnh scan không đọc được).');

      setProgress('AI đang phân tích lịch trình…');
      const parsed = await parseItineraryText(text);
      const { itinerary, pois } = buildItineraryFromParsed(parsed);
      onParsed(itinerary, pois);
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Lỗi không xác định');
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        📥 Phân tích lịch trình từ file
        <Typography variant="caption" display="block" color="text.secondary">
          Tải file Word (.docx) hoặc PDF — AI sẽ trích thành chương trình để bạn rà soát rồi lưu.
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Button
              component="label" variant="contained" size="large" startIcon={<UploadFileIcon />}
              disabled={busy}
              sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}
            >
              {busy ? 'Đang xử lý…' : 'Chọn file lịch trình'}
              <Box component="input" type="file" hidden accept=".docx,.pdf" onChange={handleFile} />
            </Button>
          </Box>
          {busy && (
            <Box>
              <LinearProgress />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block', textAlign: 'center' }}>
                {progress || 'Đang xử lý…'}
              </Typography>
            </Box>
          )}
          <Typography variant="caption" color="text.disabled">
            Mẹo: file Word (.docx) cho kết quả chính xác nhất. Sau khi phân tích, chương trình sẽ
            mở trong trình soạn để bạn kiểm tra ngày/giờ/địa điểm/thuyết minh trước khi lưu.
          </Typography>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
