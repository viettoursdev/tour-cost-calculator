import { useMemo, useState } from 'react';
import {
  Avatar, AvatarGroup, Box, Checkbox, Chip, IconButton, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useAuthStore } from '@/stores/authStore';
import { useTodoStore, isMyTodo } from '@/stores/todoStore';
import { NOTIF_PRIORITY } from '@/types';
import type { Todo } from '@/types';

const fmtDue = (iso?: string): { text: string; color: 'error' | 'warning' | 'default' } | null => {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  const days = Math.floor(Math.abs(diff) / 86400000);
  const hours = Math.floor((Math.abs(diff) % 86400000) / 3600000);
  const core = days > 0 ? `${days}n${hours ? ` ${hours}g` : ''}` : `${hours}g`;
  if (diff < 0) return { text: `QUÁ HẠN ${core}`, color: 'error' };
  if (diff <= 86400000) return { text: `còn ${core}`, color: 'warning' };
  return { text: `còn ${core}`, color: 'default' };
};

export function TodoPanel({ onEdit }: { onEdit: (t: Todo | null) => void }) {
  const me = useAuthStore((s) => s.currentUser);
  const users = useAuthStore((s) => s.users);
  const todos = useTodoStore((s) => s.todos);
  const add = useTodoStore((s) => s.add);
  const setStatus = useTodoStore((s) => s.setStatus);
  const remove = useTodoStore((s) => s.remove);

  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [quick, setQuick] = useState('');
  const nameOf = (u: string) => users.find((x) => x.u === u)?.name ?? u;

  const groups = useMemo(() => {
    const mine = me ? todos.filter((t) => (scope === 'mine' ? isMyTodo(t, me.u) : true)) : [];
    const open = mine.filter((t) => t.status !== 'done');
    const today = new Date(); today.setHours(23, 59, 59, 999);
    const bucket = (label: string, items: Todo[]) => ({ label, items });
    const overdue = open.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < Date.now());
    const todayB = open.filter((t) => t.dueDate && new Date(t.dueDate).getTime() >= Date.now() && new Date(t.dueDate).getTime() <= today.getTime());
    const upcoming = open.filter((t) => t.dueDate && new Date(t.dueDate).getTime() > today.getTime());
    const noDue = open.filter((t) => !t.dueDate);
    const sortDue = (a: Todo, b: Todo) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
    const doneCount = mine.filter((t) => t.status === 'done').length;
    return {
      buckets: [
        bucket('🔴 Quá hạn', overdue.sort(sortDue)),
        bucket('📌 Hôm nay', todayB.sort(sortDue)),
        bucket('🗓️ Sắp tới', upcoming.sort(sortDue)),
        bucket('• Không hạn', noDue),
      ].filter((b) => b.items.length > 0),
      openCount: open.length, doneCount,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos, scope, me]);

  const quickAdd = async () => {
    const t = quick.trim();
    if (!t) return;
    setQuick('');
    await add({ title: t, status: 'todo' });
  };

  const Row = ({ t }: { t: Todo }) => {
    const due = fmtDue(t.dueDate);
    const pr = t.priority !== 'normal' ? NOTIF_PRIORITY[t.priority] : null;
    const checks = t.checklist ?? [];
    const doneChecks = checks.filter((c) => c.done).length;
    return (
      <Paper variant="outlined" sx={{ p: 1, borderLeft: `4px solid ${t.status === 'doing' ? '#2563eb' : 'rgba(0,0,0,0.12)'}` }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Checkbox size="small" checked={t.status === 'done'} onChange={(e) => void setStatus(t.id, e.target.checked ? 'done' : 'todo')} sx={{ p: 0.25 }} color="success" />
          <Box sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onEdit(t)}>
            <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" useFlexGap>
              <Typography fontSize={13.5} fontWeight={600} sx={{ textDecoration: t.status === 'done' ? 'line-through' : 'none', color: t.status === 'done' ? 'text.disabled' : 'text.primary' }} noWrap>{t.title}</Typography>
              {pr && <Chip size="small" label={pr.label} sx={{ height: 18, fontWeight: 700, bgcolor: pr.color + '22', color: pr.color }} />}
              {t.status === 'doing' && <Chip size="small" label="Đang làm" sx={{ height: 18, bgcolor: 'rgba(37,99,235,0.12)', color: '#2563eb', fontWeight: 700 }} />}
              {t.recurring && t.recurring !== 'none' && <Chip size="small" variant="outlined" label="🔁" sx={{ height: 18 }} />}
              {checks.length > 0 && <Chip size="small" variant="outlined" label={`☑ ${doneChecks}/${checks.length}`} sx={{ height: 18 }} />}
            </Stack>
            {(due || t.assignees.length > 0) && (
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 0.25 }}>
                {due && <Chip size="small" color={due.color} variant={due.color === 'default' ? 'outlined' : 'filled'} label={due.text} sx={{ height: 16, fontSize: 10.5, fontWeight: 700 }} />}
                {t.assignees.length > 0 && (
                  <AvatarGroup max={4} sx={{ '& .MuiAvatar-root': { width: 18, height: 18, fontSize: 9 } }}>
                    {t.assignees.map((u) => <Tooltip key={u} title={nameOf(u)}><Avatar>{nameOf(u).charAt(0)}</Avatar></Tooltip>)}
                  </AvatarGroup>
                )}
              </Stack>
            )}
          </Box>
          <Tooltip title="Đang làm"><IconButton size="small" onClick={() => void setStatus(t.id, t.status === 'doing' ? 'todo' : 'doing')} sx={{ color: t.status === 'doing' ? '#2563eb' : 'text.disabled' }}>▶</IconButton></Tooltip>
          <IconButton size="small" onClick={() => onEdit(t)}><EditIcon sx={{ fontSize: 15 }} /></IconButton>
          <IconButton size="small" color="error" onClick={() => { if (window.confirm('Xoá việc này?')) void remove(t.id); }}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton>
        </Stack>
      </Paper>
    );
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.75, borderTop: '3px solid #0d7a6a' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
        <Typography fontWeight={800} fontSize={14}>📋 Việc cần làm</Typography>
        <Chip size="small" label={groups.openCount} sx={{ height: 20, fontWeight: 800, bgcolor: '#0d7a6a22', color: '#0d7a6a' }} />
        <Box sx={{ flex: 1 }} />
        <Chip size="small" label="Của tôi" color={scope === 'mine' ? 'primary' : 'default'} variant={scope === 'mine' ? 'filled' : 'outlined'} onClick={() => setScope('mine')} />
        <Chip size="small" label="Tất cả" color={scope === 'all' ? 'primary' : 'default'} variant={scope === 'all' ? 'filled' : 'outlined'} onClick={() => setScope('all')} />
        <Tooltip title="Việc mới (đầy đủ)"><IconButton size="small" onClick={() => onEdit(null)} sx={{ color: '#0d7a6a' }}><AddIcon fontSize="small" /></IconButton></Tooltip>
      </Stack>

      <TextField fullWidth size="small" value={quick} onChange={(e) => setQuick(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void quickAdd(); }}
        placeholder="➕ Thêm nhanh việc rồi Enter…" sx={{ mb: 1.25 }} />

      {groups.buckets.length === 0 ? (
        <Typography variant="caption" color="text.disabled">Không có việc cần làm 🎉{groups.doneCount ? ` · ${groups.doneCount} việc đã xong` : ''}</Typography>
      ) : (
        <Stack spacing={1.5}>
          {groups.buckets.map((b) => (
            <Box key={b.label}>
              <Typography variant="caption" fontWeight={700} color="text.secondary">{b.label} ({b.items.length})</Typography>
              <Stack spacing={0.75} sx={{ mt: 0.5 }}>{b.items.map((t) => <Row key={t.id} t={t} />)}</Stack>
            </Box>
          ))}
          {groups.doneCount > 0 && <Typography variant="caption" color="text.disabled">✓ {groups.doneCount} việc đã xong</Typography>}
        </Stack>
      )}
    </Paper>
  );
}
