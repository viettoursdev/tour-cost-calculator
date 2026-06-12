import { useState } from 'react';
import {
  Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, IconButton, LinearProgress, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useAuthStore } from '@/stores/authStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import {
  deadlineMeta, DEFAULT_VISA_MILESTONES, newVisaMilestone,
  VISA_COUNTRIES, VISA_STATUS_META, VISA_STATUS_ORDER,
} from './constants';
import type { User, VisaMilestone, VisaProjectDoc, VisaProjectStatus } from '@/types';

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
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const save = useVisaProjectStore((s) => s.save);
  const [doc, setDoc] = useState<VisaProjectDoc>(initial);
  const [busy, setBusy] = useState(false);

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
        {initial.name ? 'Sửa dự án visa' : 'Dự án visa mới'}
        <Typography variant="caption" display="block" color="text.secondary">
          Mã {doc.code} · đồng bộ Cloud
        </Typography>
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
            getOptionLabel={(u) => `${u.name} (${u.role})`}
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
            getOptionLabel={(u) => `${u.name} (${u.role})`}
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
            <Typography variant="caption" fontWeight={700} color="text.secondary">TIMELINE & MỐC THỜI GIAN</Typography>
          </Divider>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              type="date" label="Thời gian triển khai" sx={{ flex: 1 }}
              value={doc.startDate ?? ''} onChange={(e) => set('startDate', e.target.value || null)}
              slotProps={{ inputLabel: { shrink: true } }}
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
            <Stack direction="row" spacing={1}>
              <Button size="small" startIcon={<AddIcon />} onClick={addMilestone}>Thêm mốc</Button>
              <Button size="small" color="inherit" startIcon={<RestartAltIcon />} onClick={resetMilestones}>Mốc mặc định</Button>
            </Stack>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy} color="inherit">Huỷ</Button>
        <Button onClick={() => void handleSave()} disabled={busy} variant="contained"
          sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
          {busy ? 'Đang lưu…' : 'Lưu dự án'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
