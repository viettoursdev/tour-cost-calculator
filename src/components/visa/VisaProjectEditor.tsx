import { type ChangeEvent, useEffect, useState } from 'react';
import {
  Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, IconButton, LinearProgress, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { useAuthStore } from '@/stores/authStore';
import { userLabel } from '@/auth/ROLES';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { useVisaProcStore } from '@/stores/visaProcStore';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { uploadFileToWorker } from '@/lib/aiWorker';
import { openFilePreview } from '@/stores/filePreviewStore';
import { attMeta } from '@/lib/util';
import { useHistoryState } from '@/lib/useHistoryState';
import { useUndoRedoShortcuts } from '@/lib/useUndoRedoShortcuts';
import { UndoRedoButtons } from '@/components/common/UndoRedoButtons';
// exportVisaProjectPDF nạp động khi bấm.
import {
  APPLICANT_DOC_META, APPLICANT_RESULT_META, countsFromApplicants,
  deadlineMeta, DEFAULT_VISA_MILESTONES, newVisaApplicant, newVisaMilestone,
  VISA_COUNTRIES, VISA_PROC_PRESETS, visaPresetKeyForCountry, VISA_STATUS_META, VISA_STATUS_ORDER,
} from './constants';
import type {
  User, VisaApplicant, VisaMilestone, VisaProcIndexEntry, VisaProjectDoc, VisaProjectStatus,
} from '@/types';

type Props = {
  initial: VisaProjectDoc;
  onClose: () => void;
};

const NUM_FIELDS: { key: keyof VisaProjectDoc; label: string; color: string }[] = [
  { key: 'applyCount', label: 'Khách apply', color: '#0d7a6a' },
  { key: 'passedCount', label: 'Đậu visa', color: '#27ae60' },
  { key: 'failedCount', label: 'Rớt visa', color: '#dc3250' },
  { key: 'haveVisaCount', label: 'Đã có visa', color: '#2563eb' },
  { key: 'pendingCount', label: 'Đang pending', color: '#a855f7' },
];

export function VisaProjectEditor({ initial, onClose }: Props) {
  const users = useAuthStore((s) => s.users);
  const user = useAuthStore((s) => s.currentUser);
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const procList = useVisaProcStore((s) => s.list);
  const save = useVisaProjectStore((s) => s.save);
  const { state: doc, set: setDoc, undo, redo, canUndo, canRedo } = useHistoryState<VisaProjectDoc>(initial);
  useUndoRedoShortcuts(undo, redo);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const byProcId = (ids: string[]): VisaProcIndexEntry[] =>
    ids.map((id) => procList.find((x) => x.id === id)).filter((x): x is VisaProcIndexEntry => !!x);

  const onPickFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      const at = new Date().toISOString();
      const uploaded = (await Promise.all(files.map((f) => uploadFileToWorker(f))))
        .map((u) => ({ ...u, uploadedBy: user?.name ?? '', uploadedAt: at }));
      setDoc((p) => ({ ...p, attachments: [...(p.attachments ?? []), ...uploaded] }));
    } catch (err) {
      window.alert('Tải file lỗi: ' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  };
  const removeAtt = (i: number) =>
    setDoc((p) => ({ ...p, attachments: (p.attachments ?? []).filter((_, j) => j !== i) }));

  const set = <K extends keyof VisaProjectDoc>(k: K, v: VisaProjectDoc[K]) =>
    setDoc((p) => ({ ...p, [k]: v }));

  const byUsername = (us: string[]): User[] =>
    us.map((u) => users.find((x) => x.u === u)).filter((x): x is User => !!x);

  const setStaff = (k: 'mainStaff' | 'supportStaff', list: User[]) =>
    set(k, list.map((u) => u.u));

  const setNum = (k: keyof VisaProjectDoc, raw: string) =>
    set(k, Math.max(0, Math.round(Number(raw) || 0)) as VisaProjectDoc[typeof k]);

  const onPickQuote = (cloudId: string) => {
    if (!cloudId) { setDoc((p) => ({ ...p, linkedQuoteId: null, linkedQuoteName: '' })); return; }
    const q = quotes.find((x) => x.cloudId === cloudId);
    setDoc((p) => ({ ...p, linkedQuoteId: cloudId, linkedQuoteName: q?.name ?? '' }));
  };

  const applicants = doc.applicants ?? [];
  const setApplicants = (a: VisaApplicant[]) => set('applicants', a);
  const addApplicant = () => setApplicants([...applicants, newVisaApplicant()]);
  const updApplicant = (id: string, patch: Partial<VisaApplicant>) =>
    setApplicants(applicants.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const delApplicant = (id: string) => setApplicants(applicants.filter((a) => a.id !== id));
  const syncCounts = () => setDoc((p) => ({ ...p, ...countsFromApplicants(p.applicants ?? []) }));

  const setMilestones = (ms: VisaMilestone[]) => set('milestones', ms);
  const updMilestone = (id: string, patch: Partial<VisaMilestone>) =>
    setMilestones(doc.milestones.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const addMilestone = () => setMilestones([...doc.milestones, newVisaMilestone()]);
  const delMilestone = (id: string) => setMilestones(doc.milestones.filter((m) => m.id !== id));
  const moveMilestone = (i: number, dir: -1 | 1) => {
    const ms = [...doc.milestones];
    const j = i + dir;
    if (j < 0 || j >= ms.length) return;
    [ms[i], ms[j]] = [ms[j], ms[i]];
    setMilestones(ms);
  };
  const resetMilestones = () => {
    if (window.confirm('Khôi phục danh sách mốc mặc định? Các mốc hiện tại sẽ bị thay thế.')) {
      setMilestones(DEFAULT_VISA_MILESTONES.map((l) => newVisaMilestone(l)));
    }
  };
  // Mẫu quy trình thủ tục theo nước — gợi ý BÁM theo quốc gia dự án (mỗi bộ đúng
  // nước riêng), tự cập nhật khi đổi nước cho tới khi người dùng chọn tay.
  const [presetKey, setPresetKey] = useState(() => visaPresetKeyForCountry(doc.country));
  const [presetTouched, setPresetTouched] = useState(false);
  useEffect(() => {
    if (!presetTouched) setPresetKey(visaPresetKeyForCountry(doc.country));
  }, [doc.country, presetTouched]);
  const applyPreset = () => {
    const preset = VISA_PROC_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    if (doc.milestones.length && !window.confirm(`Áp dụng mẫu quy trình "${preset.label}"? Danh sách mốc hiện tại sẽ bị thay thế.`)) return;
    setMilestones(preset.steps.map((l) => newVisaMilestone(l)));
  };

  const handleSave = async () => {
    if (!doc.name.trim()) { window.alert('⚠ Nhập tên chương trình.'); return; }
    setBusy(true);
    try {
      await save(doc);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const decided = doc.passedCount + doc.failedCount;
  const passPct = decided > 0 ? Math.round((doc.passedCount / decided) * 100) : 0;

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        <Stack direction="row" alignItems="flex-start" spacing={1}>
          <Box sx={{ flex: 1 }}>
            {initial.name ? 'Sửa dự án visa' : 'Dự án visa mới'}
            <Typography variant="caption" display="block" color="text.secondary">
              Mã {doc.code} · đồng bộ Cloud
            </Typography>
          </Box>
          <UndoRedoButtons undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} />
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Tên chương trình" required fullWidth value={doc.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="VD: Đoàn Hàn Quốc tháng 8 — Cty ABC"
            />
            <TextField
              select label="Trạng thái" sx={{ minWidth: 180 }}
              value={doc.status}
              onChange={(e) => set('status', e.target.value as VisaProjectStatus)}
            >
              {VISA_STATUS_ORDER.map((s) => (
                <MenuItem key={s} value={s}>
                  <Box component="span" sx={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', bgcolor: VISA_STATUS_META[s].color, mr: 1 }} />
                  {VISA_STATUS_META[s].label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Autocomplete
              freeSolo options={VISA_COUNTRIES as readonly string[]}
              value={doc.country}
              onInputChange={(_, v) => set('country', v)}
              sx={{ flex: 1 }}
              renderInput={(p) => <TextField {...p} label="Quốc gia" placeholder="VD: Hàn Quốc" />}
            />
            <TextField
              select label="🔗 Báo giá tour liên kết" sx={{ flex: 1 }}
              value={doc.linkedQuoteId ?? ''}
              onChange={(e) => onPickQuote(e.target.value)}
            >
              <MenuItem value=""><em>— Không liên kết —</em></MenuItem>
              {quotes.map((q) => (
                <MenuItem key={q.cloudId} value={q.cloudId}>
                  {q.quoteCode ? `${q.quoteCode} · ` : ''}{q.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <Autocomplete
            multiple options={users} value={byUsername(doc.mainStaff)}
            onChange={(_, v) => setStaff('mainStaff', v)}
            getOptionLabel={(u) => userLabel(u, user)}
            isOptionEqualToValue={(a, b) => a.u === b.u}
            renderTags={(value, getTagProps) =>
              value.map((u, i) => {
                const { key, ...tp } = getTagProps({ index: i });
                return <Chip key={key} {...tp} size="small" color="primary" label={u.name} />;
              })
            }
            renderInput={(p) => <TextField {...p} label="Nhân sự phụ trách chính" placeholder="Chọn một hoặc nhiều" />}
          />

          <Autocomplete
            multiple options={users} value={byUsername(doc.supportStaff)}
            onChange={(_, v) => setStaff('supportStaff', v)}
            getOptionLabel={(u) => userLabel(u, user)}
            isOptionEqualToValue={(a, b) => a.u === b.u}
            renderTags={(value, getTagProps) =>
              value.map((u, i) => {
                const { key, ...tp } = getTagProps({ index: i });
                return <Chip key={key} {...tp} size="small" label={u.name} />;
              })
            }
            renderInput={(p) => <TextField {...p} label="Nhân sự hỗ trợ" placeholder="Chọn một hoặc nhiều" />}
          />

          <TextField
            label="Hồ sơ bao gồm" multiline minRows={2} value={doc.documentsSummary}
            onChange={(e) => set('documentsSummary', e.target.value)}
            placeholder="VD: Hộ chiếu, ảnh thẻ, sao kê ngân hàng, hợp đồng lao động, đăng ký kinh doanh…"
          />

          <Divider textAlign="left">
            <Typography variant="caption" fontWeight={700} color="text.secondary">SỐ LIỆU KHÁCH</Typography>
          </Divider>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            {NUM_FIELDS.map((f) => (
              <TextField
                key={f.key as string} type="number" label={f.label}
                value={doc[f.key] as number}
                onChange={(e) => setNum(f.key, e.target.value)}
                sx={{ width: 130, '& label': { color: f.color }, '& input': { fontWeight: 700, color: f.color } }}
                slotProps={{ htmlInput: { min: 0 } }}
              />
            ))}
          </Stack>
          {decided > 0 && (
            <Box>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">Tỉ lệ đậu (trên số đã có kết quả)</Typography>
                <Typography variant="caption" fontWeight={800} color={passPct >= 50 ? '#27ae60' : '#dc3250'}>{passPct}%</Typography>
              </Stack>
              <LinearProgress
                variant="determinate" value={passPct}
                sx={{ height: 8, borderRadius: 4, bgcolor: 'rgba(220,50,80,0.18)', '& .MuiLinearProgress-bar': { bgcolor: '#27ae60' } }}
              />
            </Box>
          )}

          <Divider textAlign="left">
            <Typography variant="caption" fontWeight={700} color="text.secondary">DANH SÁCH KHÁCH (CHECKLIST)</Typography>
          </Divider>
          <Stack spacing={0.75}>
            {applicants.map((a, i) => (
              <Stack key={a.id} direction="row" spacing={0.5} alignItems="center">
                <Typography variant="caption" color="text.disabled" sx={{ width: 18, textAlign: 'right' }}>{i + 1}</Typography>
                <TextField size="small" placeholder="Họ tên" value={a.name}
                  onChange={(e) => updApplicant(a.id, { name: e.target.value })} sx={{ flex: 1 }} />
                <TextField size="small" placeholder="Số hộ chiếu" value={a.passport ?? ''}
                  onChange={(e) => updApplicant(a.id, { passport: e.target.value })} sx={{ width: 130 }} />
                <TextField select size="small" value={a.docStatus} sx={{ width: 130 }}
                  onChange={(e) => updApplicant(a.id, { docStatus: e.target.value as VisaApplicant['docStatus'] })}>
                  {(Object.keys(APPLICANT_DOC_META) as VisaApplicant['docStatus'][]).map((k) => (
                    <MenuItem key={k} value={k} sx={{ color: APPLICANT_DOC_META[k].color }}>{APPLICANT_DOC_META[k].label}</MenuItem>
                  ))}
                </TextField>
                <TextField select size="small" value={a.result} sx={{ width: 130 }}
                  onChange={(e) => updApplicant(a.id, { result: e.target.value as VisaApplicant['result'] })}>
                  {(Object.keys(APPLICANT_RESULT_META) as VisaApplicant['result'][]).map((k) => (
                    <MenuItem key={k} value={k} sx={{ color: APPLICANT_RESULT_META[k].color }}>{APPLICANT_RESULT_META[k].label}</MenuItem>
                  ))}
                </TextField>
                <IconButton size="small" color="error" onClick={() => delApplicant(a.id)}><DeleteOutlineIcon fontSize="inherit" /></IconButton>
              </Stack>
            ))}
            <Stack direction="row" spacing={1}>
              <Button size="small" startIcon={<AddIcon />} onClick={addApplicant}>Thêm khách</Button>
              {applicants.length > 0 && (
                <Button size="small" color="inherit" startIcon={<RestartAltIcon />} onClick={syncCounts}>
                  Cập nhật số liệu từ danh sách
                </Button>
              )}
            </Stack>
          </Stack>

          <Divider textAlign="left">
            <Typography variant="caption" fontWeight={700} color="text.secondary">HỒ SƠ VISA & TÀI LIỆU</Typography>
          </Divider>
          <Autocomplete
            multiple options={procList} value={byProcId(doc.linkedProcIds)}
            onChange={(_, v) => set('linkedProcIds', v.map((x) => x.id))}
            getOptionLabel={(x) => `${x.code ? x.code + ' · ' : ''}${x.title}`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderTags={(value, getTagProps) =>
              value.map((x, i) => {
                const { key, ...tp } = getTagProps({ index: i });
                return <Chip key={key} {...tp} size="small" icon={<span>🗂️</span>} label={x.title} />;
              })
            }
            renderInput={(p) => <TextField {...p} label="Hồ sơ thủ tục liên kết" placeholder="Chọn các hồ sơ thủ tục của dự án" />}
          />
          <Box>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
              📎 File hồ sơ sao lưu
            </Typography>
            <Stack spacing={0.75}>
              {(doc.attachments ?? []).map((att, i) => (
                <Stack key={att.key} direction="row" alignItems="center" spacing={1}>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Box component="button" type="button" onClick={() => openFilePreview({ key: att.key, name: att.name })} title={att.name}
                      sx={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', p: 0, fontFamily: 'inherit',
                        fontSize: 13, fontWeight: 600, color: '#0d7a6a',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', '&:hover': { textDecoration: 'underline' } }}>
                      📎 {att.name}
                    </Box>
                    {attMeta(att) && (
                      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', lineHeight: 1.3 }}>{attMeta(att)}</Typography>
                    )}
                  </Box>
                  <Button size="small" color="error" onClick={() => removeAtt(i)}>Gỡ</Button>
                </Stack>
              ))}
              <Box>
                <Button component="label" variant="outlined" size="small" startIcon={<AttachFileIcon />} disabled={uploading}>
                  {uploading ? 'Đang tải lên…' : ((doc.attachments?.length ?? 0) ? 'Thêm / cập nhật file' : 'Đính kèm file (PDF/Word/ảnh…)')}
                  <Box component="input" type="file" hidden multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*" onChange={onPickFiles} />
                </Button>
              </Box>
            </Stack>
          </Box>

          <Divider textAlign="left">
            <Typography variant="caption" fontWeight={700} color="text.secondary">TIMELINE & MỐC THỜI GIAN</Typography>
          </Divider>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              type="date" label="Thời gian triển khai" sx={{ flex: 1 }}
              value={doc.startDate ?? ''} onChange={(e) => set('startDate', e.target.value || null)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              type="date" label="Ngày khởi hành" sx={{ flex: 1 }}
              value={doc.departureDate ?? ''} onChange={(e) => set('departureDate', e.target.value || null)}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText="Dùng để gom thống kê theo tháng/năm"
            />
            <TextField
              type="date" label="Deadline kết thúc" sx={{ flex: 1 }}
              value={doc.endDate ?? ''} onChange={(e) => set('endDate', e.target.value || null)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>

          <Stack spacing={0.75}>
            {doc.milestones.map((m, i) => {
              const meta = deadlineMeta(m.date, m.done);
              return (
                <Stack key={m.id} direction="row" spacing={0.5} alignItems="center">
                  <Tooltip title={m.done ? 'Đã hoàn tất' : 'Đánh dấu hoàn tất'}>
                    <Checkbox size="small" checked={m.done} onChange={(e) => updMilestone(m.id, { done: e.target.checked })} sx={{ p: 0.5 }} />
                  </Tooltip>
                  <TextField
                    size="small" value={m.label} placeholder="Tên mốc"
                    onChange={(e) => updMilestone(m.id, { label: e.target.value })}
                    sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: 13, textDecoration: m.done ? 'line-through' : 'none' } }}
                  />
                  <TextField
                    size="small" type="date" value={m.date ?? ''}
                    onChange={(e) => updMilestone(m.id, { date: e.target.value || null })}
                    sx={{ width: 150 }} slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <Chip size="small" label={meta.text} sx={{ minWidth: 96, bgcolor: meta.color + '22', color: meta.color, fontWeight: 700 }} />
                  <IconButton size="small" onClick={() => moveMilestone(i, -1)} disabled={i === 0}><ArrowUpwardIcon fontSize="inherit" /></IconButton>
                  <IconButton size="small" onClick={() => moveMilestone(i, 1)} disabled={i === doc.milestones.length - 1}><ArrowDownwardIcon fontSize="inherit" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => delMilestone(m.id)}><DeleteOutlineIcon fontSize="inherit" /></IconButton>
                </Stack>
              );
            })}
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Button size="small" startIcon={<AddIcon />} onClick={addMilestone}>Thêm mốc</Button>
              <Button size="small" color="inherit" startIcon={<RestartAltIcon />} onClick={resetMilestones}>Mốc mặc định</Button>
              <Box sx={{ flex: 1 }} />
              <TextField
                select size="small" label="Mẫu quy trình theo nước"
                value={presetKey} onChange={(e) => { setPresetTouched(true); setPresetKey(e.target.value); }}
                sx={{ minWidth: 200 }}
              >
                {VISA_PROC_PRESETS.map((p) => <MenuItem key={p.key} value={p.key}>{p.label}</MenuItem>)}
              </TextField>
              <Button size="small" variant="outlined" onClick={applyPreset}>Áp dụng mẫu</Button>
            </Stack>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => void import('@/lib/exports/exportVisaProjectPDF').then((m) => m.exportVisaProjectPDF(doc, (u) => users.find((x) => x.u === u)?.name ?? u))}
          startIcon={<PictureAsPdfIcon />} color="inherit">
          Xuất PDF
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} disabled={busy} color="inherit">Huỷ</Button>
        <Button onClick={() => void handleSave()} disabled={busy} variant="contained"
          sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
          {busy ? 'Đang lưu…' : 'Lưu dự án'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
