import { useState, type ChangeEvent } from 'react';
import {
  AppBar, Box, Button, ButtonGroup, Checkbox, Chip, Dialog, DialogTitle, Divider, FormControlLabel,
  IconButton, ListItemIcon, ListItemText, ListSubheader, Menu, MenuItem, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Toolbar, Tooltip, Typography,
} from '@mui/material';
import { toast } from '@/stores/toastStore';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import TuneIcon from '@mui/icons-material/Tune';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DownloadIcon from '@mui/icons-material/Download';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import HistoryIcon from '@mui/icons-material/History';
import PlaylistRemoveIcon from '@mui/icons-material/PlaylistRemove';
import SaveIcon from '@mui/icons-material/Save';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import TableViewIcon from '@mui/icons-material/TableView';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import UploadIcon from '@mui/icons-material/Upload';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { useQuoteStore } from '@/stores/quoteStore';
import {
  VISA_APPLICANT_STATUS_META, VISA_APPLICANT_STATUS_ORDER, applyTimelineFromDeparture,
  countsFromApplicants, defaultApplicantTimeline, deriveVisaStatus, isApplicantOverdue, newApplicantDoc,
  newApplicantMilestone, newVisaApplicant,
} from './constants';
import { GuestDashboard, GuestListTable } from '../quote/GuestListTable';
import { RoomingPanel } from '../quote/RoomingPanel';
import { VisaApplicantTimeline } from './VisaApplicantTimeline';
import { BulkStatusDialog, ReminderDialog } from './VisaApplicantActions';
import { VisaCostDialog } from './VisaCostDialog';
import { VisaExportDialog } from './VisaExportDialog';
import { VisaShareListDialog } from './VisaShareListDialog';
import { applicantToPassenger, applicantsToPassengers, passengerToApplicant, passengersToApplicants } from './guestAdapters';
import { VisaGuestHistory } from './VisaGuestHistory';
import { dedupeApplicants, guestKeyOf, mergeIncoming, type GuestKey } from './applicantMatch';
// importVisaApplicants nạp động khi bấm (thư viện Excel nặng).
import type { ApplicantDoc, Passenger, VisaApplicantMilestone, VisaProjectDoc } from '@/types';

/** Bộ sửa timeline RIÊNG của một khách (5 mốc chuẩn + thêm mốc tuỳ biến). */
function ApplicantTimelineEditor({ timeline, departureDate, onChange }: {
  timeline: VisaApplicantMilestone[]; departureDate?: string | null;
  onChange: (t: VisaApplicantMilestone[]) => void;
}) {
  const list = timeline.length ? timeline : defaultApplicantTimeline(departureDate);
  const setDate = (id: string, date: string) => onChange(list.map((m) => (m.id === id ? { ...m, date: date || null } : m)));
  const setLabel = (id: string, label: string) => onChange(list.map((m) => (m.id === id ? { ...m, label } : m)));
  const del = (id: string) => onChange(list.filter((m) => m.id !== id));
  return (
    <Box>
      <Typography variant="caption" fontWeight={800} color="text.secondary"
        sx={{ display: 'block', mb: 0.75, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        🗓️ Timeline hồ sơ khách
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 1 }}>
        {list.map((m) => (
          <Stack key={m.id} direction="row" alignItems="center" spacing={0.5}>
            {m.key ? (
              <TextField size="small" type="date" fullWidth label={m.label} value={m.date ?? ''}
                onChange={(e) => setDate(m.id, e.target.value)} InputLabelProps={{ shrink: true }} />
            ) : (
              <>
                <TextField size="small" value={m.label} placeholder="Tên mốc"
                  onChange={(e) => setLabel(m.id, e.target.value)} sx={{ width: 130 }} />
                <TextField size="small" type="date" value={m.date ?? ''}
                  onChange={(e) => setDate(m.id, e.target.value)} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
                <IconButton size="small" color="error" onClick={() => del(m.id)}><DeleteOutlineIcon fontSize="inherit" /></IconButton>
              </>
            )}
          </Stack>
        ))}
      </Box>
      <Stack direction="row" spacing={1} sx={{ mt: 0.75 }} flexWrap="wrap" useFlexGap>
        <Button size="small" startIcon={<AddIcon />} sx={{ color: '#0d7a6a' }}
          onClick={() => onChange([...list, newApplicantMilestone('Mốc khác')])}>
          Thêm mốc ngày
        </Button>
        {departureDate && (
          <Tooltip title="Tự điền các mốc còn trống bằng cách tính ngược từ ngày khởi hành">
            <Button size="small" startIcon={<EventRepeatIcon />} sx={{ color: '#0369a1' }}
              onClick={() => onChange(applyTimelineFromDeparture(list, departureDate, false))}>
              Tính từ ngày khởi hành
            </Button>
          </Tooltip>
        )}
      </Stack>
    </Box>
  );
}

