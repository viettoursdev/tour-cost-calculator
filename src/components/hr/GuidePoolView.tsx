import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, IconButton, LinearProgress, MenuItem, Rating, Stack,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import { useHrGuideStore } from '@/stores/hrGuideStore';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { daysUntil } from '@/lib/dateUtils';
import { normalizeVN } from '@/lib/search';
import { GUIDE_STATUS_LABEL, type GuideStatus, type HrGuide } from '@/types';
import { GuideModal } from './GuideModal';

const STATUS_COLOR: Record<GuideStatus, 'success' | 'warning' | 'error'> = {
  active: 'success', paused: 'warning', blacklist: 'error',
};

/** Thẻ HDV sắp/đã hết hạn (≤90 ngày)? */
const cardExpiringSoon = (g: HrGuide): boolean => {
  const n = g.guideCardExpires ? daysUntil(g.guideCardExpires) : null;
  return n !== null && n <= 90;
};

export function GuidePoolView() {
  const guides = useHrGuideStore((s) => s.guides);
  const loading = useHrGuideStore((s) => s.loading);
  const syncing = useHrGuideStore((s) => s.syncing);
  const save = useHrGuideStore((s) => s.save);
  const del = useHrGuideStore((s) => s.delete);
  const currentUser = useAuthStore((s) => s.currentUser);
  const canEdit = hasPerm(currentUser, 'manageNCC');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | GuideStatus>('');
  const [lang, setLang] = useState('');
  const [region, setRegion] = useState('');
  const [modal, setModal] = useState<{ guide: HrGuide | null } | null>(null);

  const allLangs = useMemo(() => Array.from(new Set(guides.flatMap((g) => g.languages))).sort(), [guides]);
  const allRegions = useMemo(() => Array.from(new Set(guides.flatMap((g) => g.regions))).sort(), [guides]);

  const filtered = useMemo(() => {
    const q = normalizeVN(search.trim());
    return guides.filter((g) => {
      if (status && g.status !== status) return false;
      if (lang && !g.languages.includes(lang)) return false;
      if (region && !g.regions.includes(region)) return false;
      if (q && !normalizeVN(`${g.fullName} ${g.phone} ${g.email} ${g.guideCardNo}`).includes(q)) return false;
      return true;
    });
  }, [guides, search, status, lang, region]);

  const totalExpiring = useMemo(() => guides.filter(cardExpiringSoon).length, [guides]);

  const handleDelete = (g: HrGuide) => {
    if (window.confirm(`Xoá HDV "${g.fullName}" khỏi pool? Hành động không thể hoàn tác.`)) void del(g.id);
  };
  const handleSave = (g: HrGuide) => { void save(g); setModal(null); };

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1.5} flexWrap="wrap" gap={1}>
        <Typography variant="h6" fontWeight={800}>🧭 HDV cộng tác viên {guides.length ? `(${guides.length})` : ''}</Typography>
        {canEdit && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setModal({ guide: null })}>Thêm HDV</Button>}
      </Stack>

      {(loading || syncing) && <LinearProgress sx={{ mb: 1 }} />}

      {totalExpiring > 0 && (
        <Alert severity="warning" icon={<BadgeOutlinedIcon />} sx={{ mb: 1.5 }}>
          Có <b>{totalExpiring}</b> HDV sắp/đã hết hạn thẻ hành nghề (≤90 ngày).
        </Alert>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} mb={1.5} flexWrap="wrap" useFlexGap>
        <TextField size="small" label="Tìm tên / SĐT / số thẻ" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 220 }} />
        <TextField size="small" select label="Trạng thái" value={status} onChange={(e) => setStatus(e.target.value as '' | GuideStatus)} sx={{ minWidth: 160 }}>
          <MenuItem value="">Tất cả</MenuItem>
          {(['active', 'paused', 'blacklist'] as GuideStatus[]).map((s) => <MenuItem key={s} value={s}>{GUIDE_STATUS_LABEL[s]}</MenuItem>)}
        </TextField>
        <TextField size="small" select label="Ngôn ngữ" value={lang} onChange={(e) => setLang(e.target.value)} sx={{ minWidth: 150 }} disabled={!allLangs.length}>
          <MenuItem value="">Tất cả</MenuItem>
          {allLangs.map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}
        </TextField>
        <TextField size="small" select label="Tuyến/vùng" value={region} onChange={(e) => setRegion(e.target.value)} sx={{ minWidth: 150 }} disabled={!allRegions.length}>
          <MenuItem value="">Tất cả</MenuItem>
          {allRegions.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
        </TextField>
      </Stack>

      {filtered.length === 0 ? (
        <Typography color="text.secondary">{guides.length ? 'Không có HDV khớp bộ lọc.' : 'Pool chưa có HDV nào. Bấm “Thêm HDV”.'}</Typography>
      ) : (
        <Stack spacing={0.75}>
          {filtered.map((g) => (
            <Stack
              key={g.id} direction="row" alignItems="center" spacing={1.5}
              sx={{ px: 1.5, py: 1, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', opacity: g.status === 'blacklist' ? 0.6 : 1, '&:hover': { bgcolor: 'action.hover' } }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography fontWeight={700} noWrap>{g.fullName}</Typography>
                  {g.rating ? <Rating size="small" value={g.rating} precision={0.5} readOnly /> : null}
                </Stack>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {g.phone || '—'}
                  {g.languages.length ? ` · ${g.languages.join(', ')}` : ''}
                  {g.regions.length ? ` · ${g.regions.join(', ')}` : ''}
                </Typography>
              </Box>
              {cardExpiringSoon(g) && (
                <Tooltip title="Thẻ HDV sắp/đã hết hạn">
                  <Chip size="small" color="warning" icon={<WarningAmberIcon />} label="Thẻ" />
                </Tooltip>
              )}
              <Chip size="small" color={STATUS_COLOR[g.status]} label={GUIDE_STATUS_LABEL[g.status]} />
              <IconButton size="small" onClick={() => setModal({ guide: g })}><EditIcon fontSize="small" /></IconButton>
              {canEdit && <IconButton size="small" color="error" onClick={() => handleDelete(g)}><DeleteOutlineIcon fontSize="small" /></IconButton>}
            </Stack>
          ))}
        </Stack>
      )}

      {modal && (
        <GuideModal
          guide={modal.guide}
          canEdit={canEdit}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </Box>
  );
}
