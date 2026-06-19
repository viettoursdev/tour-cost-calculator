import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography,
} from '@mui/material';
import { itinerarySummary, itineraryIssues } from './itinerarySummary';
import type { Itinerary } from '@/types';

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <Box sx={{ flex: '1 1 90px', minWidth: 90, textAlign: 'center', p: 1, borderRadius: 1.5, bgcolor: warn ? 'rgba(245,166,35,0.12)' : 'rgba(20,150,140,0.08)' }}>
      <Typography sx={{ fontSize: 20, fontWeight: 900, color: warn ? '#b9770f' : '#0d7a6a', fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}

export function ItineraryCheckDialog({ itinerary, onClose, onExportWord, onExportPDF, onPreview }: {
  itinerary: Itinerary | null;
  onClose: () => void;
  onExportWord?: () => void;
  onExportPDF?: () => void;
  onPreview?: () => void;
}) {
  if (!itinerary) return null;
  const s = itinerarySummary(itinerary);
  const issues = itineraryIssues(itinerary);

  return (
    <Dialog open={!!itinerary} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>✅ Kiểm tra & tóm tắt chương trình</DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          <Stat label="Ngày trong lịch" value={s.scheduleDays} warn={!!itinerary.days && itinerary.days !== s.scheduleDays} />
          <Stat label="Khai báo" value={`${s.declaredDays}N${s.declaredNights}Đ`} />
          <Stat label="Hoạt động" value={s.activities} />
          <Stat label="Bữa ăn (B/L/D)" value={`${s.meals.B}/${s.meals.L}/${s.meals.D}`} />
          <Stat label="Ngày có ngày tháng" value={`${s.daysWithDate}/${s.scheduleDays}`} warn={s.daysWithDate < s.scheduleDays} />
          <Stat label="Ngày trống" value={s.daysEmpty} warn={s.daysEmpty > 0} />
        </Stack>

        {issues.length === 0 ? (
          <Alert severity="success">Chương trình đầy đủ — sẵn sàng xuất.</Alert>
        ) : (
          <>
            <Typography variant="caption" fontWeight={800} sx={{ color: '#b9770f' }}>⚠ {issues.length} điểm cần xem lại:</Typography>
            <Stack component="ul" sx={{ mt: 0.5, mb: 0, pl: 2.5 }} spacing={0.25}>
              {issues.map((w, i) => <Typography key={i} component="li" variant="body2" color="text.secondary">{w}</Typography>)}
            </Stack>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">Đóng</Button>
        {onPreview && <Button onClick={() => { onClose(); onPreview(); }}>Xem trước</Button>}
        {onExportPDF && <Button onClick={() => { onClose(); onExportPDF(); }}>Xuất PDF</Button>}
        {onExportWord && <Button variant="contained" onClick={() => { onClose(); onExportWord(); }} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>Xuất Word</Button>}
      </DialogActions>
    </Dialog>
  );
}
