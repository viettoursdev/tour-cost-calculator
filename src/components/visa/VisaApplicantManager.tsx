import { useState, type ChangeEvent } from 'react';
import {
  AppBar, Box, Button, Checkbox, Dialog, DialogTitle, FormControlLabel, IconButton, Stack,
  TextField, Toolbar, Tooltip, Typography,
} from '@mui/material';
import { toast } from '@/stores/toastStore';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DownloadIcon from '@mui/icons-material/Download';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import HistoryIcon from '@mui/icons-material/History';
import PlaylistRemoveIcon from '@mui/icons-material/PlaylistRemove';
import SaveIcon from '@mui/icons-material/Save';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import UploadIcon from '@mui/icons-material/Upload';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { countsFromApplicants, newApplicantDoc, newVisaApplicant } from './constants';
import { GuestDashboard, GuestListTable } from '../quote/GuestListTable';
import { RoomingPanel } from '../quote/RoomingPanel';
import { applicantToPassenger, applicantsToPassengers, passengerToApplicant, passengersToApplicants } from './guestAdapters';
import { VisaGuestHistory } from './VisaGuestHistory';
import { dedupeApplicants, guestKeyOf, mergeIncoming, type GuestKey } from './applicantMatch';
// importVisaApplicants nạp động khi bấm (thư viện Excel nặng).
import type { ApplicantDoc, Passenger, VisaProjectDoc } from '@/types';

type Props = {
  project: VisaProjectDoc;
  onClose: () => void;
};

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

  const add = () => setList((prev) => [...prev, applicantToPassenger(newVisaApplicant())]);

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
      await save({
        ...project,
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
      <AppBar position="sticky" sx={{ background: 'linear-gradient(135deg,#0a5c50,#0d7a6a 40%,#14a08c)' }}>
        <Toolbar sx={{ gap: 1, flexWrap: 'wrap' }}>
          <IconButton edge="start" color="inherit" onClick={onClose} disabled={busy}>
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontWeight={900} noWrap>👥 Danh sách khách</Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }} noWrap>
              {project.name || '(Chưa đặt tên)'} · {project.code} · {list.length} khách
            </Typography>
          </Box>
          {project.linkedQuoteId && (
            <>
              <Button color="inherit" variant="outlined" startIcon={<DownloadIcon />} onClick={pullFromQuote}>
                Kéo từ báo giá
              </Button>
              <Button color="inherit" variant="outlined" startIcon={<UploadIcon />} onClick={pushToQuote}>
                Đẩy sang báo giá
              </Button>
            </>
          )}
          <Button color="inherit" variant="outlined" startIcon={<UploadFileIcon />} component="label">
            Import Excel
            <input type="file" hidden accept=".xlsx,.xls" onChange={onImport} />
          </Button>
          <Button color="inherit" variant="outlined" startIcon={<FileDownloadIcon />}
            onClick={() => void import('@/lib/exports/importVisaApplicants').then((m) => m.downloadVisaApplicantsTemplate())}>
            Tải mẫu
          </Button>
          <Button color="inherit" variant="outlined" startIcon={<PlaylistRemoveIcon />} onClick={onDedupe}>
            Loại trùng
          </Button>
          <Button color="inherit" variant="outlined" startIcon={<AddIcon />} onClick={add}>
            Thêm khách
          </Button>
          <Button
            variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={busy}
            sx={{ bgcolor: '#fff', color: '#0d7a6a', fontWeight: 800, '&:hover': { bgcolor: '#eafaf6' } }}
          >
            {busy ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: { xs: 1, sm: 2 }, width: '100%' }}>
        {list.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8, color: 'text.disabled' }}>
            <Typography fontSize={42} sx={{ mb: 1 }}>🧑‍✈️</Typography>
            <Typography variant="subtitle1" fontWeight={600}>Chưa có khách nào</Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>Bấm “Thêm khách”, hoặc “Import Excel” để nhập từ file.</Typography>
          </Box>
        ) : (
          <>
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

                    <TextField
                      size="small" fullWidth multiline minRows={2} label="Lý do rớt (nếu khách rớt)"
                      value={p.failReason ?? ''} onChange={(e) => patch({ failReason: e.target.value })}
                      color={p.result === 'failed' ? 'error' : undefined}
                      focused={p.result === 'failed' ? true : undefined}
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
