import { useState } from 'react';
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography,
} from '@mui/material';
import type { Contract } from '@/types';

type Props = {
  contract: Contract;
  onSave: (date: string, note: string) => void;
  onClose: () => void;
};

export function AcceptanceCertModal({ contract, onSave, onClose }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(contract.acceptanceDate ?? today);
  const [note, setNote] = useState(contract.acceptanceNote ?? '');

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>📋 Biên bản nghiệm thu</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Hợp đồng: <strong>{contract.contractNo || contract.id}</strong> — {contract.tourName}
          </Typography>
          <TextField
            label="Ngày nghiệm thu"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            required
          />
          <TextField
            label="Ghi chú"
            multiline
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Các bên đã hoàn thành đầy đủ nghĩa vụ..."
          />
          <Typography variant="caption" color="text.secondary">
            * PDF xuất biên bản sẽ có trong phiên bản tiếp theo.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button
          variant="contained"
          disabled={!date}
          onClick={() => onSave(date, note)}
        >
          ✅ Xác nhận nghiệm thu
        </Button>
      </DialogActions>
    </Dialog>
  );
}
