import { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, Chip, IconButton, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import LaunchIcon from '@mui/icons-material/Launch';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import { useAuthStore } from '@/stores/authStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { newVisaProject, VISA_STATUS_META } from './constants';
import { VisaProjectEditor } from './VisaProjectEditor';
import { VisaApplicantManager } from './VisaApplicantManager';
import { canViewVisaProject, visibleVisaProjects } from './visaAccess';
import type { VisaProjectDoc } from '@/types';
import { filterRank } from '@/lib/search';
import { inDateRange, type DateRangeKey } from '@/lib/listFilters';
import { ListFilterBar } from '@/components/common/ListFilterBar';

type Props = { initialOpenId?: string | null; onConsumeInitial?: () => void };

function fmtDt(s?: string): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return s; }
}

export function VisaProjectManager({ initialOpenId, onConsumeInitial }: Props = {}) {
  const projects = useVisaProjectStore((s) => s.projects);
  const loading = useVisaProjectStore((s) => s.loading);
  const remove = useVisaProjectStore((s) => s.remove);
  const loadCloud = useQuoteStore((s) => s.loadCloud);
  const users = useAuthStore((s) => s.users);
  const user = useAuthStore((s) => s.currentUser);

  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [owner, setOwner] = useState('');
  const [editing, setEditing] = useState<VisaProjectDoc | null>(null);
  const [managing, setManaging] = useState<VisaProjectDoc | null>(null);
  const [delId, setDelId] = useState<string | null>(null);

  // Auto-mở editor khi được điều hướng từ hub liên kết (chờ projects tải xong).
  // Chỉ mở nếu user có quyền xem dự án; nếu không thì bỏ qua điều hướng.
  useEffect(() => {
    if (!initialOpenId) return;
    const p = projects.find((x) => x.id === initialOpenId);
    if (!p) return;
    if (canViewVisaProject(user, p)) setEditing(p);
    onConsumeInitial?.();
  }, [initialOpenId, projects, onConsumeInitial, user]);

  const openLinkedQuote = async (cloudId: string) => {
    if (!window.confirm('Rời phần visa để mở báo giá liên kết? Thay đổi chưa lưu có thể mất.')) return;
    const r = await loadCloud(cloudId);
    if (!r.ok) window.alert('⚠ ' + r.error);
  };

  const nameOf = (u: string) => users.find((x) => x.u === u)?.name ?? u;

  const visible = useMemo(() => visibleVisaProjects(user, projects), [projects, user]);

  const owners = useMemo(
    () => [...new Set(visible.map((p) => p.createdByName).filter(Boolean))].sort(),
    [visible],
  );
  const filtered = useMemo(() => {
    const base = visible.filter((p) =>
      (!owner || p.createdByName === owner)
      && inDateRange(p.updatedAt ?? p.createdAt, dateRange, dateFrom, dateTo));
    return filterRank(base, search, (p) => `${p.name} ${p.code} ${p.country} ${VISA_STATUS_META[p.status]?.label ?? ''}`);
  }, [visible, search, owner, dateRange, dateFrom, dateTo]);

  if (!user) return null;

  const handleDelete = async (id: string) => { await remove(id); setDelId(null); };

  return (
    <Box sx={{ p: 3, maxWidth: 1150, mx: 'auto' }}>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <TextField
          size="small" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Tìm tên chương trình, mã, quốc gia, trạng thái…"
          sx={{ maxWidth: 360, flex: 1 }}
        />
        <ListFilterBar
          dateRange={dateRange} onDateRange={setDateRange}
          from={dateFrom} to={dateTo} onFrom={setDateFrom} onTo={setDateTo}
          owners={owners} owner={owner} onOwner={setOwner}
        />
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained" startIcon={<AddIcon />}
          onClick={() => setEditing(newVisaProject(user))}
          sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}
        >
          Dự án visa mới
        </Button>
      </Stack>

      {loading ? (
        <Typography color="text.secondary">Đang tải…</Typography>
      ) : filtered.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.disabled' }}>
          {projects.length === 0 ? 'Chưa có dự án visa nào. Bấm “Dự án visa mới”.' : 'Không có dự án khớp tìm kiếm.'}
        </Paper>
      ) : (
        <Stack spacing={1.25}>
          {filtered.map((p) => {
            const meta = VISA_STATUS_META[p.status] ?? VISA_STATUS_META.planning;
            const decided = p.passedCount + p.failedCount;
            const passPct = decided > 0 ? Math.round((p.passedCount / decided) * 100) : 0;
            return (
              <Paper
                key={p.id} variant="outlined"
                sx={{ p: 1.75, borderLeft: `4px solid ${meta.color}`, '&:hover': { boxShadow: 2 } }}
              >
                <Stack direction="row" alignItems="flex-start" spacing={2} flexWrap="wrap" useFlexGap>
                  <Box sx={{ flex: 1, minWidth: 260 }}>
                    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                      <Typography fontWeight={800} fontSize={15}>{p.name || '(Chưa đặt tên)'}</Typography>
                      <Chip size="small" label={meta.label} sx={{ bgcolor: meta.color + '22', color: meta.color, fontWeight: 700 }} />
                      {p.country && <Chip size="small" variant="outlined" label={`🌐 ${p.country}`} />}
                      {p.linkedQuoteId && (
                        <Tooltip title={`Mở báo giá: ${p.linkedQuoteName}`}>
                          <Chip size="small" color="primary" variant="outlined" clickable icon={<LaunchIcon />}
                            label="🔗 Báo giá" onClick={() => void openLinkedQuote(p.linkedQuoteId!)} />
                        </Tooltip>
                      )}
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                      {p.code}{p.linkedQuoteName ? ` · 🔗 ${p.linkedQuoteName}` : ''} · Cập nhật {fmtDt(p.updatedAt ?? p.createdAt)}
                    </Typography>
                    {(p.mainStaff?.length ?? 0) > 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        👤 {p.mainStaff.map(nameOf).join(', ')}
                        {(p.supportStaff?.length ?? 0) > 0 ? ` · Hỗ trợ: ${p.supportStaff.map(nameOf).join(', ')}` : ''}
                      </Typography>
                    )}
                  </Box>

                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <CountBox label="Apply" value={p.applyCount} color="#0d7a6a" />
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
