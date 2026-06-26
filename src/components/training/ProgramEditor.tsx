import { useState } from 'react';
import {
  Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControlLabel, IconButton, MenuItem, Paper, Radio, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useAuthStore } from '@/stores/authStore';
import { useTrainingStore, newTrainingId } from '@/stores/trainingStore';
import { toast } from '@/stores/toastStore';
import { DEPARTMENTS } from '@/auth/departments';
import { TRAINING_PHASES } from '@/types';
import type { Department, TrainingProgram, TrainingModule, QuizQuestion } from '@/types';

const COLOR_SWATCHES = ['#0d7a6a', '#2563eb', '#f5a623', '#7c3aed', '#dc3250', '#0891b2', '#db2777'];

const blankQuestion = (): QuizQuestion => ({ id: newTrainingId('q'), q: '', options: ['', ''], answer: 0 });
const blankModule = (): TrainingModule => ({
  id: newTrainingId('m'), code: '', phase: 'gd1', title: '', objective: '',
});

type Props = { initial?: TrainingProgram; onClose: () => void };

/** Trình soạn chương trình đào tạo: thông tin chung + module (nội dung, thực hành,
 *  quiz, mentor ký). Lưu sẽ tăng `version`. */
export function ProgramEditor({ initial, onClose }: Props) {
  const me = useAuthStore((s) => s.currentUser);
  const saveProgram = useTrainingStore((s) => s.saveProgram);
  const isEdit = !!initial;

  const [dept, setDept] = useState<Department>(initial?.department ?? 'dh_nuocngoai');
  const [name, setName] = useState(initial?.name ?? '');
  const [roleTarget, setRoleTarget] = useState(initial?.roleTarget ?? 'L2');
  const [certTitle, setCertTitle] = useState(initial?.certTitle ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '🎓');
  const [color, setColor] = useState(initial?.color ?? '#0d7a6a');
  const [modules, setModules] = useState<TrainingModule[]>(
    initial ? initial.modules.map((m) => ({ ...m, quiz: m.quiz?.map((q) => ({ ...q })) })) : [blankModule()],
  );

  const patchModule = (id: string, patch: Partial<TrainingModule>) =>
    setModules((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const addModule = () => setModules((prev) => [...prev, blankModule()]);
  const delModule = (id: string) => setModules((prev) => prev.filter((m) => m.id !== id));

  const patchQuestion = (mid: string, qid: string, patch: Partial<QuizQuestion>) =>
    setModules((prev) => prev.map((m) => m.id === mid
      ? { ...m, quiz: (m.quiz ?? []).map((q) => (q.id === qid ? { ...q, ...patch } : q)) }
      : m));
  const addQuestion = (mid: string) =>
    setModules((prev) => prev.map((m) => (m.id === mid ? { ...m, quiz: [...(m.quiz ?? []), blankQuestion()] } : m)));
  const delQuestion = (mid: string, qid: string) =>
    setModules((prev) => prev.map((m) => (m.id === mid ? { ...m, quiz: (m.quiz ?? []).filter((q) => q.id !== qid) } : m)));

  const cleanModules: TrainingModule[] = modules
    .filter((m) => m.title.trim())
    .map((m) => ({
      ...m,
      code: m.code.trim() || m.id.slice(-4).toUpperCase(),
      title: m.title.trim(),
      objective: m.objective.trim(),
      contentMd: m.contentMd?.trim() || undefined,
      practice: (m.practice ?? []).map((s) => s.trim()).filter(Boolean),
      quiz: (m.quiz ?? [])
        .map((q) => ({ ...q, q: q.q.trim(), options: q.options.map((o) => o.trim()).filter(Boolean) }))
        .filter((q) => q.q && q.options.length >= 2)
        .map((q) => ({ ...q, answer: Math.min(q.answer, q.options.length - 1) })),
    }))
    .map((m) => ({ ...m, practice: m.practice?.length ? m.practice : undefined }));

  const canSave = !!name.trim() && cleanModules.length > 0;

  const save = async () => {
    if (!me || !canSave) return;
    const now = new Date().toISOString();
    const program: TrainingProgram = {
      id: initial?.id ?? newTrainingId('tp'),
      department: dept,
      roleTarget: roleTarget.trim() || 'L2',
      name: name.trim(),
      description: description.trim() || undefined,
      certTitle: certTitle.trim() || undefined,
      icon: icon || '🎓',
      color: color || '#0d7a6a',
      modules: cleanModules,
      version: (initial?.version ?? 0) + 1,
      isPublished: true,
      isSeed: false,
      createdByUsername: initial?.createdByUsername ?? me.u,
      createdByName: initial?.createdByName ?? me.name,
      createdAt: initial?.createdAt ?? now,
    };
    await saveProgram(program, me.name);
    toast(isEdit ? `Đã lưu "${program.name}" (v${program.version})` : `Đã tạo chương trình "${program.name}"`, 'success');
    onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{isEdit ? `Sửa chương trình (v${initial!.version} → v${initial!.version + 1})` : 'Tạo chương trình đào tạo'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField label="Tên chương trình" value={name} onChange={(e) => setName(e.target.value)} fullWidth autoFocus
              placeholder="VD: Điều hành nước ngoài — Nhân viên mới" />
            <TextField select label="Phòng ban" value={dept} onChange={(e) => setDept(e.target.value as Department)} sx={{ minWidth: 190 }}>
              {DEPARTMENTS.map((d) => <MenuItem key={d.id} value={d.id}>{d.icon} {d.label}</MenuItem>)}
            </TextField>
            <TextField label="Cấp đầu ra" value={roleTarget} onChange={(e) => setRoleTarget(e.target.value)} sx={{ width: 110 }} placeholder="L2" />
          </Stack>
          <TextField label="Tên chứng nhận" value={certTitle} onChange={(e) => setCertTitle(e.target.value)} fullWidth
            placeholder="VD: Qualified Outbound Operator (L2)" />
          <TextField label="Mô tả ngắn" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth />
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField label="Icon" value={icon} onChange={(e) => setIcon(e.target.value)} sx={{ width: 90 }} inputProps={{ maxLength: 4 }} />
            <Box>
              <Typography variant="caption" color="text.secondary">Màu nhấn</Typography>
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.25 }}>
                {COLOR_SWATCHES.map((c) => (
                  <Box key={c} onClick={() => setColor(c)} sx={{
                    width: 24, height: 24, borderRadius: '50%', bgcolor: c, cursor: 'pointer',
                    border: color === c ? '3px solid rgba(0,0,0,0.45)' : '2px solid rgba(0,0,0,0.1)',
                  }} />
                ))}
              </Stack>
            </Box>
          </Stack>

          <Divider />
          <Stack direction="row" alignItems="center">
            <Typography fontWeight={800} fontSize={14} sx={{ flex: 1 }}>Module ({cleanModules.length})</Typography>
            <Button size="small" startIcon={<AddIcon />} onClick={addModule}>Thêm module</Button>
          </Stack>

          <Stack spacing={1.5}>
            {modules.map((m, i) => (
              <Paper key={m.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <Typography fontSize={12} fontWeight={800} color="text.secondary">{i + 1}</Typography>
                  <TextField size="small" label="Mã" value={m.code} onChange={(e) => patchModule(m.id, { code: e.target.value })} sx={{ width: 100 }} placeholder="OB-101" />
                  <TextField select size="small" label="Giai đoạn" value={m.phase}
                    onChange={(e) => patchModule(m.id, { phase: e.target.value as TrainingModule['phase'] })} sx={{ minWidth: 150 }}>
                    {TRAINING_PHASES.map((ph) => <MenuItem key={ph.id} value={ph.id}>{ph.label}</MenuItem>)}
                  </TextField>
                  <TextField size="small" label="Tiêu đề module" value={m.title} onChange={(e) => patchModule(m.id, { title: e.target.value })} fullWidth />
                  <IconButton size="small" color="error" onClick={() => delModule(m.id)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Stack>
                <TextField size="small" label="Mục tiêu học tập" value={m.objective} onChange={(e) => patchModule(m.id, { objective: e.target.value })} fullWidth sx={{ mb: 1 }}
                  placeholder="Sau bài này bạn làm được X" />
                <TextField size="small" label="Nội dung (tuỳ chọn)" value={m.contentMd ?? ''} onChange={(e) => patchModule(m.id, { contentMd: e.target.value })} fullWidth multiline minRows={2} sx={{ mb: 1 }} />
                <TextField size="small" label="Thực hành (mỗi dòng 1 việc)" value={(m.practice ?? []).join('\n')}
                  onChange={(e) => patchModule(m.id, { practice: e.target.value.split('\n') })} fullWidth multiline minRows={2} sx={{ mb: 0.5 }} />
                <FormControlLabel
                  control={<Checkbox size="small" checked={!!m.requiresMentorSignoff} onChange={(e) => patchModule(m.id, { requiresMentorSignoff: e.target.checked })} />}
                  label={<Typography fontSize={13}>Yêu cầu mentor ký xác nhận</Typography>} />

                {/* Quiz */}
                <Box sx={{ mt: 0.5, pl: 1, borderLeft: '2px solid rgba(13,122,106,0.25)' }}>
                  <Stack direction="row" alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography fontSize={12.5} fontWeight={700} color="text.secondary" sx={{ flex: 1 }}>Câu hỏi quiz ({(m.quiz ?? []).length})</Typography>
                    <Button size="small" startIcon={<AddIcon />} onClick={() => addQuestion(m.id)}>Thêm câu</Button>
                  </Stack>
                  <Stack spacing={1}>
                    {(m.quiz ?? []).map((q, qi) => (
                      <Paper key={q.id} variant="outlined" sx={{ p: 1, bgcolor: 'rgba(0,0,0,0.015)' }}>
                        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                          <Typography fontSize={11.5} fontWeight={800} color="text.secondary">{qi + 1}.</Typography>
                          <TextField size="small" placeholder="Câu hỏi" value={q.q} onChange={(e) => patchQuestion(m.id, q.id, { q: e.target.value })} fullWidth />
                          <IconButton size="small" color="error" onClick={() => delQuestion(m.id, q.id)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>Chọn ● cho đáp án đúng:</Typography>
                        {q.options.map((opt, oi) => (
                          <Stack key={oi} direction="row" alignItems="center" spacing={0.5}>
                            <Tooltip title="Đáp án đúng"><Radio size="small" checked={q.answer === oi} onChange={() => patchQuestion(m.id, q.id, { answer: oi })} /></Tooltip>
                            <TextField size="small" placeholder={`Phương án ${oi + 1}`} value={opt}
                              onChange={(e) => patchQuestion(m.id, q.id, { options: q.options.map((o, k) => (k === oi ? e.target.value : o)) })} fullWidth />
                            {q.options.length > 2 && (
                              <IconButton size="small" onClick={() => patchQuestion(m.id, q.id, { options: q.options.filter((_, k) => k !== oi), answer: q.answer > oi ? q.answer - 1 : q.answer })}>
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            )}
                          </Stack>
                        ))}
                        {q.options.length < 4 && (
                          <Button size="small" onClick={() => patchQuestion(m.id, q.id, { options: [...q.options, ''] })}>+ phương án</Button>
                        )}
                        <TextField size="small" label="Giải thích (tuỳ chọn)" value={q.explain ?? ''} onChange={(e) => patchQuestion(m.id, q.id, { explain: e.target.value })} fullWidth sx={{ mt: 0.5 }} />
                      </Paper>
                    ))}
                  </Stack>
                </Box>
              </Paper>
            ))}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="contained" onClick={() => void save()} disabled={!canSave}
          sx={{ bgcolor: color, '&:hover': { bgcolor: color } }}>
          {isEdit ? 'Lưu thay đổi' : 'Tạo chương trình'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
