import { useMemo, useState } from 'react';
import {
  Avatar, AvatarGroup, Box, Button, Checkbox, Chip, IconButton, MenuItem, Paper, Stack,
  TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ViewListIcon from '@mui/icons-material/ViewList';
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import { useAuthStore } from '@/stores/authStore';
import { useTodoStore } from '@/stores/todoStore';
import { allTags, filterTodos, EMPTY_FILTER, type TodoFilter } from '@/lib/todoFilter';
import { NOTIF_PRIORITY } from '@/types';
import type { Todo } from '@/types';
import { TodoModal } from './TodoModal';
import { TodoBoard } from './TodoBoard';
import { TodoDashboard } from './TodoDashboard';

type Mode = 'list' | 'board' | 'stats';

const dueMeta = (iso?: string, done?: boolean): { text: string; color: 'error' | 'warning' | 'default' } | null => {
  if (!iso || done) return null;
  const diff = new Date(iso).getTime() - Date.now();
  const days = Math.floor(Math.abs(diff) / 86400000);
  const hours = Math.floor((Math.abs(diff) % 86400000) / 3600000);
  const core = days > 0 ? `${days}n${hours ? ` ${hours}g` : ''}` : `${hours}g`;
  if (diff < 0) return { text: `QUÁ HẠN ${core}`, color: 'error' };
  if (diff <= 86400000) return { text: `còn ${core}`, color: 'warning' };
  return { text: `còn ${core}`, color: 'default' };
};

export function TodoView() {
  const me = useAuthStore((s) => s.currentUser);
  const users = useAuthStore((s) => s.users);
  const todos = useTodoStore((s) => s.todos);
  const add = useTodoStore((s) => s.add);
  const setStatus = useTodoStore((s) => s.setStatus);
  const remove = useTodoStore((s) => s.remove);

  const [mode, setMode] = useState<Mode>('list');
  const [filter, setFilter] = useState<TodoFilter>(EMPTY_FILTER);
  const [quick, setQuick] = useState('');
  const [modalTodo, setModalTodo] = useState<Todo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const nameOf = (u: string) => users.find((x) => x.u === u)?.name ?? u;
  const tags = useMemo(() => allTags(todos), [todos]);
  const filtered = useMemo(() => filterTodos(todos, filter, me?.u ?? ''), [todos, filter, me]);
  const set = (patch: Partial<TodoFilter>) => setFilter((f) => ({ ...f, ...patch }));

  const openNew = () => { setModalTodo(null); setModalOpen(true); };
  const openEdit = (t: Todo) => { setModalTodo(t); setModalOpen(true); };
  const quickAdd = async () => {
    const t = quick.trim();
    if (!t) return;
    setQuick('');
    await add({ title: t, status: 'todo' });
  };

  // Danh sách (List): sắp theo hạn rồi ưu tiên.
  const sorted = useMemo(() => {
    const prRank: Record<Todo['priority'], number> = { urgent: 0, high: 1, normal: 2 };
    return [...filtered].sort((a, b) =>
      (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || prRank[a.priority] - prRank[b.priority]);
  }, [filtered]);

  const Row = ({ t }: { t: Todo }) => {
    const due = dueMeta(t.dueDate, t.status === 'done');
    const pr = t.priority !== 'normal' ? NOTIF_PRIORITY[t.priority] : null;
    const checks = t.checklist ?? [];
    const doneChecks = checks.filter((c) => c.done).length;
    return (
      <Paper variant="outlined" sx={{ p: 1, borderLeft: `4px solid ${t.status === 'doing' ? '#2563eb' : t.status === 'done' ? '#27ae60' : 'rgba(0,0,0,0.12)'}` }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Checkbox size="small" checked={t.status === 'done'} onChange={(e) => void setStatus(t.id, e.target.checked ? 'done' : 'todo')} sx={{ p: 0.25 }} color="success" />
          <Box sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => openEdit(t)}>
            <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" useFlexGap>
              <Typography fontSize={13.5} fontWeight={600} sx={{ textDecoration: t.status === 'done' ? 'line-through' : 'none', color: t.status === 'done' ? 'text.disabled' : 'text.primary' }}>{t.title}</Typography>
              {pr && <Chip size="small" label={pr.label} sx={{ height: 18, fontWeight: 700, bgcolor: pr.color + '22', color: pr.color }} />}
              {t.status === 'doing' && <Chip size="small" label="Đang làm" sx={{ height: 18, bgcolor: 'rgba(37,99,235,0.12)', color: '#2563eb', fontWeight: 700 }} />}
              {t.recurring && t.recurring !== 'none' && <Chip size="small" variant="outlined" label="🔁" sx={{ height: 18 }} />}
              {checks.length > 0 && <Chip size="small" variant="outlined" label={`☑ ${doneChecks}/${checks.length}`} sx={{ height: 18 }} />}
              {(t.tags ?? []).map((tag) => <Chip key={tag} size="small" variant="outlined" label={`#${tag}`} sx={{ height: 18, color: 'text.secondary' }} clickable onClick={(e) => { e.stopPropagation(); set({ tag }); }} />)}
            </Stack>
            {(due || t.assignees.length > 0) && (
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 0.25 }}>
                {due && <Chip size="small" color={due.color} variant={due.color === 'default' ? 'outlined' : 'filled'} label={due.text} sx={{ height: 16, fontSize: 10.5, fontWeight: 700 }} />}
                {t.assignees.length > 0 && (
                  <AvatarGroup max={5} sx={{ '& .MuiAvatar-root': { width: 18, height: 18, fontSize: 9 } }}>
                    {t.assignees.map((u) => <Tooltip key={u} title={nameOf(u)}><Avatar>{nameOf(u).charAt(0)}</Avatar></Tooltip>)}
                  </AvatarGroup>
                )}
              </Stack>
            )}
          </Box>
          <Tooltip title="Đang làm"><IconButton size="small" onClick={() => void setStatus(t.id, t.status === 'doing' ? 'todo' : 'doing')} sx={{ color: t.status === 'doing' ? '#2563eb' : 'text.disabled' }}>▶</IconButton></Tooltip>
          <IconButton size="small" onClick={() => openEdit(t)}><EditIcon sx={{ fontSize: 15 }} /></IconButton>
          <IconButton size="small" color="error" onClick={() => { if (window.confirm('Xoá việc này?')) void remove(t.id); }}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton>
        </Stack>
      </Paper>
    );
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Typography fontWeight={900} fontSize={18}>📋 Việc cần làm</Typography>
        <Chip size="small" label={`${filtered.length} việc`} sx={{ fontWeight: 800, bgcolor: '#0d7a6a22', color: '#0d7a6a' }} />
        <Box sx={{ flex: 1 }} />
        <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v) => v && setMode(v)}>
          <ToggleButton value="list"><Tooltip title="Danh sách"><ViewListIcon fontSize="small" /></Tooltip></ToggleButton>
          <ToggleButton value="board"><Tooltip title="Kanban"><ViewKanbanOutlinedIcon fontSize="small" /></Tooltip></ToggleButton>
          <ToggleButton value="stats"><Tooltip title="Dashboard"><InsightsOutlinedIcon fontSize="small" /></Tooltip></ToggleButton>
        </ToggleButtonGroup>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openNew} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)', fontWeight: 800 }}>Việc mới</Button>
      </Stack>

      {/* Thanh lọc + tìm kiếm */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
          <TextField size="small" placeholder="🔍 Tìm việc…" value={filter.q} onChange={(e) => set({ q: e.target.value })} sx={{ minWidth: 180, flex: 1 }} />
          <ToggleButtonGroup size="small" exclusive value={filter.scope} onChange={(_, v) => v && set({ scope: v })}>
            <ToggleButton value="mine">Của tôi</ToggleButton>
            <ToggleButton value="all">Tất cả</ToggleButton>
          </ToggleButtonGroup>
          <TextField select size="small" label="Người" value={filter.assignee} onChange={(e) => set({ assignee: e.target.value })} sx={{ minWidth: 130 }}>
            <MenuItem value="">Mọi người</MenuItem>
            {users.map((u) => <MenuItem key={u.u} value={u.u}>{u.name}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Ưu tiên" value={filter.priority} onChange={(e) => set({ priority: e.target.value as TodoFilter['priority'] })} sx={{ minWidth: 120 }}>
            <MenuItem value="">Tất cả</MenuItem>
            <MenuItem value="urgent">Khẩn</MenuItem>
            <MenuItem value="high">Quan trọng</MenuItem>
            <MenuItem value="normal">Bình thường</MenuItem>
          </TextField>
          <TextField select size="small" label="Trạng thái" value={filter.status} onChange={(e) => set({ status: e.target.value as TodoFilter['status'] })} sx={{ minWidth: 120 }}>
            <MenuItem value="">Tất cả</MenuItem>
            <MenuItem value="todo">Chưa làm</MenuItem>
            <MenuItem value="doing">Đang làm</MenuItem>
            <MenuItem value="done">Xong</MenuItem>
          </TextField>
          {tags.length > 0 && (
            <TextField select size="small" label="Tag" value={filter.tag} onChange={(e) => set({ tag: e.target.value })} sx={{ minWidth: 120 }}>
              <MenuItem value="">Tất cả</MenuItem>
              {tags.map((tag) => <MenuItem key={tag} value={tag}>#{tag}</MenuItem>)}
            </TextField>
          )}
          <Chip label={filter.hideDone ? 'Ẩn việc xong' : 'Hiện việc xong'} size="small" variant={filter.hideDone ? 'filled' : 'outlined'} color={filter.hideDone ? 'primary' : 'default'} onClick={() => set({ hideDone: !filter.hideDone })} />
          {(filter.q || filter.assignee || filter.priority || filter.status || filter.tag || filter.hideDone || filter.scope !== 'mine') && (
            <Button size="small" onClick={() => setFilter(EMPTY_FILTER)}>Xoá lọc</Button>
          )}
        </Stack>
      </Paper>

      {mode === 'list' && (
        <Stack spacing={1.5}>
          <TextField fullWidth size="small" value={quick} onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void quickAdd(); }}
            placeholder="➕ Thêm nhanh việc rồi Enter…" />
          {sorted.length === 0 ? (
            <Typography variant="caption" color="text.disabled">Không có việc khớp bộ lọc 🎉</Typography>
          ) : (
            <Stack spacing={0.75}>{sorted.map((t) => <Row key={t.id} t={t} />)}</Stack>
          )}
        </Stack>
      )}

      {mode === 'board' && <TodoBoard todos={filtered} users={users} onMove={(id, st) => void setStatus(id, st)} onOpen={openEdit} />}

      {mode === 'stats' && <TodoDashboard todos={filter.scope === 'mine' ? filtered : todos} users={users} />}

      {modalOpen && <TodoModal todo={modalTodo} onClose={() => setModalOpen(false)} />}
    </Box>
  );
}
