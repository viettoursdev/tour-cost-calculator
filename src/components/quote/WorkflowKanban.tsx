import { useEffect, useRef } from 'react';
import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import Sortable from 'sortablejs';
import { deadlineMeta } from '@/components/visa/constants';
import { WORKFLOW_STATUS_META, WORKFLOW_STATUS_ORDER, roleOfStep } from './workflowConstants';
import type { User, WorkflowStatus, WorkflowStep } from '@/types';

type Props = {
  steps: WorkflowStep[];
  users: User[];
  suggestions?: Record<string, WorkflowStatus>;
  onMove: (id: string, status: WorkflowStatus) => void;
  onOpen: (step: WorkflowStep) => void;
};

export function WorkflowKanban({ steps, users, suggestions = {}, onMove, onOpen }: Props) {
  const refs = useRef<Partial<Record<WorkflowStatus, HTMLDivElement | null>>>({});
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const nameOf = (u?: string) => users.find((x) => x.u === u)?.name ?? u ?? '';
  const numOf = (id: string) => steps.findIndex((s) => s.id === id) + 1;

  useEffect(() => {
    const instances = WORKFLOW_STATUS_ORDER.map((st) => {
      const el = refs.current[st];
      if (!el) return null;
      return Sortable.create(el, {
        group: 'wf', animation: 160, ghostClass: 'sortable-ghost',
        onEnd: (e) => {
          const id = (e.item as HTMLElement).dataset.id;
          const to = (e.to as HTMLElement).dataset.status as WorkflowStatus | undefined;
          const from = e.from as HTMLElement;
          // Revert DOM — React làm chủ vị trí thẻ theo trạng thái.
          from.removeChild(e.item);
          from.insertBefore(e.item, from.children[e.oldIndex ?? 0] ?? null);
          if (id && to) moveRef.current(id, to);
        },
      });
    });
    return () => instances.forEach((i) => { try { i?.destroy(); } catch { /* ignore */ } });
  }, []);

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', lg: 'repeat(4,1fr)' }, gap: 1.5, alignItems: 'start' }}>
      {WORKFLOW_STATUS_ORDER.map((st) => {
        const meta = WORKFLOW_STATUS_META[st];
        const items = steps.filter((s) => s.status === st);
        return (
          <Paper key={st} variant="outlined" sx={{ p: 1, bgcolor: 'rgba(0,0,0,0.015)', borderTop: `3px solid ${meta.color}` }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 0.5, py: 0.5 }}>
              <Typography fontWeight={800} sx={{ color: meta.color }}>{meta.label}</Typography>
              <Chip size="small" label={items.length} sx={{ bgcolor: meta.color + '22', color: meta.color, fontWeight: 700 }} />
            </Stack>
            <Box
              ref={(el: HTMLDivElement | null) => { refs.current[st] = el; }}
              data-status={st}
              sx={{ minHeight: 60, display: 'flex', flexDirection: 'column', gap: 1, p: 0.5 }}
            >
              {items.map((s) => {
                const dl = s.dueDate ? deadlineMeta(s.dueDate, s.status === 'done') : null;
                const dept = s.assignee ? undefined : roleOfStep(s);
                return (
                  <Paper
                    key={s.id} data-id={s.id} elevation={0} onClick={() => onOpen(s)}
                    sx={{ p: 1.25, cursor: 'grab', border: '1px solid rgba(15,58,74,0.14)', borderRadius: 1.5,
                      '&:hover': { boxShadow: 2, borderColor: meta.color } }}
                  >
                    <Stack direction="row" spacing={0.75} alignItems="flex-start">
                      <Chip size="small" label={numOf(s.id)} sx={{ height: 20, fontWeight: 800, bgcolor: meta.color + '22', color: meta.color }} />
                      <Typography fontSize={13.5} fontWeight={600} sx={{ flex: 1 }}>{s.label}</Typography>
                    </Stack>
                    {suggestions[s.id] && (
                      <Chip size="small" label={`↗ nên: ${WORKFLOW_STATUS_META[suggestions[s.id]].label}`}
                        sx={{ mt: 0.5, height: 20, fontWeight: 700, bgcolor: WORKFLOW_STATUS_META[suggestions[s.id]].color, color: '#fff' }} />
                    )}
                    {(s.assignee || dept || dl) && (
                      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                        {s.assignee && <Chip size="small" variant="outlined" label={`👤 ${nameOf(s.assignee)}`} />}
                        {dept && <Chip size="small" variant="outlined" label={`🏢 ${dept}`} sx={{ color: 'text.secondary', borderStyle: 'dashed' }} />}
                        {dl && <Typography variant="caption" sx={{ color: dl.color, fontWeight: 700 }}>⏱ {dl.text}</Typography>}
                      </Stack>
                    )}
                  </Paper>
                );
              })}
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}
