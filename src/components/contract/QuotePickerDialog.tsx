import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle,
  List, ListItemButton, ListItemText, Typography,
} from '@mui/material';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { fmtVND } from '@/components/quote/calc';
import type { CloudQuoteEntry } from '@/types';

type Props = {
  open: boolean;
  onPick: (quote: CloudQuoteEntry | null) => void;  // null = "Thêm trống"
  onClose: () => void;
};

export function QuotePickerDialog({ open, onPick, onClose }: Props) {
  const quotes = useQuoteHistoryStore((s) => s.visibleQuotes());

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Chọn báo giá để tạo hợp đồng</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {quotes.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
            Chưa có báo giá nào trong lịch sử.
          </Typography>
        ) : (
          <List disablePadding>
            {quotes.map((q) => (
              <ListItemButton key={q.id} onClick={() => onPick(q)} divider>
                <ListItemText
                  primary={<Typography fontWeight={700}>{q.name} ({q.quoteCode})</Typography>}
                  secondary={`${q.pax} khách · ${fmtVND(q.totalCost)}`}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="outlined" onClick={() => onPick(null)}>
          Thêm trống
        </Button>
      </DialogActions>
    </Dialog>
  );
}
