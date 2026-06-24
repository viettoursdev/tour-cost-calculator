import { useMemo } from 'react';
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import LinkIcon from '@mui/icons-material/Link';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import SyncIcon from '@mui/icons-material/Sync';
import TableChartIcon from '@mui/icons-material/TableChart';
import { useQuoteStore } from '@/stores/quoteStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { toast } from '@/stores/toastStore';
import { GuestDashboard, GuestListTable } from './GuestListTable';
import { RoomingPanel } from './RoomingPanel';
import { applicantsToPassengers, passengersToApplicants } from '../visa/guestAdapters';
import { mergeIncoming } from '../visa/applicantMatch';
import type { Passenger } from '@/types';

const NO_PAX: Passenger[] = [];
let seq = 0;
const newPax = (): Passenger => ({ id: 'p' + Date.now().toString(36) + (seq++).toString(36), name: '' });

export function PassengerView() {
  const pax = useQuoteStore((s) => s.draft.passengers) ?? NO_PAX;
  const info = useQuoteStore((s) => s.draft.info);
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);
  const setPassengers = useQuoteStore((s) => s.setPassengers);
  const visaProjects = useVisaProjectStore((s) => s.projects);

  // Dự án visa đang liên kết với báo giá hiện hành (nếu có).
  const linkedVisa = useMemo(
    () => (currentQuoteId ? visaProjects.find((p) => p.linkedQuoteId === currentQuoteId) : undefined),
    [visaProjects, currentQuoteId],
  );

  const add = () => setPassengers([...pax, newPax()]);

  const syncFromVisa = () => {
    if (!linkedVisa) return;
    // Gộp khách hồ sơ visa vào danh sách báo giá theo khoá khách (số HC/tên).
    const merged = mergeIncoming(passengersToApplicants(pax), linkedVisa.applicants ?? []);
    setPassengers(applicantsToPassengers(merged.list));
    toast(`✅ Đồng bộ từ hồ sơ visa: thêm ${merged.added}, gộp ${merged.merged}.`);
  };

  const exportPdf = async () => {
    if (!pax.length) { toast('Chưa có khách để xuất.', 'warning'); return; }
    (await import('@/lib/exports/exportManifest')).exportManifestPDF(info, pax);
  };
  const exportXls = async () => {
    if (!pax.length) { toast('Chưa có khách để xuất.', 'warning'); return; }
    await (await import('@/lib/exports/exportManifest')).exportManifestExcel(info, pax);
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1280, mx: 'auto' }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
        <Box>
          <Typography fontWeight={900} fontSize={16}>👥 Danh sách khách đoàn</Typography>
          <GuestDashboard pax={pax} />
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button size="small" variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={() => void exportPdf()}>PDF</Button>
          <Button size="small" variant="outlined" startIcon={<TableChartIcon />} onClick={() => void exportXls()}>Excel</Button>
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={add} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>Thêm khách</Button>
        </Stack>
      </Stack>

      {linkedVisa && (
        <Alert
          severity="info" icon={<LinkIcon />} sx={{ mb: 2 }}
          action={(linkedVisa.applicants?.length ?? 0) > 0 && (
            <Button color="inherit" size="small" startIcon={<SyncIcon />} onClick={syncFromVisa}>
              Đồng bộ với hồ sơ visa
            </Button>
          )}
        >
          Liên kết hồ sơ visa: <b>{linkedVisa.name || linkedVisa.code}</b> ({linkedVisa.applicants?.length ?? 0} khách).
          Bấm đồng bộ để kéo danh sách khách visa vào báo giá (gộp theo số hộ chiếu/tên).
        </Alert>
      )}

      {pax.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.disabled' }}>
          Chưa có khách. Bấm “Thêm khách” để lập danh sách đoàn (manifest + rooming) — lưu cùng báo giá.
        </Paper>
      ) : (
        <>
          <RoomingPanel rows={pax} onChange={setPassengers} />
          <GuestListTable rows={pax} onChange={setPassengers} mode="tour" />
        </>
      )}
    </Box>
  );
}
