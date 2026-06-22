import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Chip, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material';
import Sortable from 'sortablejs';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { useAuthStore } from '@/stores/authStore';
import { logAudit } from '@/lib/audit';
import { filterRank } from '@/lib/search';
import { VISA_STATUS_META, VISA_STATUS_ORDER } from './constants';
import { visibleVisaProjects } from './visaAccess';
import type { VisaProjectDoc, VisaProjectStatus } from '@/types';

/** Visa Đợt 2 — Bảng điều phối quy trình visa: Kanban dự án visa theo 6 trạng
 *  thái, kéo-thả để đổi trạng thái. Thẻ hiện quốc gia, tiến độ hồ sơ và mốc gần
 *  nhất (đỏ nếu trễ hạn). Bấm thẻ để mở dự án. */
export function VisaPipeline({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const projects = useVisaProjectStore((s) => s.projects);
  const save = useVisaProjectStore((s) => s.save);
  const user = useAuthStore((s) => s.currentUser);

  const [search, setSearch] = useState('');
  const [owner, setOwner] = useState('');
  const refs = useRef<Partial<Record<VisaProjectStatus, HTMLDivElement | null>>>({});
  const today = new Date().toISOString().slice(0, 10);

  const visible = useMemo(() => visibleVisaProjects(user, projects), [user, projects]);
  const owners = useMemo(() => [...new Set(visible.map((p) => p.createdByName).filter(Boolean))].sort(), [visible]);

  const rows = useMemo(() => {
    let list = visible;
    if (owner) list = list.filter((p) => p.createdByName === owner);
    return filterRank(list, search, (p) => `${p.name} ${p.code} ${p.country} ${p.linkedQuoteName}`);
  }, [visible, search, owner]);

  const byStatus = (st: VisaProjectStatus) => rows.filter((p) => p.status === st);
  const applyOf = (p: VisaProjectDoc) => p.applyCount || (p.applicants?.length ?? 0);
  const passedOf = (p: VisaProjectDoc) => p.passedCount + p.haveVisaCount;
  // Mốc gần nhất chưa xong (có ngày) — để cảnh báo tiến độ.
  const nextMs = (p: VisaProjectDoc) =>
    p.milestones.filter((m) => !m.done && m.date).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0];

  const move = (id: string, status: VisaProjectStatus) => {
    const p = useVisaProjectStore.getState().projects.find((x) => x.id === id);
    if (!p || p.status === status) return;
    if (status === 'cancelled' && !window.confirm(`Chuyển "${p.name}" sang Huỷ?`)) return;
    void save({ ...p, status }).catch((e) => window.alert('Đổi trạng thái lỗi: ' + (e as Error).message));
    logAudit('update', 'Dự án visa', p.name, `Trạng thái → ${VISA_STATUS_META[status].label}`);
  };
  const moveRef = useRef(move);
  moveRef.current = move;

  useEffect(() => {
    const instances = VISA_STATUS_ORDER.map((st) => {
      const el = refs.current[st];
      if (!el) return null;
      return Sortable.create(el, {
        group: 'visa-pipeline', animation: 160, ghostClass: 'sortable-ghost',
        onEnd: (e) => {
          const id = (e.item as HTMLElement).dataset.id;
          const to = (e.to as HTMLElement).dataset.status as VisaProjectStatus | undefined;
          const from = e.from as HTMLElement;
          from.removeChild(e.item);
          from.insertBefore(e.item, from.children[e.oldIndex ?? 0] ?? null);
          if (id && to) moveRef.current(id, to);
        },
      });
    });
    return () => instances.forEach((i) => { try { i?.destroy(); } catch { /* ignore */ } });
  }, []);

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2 }, maxWidth: 1400, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.secondary">{rows.length} dự án · kéo-thả thẻ để đổi trạng thái</Typography>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField size="small" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Tìm dự án, mã, nước…" sx={{ minWidth: 200 }} />
          <Select size="small" displayEmpty value={owner} onChange={(e) => setOwner(e.target.value)} sx={{ minWidth: 140 }}>
            <MenuItem value="">Mọi nhân viên</MenuItem>
            {owners.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
          </Select>
        </Stack>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', md: 'repeat(3,1fr)', lg: 'repeat(6,1fr)' }, gap: 1.25, alignItems: 'start' }}>
        {VISA_STATUS_ORDER.map((st) => {
          const meta = VISA_STATUS_META[st];
          const items = byStatus(st);
          return (
            <Paper key={st} variant="outlined" sx={{ p: 0.75, bgcolor: 'rgba(0,0,0,0.015)', borderTop: `3px solid ${meta.color}` }}>
              <Box sx={{ px: 0.5, py: 0.5 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography fontWeight={800} fontSize={13} sx={{ color: meta.color }}>{meta.label}</Typography>
                  <Chip size="small" label={items.length} sx={{ height: 18, bgcolor: meta.color + '22', color: meta.color, fontWeight: 700 }} />
                </Stack>
              </Box>
              <Box ref={(el: HTMLDivElement | null) => { refs.current[st] = el; }} data-status={st}
                sx={{ minHeight: 50, display: 'flex', flexDirection: 'column', gap: 0.75, p: 0.5 }}>
                {items.map((p) => {
                  const ms = nextMs(p);
                  const overdue = ms?.date && ms.date < today;
                  const apply = applyOf(p);
                  return (
                    <Paper key={p.id} data-id={p.id} elevation={0} onClick={() => onOpenProject(p.id)}
                      sx={{ p: 1, cursor: 'grab', border: '1px solid rgba(15,58,74,0.14)', borderRadius: 1.5, '&:hover': { boxShadow: 2, borderColor: meta.color } }}>
                      <Typography fontSize={12.5} fontWeight={700} sx={{ lineHeight: 1.3 }}>{p.name || p.code}</Typography>
                      <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.25 }}>
                        {p.country && <Chip size="small" label={p.country} sx={{ height: 17, fontSize: 10.5, bgcolor: meta.color + '14', color: meta.color }} />}
                        {p.linkedQuoteName && <Chip size="small" label={`📋 ${p.linkedQuoteName}`} sx={{ height: 17, fontSize: 10.5 }} />}
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {p.createdByName || '—'}
                      </Typography>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                        {apply > 0 && <Chip size="small" label={`${passedOf(p)}/${apply} đậu`} sx={{ height: 18, fontSize: 11 }} />}
                        {ms && (
                          <Typography variant="caption" sx={{ color: overdue ? '#dc3250' : 'text.secondary', fontWeight: overdue ? 700 : 400 }}>
                            {overdue ? '⚠ ' : '🗓 '}{ms.date?.slice(5)}
                          </Typography>
                        )}
                      </Stack>
                    </Paper>
                  );
                })}
              </Box>
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}
