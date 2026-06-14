import { useMemo, useState } from 'react';
import {
  Box, Chip, LinearProgress, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { useAuthStore } from '@/stores/authStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { deadlineMeta, VISA_STATUS_META } from './constants';
import { visibleVisaProjects } from './visaAccess';
import { daysUntil, fmtDate } from '@/lib/dateUtils';
import type { VisaProjectDoc } from '@/types';

export function VisaTimeline() {
  const projects = useVisaProjectStore((s) => s.projects);
  const user = useAuthStore((s) => s.currentUser);
  const [selId, setSelId] = useState<string>('');

  const visible = useMemo(() => visibleVisaProjects(user, projects), [projects, user]);

  const selected = visible.find((p) => p.id === selId) ?? visible[0] ?? null;

  if (!user) return null;

  return (
    <Box sx={{ p: 3, maxWidth: 880, mx: 'auto' }}>
      <TextField
        select fullWidth size="small" label="Chọn dự án visa"
        value={selected?.id ?? ''} onChange={(e) => setSelId(e.target.value)}
        sx={{ mb: 2 }}
      >
        {visible.length === 0 && <MenuItem value=""><em>Chưa có dự án</em></MenuItem>}
        {visible.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.name || '(Chưa đặt tên)'} · {VISA_STATUS_META[p.status]?.label}
          </MenuItem>
        ))}
      </TextField>

      {!selected ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.disabled' }}>
          Chưa có dự án để xem timeline.
        </Paper>
      ) : (
        <TimelineBody project={selected} />
      )}
    </Box>
  );
}

function TimelineBody({ project }: { project: VisaProjectDoc }) {
  const meta = VISA_STATUS_META[project.status] ?? VISA_STATUS_META.planning;
  const endLeft = daysUntil(project.endDate);
  const doneCount = project.milestones.filter((m) => m.done).length;
  const total = project.milestones.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <>
      {/* Header card */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderLeft: `4px solid ${meta.color}` }}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <Typography fontWeight={800} fontSize={16}>{project.name || '(Chưa đặt tên)'}</Typography>
          <Chip size="small" label={meta.label} sx={{ bgcolor: meta.color + '22', color: meta.color, fontWeight: 700 }} />
          {project.country && <Chip size="small" variant="outlined" label={`🌐 ${project.country}`} />}
        </Stack>
        <Stack direction="row" spacing={3} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
          <Info label="Triển khai" value={fmtDate(project.startDate) || '—'} />
          <Info label="Deadline kết thúc" value={fmtDate(project.endDate) || '—'} />
          {endLeft != null && (
            <Info
              label="Còn lại"
              value={endLeft < 0 ? `Quá hạn ${Math.abs(endLeft)} ngày` : `${endLeft} ngày`}
              color={endLeft < 0 ? '#dc3250' : endLeft <= 7 ? '#f5a623' : '#27ae60'}
            />
          )}
          <Info label="Tiến độ mốc" value={`${doneCount}/${total}`} />
        </Stack>
        <LinearProgress
          variant="determinate" value={pct}
          sx={{ mt: 1.25, height: 7, borderRadius: 4, '& .MuiLinearProgress-bar': { bgcolor: meta.color } }}
        />
      </Paper>

      {/* Vertical timeline */}
      <Box sx={{ position: 'relative', pl: 3 }}>
        <Box sx={{ position: 'absolute', left: 9, top: 6, bottom: 6, width: 2, bgcolor: 'rgba(15,58,74,0.12)' }} />
        <Stack spacing={1.25}>
          {project.milestones.length === 0 ? (
            <Typography color="text.disabled" sx={{ pl: 1 }}>Chưa có mốc nào.</Typography>
          ) : project.milestones.map((m) => {
            const dm = deadlineMeta(m.date, m.done);
            return (
              <Box key={m.id} sx={{ position: 'relative' }}>
                <Box sx={{
                  position: 'absolute', left: -22, top: 4, width: 16, height: 16, borderRadius: '50%',
                  bgcolor: m.done ? '#27ae60' : '#fff', border: `3px solid ${dm.color}`,
                }} />
                <Paper variant="outlined" sx={{ p: 1.25, borderColor: m.done ? 'rgba(39,174,96,0.4)' : undefined }}>
                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                    <Typography fontWeight={700} fontSize={14} sx={{ textDecoration: m.done ? 'line-through' : 'none', flex: 1, minWidth: 160 }}>
                      {m.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{fmtDate(m.date) || 'Chưa đặt ngày'}</Typography>
                    <Chip size="small" label={dm.text} sx={{ bgcolor: dm.color + '22', color: dm.color, fontWeight: 700 }} />
                  </Stack>
                  {m.note && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>{m.note}</Typography>}
                </Paper>
              </Box>
            );
          })}
        </Stack>
      </Box>
    </>
  );
}

function Info({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{label}</Typography>
      <Typography fontWeight={800} fontSize={14} sx={{ color: color ?? 'inherit' }}>{value}</Typography>
    </Box>
  );
}
