import { Box, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { ganttBounds, WORKFLOW_STATUS_META } from './workflowConstants';
import type { WorkflowStep } from '@/types';

type Props = { steps: WorkflowStep[]; onOpen: (step: WorkflowStep) => void };

const DAY = 86400000;
const fmt = (ms: number) => new Date(ms).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
const parse = (d?: string | null) => (d ? (Number.isNaN(Date.parse(d)) ? null : Date.parse(d)) : null);

export function WorkflowGantt({ steps, onOpen }: Props) {
  const bounds = ganttBounds(steps);
  if (!bounds) {
    return (
      <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.disabled' }}>
        Chưa có bước nào đặt ngày. Mở một bước (hoặc dùng kiểu List) để đặt <b>Ngày bắt đầu</b> / <b>Hạn</b> → Gantt sẽ hiện timeline.
      </Paper>
    );
  }
  const pad = Math.max(2 * DAY, (bounds.max - bounds.min) * 0.05);
  const lo = bounds.min - pad; const hi = bounds.max + pad; const span = hi - lo || DAY;
  const pos = (t: number) => ((t - lo) / span) * 100;
  const todayPct = pos(Date.now());

  return (
    <Paper variant="outlined" sx={{ p: 2, overflowX: 'auto' }}>
      <Box sx={{ minWidth: 720 }}>
        {/* Trục ngày */}
        <Stack direction="row" sx={{ pl: '180px', mb: 1 }} justifyContent="space-between">
          <Typography variant="caption" color="text.secondary">{fmt(lo)}</Typography>
          <Typography variant="caption" color="text.secondary">{fmt(hi)}</Typography>
        </Stack>

        <Box sx={{ position: 'relative' }}>
          {/* Vạch hôm nay */}
          <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: `calc(180px + (100% - 180px) * ${todayPct / 100})`, width: '2px', bgcolor: 'rgba(220,50,80,0.6)', zIndex: 1 }}>
            <Typography variant="caption" sx={{ position: 'absolute', top: -16, left: 2, color: '#dc3250', fontWeight: 700, whiteSpace: 'nowrap' }}>Hôm nay</Typography>
          </Box>

          <Stack spacing={0.75}>
            {steps.map((s, i) => {
              const meta = WORKFLOW_STATUS_META[s.status];
              const st = parse(s.startDate); const du = parse(s.dueDate);
              const a = st ?? du; const b = du ?? st;
              const left = a != null ? pos(a) : null;
              const width = a != null && b != null ? Math.max(pos(b) - pos(a), 1.5) : null;
              return (
                <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 172, flexShrink: 0, display: 'flex', gap: 0.5, alignItems: 'center' }}>
                    <Typography variant="caption" color="text.disabled" sx={{ width: 18 }}>{i + 1}</Typography>
                    <Typography variant="caption" fontWeight={600} noWrap title={s.label}>{s.label}</Typography>
                  </Box>
                  <Box sx={{ position: 'relative', flex: 1, height: 22, bgcolor: 'rgba(0,0,0,0.035)', borderRadius: 1 }}>
                    {left != null && width != null ? (
                      <Tooltip title={`${s.startDate ?? '—'} → ${s.dueDate ?? '—'}`}>
                        <Box onClick={() => onOpen(s)}
                          sx={{ position: 'absolute', top: 3, height: 16, left: `${left}%`, width: `${width}%`, minWidth: 8,
                            bgcolor: meta.color, borderRadius: 1, cursor: 'pointer', opacity: 0.9, '&:hover': { opacity: 1 } }} />
                      </Tooltip>
                    ) : (
                      <Typography variant="caption" color="text.disabled" sx={{ position: 'absolute', left: 6, top: 2 }}
                        onClick={() => onOpen(s)} style={{ cursor: 'pointer' }}>— chưa đặt ngày —</Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Stack>
        </Box>
      </Box>
    </Paper>
  );
}
