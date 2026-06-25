import { useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import LaunchIcon from '@mui/icons-material/Launch';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import { useAuthStore } from '@/stores/authStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { useLinkNavStore } from '@/stores/linkNavStore';
import { VisaProjectEditor } from '@/components/visa/VisaProjectEditor';
import { VisaApplicantManager } from '@/components/visa/VisaApplicantManager';
import {
  VISA_COUNTRIES, VISA_PROC_PRESETS, VISA_STATUS_META, visaPresetKeyForCountry,
} from '@/components/visa/constants';
import { LEGACY } from '@/theme';
import type { VisaProjectDoc } from '@/types';

function fmtDt(s?: string): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return s; }
}

/**
 * Quản lý visa của TỪNG tour — chỉ hiện cho báo giá nước ngoài (template `intl`).
 * Lọc các dự án visa gắn với báo giá đang mở (theo `linkedQuoteId` hoặc cùng
 * hồ sơ tour `tourProfileId`); cho phép tạo bộ hồ sơ mới theo nước, sửa, quản lý
 * danh sách khách và xoá ngay tại chỗ — không rời báo giá.
 */
export function TourVisaPanel() {
  const draft = useQuoteStore((s) => s.draft);
  const cid = useQuoteStore((s) => s.draft.currentQuoteId);
  const tourProfileId = useQuoteStore((s) => s.draft.tourProfileId);
  const projects = useVisaProjectStore((s) => s.projects);
  const remove = useVisaProjectStore((s) => s.remove);
  const users = useAuthStore((s) => s.users);
  const user = useAuthStore((s) => s.currentUser);

  const [editing, setEditing] = useState<VisaProjectDoc | null>(null);
  const [managing, setManaging] = useState<VisaProjectDoc | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [visaDlg, setVisaDlg] = useState(false);
  const [visaCountry, setVisaCountry] = useState('');

  // Bộ hồ sơ visa của tour này: ưu tiên theo báo giá, gộp thêm theo hồ sơ tour.
  const linked = useMemo(
    () => projects.filter((p) =>
      (cid && p.linkedQuoteId === cid)
      || (!!tourProfileId && p.tourProfileId === tourProfileId)),
    [projects, cid, tourProfileId],
  );

  const nameOf = (u: string) => users.find((x) => x.u === u)?.name ?? u;
  const presetLabel = VISA_PROC_PRESETS.find((p) => p.key === visaPresetKeyForCountry(visaCountry))?.label;

  const openInVisaApp = (id: string) => {
    if (!window.confirm('Mở dự án này trong phần Quản lý Visa? Thay đổi chưa lưu của báo giá có thể mất.')) return;
    useLinkNavStore.getState().request('visaProject', id);
    useQuoteStore.setState((s) => ({ draft: { ...s.draft, template: 'visa' }, view: 'cost' }));
  };

  const openAddVisa = () => {
    if (!cid) { window.alert('Hãy lưu báo giá lên cloud trước khi tạo dự án visa.'); return; }
    setVisaCountry(draft.info.dest ?? '');
    setVisaDlg(true);
  };

  const confirmAddVisa = async () => {
    if (!cid) return;
    setVisaDlg(false);
    const p = await useVisaProjectStore.getState().spawnFromQuote({
      quoteId: cid,
      quoteName: draft.info.name || 'Dự án visa',
      country: visaCountry.trim(),
      departDate: draft.info.startDate ? draft.info.startDate.slice(0, 10) : undefined,
    });
    if (p) setEditing(p);
  };

  const handleDelete = async (id: string) => { await remove(id); setDelId(null); };

  if (!user) return null;

  return (
    <Box sx={{ p: 3, maxWidth: 1150, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" fontWeight={900}>🛂 Visa của tour</Typography>
          <Typography variant="caption" color="text.secondary">
            Các bộ hồ sơ visa gắn với báo giá <strong>{draft.info.name || '(chưa đặt tên)'}</strong>
            {draft.tourCode ? ` · ${draft.tourCode}` : ''}
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained" startIcon={<AddIcon />} disabled={!cid}
          onClick={openAddVisa}
          sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}
        >
          Thêm bộ hồ sơ (theo nước)
        </Button>
      </Stack>

      {!cid && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Báo giá chưa lưu lên cloud — hãy lưu trước để tạo & liên kết dự án visa cho tour này.
        </Alert>
      )}

      {linked.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.disabled' }}>
          Chưa có bộ hồ sơ visa cho tour này. {cid ? 'Bấm “Thêm bộ hồ sơ (theo nước)”.' : ''}
        </Paper>
      ) : (
        <Stack spacing={1.25}>
          {linked.map((p) => {
            const meta = VISA_STATUS_META[p.status] ?? VISA_STATUS_META.planning;
            const apply = p.applyCount || (p.applicants?.length ?? 0);
            const decided = p.passedCount + p.failedCount;
            const passPct = decided > 0 ? Math.round((p.passedCount / decided) * 100) : 0;
            return (
              <Paper
                key={p.id} variant="outlined"
                sx={{ p: 1.75, borderLeft: `4px solid ${meta.color}`, '&:hover': { boxShadow: 2 } }}
              >
                <Stack direction="row" alignItems="flex-start" spacing={2} flexWrap="wrap" useFlexGap>
                  <Box sx={{ flex: 1, minWidth: 240 }}>
                    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                      <Typography fontWeight={800} fontSize={15}>{p.country || p.name || '(chưa rõ nước)'}</Typography>
                      <Chip size="small" label={meta.label} sx={{ bgcolor: meta.color + '22', color: meta.color, fontWeight: 700 }} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                      {p.code} · Cập nhật {fmtDt(p.updatedAt ?? p.createdAt)}
                    </Typography>
                    {(p.mainStaff?.length ?? 0) > 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        👤 {p.mainStaff.map(nameOf).join(', ')}
                        {(p.supportStaff?.length ?? 0) > 0 ? ` · Hỗ trợ: ${p.supportStaff.map(nameOf).join(', ')}` : ''}
                      </Typography>
                    )}
                  </Box>

                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <CountBox label="Apply" value={apply} color="#0d7a6a" />
                    <CountBox label="Đậu" value={p.passedCount} color="#27ae60" />
                    <CountBox label="Rớt" value={p.failedCount} color="#dc3250" />
                    <CountBox label="Pending" value={p.pendingCount} color="#a855f7" />
                    {decided > 0 && (
                      <Box sx={{ textAlign: 'center', minWidth: 48 }}>
                        <Typography fontWeight={800} fontSize={15} color={passPct >= 50 ? '#27ae60' : '#dc3250'}>{passPct}%</Typography>
                        <Typography variant="caption" color="text.secondary">tỉ lệ đậu</Typography>
                      </Box>
                    )}
                  </Stack>

                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Danh sách khách">
                      <IconButton size="small" sx={{ color: '#0d7a6a' }} onClick={() => setManaging(p)}><PeopleAltIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Sửa">
                      <IconButton size="small" color="primary" onClick={() => setEditing(p)}><EditIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Mở trong Quản lý Visa">
                      <IconButton size="small" sx={{ color: '#0369a1' }} onClick={() => openInVisaApp(p.id)}><LaunchIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title={delId === p.id ? 'Bấm lần nữa để xoá' : 'Xoá'}>
                      <IconButton
                        size="small" color="error"
                        onClick={() => (delId === p.id ? void handleDelete(p.id) : setDelId(p.id))}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}

      {/* Hộp thoại chọn quốc gia khi thêm một bộ hồ sơ visa */}
      <Dialog open={visaDlg} onClose={() => setVisaDlg(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Thêm bộ hồ sơ visa</DialogTitle>
        <DialogContent>
          <Autocomplete
            freeSolo
            options={VISA_COUNTRIES as readonly string[]}
            value={visaCountry}
            onInputChange={(_, v) => setVisaCountry(v)}
            renderInput={(pr) => <TextField {...pr} autoFocus label="Quốc gia xin visa" placeholder="Chọn hoặc nhập nước…" sx={{ mt: 1 }} />}
          />
          {visaCountry.trim() && presetLabel && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Mẫu thủ tục sẽ áp: <strong>{presetLabel}</strong>
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVisaDlg(false)}>Huỷ</Button>
          <Button variant="contained" disabled={!visaCountry.trim()} onClick={() => void confirmAddVisa()} sx={{ background: LEGACY.headerGradient }}>
            Tạo bộ hồ sơ
          </Button>
        </DialogActions>
      </Dialog>

      {editing && <VisaProjectEditor initial={editing} onClose={() => setEditing(null)} />}
      {managing && <VisaApplicantManager project={managing} onClose={() => setManaging(null)} />}
    </Box>
  );
}

function CountBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Box sx={{ textAlign: 'center', minWidth: 44 }}>
      <Typography fontWeight={800} fontSize={15} sx={{ color }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}
