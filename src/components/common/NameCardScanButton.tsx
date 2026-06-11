import { useState } from 'react';
import { Box, Button, CircularProgress } from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import { scanNameCard, type NameCardFields } from '@/lib/nameCard';

type Props = {
  onScanned: (fields: NameCardFields) => void;
  disabled?: boolean;
};

/** Pick a name-card image → OCR + AI extraction → hand back structured fields. */
export function NameCardScanButton({ onScanned, disabled }: Props) {
  const [busy, setBusy] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const fields = await scanNameCard(file);
      const any = Object.values(fields).some((v) => v && v.trim());
      if (!any) {
        window.alert('Không nhận diện được trường nào từ ảnh. Hãy thử ảnh rõ nét hơn.');
        return;
      }
      onScanned(fields);
    } catch (err) {
      window.alert('❌ Quét name card lỗi: ' + (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      component="label"
      size="small"
      variant="outlined"
      disabled={disabled || busy}
      startIcon={busy ? <CircularProgress size={14} /> : <PhotoCameraIcon />}
    >
      {busy ? 'Đang quét…' : '📇 Quét name card'}
      <Box component="input" type="file" hidden accept="image/*" onChange={onPick} />
    </Button>
  );
}
