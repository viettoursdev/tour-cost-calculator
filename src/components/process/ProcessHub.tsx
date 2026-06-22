import { useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogContent, DialogTitle, Divider, IconButton, LinearProgress,
  Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LibraryAddCheckIcon from '@mui/icons-material/LibraryAddCheck';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useProcessStore, newProcessId } from '@/stores/processStore';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';
import { DEPARTMENTS } from '@/auth/departments';
import { PROCESS_SEED, DEPT_COLOR, DEPT_ICON } from './processSeed';
import { RunCreateDialog } from './RunCreateDialog';
import { ProcessRunView } from './ProcessRunView';
import { runProgress, currentStep } from './processRun';
import type { Department, ProcessTemplate } from '@/types';

// Các phòng ban có quy trình (theo yêu cầu: 5 phòng lõi).
const TARGET_DEPTS: Department[] = ['dh_noidia', 'dh_nuocngoai', 'hdv', 'visa', 'ketoan'];

/** Thư viện quy trình phòng ban + phiên đang chạy. */
export function ProcessHub() {
  const me = useAuthStore((s) => s.currentUser);
  const saved = useProcessStore((s) => s.templates);
  const runs = useProcessStore((s) => s.runs);
  const openRunId = useProcessStore((s) => s.openRunId);
  const setOpenRun = useProcessStore((s) => s.setOpenRun);
  const saveTemplate = useProcessStore((s) => s.saveTemplate);
  const deleteTemplate = useProcessStore((s) => s.deleteTemplate);
  const [dept, setDept] = useState<Department>('dh_noidia');
  const [open, setOpen] = useState<ProcessTemplate | null>(null);
  const [starting, setStarting] = useState<ProcessTemplate | null>(null);

  const openRun = runs.find((r) => r.id === openRunId);
  if (openRun) return <ProcessRunView run={openRun} onBack={() => setOpenRun(null)} />;

  const depts = DEPARTMENTS.filter((d) => TARGET_DEPTS.includes(d.id));
  const deptRuns = runs.filter((r) => r.department === dept && r.status !== 'archived');

  // Số quy trình mỗi phòng = seed + đã lưu.
  const countFor = (d: Department) =>
    PROCESS_SEED.filter((t) => t.department === d).length + saved.filter((t) => t.department === d).length;

  // Thư viện phòng đang chọn = template của tôi (DB) trước, rồi mẫu dựng sẵn.
  const list = [
    ...saved.filter((t) => t.department === dept),
    ...PROCESS_SEED.filter((t) => t.department === dept),
  ];

  const cloneSeed = async (t: ProcessTemplate) => {
    if (!me) return;
    const now = new Date().toISOString();
    const copy: ProcessTemplate = {
      ...t,
      id: newProcessId('pt'),
      name: `${t.name} (bản sao)`,
      isSeed: false,
      version: 1,
      createdByUsername: me.u,
      createdByName: me.name,
      createdAt: now,
      // Giữ nguyên nội dung bước; cấp id mới để không trùng template gốc.
      steps: t.steps.map((s, i) => ({ ...s, id: `ps${Date.now().toString(36)}_${i}` })),
    };
    await saveTemplate(copy, me.name);
    toast(`Đã thêm "${copy.name}" vào thư viện ${depts.find((d) => d.id === dept)?.label}`, 'success');
    setOpen(null);
  };

  const removeTemplate = async (t: ProcessTemplate) => {
    if (!window.confirm(`Xoá quy trình "${t.name}" khỏi thư viện?`)) return;
    await deleteTemplate(t.id);
    toast('Đã xoá quy trình', 'info');
    setOpen(null);
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Typography fontWeight={900} fontSize={18}>🗂️ Quy trình phòng ban</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
        Thư viện quy trình chuẩn (SOP) cho từng phòng ban. Mở để xem chi tiết, bấm <b>Bắt đầu quy trình</b> để tạo phiên theo dõi cho một việc cụ thể, hoặc <b>Dùng mẫu</b> để lưu bản chỉnh được.
      </Typography>

      {/* Chọn phòng ban */}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        {depts.map((d) => {
          const active = d.id === dept;
          const color = DEPT_COLOR[d.id];
          return (
            <Paper key={d.id} variant="outlined" onClick={() => setDept(d.id)}
              sx={{
                px: 1.5, py: 1, cursor: 'pointer', borderColor: active ? color : undefined,
                borderWidth: active ? 2 : 1, bgcolor: active ? color + '12' : undefined,
                display: 'flex', alignItems: 'center', gap: 1, minWidth: 150,
                '&:hover': { boxShadow: 1 },
              }}>
              <Box sx={{ fontSize: 22 }}>{DEPT_ICON[d.id]}</Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography fontSize={13} fontWeight={800} noWrap sx={{ color: active ? color : 'text.primary' }}>{d.label}</Typography>
                <Typography variant="caption" color="text.secondary">{countFor(d.id)} quy trình</Typography>
              </Box>
            </Paper>
          );
        })}
      </Stack>

      {/* Phiên đang chạy của phòng đang chọn */}
      {deptRuns.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography fontWeight={800} fontSize={13.5} sx={{ mb: 0.75 }}>▶️ Phiên đang chạy ({deptRuns.length})</Typography>
          <Stack spacing={0.75}>
            {deptRuns.map((r) => {
              const p = runProgress(r);
              const cur = currentStep(r);
              const color = DEPT_COLOR[r.department];
              return (
                <Paper key={r.id} variant="outlined" onClick={() => setOpenRun(r.id)}
                  sx={{ p: 1.25, cursor: 'pointer', '&:hover': { boxShadow: 1 } }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography fontSize={13} fontWeight={700} noWrap>{r.title}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {r.status === 'done' ? '✓ Hoàn tất' : cur ? `Bước: ${cur.label}` : '—'}{r.ref ? ` · ${r.ref.label}` : ''}
                      </Typography>
                    </Box>
                    <Box sx={{ width: 90 }}><LinearProgress variant="determinate" value={p.pct} sx={{ height: 6, borderRadius: 1, '& .MuiLinearProgress-bar': { bgcolor: color } }} /></Box>
                    <Typography fontSize={12} fontWeight={800} sx={{ color, width: 64, textAlign: 'right' }}>{p.done}/{p.total}</Typography>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        </Box>
      )}

      {/* Danh sách quy trình của phòng đang chọn */}
      <Typography fontWeight={800} fontSize={13.5} sx={{ mb: 0.75 }}>📚 Thư viện quy trình</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
        {list.map((t) => (
          <Paper key={t.id} variant="outlined" onClick={() => setOpen(t)}
            sx={{ p: 1.75, cursor: 'pointer', borderTop: `3px solid ${t.color ?? DEPT_COLOR[t.department]}`, '&:hover': { boxShadow: 2 } }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
              <Typography fontWeight={800} fontSize={14} sx={{ flex: 1 }}>{t.icon} {t.name}</Typography>
              {t.isSeed
                ? <Tooltip title="Mẫu dựng sẵn (chỉ đọc)"><Chip size="small" icon={<LockOutlinedIcon />} label="Mẫu" sx={{ height: 22 }} /></Tooltip>
                : <Chip size="small" color="primary" variant="outlined" label="Của tôi" sx={{ height: 22 }} />}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>{t.description}</Typography>
            <Chip size="small" label={`${t.steps.length} bước`} sx={{ height: 20, fontWeight: 700, bgcolor: (t.color ?? DEPT_COLOR[t.department]) + '22', color: t.color ?? DEPT_COLOR[t.department] }} />
          </Paper>
        ))}
        {list.length === 0 && (
          <Typography variant="caption" color="text.disabled">Chưa có quy trình nào cho phòng này.</Typography>
        )}
      </Box>

      {/* Chi tiết quy trình */}
      <Dialog open={!!open} onClose={() => setOpen(null)} maxWidth="md" fullWidth>
        {open && (
          <>
            <DialogTitle sx={{ pr: 6 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box sx={{ fontSize: 22 }}>{open.icon}</Box>
                <Box>
                  <Typography fontWeight={900} fontSize={16}>{open.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{open.description}</Typography>
                </Box>
              </Stack>
              <IconButton onClick={() => setOpen(null)} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
            </DialogTitle>
            <DialogContent dividers>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width={36} sx={{ fontWeight: 800 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Hành động</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Đầu ra</TableCell>
                    <TableCell sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>Hạn</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Rủi ro cần tránh</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {open.steps.map((s, i) => (
                    <TableRow key={s.id} hover>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{s.label}</TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>{s.output}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {s.dueRule && <Chip size="small" variant="outlined" label={s.dueRule} sx={{ height: 20 }} />}
                      </TableCell>
                      <TableCell sx={{ color: '#b91c1c', fontSize: 12.5 }}>{s.risk}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Divider sx={{ my: 2 }} />
              <Stack direction="row" spacing={1} justifyContent="space-between" flexWrap="wrap" useFlexGap>
                <Button variant="contained" startIcon={<PlayArrowIcon />}
                  onClick={() => { setStarting(open); setOpen(null); }}
                  sx={{ bgcolor: open.color ?? DEPT_COLOR[open.department], '&:hover': { bgcolor: open.color ?? DEPT_COLOR[open.department] } }}>
                  Bắt đầu quy trình này
                </Button>
                <Stack direction="row" spacing={1}>
                  {open.isSeed ? (
                    <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={() => void cloneSeed(open)}>
                      Dùng mẫu (thêm vào thư viện)
                    </Button>
                  ) : (
                    <>
                      <Button color="error" onClick={() => void removeTemplate(open)}>Xoá</Button>
                      <Button variant="outlined" startIcon={<LibraryAddCheckIcon />} onClick={() => void cloneSeed(open)}>
                        Nhân bản
                      </Button>
                    </>
                  )}
                </Stack>
              </Stack>
            </DialogContent>
          </>
        )}
      </Dialog>

      {starting && <RunCreateDialog template={starting} onClose={() => setStarting(null)} />}
    </Box>
  );
}
