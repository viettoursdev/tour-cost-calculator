import { useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, AppBar, Box, Button, Checkbox, Chip,
  Dialog, FormControlLabel, IconButton, MenuItem, Stack, TextField, Toolbar, Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import SaveIcon from '@mui/icons-material/Save';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import {
  APPLICANT_DOC_META, APPLICANT_RESULT_META, countsFromApplicants,
  newApplicantDoc, newVisaApplicant,
} from './constants';
import type { ApplicantDoc, VisaApplicant, VisaProjectDoc } from '@/types';

type Props = {
  project: VisaProjectDoc;
  onClose: () => void;
  onOpenGuestHistory?: (a: VisaApplicant) => void;
};

/** Bỏ dấu nhưng GIỮ hoa/thường (khác normalizeVN vốn lowercase) → tên không dấu. */
function stripAccentsKeepCase(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

/** Màn quản lý danh sách khách theo từng dự án — đầy đủ trường + checklist hồ sơ. */
export function VisaApplicantManager({ project, onClose, onOpenGuestHistory }: Props) {
  const save = useVisaProjectStore((s) => s.save);
  const [list, setList] = useState<VisaApplicant[]>(
    () => (project.applicants ?? []).map((a) => ({ ...a, docs: a.docs ? a.docs.map((d) => ({ ...d })) : undefined })),
  );
  const [busy, setBusy] = useState(false);

  const upd = (id: string, patch: Partial<VisaApplicant>) =>
    setList((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const add = () => setList((prev) => [...prev, newVisaApplicant()]);
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

  return (
    <Dialog open fullScreen onClose={busy ? undefined : onClose}>
      <AppBar position="sticky" sx={{ background: 'linear-gradient(135deg,#0a5c50,#0d7a6a 40%,#14a08c)' }}>
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={onClose} disabled={busy}>
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0, ml: 1 }}>
            <Typography fontWeight={900} noWrap>👥 Danh sách khách</Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }} noWrap>
              {project.name || '(Chưa đặt tên)'} · {project.code} · {list.length} khách
            </Typography>
          </Box>
          <Button color="inherit" variant="outlined" startIcon={<AddIcon />} onClick={add} sx={{ mr: 1 }}>
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

      <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1000, mx: 'auto', width: '100%' }}>
        {list.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8, color: 'text.disabled' }}>
            <Typography fontSize={42} sx={{ mb: 1 }}>🧑‍✈️</Typography>
            <Typography variant="subtitle1" fontWeight={600}>Chưa có khách nào</Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>Bấm “Thêm khách” để bắt đầu.</Typography>
          </Box>
        ) : (
          <Stack spacing={1.25}>
            {list.map((a, i) => {
              const docs = a.docs ?? [];
              const doneDocs = docs.filter((d) => d.checked).length;
              const resMeta = APPLICANT_RESULT_META[a.result];
              const docMeta = APPLICANT_DOC_META[a.docStatus];
              return (
                <Accordion key={a.id} defaultExpanded={list.length <= 3} disableGutters>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap sx={{ flex: 1, pr: 1 }}>
                      <Typography variant="caption" color="text.disabled" sx={{ width: 20, textAlign: 'right' }}>{i + 1}</Typography>
                      <Typography fontWeight={800} sx={{ minWidth: 140 }}>{a.name || '(Chưa nhập tên)'}</Typography>
                      {a.passport && <Chip size="small" variant="outlined" label={`🛂 ${a.passport}`} />}
                      <Chip size="small" label={docMeta.label} sx={{ bgcolor: docMeta.color + '22', color: docMeta.color, fontWeight: 700 }} />
                      <Chip size="small" label={resMeta.label} sx={{ bgcolor: resMeta.color + '22', color: resMeta.color, fontWeight: 700 }} />
                      {docs.length > 0 && (
                        <Chip size="small" variant="outlined"
                          label={`📋 ${doneDocs}/${docs.length}`}
                          color={doneDocs === docs.length ? 'success' : 'default'} />
                      )}
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={1.5}>
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
                        <TextField size="small" label="Họ tên (có dấu)" value={a.name}
                          onChange={(e) => {
                            const name = e.target.value;
                            // Tự đồng bộ tên không dấu khi nó đang khớp với tên cũ.
                            upd(a.id, a.nameNoAccent === stripAccentsKeepCase(a.name) || !a.nameNoAccent
                              ? { name, nameNoAccent: stripAccentsKeepCase(name) }
                              : { name });
                          }} />
                        <TextField size="small" label="Họ tên (không dấu)" value={a.nameNoAccent ?? ''}
                          onChange={(e) => upd(a.id, { nameNoAccent: e.target.value })} />
                        <TextField select size="small" label="Giới tính" value={a.gender ?? ''}
                          onChange={(e) => upd(a.id, { gender: e.target.value as VisaApplicant['gender'] })}>
                          <MenuItem value="">—</MenuItem>
                          <MenuItem value="Nam">Nam</MenuItem>
                          <MenuItem value="Nữ">Nữ</MenuItem>
                          <MenuItem value="Khác">Khác</MenuItem>
                        </TextField>
                        <TextField size="small" type="date" label="Ngày sinh" value={a.dob ?? ''}
                          onChange={(e) => upd(a.id, { dob: e.target.value })}
                          slotProps={{ inputLabel: { shrink: true } }} />
                        <TextField size="small" label="Số hộ chiếu" value={a.passport ?? ''}
                          onChange={(e) => upd(a.id, { passport: e.target.value })} />
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
                          <TextField size="small" type="date" label="Ngày cấp" value={a.passportIssue ?? ''}
                            onChange={(e) => upd(a.id, { passportIssue: e.target.value })}
                            slotProps={{ inputLabel: { shrink: true } }} />
                          <TextField size="small" type="date" label="Ngày hết hạn" value={a.passportExpiry ?? ''}
                            onChange={(e) => upd(a.id, { passportExpiry: e.target.value })}
                            slotProps={{ inputLabel: { shrink: true } }} />
                        </Box>
                        <TextField select size="small" label="Tình trạng hồ sơ" value={a.docStatus}
                          onChange={(e) => upd(a.id, { docStatus: e.target.value as VisaApplicant['docStatus'] })}>
                          {(Object.keys(APPLICANT_DOC_META) as VisaApplicant['docStatus'][]).map((k) => (
                            <MenuItem key={k} value={k} sx={{ color: APPLICANT_DOC_META[k].color }}>{APPLICANT_DOC_META[k].label}</MenuItem>
                          ))}
                        </TextField>
                        <TextField select size="small" label="Kết quả" value={a.result}
                          onChange={(e) => upd(a.id, { result: e.target.value as VisaApplicant['result'] })}>
                          {(Object.keys(APPLICANT_RESULT_META) as VisaApplicant['result'][]).map((k) => (
                            <MenuItem key={k} value={k} sx={{ color: APPLICANT_RESULT_META[k].color }}>{APPLICANT_RESULT_META[k].label}</MenuItem>
                          ))}
                        </TextField>
                      </Box>
                      <TextField size="small" fullWidth label="Các quốc gia đã từng đi" value={a.countriesVisited ?? ''}
                        onChange={(e) => upd(a.id, { countriesVisited: e.target.value })}
                        placeholder="VD: Nhật Bản, Hàn Quốc, Singapore…" />

                      <Box>
                        <Typography variant="caption" fontWeight={800} color="text.secondary"
                          sx={{ display: 'block', mb: 0.75, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Checklist hồ sơ
                        </Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0.5 }}>
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
                        {onOpenGuestHistory && (
                          <Tooltip title="Xem lịch sử visa của khách này">
                            <Button size="small" color="inherit" startIcon={<HistoryIcon />}
                              onClick={() => onOpenGuestHistory(a)}>
                              Lịch sử khách
                            </Button>
                          </Tooltip>
                        )}
                        <Button size="small" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => del(a.id)}>
                          Xoá khách
                        </Button>
                      </Stack>
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Stack>
        )}
      </Box>
    </Dialog>
  );
}