/** Dải tổng hợp tình trạng visa của đoàn: đếm theo 8 trạng thái + số quá hạn. */
function StatusSummaryStrip({ rows }: { rows: Passenger[] }) {
  const counts = VISA_APPLICANT_STATUS_ORDER
    .map((s) => ({ s, n: rows.filter((p) => deriveVisaStatus(p) === s).length }))
    .filter((x) => x.n > 0);
  const overdue = rows.filter((p) => isApplicantOverdue(p)).length;
  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center" sx={{ mb: 1.5 }}>
      <Chip size="small" label={`${rows.length} khách`} sx={{ fontWeight: 800 }} />
      {counts.map(({ s, n }) => {
        const meta = VISA_APPLICANT_STATUS_META[s];
        return (
          <Chip key={s} size="small" label={`${meta.label}: ${n}`}
            sx={{ bgcolor: `${meta.color}1a`, color: meta.color, fontWeight: 700 }} />
        );
      })}
      {overdue > 0 && (
        <Chip size="small" color="error" variant="outlined" label={`⚠ Quá hạn: ${overdue}`} sx={{ fontWeight: 800 }} />
      )}
    </Stack>
  );
}

type Props = {
  project: VisaProjectDoc;
  onClose: () => void;
};

/** Style dùng chung cho các nút/menu trên thanh công cụ — viền trắng mảnh, bo góc nhất quán. */
const outlinedBtnSx = {
  borderColor: 'rgba(255,255,255,0.45)',
  color: '#fff',
  textTransform: 'none' as const,
  fontWeight: 600,
  borderRadius: 2,
  whiteSpace: 'nowrap' as const,
  '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.12)' },
};
const toolbarBtn = {
  wrap: {},
  group: {
    borderRadius: 2,
    '& .MuiButton-root': {
      borderColor: 'rgba(255,255,255,0.45)',
      color: '#fff',
      textTransform: 'none' as const,
      '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.12)' },
    },
    '& .MuiButtonGroup-grouped:not(:last-of-type)': { borderColor: 'rgba(255,255,255,0.45)' },
  },
  menu: outlinedBtnSx,
};
const menuPaperSx = { borderRadius: 2, mt: 0.5, minWidth: 224, boxShadow: '0 8px 28px rgba(0,0,0,0.18)' };

function fmtDt(s?: string): string {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch { return s; }
}

