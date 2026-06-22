import { useEffect, useRef } from 'react';
import { Avatar, AvatarGroup, Box, Chip, Paper, Stack, Tooltip, Typography } from '@mui/material';
import Sortable from 'sortablejs';
import { NOTIF_PRIORITY } from '@/types';
import type { Todo, TodoStatus, User } from '@/types';

const COLS: { v: TodoStatus; label: string; color: string }[] = [
  { v: 'todo', label: 'Chưa làm', color: '#64748b' },
  { v: 'doing', label: 'Đang làm', color: '#2563eb' },
  { v: 'done', label: 'Xong', color: '#27ae60' },
];

const dueMeta = (iso?: string, done?: boolean): { text: string; color: string } | null => {
  if (!iso || done) return null;
  const diff = new Date(iso).getTime() - Date.now();
  const days = Math.floor(Math.abs(diff) / 86400000);
  const hours = Math.floor((Math.abs(diff) % 86400000) / 3600000);
  const core = days > 0 ? `${days}n${hours ? ` ${hours}g` : ''}` : `${hours}g`;
  if (diff < 0) return { text: `QUÁ HẠN ${core}`, color: '#dc3250' };
  if (diff <= 86400000) return { text: `còn ${core}`, color: '#f5a623' };
  return { text: `còn ${core}`, color: '#64748b' };
};

type Props = {
  todos: Todo[];
  users: User[];
  onMove: (id: string, status: TodoStatus) => void;
  onOpen: (t: Todo) => void;
};

/** Bảng Kanban kéo-thả 3 cột (Chưa làm / Đang làm / Xong). Tái dùng pattern WorkflowKanban. */
export function TodoBoard({ todos, users, onMove, onOpen }: Props) {
  const refs = useRef<Partial<Record<TodoStatus, HTMLDivElement | null>>>({});
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const nameOf = (u: string) => users.find((x) => x.u === u)?.name ?? u;

  useEffect(() => {
    const instances = COLS.map(({ v }) => {
      const el = refs.current[v];
      if (!el) return null;
      return Sortable.create(el, {
        group: 'todo', animation: 160, ghostClass: 'sortable-ghost',
        onEnd: (e) => {
          const id = (e.item as HTMLElement).dataset.id;
          const to = (e.to as HTMLElement).dataset.status as TodoStatus | undefined;
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
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3,1fr)' }, gap: 1.5, alignItems: 'start' }}>
      {COLS.map(({ v, label, color }) => {
        const items = todos.filter((t) => t.status === v);
        return (
          <Paper key={v} variant="outlined" sx={{ p: 1, bgcolor: 'rgba(0,0,0,0.015)', borderTop: `3px solid ${color}` }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 0.5, py: 0.5 }}>
              <Typography fontWeight={800} sx={{ color }}>{label}</Typography>
              <Chip size="small" label={items.length} sx={{ bgcolor: color + '22', color, fontWeight: 700 }} />
            </Stack>
            <Box
              ref={(el: HTMLDivElement | null) => { refs.current[v] = el; }}
              data-status={v}
              sx={{ minHeight: 60, display: 'flex', flexDirection: 'column', gap: 1, p: 0.5 }}
            >
              {items.map((t) => {
                const pr = t.priority !== 'normal' ? NOTIF_PRIORITY[t.priority] : null;
                const due = dueMeta(t.dueDate, t.status === 'done');
                const checks = t.checklist ?? [];
                const doneChecks = checks.filter((c) => c.done).length;
                return (
                  <Paper
                    key={t.id} data-id={t.id} elevation={0} onClick={() => onOpen(t)}
                    sx={{ p: 1.25, cursor: 'grab', border: '1px solid rgba(15,58,74,0.14)', borderRadius: 1.5,
                      '&:hover': { boxShadow: 2, borderColor: color } }}
                  >
                    <Stack direction="row" spacing={0.75} alignItems="flex-start">
                      <Typography fontSize={13.5} fontWeight={600} sx={{ flex: 1, textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</Typography>
                      {pr && <Chip size="small" label={pr.label} sx={{ height: 18, fontWeight: 700, bgcolor: pr.color + '22', color: pr.color }} />}
                    </Stack>
                    <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                      {due && <Chip size="small" label={due.text} sx={{ height: 18, fontSize: 10.5, fontWeight: 700, bgcolor: due.color + '22', color: due.color }} />}
                      {t.recurring && t.recurring !== 'none' && <Chip size="small" variant="outlined" label="🔁" sx={{ height: 18 }} />}
                      {checks.length > 0 && <Chip size="small" variant="outlined" label={`☑ ${doneChecks}/${checks.length}`} sx={{ height: 18 }} />}
                      {(t.tags ?? []).map((tag) => <Chip key={tag} size="small" variant="outlined" label={`#${tag}`} sx={{ height: 18, color: 'text.secondary' }} />)}
                      <Box sx={{ flex: 1 }} />
                      {t.assignees.length > 0 && (
                        <AvatarGroup max={4} sx={{ '& .MuiAvatar-root': { width: 20, height: 20, fontSize: 10 } }}>
                          {t.assignees.map((u) => <Tooltip key={u} title={nameOf(u)}><Avatar>{nameOf(u).charAt(0)}</Avatar></Tooltip>)}
                        </AvatarGroup>
                      )}
                    </Stack>
                  </Paper>
                );
              })}
              {items.length === 0 && <Typography variant="caption" color="text.disabled" sx={{ p: 0.5 }}>Kéo việc vào đây…</Typography>}
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}
