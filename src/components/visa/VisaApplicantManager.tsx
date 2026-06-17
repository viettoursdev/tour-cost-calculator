import { Fragment, useState, type ChangeEvent } from 'react';
import {
  AppBar, Box, Button, Checkbox, Chip, Collapse, Dialog, DialogTitle, FormControlLabel,
  IconButton, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Toolbar, Tooltip, Typography,
} from '@mui/material';
import { toast } from '@/stores/toastStore';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import HistoryIcon from '@mui/icons-material/History';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import PlaylistRemoveIcon from '@mui/icons-material/PlaylistRemove';
import SaveIcon from '@mui/icons-material/Save';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import {
  APPLICANT_DOC_META, APPLICANT_RESULT_META, countsFromApplicants,
  newApplicantDoc, newVisaApplicant,
} from './constants';
import { VisaGuestHistory } from './VisaGuestHistory';
import { dedupeApplicants, guestKeyOf, mergeIncoming, type GuestKey } from './applicantMatch';
// importVisaApplicants nạp động khi bấm (thư viện Excel nặng).
import type { ApplicantDoc, VisaApplicant, VisaProjectDoc } from '@/types';

type Props = {
  project: VisaProjectDoc;
  onClose: () => void;
};

/** Bỏ dấu nhưng GIỮ hoa/thường (khác normalizeVN vốn lowercase) → tên không dấu. */
function stripAccentsKeepCase(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

function fmtDt(s?: string): string {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch { return s; }
}

const cellSx = { p: 0.5 } as const;
const inputSx = { '& .MuiInputBase-input': { fontSize: 13, py: 0.5 } } as const;

/** Màn quản lý danh sách khách theo từng dự án — bảng kiểu Excel + import + lọc trùng. */
export function VisaApplicantManager({ project, onClose }: Props) {
  const save = useVisaProjectStore((s) => s.save);
  const [list, setList] = useState<VisaApplicant[]>(
    () => (project.applicants ?? []).map((a) => ({ ...a, docs: a.docs ? a.docs.map((d) => ({ ...d })) : undefined })),
  );
  const [busy, setBusy] = useState(false);
  const [guestSeed, setGuestSeed] = useState<GuestKey | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggleExpand = (id: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const upd = (id: string, patch: Partial<VisaApplicant>) =>
    setList((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const updName = (a: VisaApplicant, name: string) =>
    // Tự đồng bộ tên không dấu khi nó đang khớp với tên cũ (hoặc còn trống).
    upd(a.id, a.nameNoAccent === stripAccentsKeepCase(a.name) || !a.nameNoAccent
      ? { name, nameNoAccent: stripAccentsKeepCase(name) }
      : { name });
  const add = () => {
    const a = newVisaApplicant();
    setList((prev) => [...prev, a]);
    setExpanded((prev) => new Set(prev).add(a.id));
  };
  const del = (id: string) => {
    if (!window.confirm('Xoá khách này khỏi danh sách?')) return;
    setList((prev) => prev.filter((a) => a.id !== id));
  };

  const updDoc = (aid: string, did: string, patch: Partial<ApplicantDoc>) =>
    setList((prev) => prev.map((a) =>
      a.id === aid ? { ...a, docs: (a.docs ?? []).map((d) => (d.id === did ? { ...d, ...patch } : d)) } : a));
  const addDoc = (aid: string) =>
    setList((prev) => prev.map((a) =>
      a.id === aid ? { ...a, docs: [...(a.docs ?? []), newApplicantDoc()] } : a));
  const delDoc = (aid: string, did: string) =>
    setList((prev) => prev.map((a) =>
      a.id === aid ? { ...a, docs: (a.docs ?? []).filter((d) => d.id !== did) } : a));

  // Đổi hộ chiếu mới: lưu hộ chiếu hiện tại vào lịch sử, để trống các ô để nhập mới.
  const changePassport = (a: VisaApplicant) => {
    if (!a.passport && !a.passportIssue && !a.passportExpiry) {
      window.alert('Chưa có thông tin hộ chiếu hiện tại để lưu vào lịch sử.');
      return;
    }
    if (!window.confirm('Lưu hộ chiếu hiện tại vào lịch sử và để trống để nhập hộ chiếu mới?')) return;
    upd(a.id, {
      passportHistory: [
        { passport: a.passport, issue: a.passportIssue, expiry: a.passportExpiry, replacedAt: new Date().toISOString() },
        ...(a.passportHistory ?? []),
      ],
      passport: '', passportIssue: '', passportExpiry: '',
    });
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const incoming = await (await import('@/lib/exports/importVisaApplicants')).parseVisaApplicantsExcel(file);
      if (!incoming.length) { window.alert('Không đọc được khách nào từ file.'); return; }
      const r = mergeIncoming(list, incoming);
      setList(r.list);
      toast(`✅ Import xong: thêm mới ${r.added} khách, gộp trùng ${r.merged}.`);
    } catch (err) {
      window.alert('❌ ' + (err as Error).message);
    }
  };

  const onDedupe = () => {
    const r = dedupeApplicants(list);
    if (r.removed === 0) { window.alert('Không phát hiện khách trùng.'); return; }
    if (!window.confirm(`Phát hiện ${r.removed} bản trùng. Gộp thông tin & loại bỏ bản thừa?`)) return;
    setList(r.list);
    toast(`✅ Đã gộp & loại ${r.removed} bản trùng.`);
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      await save({
        ...project,
        applicants: list,
        ...countsFromApplicants(list),
        updatedAt: new Date().toISOString(),
      });
      onClose();
    } catch (e) {
      window.alert('Lỗi lưu danh sách khách: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const COLS = 12; // số cột của hàng chính (để colSpan cho hàng chi tiết)

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
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 150px)' }}>
            <Table stickyHeader size="small" sx={{ minWidth: 1280 }}>
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 800, bgcolor: '#eafaf6', whiteSpace: 'nowrap' } }}>
                  <TableCell sx={{ width: 36 }} />
                  <TableCell sx={{ width: 36 }}>#</TableCell>
                  <TableCell>Họ tên (có dấu)</TableCell>
                  <TableCell>Họ tên (không dấu)</TableCell>
                  <TableCell>Giới tính</TableCell>
                  <TableCell>Ngày sinh</TableCell>
                  <TableCell>Số hộ chiếu</TableCell>
                  <TableCell>Ngày cấp</TableCell>
                  <TableCell>Ngày hết hạn</TableCell>
                  <TableCell>Tình trạng HS</TableCell>
                  <TableCell>Kết quả</TableCell>
                  <TableCell sx={{ width: 64 }}>📋 Hồ sơ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {list.map((a, i) => {
                  const docs = a.docs ?? [];
                  const doneDocs = docs.filter((d) => d.checked).length;
                  const isOpen = expanded.has(a.id);
                  const histN = a.passportHistory?.length ?? 0;
                  return (
                    <Fragment key={a.id}>
                      <TableRow hover sx={{ '& td': cellSx }}>
                        <TableCell>
                          <IconButton size="small" onClick={() => toggleExpand(a.id)}>
                            {isOpen ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
                          </IconButton>
                        </TableCell>
                        <TableCell sx={{ color: 'text.disabled' }}>{i + 1}</TableCell>
                        <TableCell>
                          <TextField variant="standard" fullWidth value={a.name} placeholder="Họ tên"
                            onChange={(e) => updName(a, e.target.value)} sx={{ ...inputSx, minWidth: 150 }} />
                        </TableCell>
                        <TableCell>
                          <TextField variant="standard" fullWidth value={a.nameNoAccent ?? ''} placeholder="Không dấu"
                            onChange={(e) => upd(a.id, { nameNoAccent: e.target.value })} sx={{ ...inputSx, minWidth: 140 }} />
                        </TableCell>
                        <TableCell>
                          <TextField select variant="standard" fullWidth value={a.gender ?? ''}
                            onChange={(e) => upd(a.id, { gender: e.target.value as VisaApplicant['gender'] })} sx={{ ...inputSx, minWidth: 70 }}>
                            <MenuItem value="">—</MenuItem>
                            <MenuItem value="Nam">Nam</MenuItem>
                            <MenuItem value="Nữ">Nữ</MenuItem>
                            <MenuItem value="Khác">Khác</MenuItem>
                          </TextField>
                        </TableCell>
                        <TableCell>
                          <TextField variant="standard" type="date" value={a.dob ?? ''}
                            onChange={(e) => upd(a.id, { dob: e.target.value })} sx={{ ...inputSx, minWidth: 130 }} />
                        </TableCell>
                        <TableCell>
                          <TextField variant="standard" fullWidth value={a.passport ?? ''} placeholder="Số HC"
                            onChange={(e) => upd(a.id, { passport: e.target.value })} sx={{ ...inputSx, minWidth: 110 }} />
                        </TableCell>
                        <TableCell>
                          <TextField variant="standard" type="date" value={a.passportIssue ?? ''}
                            onChange={(e) => upd(a.id, { passportIssue: e.target.value })} sx={{ ...inputSx, minWidth: 130 }} />
                        </TableCell>
                        <TableCell>
                          <TextField variant="standard" type="date" value={a.passportExpiry ?? ''}
                            onChange={(e) => upd(a.id, { passportExpiry: e.target.value })} sx={{ ...inputSx, minWidth: 130 }} />
                        </TableCell>
                        <TableCell>
                          <TextField select variant="standard" fullWidth value={a.docStatus}
                            onChange={(e) => upd(a.id, { docStatus: e.target.value as VisaApplicant['docStatus'] })} sx={{ ...inputSx, minWidth: 110 }}>
                            {(Object.keys(APPLICANT_DOC_META) as VisaApplicant['docStatus'][]).map((k) => (
                              <MenuItem key={k} value={k} sx={{ color: APPLICANT_DOC_META[k].color }}>{APPLICANT_DOC_META[k].label}</MenuItem>
                            ))}
                          </TextField>
                        </TableCell>
                        <TableCell>
                          <TextField select variant="standard" fullWidth value={a.result}
                            onChange={(e) => upd(a.id, { result: e.target.value as VisaApplicant['result'] })} sx={{ ...inputSx, minWidth: 100 }}>
                            {(Object.keys(APPLICANT_RESULT_META) as VisaApplicant['result'][]).map((k) => (
                              <MenuItem key={k} value={k} sx={{ color: APPLICANT_RESULT_META[k].color }}>{APPLICANT_RESULT_META[k].label}</MenuItem>
                            ))}
                          </TextField>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" variant="outlined"
                            label={docs.length ? `${doneDocs}/${docs.length}` : '—'}
                            color={docs.length && doneDocs === docs.length ? 'success' : 'default'}
                            onClick={() => toggleExpand(a.id)} />
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell colSpan={COLS} sx={{ py: 0, border: 0 }}>
                          <Collapse in={isOpen} unmountOnExit>
                            <Box sx={{ p: 2, bgcolor: 'rgba(20,150,140,0.04)', borderRadius: 1, my: 1 }}>
                              <Stack spacing={1.5}>
                                <TextField size="small" fullWidth label="Các quốc gia đã từng đi" value={a.countriesVisited ?? ''}
                                  onChange={(e) => upd(a.id, { countriesVisited: e.target.value })}
                                  placeholder="VD: Nhật Bản, Hàn Quốc, Singapore…" />

                                <TextField
                                  size="small" fullWidth multiline minRows={2}
                                  label="Lý do rớt (nếu khách rớt)"
                                  value={a.failReason ?? ''}
                                  onChange={(e) => upd(a.id, { failReason: e.target.value })}
                                  color={a.result === 'failed' ? 'error' : undefined}
                                  focused={a.result === 'failed' ? true : undefined}
                                  placeholder="VD: thiếu chứng minh tài chính, hồ sơ công việc chưa thuyết phục…" />

                                <Box>
                                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                                    <Typography variant="caption" fontWeight={800} color="text.secondary"
                                      sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                      Hộ chiếu
                                    </Typography>
                                    <Button size="small" onClick={() => changePassport(a)} sx={{ color: '#0d7a6a' }}>
                                      🔄 Đổi hộ chiếu mới
                                    </Button>
                                  </Stack>
                                  {histN > 0 ? (
                                    <Stack spacing={0.25}>
                                      {a.passportHistory!.map((h, k) => (
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
                                            onChange={(e) => updDoc(a.id, d.id, { checked: e.target.checked })} />}
                                          label={
                                            <TextField variant="standard" value={d.label}
                                              onChange={(e) => updDoc(a.id, d.id, { label: e.target.value })}
                                              sx={{ '& .MuiInputBase-input': { fontSize: 13 } }} />
                                          }
                                        />
                                        <IconButton size="small" color="error" onClick={() => delDoc(a.id, d.id)}>
                                          <DeleteOutlineIcon fontSize="inherit" />
                                        </IconButton>
                                      </Stack>
                                    ))}
                                  </Box>
                                  <Button size="small" startIcon={<AddIcon />} onClick={() => addDoc(a.id)} sx={{ mt: 0.5, color: '#0d7a6a' }}>
                                    Thêm loại hồ sơ
                                  </Button>
                                </Box>

                                <TextField size="small" fullWidth multiline minRows={2} label="Lưu ý khác" value={a.note ?? ''}
                                  onChange={(e) => upd(a.id, { note: e.target.value })} />

                                <Stack direction="row" spacing={1} justifyContent="flex-end">
                                  <Tooltip title="Xem lịch sử visa của khách này (các dự án & báo giá liên quan)">
                                    <Button size="small" color="inherit" startIcon={<HistoryIcon />}
                                      onClick={() => setGuestSeed(guestKeyOf(a))}>
                                      Lịch sử khách
                                    </Button>
                                  </Tooltip>
                                  <Button size="small" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => del(a.id)}>
                                    Xoá khách
                                  </Button>
                                </Stack>
                              </Stack>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
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