/** Màn quản lý danh sách khách theo từng dự án — dùng template khách của báo giá. */
export function VisaApplicantManager({ project, onClose }: Props) {
  const save = useVisaProjectStore((s) => s.save);
  const [list, setList] = useState<Passenger[]>(() => applicantsToPassengers(project.applicants ?? []));
  const [busy, setBusy] = useState(false);
  const [guestSeed, setGuestSeed] = useState<GuestKey | null>(null);
  const [view, setView] = useState<'list' | 'timeline'>('list');
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  const [bulkAnchor, setBulkAnchor] = useState<HTMLElement | null>(null);
  const [quoteAnchor, setQuoteAnchor] = useState<HTMLElement | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const [exportListOpen, setExportListOpen] = useState(false);
  const [shareLinkOpen, setShareLinkOpen] = useState(false);

  const add = () => setList((prev) => [...prev, applicantToPassenger(newVisaApplicant())]);

  // Quét hộ chiếu bằng AI: mỗi ảnh → 1 khách mới (tự điền tên/HC/ngày sinh…).
  const onScanPassports = async (e: ChangeEvent<HTMLInputElement>) => {
    setAddAnchor(null);
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    let ok = 0;
    const created: Passenger[] = [];
    for (const f of files) {
      try {
        const { extractPassport } = await import('./passportOcr');
        const patch = await extractPassport(f);
        created.push({ ...applicantToPassenger(newVisaApplicant()), ...patch });
        ok++;
      } catch (err) {
        toast(`Lỗi quét ${f.name}: ${(err as Error).message}`, 'warning');
      }
    }
    if (created.length) setList((prev) => [...prev, ...created]);
    setBusy(false);
    if (ok) toast(`✅ Đã quét ${ok}/${files.length} hộ chiếu — kiểm tra lại trước khi lưu.`);
  };

  const updDoc = (p: Passenger, patch: (docs: ApplicantDoc[]) => ApplicantDoc[], set: (x: Partial<Passenger>) => void) =>
    set({ docs: patch(p.docs ?? []) });

  // Đổi hộ chiếu mới: lưu hộ chiếu hiện tại vào lịch sử, để trống để nhập mới.
  const changePassport = (p: Passenger, set: (x: Partial<Passenger>) => void) => {
    if (!p.idNo && !p.passportIssue && !p.passportExpiry) {
      window.alert('Chưa có thông tin hộ chiếu hiện tại để lưu vào lịch sử.');
      return;
    }
    if (!window.confirm('Lưu hộ chiếu hiện tại vào lịch sử và để trống để nhập hộ chiếu mới?')) return;
    set({
      passportHistory: [
        { passport: p.idNo, issue: p.passportIssue, expiry: p.passportExpiry, replacedAt: new Date().toISOString() },
        ...(p.passportHistory ?? []),
      ],
      idNo: '', passportIssue: '', passportExpiry: '',
    });
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    setAddAnchor(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const incoming = await (await import('@/lib/exports/importVisaApplicants')).parseVisaApplicantsExcel(file);
      if (!incoming.length) { window.alert('Không đọc được khách nào từ file.'); return; }
      const r = mergeIncoming(passengersToApplicants(list), incoming);
      setList(applicantsToPassengers(r.list));
      toast(`✅ Import xong: thêm mới ${r.added} khách, gộp trùng ${r.merged}.`);
    } catch (err) {
      window.alert('❌ ' + (err as Error).message);
    }
  };

  const onDedupe = () => {
    const r = dedupeApplicants(passengersToApplicants(list));
    if (r.removed === 0) { window.alert('Không phát hiện khách trùng.'); return; }
    if (!window.confirm(`Phát hiện ${r.removed} bản trùng. Gộp thông tin & loại bỏ bản thừa?`)) return;
    setList(applicantsToPassengers(r.list));
    toast(`✅ Đã gộp & loại ${r.removed} bản trùng.`);
  };

  // Xuất tình trạng + timeline visa của đoàn (Excel / PDF) — nạp động thư viện nặng.
  const exportTimeline = async (fmt: 'excel' | 'pdf') => {
    setExportAnchor(null);
    if (list.length === 0) { toast('Chưa có khách để xuất.', 'warning'); return; }
    try {
      const m = await import('@/lib/exports/exportVisaTimeline');
      if (fmt === 'excel') await m.exportVisaTimelineExcel(project, list);
      else m.exportVisaTimelinePDF(project, list);
    } catch (e) {
      window.alert('❌ Lỗi xuất file: ' + (e as Error).message);
    }
  };

  // Xuất checklist hồ sơ visa theo từng khách (PDF).
  const exportChecklist = async () => {
    setExportAnchor(null);
    if (list.length === 0) { toast('Chưa có khách để xuất.', 'warning'); return; }
    try {
      const m = await import('@/lib/exports/exportVisaDocsChecklist');
      m.exportVisaDocsChecklistPDF(project, list);
    } catch (e) {
      window.alert('❌ Lỗi xuất file: ' + (e as Error).message);
    }
  };

  // Tính ngược timeline từ ngày khởi hành cho CẢ ĐOÀN (chỉ điền mốc còn trống).
  const bulkTimelineFromDeparture = () => {
    if (!project.departureDate) { toast('Dự án chưa có ngày khởi hành (sửa ở thẻ dự án).', 'warning'); return; }
    setList((prev) => prev.map((p) => ({ ...p, visaTimeline: applyTimelineFromDeparture(p.visaTimeline, project.departureDate, false) })));
    toast('✅ Đã tính các mốc timeline còn trống cho cả đoàn.');
  };

  // Báo giá liên kết chỉ thao tác được khi nó đang là draft đang mở.
  const draftIsLinked = () => {
    const d = useQuoteStore.getState().draft;
    return project.linkedQuoteId && d.currentQuoteId === project.linkedQuoteId ? d : null;
  };

  const pullFromQuote = () => {
    const d = draftIsLinked();
    if (!d) { toast('Mở báo giá liên kết (làm báo giá hiện hành) rồi thử lại.', 'warning'); return; }
    const r = mergeIncoming(passengersToApplicants(list), passengersToApplicants(d.passengers ?? []));
    setList(applicantsToPassengers(r.list));
    toast(`✅ Kéo từ báo giá: thêm ${r.added}, gộp ${r.merged}.`);
  };

  const pushToQuote = () => {
    const d = draftIsLinked();
    if (!d) { toast('Mở báo giá liên kết (làm báo giá hiện hành) rồi thử lại.', 'warning'); return; }
    const r = mergeIncoming(passengersToApplicants(d.passengers ?? []), passengersToApplicants(list));
    useQuoteStore.getState().setPassengers(applicantsToPassengers(r.list));
    toast(`✅ Đẩy sang báo giá: thêm ${r.added}, gộp ${r.merged}.`);
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      const applicants = passengersToApplicants(list);
      // Merge từ bản MỚI NHẤT trong store để không đè chi phí visa (costing) vừa lưu nơi khác.
      const cur = useVisaProjectStore.getState().projects.find((p) => p.id === project.id) ?? project;
      await save({
        ...cur,
        applicants,
        ...countsFromApplicants(applicants),
        updatedAt: new Date().toISOString(),
      });
      onClose();
    } catch (e) {
      window.alert('Lỗi lưu danh sách khách: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open fullScreen onClose={busy ? undefined : onClose}>
      <AppBar position="sticky" elevation={0} sx={{ background: 'linear-gradient(135deg,#0a5c50,#0d7a6a 45%,#14a08c)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
        <Toolbar sx={{ gap: 1.25, flexWrap: 'wrap', minHeight: { xs: 56, sm: 60 }, py: 0.75 }}>
          <IconButton edge="start" color="inherit" onClick={onClose} disabled={busy} sx={{ mr: 0.25 }}>
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontWeight={800} fontSize={17} noWrap sx={{ lineHeight: 1.2 }}>
              Danh sách khách
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.78, letterSpacing: 0.2 }} noWrap>
              {project.name || '(Chưa đặt tên)'} · {project.code} · {list.length} khách
            </Typography>
          </Box>

          {/* Chế độ xem */}
          <ToggleButtonGroup
            exclusive size="small" value={view} onChange={(_, v: 'list' | 'timeline' | null) => v && setView(v)}
            sx={{
              bgcolor: 'rgba(255,255,255,0.14)', borderRadius: 2, p: 0.25,
              '& .MuiToggleButton-root': { color: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: '6px !important', textTransform: 'none', fontWeight: 600, px: 1.75, py: 0.4, lineHeight: 1 },
              '& .Mui-selected': { bgcolor: '#fff !important', color: '#0d7a6a !important', boxShadow: '0 1px 3px rgba(0,0,0,0.18)' },
            }}>
            <ToggleButton value="list">Danh sách</ToggleButton>
            <ToggleButton value="timeline">Timeline</ToggleButton>
          </ToggleButtonGroup>

          <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.22)', my: 1, mx: 0.25 }} />

          {/* Nhóm hành động — gọn vào các menu thả xuống */}
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center" sx={toolbarBtn.wrap}>
            {/* Thêm khách (split): thêm thủ công + menu nhập liệu */}
            <ButtonGroup variant="outlined" color="inherit" sx={toolbarBtn.group}>
              <Button startIcon={<AddIcon />} onClick={add} sx={{ fontWeight: 700 }}>Thêm khách</Button>
              <Button size="small" onClick={(e) => setAddAnchor(e.currentTarget)} sx={{ px: 0.5 }} aria-label="Tùy chọn thêm khách">
                <ArrowDropDownIcon />
              </Button>
            </ButtonGroup>

            <Button color="inherit" variant="outlined" startIcon={<TuneIcon />} endIcon={<ArrowDropDownIcon />}
              onClick={(e) => setBulkAnchor(e.currentTarget)} sx={toolbarBtn.menu}>
              Xử lý loạt
            </Button>

            <Button color="inherit" variant="outlined" startIcon={<FileDownloadIcon />} endIcon={<ArrowDropDownIcon />}
              onClick={(e) => setExportAnchor(e.currentTarget)} sx={toolbarBtn.menu}>
              Xuất
            </Button>

            {project.linkedQuoteId && (
              <Button color="inherit" variant="outlined" startIcon={<SwapHorizIcon />} endIcon={<ArrowDropDownIcon />}
                onClick={(e) => setQuoteAnchor(e.currentTarget)} sx={toolbarBtn.menu}>
                Báo giá
              </Button>
            )}

            <Button color="inherit" variant="outlined" startIcon={<PaidOutlinedIcon />}
              onClick={() => setCostOpen(true)} sx={toolbarBtn.menu}>
              Chi phí
            </Button>

            <Button color="inherit" variant="outlined" startIcon={<ShareOutlinedIcon />}
              onClick={() => setShareLinkOpen(true)} sx={toolbarBtn.menu}>
              Link khách
            </Button>
          </Stack>

          <Button
            variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={busy}
            sx={{ bgcolor: '#fff', color: '#0d7a6a', fontWeight: 800, borderRadius: 2, boxShadow: 'none', px: 2.25, '&:hover': { bgcolor: '#eafaf6', boxShadow: 'none' } }}
          >
            {busy ? 'Đang lưu…' : 'Lưu'}
          </Button>

          {/* Menu: thêm khách */}
          <Menu anchorEl={addAnchor} open={!!addAnchor} onClose={() => setAddAnchor(null)} slotProps={{ paper: { sx: menuPaperSx } }}>
            <MenuItem component="label" disabled={busy}>
              <ListItemIcon><DocumentScannerIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Quét hộ chiếu (AI)" secondary="Mỗi ảnh → 1 khách" />
              <input type="file" hidden accept="image/*" multiple onChange={onScanPassports} />
            </MenuItem>
            <MenuItem component="label">
              <ListItemIcon><UploadFileIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Nhập từ Excel" />
              <input type="file" hidden accept=".xlsx,.xls" onChange={onImport} />
            </MenuItem>
            <MenuItem onClick={() => { setAddAnchor(null); void import('@/lib/exports/importVisaApplicants').then((m) => m.downloadVisaApplicantsTemplate()); }}>
              <ListItemIcon><FileDownloadIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Tải mẫu Excel" />
            </MenuItem>
          </Menu>

          {/* Menu: xử lý loạt */}
          <Menu anchorEl={bulkAnchor} open={!!bulkAnchor} onClose={() => setBulkAnchor(null)} slotProps={{ paper: { sx: menuPaperSx } }}>
            <MenuItem disabled={list.length === 0} onClick={() => { setBulkAnchor(null); setBulkOpen(true); }}>
              <ListItemIcon><PlaylistAddCheckIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Đổi trạng thái loạt" />
            </MenuItem>
            <MenuItem disabled={list.length === 0} onClick={() => { setBulkAnchor(null); setReminderOpen(true); }}>
              <ListItemIcon><CampaignOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Nhắc khách" />
            </MenuItem>
            <MenuItem onClick={() => { setBulkAnchor(null); onDedupe(); }}>
              <ListItemIcon><PlaylistRemoveIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Loại khách trùng" />
            </MenuItem>
            {project.departureDate && [
              <Divider key="d" />,
              <MenuItem key="t" onClick={() => { setBulkAnchor(null); bulkTimelineFromDeparture(); }}>
                <ListItemIcon><EventRepeatIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Tính timeline cả đoàn" secondary="Điền mốc trống từ ngày khởi hành" />
              </MenuItem>,
            ]}
          </Menu>

          {/* Menu: xuất */}
          <Menu anchorEl={exportAnchor} open={!!exportAnchor} onClose={() => setExportAnchor(null)} slotProps={{ paper: { sx: menuPaperSx } }}>
            <ListSubheader sx={{ lineHeight: '32px', fontWeight: 700 }}>Excel</ListSubheader>
            <MenuItem disabled={list.length === 0}
              onClick={() => { setExportAnchor(null); setExportListOpen(true); }}>
              <ListItemIcon><TableViewIcon fontSize="small" sx={{ color: '#0d7a6a' }} /></ListItemIcon>
              <ListItemText primary="Tải danh sách khách" secondary="Chọn cột & thứ tự (có preset Tình trạng & timeline) · cần mật khẩu" />
            </MenuItem>
            <Divider />
            <ListSubheader sx={{ lineHeight: '32px', fontWeight: 700 }}>PDF</ListSubheader>
            <MenuItem onClick={() => void exportTimeline('pdf')}>
              <ListItemIcon><FileDownloadIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Tình trạng & timeline" />
            </MenuItem>
            <MenuItem onClick={() => void exportChecklist()}>
              <ListItemIcon><PlaylistAddCheckIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Checklist hồ sơ từng khách" />
            </MenuItem>
          </Menu>

          {/* Menu: báo giá */}
          <Menu anchorEl={quoteAnchor} open={!!quoteAnchor} onClose={() => setQuoteAnchor(null)} slotProps={{ paper: { sx: menuPaperSx } }}>
            <MenuItem onClick={() => { setQuoteAnchor(null); pullFromQuote(); }}>
              <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Kéo từ báo giá" />
            </MenuItem>
            <MenuItem onClick={() => { setQuoteAnchor(null); pushToQuote(); }}>
              <ListItemIcon><UploadIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Đẩy sang báo giá" />
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: { xs: 1, sm: 2 }, width: '100%' }}>
        {list.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8, color: 'text.disabled' }}>
            <Typography fontSize={42} sx={{ mb: 1 }}>🧑‍✈️</Typography>
            <Typography variant="subtitle1" fontWeight={600}>Chưa có khách nào</Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>Bấm “Thêm khách”, hoặc “Import Excel” để nhập từ file.</Typography>
          </Box>
        ) : view === 'timeline' ? (
          <>
            <StatusSummaryStrip rows={list} />
            <VisaApplicantTimeline rows={list} onChange={setList} departureDate={project.departureDate} />
          </>
        ) : (
          <>
            <StatusSummaryStrip rows={list} />
            <Box sx={{ mb: 1.5 }}><GuestDashboard pax={list} /></Box>
            <RoomingPanel rows={list} onChange={setList} />
            <GuestListTable
              rows={list}
              onChange={setList}
              mode="visa"
              renderExpanded={(p, patch) => {
                const docs = p.docs ?? [];
                const histN = p.passportHistory?.length ?? 0;
                return (
                  <Stack spacing={1.5}>
                    <TextField size="small" fullWidth label="Các quốc gia đã từng đi" value={p.countriesVisited ?? ''}
                      onChange={(e) => patch({ countriesVisited: e.target.value })}
                      placeholder="VD: Nhật Bản, Hàn Quốc, Singapore…" />

                    <ApplicantTimelineEditor
                      timeline={p.visaTimeline ?? []}
                      departureDate={project.departureDate}
                      onChange={(t) => patch({ visaTimeline: t })}
                    />

                    <TextField
                      size="small" fullWidth multiline minRows={2} label="Lý do rớt (nếu khách rớt)"
                      value={p.failReason ?? ''} onChange={(e) => patch({ failReason: e.target.value })}
                      color={deriveVisaStatus(p) === 'failed' ? 'error' : undefined}
                      focused={deriveVisaStatus(p) === 'failed' ? true : undefined}
                      placeholder="VD: thiếu chứng minh tài chính, hồ sơ công việc chưa thuyết phục…" />

                    <Box>
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                        <Typography variant="caption" fontWeight={800} color="text.secondary"
                          sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>Hộ chiếu</Typography>
                        <Button size="small" onClick={() => changePassport(p, patch)} sx={{ color: '#0d7a6a' }}>
                          🔄 Đổi hộ chiếu mới
                        </Button>
                      </Stack>
                      {histN > 0 ? (
                        <Stack spacing={0.25}>
                          {p.passportHistory!.map((h, k) => (
                            <Typography key={k} variant="caption" color="text.secondary">
                              • HC cũ: <b>{h.passport || '—'}</b> · cấp {fmtDt(h.issue)} · hết hạn {fmtDt(h.expiry)}
                              {' '}<i>(thay {fmtDt(h.replacedAt)})</i>
                            </Typography>
                          ))}
                        </Stack>
                      ) : (
                        <Typography variant="caption" color="text.disabled">Chưa có hộ chiếu cũ.</Typography>
                      )}
                    </Box>

                    <Box>
                      <Typography variant="caption" fontWeight={800} color="text.secondary"
                        sx={{ display: 'block', mb: 0.75, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Checklist hồ sơ
                      </Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 0.5 }}>
                        {docs.map((d) => (
                          <Stack key={d.id} direction="row" alignItems="center" spacing={0.5}>
                            <FormControlLabel
                              sx={{ flex: 1, m: 0 }}
                              control={<Checkbox size="small" checked={d.checked}
                                onChange={(e) => updDoc(p, (ds) => ds.map((x) => (x.id === d.id ? { ...x, checked: e.target.checked } : x)), patch)} />}
                              label={
                                <TextField variant="standard" value={d.label}
                                  onChange={(e) => updDoc(p, (ds) => ds.map((x) => (x.id === d.id ? { ...x, label: e.target.value } : x)), patch)}
                                  sx={{ '& .MuiInputBase-input': { fontSize: 13 } }} />
                              }
                            />
                            <IconButton size="small" color="error"
                              onClick={() => updDoc(p, (ds) => ds.filter((x) => x.id !== d.id), patch)}>
                              <DeleteOutlineIcon fontSize="inherit" />
                            </IconButton>
                          </Stack>
                        ))}
                      </Box>
                      <Button size="small" startIcon={<AddIcon />} sx={{ mt: 0.5, color: '#0d7a6a' }}
                        onClick={() => updDoc(p, (ds) => [...ds, newApplicantDoc()], patch)}>
                        Thêm loại hồ sơ
                      </Button>
                    </Box>

                    <TextField size="small" fullWidth multiline minRows={2} label="Lưu ý khác" value={p.note ?? ''}
                      onChange={(e) => patch({ note: e.target.value })} />

                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Tooltip title="Xem lịch sử visa của khách này (các dự án & báo giá liên quan)">
                        <Button size="small" color="inherit" startIcon={<HistoryIcon />}
                          onClick={() => setGuestSeed(guestKeyOf(passengerToApplicant(p)))}>
                          Lịch sử khách
                        </Button>
                      </Tooltip>
                    </Stack>
                  </Stack>
                );
              }}
            />
          </>
        )}
      </Box>

      {bulkOpen && <BulkStatusDialog applicants={list} onApply={setList} onClose={() => setBulkOpen(false)} />}
      {reminderOpen && <ReminderDialog project={project} applicants={list} onClose={() => setReminderOpen(false)} />}
      {costOpen && <VisaCostDialog project={project} count={list.length} onClose={() => setCostOpen(false)} />}
      {exportListOpen && <VisaExportDialog project={project} applicants={list} onClose={() => setExportListOpen(false)} />}
      {shareLinkOpen && <VisaShareListDialog project={project} applicants={list} onClose={() => setShareLinkOpen(false)} />}

      <Dialog open={!!guestSeed} onClose={() => setGuestSeed(null)} fullWidth maxWidth="md">
        <DialogTitle sx={{ pr: 6 }}>
          🔗 Lịch sử visa của khách
          <IconButton onClick={() => setGuestSeed(null)} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        {guestSeed && <VisaGuestHistory seed={guestSeed} />}
      </Dialog>
    </Dialog>
  );
}
