import { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControl, FormControlLabel, IconButton, LinearProgress, MenuItem, Paper, Radio, RadioGroup,
  Select, Stack, Tab, Tabs, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { ProgramEditor } from './ProgramEditor';
import { useAuthStore } from '@/stores/authStore';
import { useTrainingStore, newTrainingId } from '@/stores/trainingStore';
import { useHrStore } from '@/stores/hrStore';
import { useHrEvalStore } from '@/stores/hrEvalStore';
import { toast } from '@/stores/toastStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { DEPT_LABEL } from '@/auth/departments';
import { sbNextCertCode } from '@/lib/supabase';
import { TRAINING_PHASES, QUIZ_PASS_PCT } from '@/types';
import type {
  TrainingProgram, TrainingModule, TrainingEnrollment, ModuleProgress, TrainingPhase, GateState, QuizQuestion,
} from '@/types';
import { TRAINING_SEED } from '@/lib/trainingSeed';
import {
  scoreQuiz, isModuleComplete, isPhasePassed, programProgressPct, isCertEligible, currentPhase,
  modulesOfPhase, buildCertEvaluation, resolveLearner, trainingAnalytics,
} from '@/lib/training';

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Tính lại bản đồ gate của 1 enrollment theo program. */
function recomputeGates(program: TrainingProgram, e: TrainingEnrollment): Partial<Record<TrainingPhase, GateState>> {
  const gates: Partial<Record<TrainingPhase, GateState>> = {};
  for (const ph of TRAINING_PHASES) gates[ph.id] = isPhasePassed(program, e, ph.id) ? 'pass' : 'open';
  return gates;
}

export function TrainingView() {
  const me = useAuthStore((s) => s.currentUser);
  const enrollments = useTrainingStore((s) => s.enrollments);
  const [tab, setTab] = useState<'mine' | 'library' | 'roster' | 'certs' | 'report'>('mine');
  const canManage = hasPerm(me, 'manageTraining');
  const isMentor = enrollments.some((e) => e.mentorUsername === me?.u);
  const showRoster = canManage || isMentor;

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <SchoolOutlinedIcon color="primary" />
        <Typography fontWeight={900} fontSize={18}>Đào tạo nhân viên mới</Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
        Lộ trình onboarding 90 ngày theo chuẩn 30-60-90 cho từng phòng. Học theo module, làm quiz (đạt ≥{QUIZ_PASS_PCT}%), tick thực hành để qua từng giai đoạn.
      </Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="mine" label="Lộ trình của tôi" />
        <Tab value="library" label="Thư viện chương trình" />
        {showRoster && <Tab value="roster" label="Học viên" />}
        {canManage && <Tab value="certs" label="Chứng nhận" />}
        {canManage && <Tab value="report" label="Báo cáo" />}
      </Tabs>

      {tab === 'mine' && <MyTrack />}
      {tab === 'library' && <Library canManage={canManage} />}
      {tab === 'roster' && showRoster && <Roster canManage={canManage} />}
      {tab === 'certs' && canManage && <CertList />}
      {tab === 'report' && canManage && <TrainingReport />}
    </Box>
  );
}

// ── Thư viện chương trình ───────────────────────────────────────────────────

function Library({ canManage }: { canManage: boolean }) {
  const me = useAuthStore((s) => s.currentUser);
  const saved = useTrainingStore((s) => s.programs);
  const enrollments = useTrainingStore((s) => s.enrollments);
  const saveProgram = useTrainingStore((s) => s.saveProgram);
  const deleteProgram = useTrainingStore((s) => s.deleteProgram);
  const saveEnrollment = useTrainingStore((s) => s.saveEnrollment);
  const [open, setOpen] = useState<TrainingProgram | null>(null);
  // null = đóng; { program: undefined } = tạo mới; { program } = sửa.
  const [editor, setEditor] = useState<{ program?: TrainingProgram } | null>(null);

  // Của tôi (DB) trước, rồi mẫu dựng sẵn chưa bị clone.
  const list = useMemo(() => [...saved, ...TRAINING_SEED], [saved]);
  const myEnrolledProgramIds = new Set(enrollments.filter((e) => e.learnerUsername === me?.u).map((e) => e.programId));

  const cloneSeed = async (p: TrainingProgram) => {
    if (!me) return;
    const copy: TrainingProgram = {
      ...p,
      id: newTrainingId('tp'),
      name: `${p.name} (bản sao)`,
      isSeed: false,
      version: 1,
      createdByUsername: me.u,
      createdByName: me.name,
      createdAt: new Date().toISOString(),
    };
    await saveProgram(copy, me.name);
    toast(`Đã thêm "${copy.name}" vào thư viện`, 'success');
    setOpen(null);
  };

  const enroll = async (p: TrainingProgram) => {
    if (!me) return;
    const e: TrainingEnrollment = {
      id: newTrainingId('te'),
      programId: p.id,
      learnerUsername: me.u,
      learnerName: me.name,
      department: p.department,
      status: 'active',
      startDate: todayISO(),
      progress: {},
      gates: {},
      createdByUsername: me.u,
      createdByName: me.name,
      createdAt: new Date().toISOString(),
    };
    await saveEnrollment(e, me.name);
    toast(`Đã ghi danh "${p.name}". Mở tab "Lộ trình của tôi" để bắt đầu.`, 'success');
    setOpen(null);
  };

  const removeProgram = async (p: TrainingProgram) => {
    if (!window.confirm(`Xoá chương trình "${p.name}" khỏi thư viện?`)) return;
    await deleteProgram(p.id);
    toast('Đã xoá chương trình', 'info');
    setOpen(null);
  };

  return (
    <Box>
      {canManage && (
        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1.5 }}>
          <Button size="small" variant="outlined" startIcon={<AddCircleOutlineIcon />} onClick={() => setEditor({})}>
            Tạo chương trình mới
          </Button>
        </Stack>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
      {list.map((p) => (
        <Paper key={p.id} variant="outlined" onClick={() => setOpen(p)}
          sx={{ p: 1.75, cursor: 'pointer', borderTop: `3px solid ${p.color ?? '#0d7a6a'}`, '&:hover': { boxShadow: 2 } }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
            <Typography fontWeight={800} fontSize={14} sx={{ flex: 1 }}>{p.icon} {p.name}</Typography>
            {p.isSeed
              ? <Tooltip title="Mẫu dựng sẵn"><Chip size="small" icon={<LockOutlinedIcon />} label="Mẫu" sx={{ height: 22 }} /></Tooltip>
              : <Chip size="small" color="primary" variant="outlined" label="Của tôi" sx={{ height: 22 }} />}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>{p.description}</Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={DEPT_LABEL[p.department]} sx={{ height: 20 }} />
            <Chip size="small" label={`${p.modules.length} module`} sx={{ height: 20, fontWeight: 700 }} />
            {myEnrolledProgramIds.has(p.id) && <Chip size="small" color="success" label="Đã ghi danh" sx={{ height: 20 }} />}
          </Stack>
        </Paper>
      ))}

      <ProgramDetailDialog
        program={open}
        onClose={() => setOpen(null)}
        canManage={canManage}
        enrolled={!!open && myEnrolledProgramIds.has(open.id)}
        onClone={cloneSeed}
        onEnroll={enroll}
        onEdit={(p) => { setEditor({ program: p }); setOpen(null); }}
        onDelete={removeProgram}
      />
      </Box>

      {editor && <ProgramEditor initial={editor.program} onClose={() => setEditor(null)} />}
    </Box>
  );
}

function ProgramDetailDialog({ program, onClose, canManage, enrolled, onClone, onEnroll, onEdit, onDelete }: {
  program: TrainingProgram | null;
  onClose: () => void;
  canManage: boolean;
  enrolled: boolean;
  onClone: (p: TrainingProgram) => Promise<void>;
  onEnroll: (p: TrainingProgram) => Promise<void>;
  onEdit: (p: TrainingProgram) => void;
  onDelete: (p: TrainingProgram) => Promise<void>;
}) {
  if (!program) return null;
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        <Typography fontWeight={900} fontSize={16}>{program.icon} {program.name}</Typography>
        <Typography variant="caption" color="text.secondary">{program.certTitle ? `Chứng nhận: ${program.certTitle}` : program.description}</Typography>
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {TRAINING_PHASES.map((ph) => {
          const mods = modulesOfPhase(program, ph.id);
          if (!mods.length) return null;
          return (
            <Box key={ph.id} sx={{ mb: 1.5 }}>
              <Typography fontWeight={800} fontSize={13.5} sx={{ color: '#0d7a6a' }}>{ph.label}</Typography>
              <Typography variant="caption" color="text.secondary">{ph.hint}</Typography>
              <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                {mods.map((m) => (
                  <Stack key={m.id} direction="row" spacing={1} alignItems="baseline">
                    <Chip size="small" label={m.code} sx={{ height: 18, fontSize: 10 }} />
                    <Typography fontSize={13} fontWeight={600}>{m.title}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          );
        })}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {canManage && program.isSeed && (
          <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={() => void onClone(program)}>
            Dùng mẫu (thêm vào thư viện)
          </Button>
        )}
        {canManage && !program.isSeed && (
          <>
            <Button color="error" onClick={() => void onDelete(program)}>Xoá</Button>
            <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => onEdit(program)}>Sửa nội dung</Button>
          </>
        )}
        <Button variant="contained" disabled={enrolled} onClick={() => void onEnroll(program)}>
          {enrolled ? 'Đã ghi danh' : 'Ghi danh học'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Lộ trình của tôi ────────────────────────────────────────────────────────

function programOf(e: TrainingEnrollment, saved: TrainingProgram[]): TrainingProgram | undefined {
  return saved.find((p) => p.id === e.programId) ?? TRAINING_SEED.find((p) => p.id === e.programId);
}

/** Tải giấy chứng nhận PDF (brand Viettours) cho 1 enrollment đã cấp. */
async function downloadCert(e: TrainingEnrollment, program: TrainingProgram | undefined): Promise<void> {
  const m = await import('@/lib/exports/exportTrainingCertPDF');
  m.exportTrainingCertPDF({
    learnerName: e.learnerName || e.learnerUsername,
    programName: program?.name ?? '',
    certTitle: program?.certTitle,
    certCode: e.certCode,
    certifiedAt: e.certifiedAt,
    reviewerName: e.updatedBy,
  });
}

function MyTrack() {
  const me = useAuthStore((s) => s.currentUser);
  const saved = useTrainingStore((s) => s.programs);
  const enrollments = useTrainingStore((s) => s.enrollments);
  const [openId, setOpenId] = useState<string | null>(null);

  const mine = enrollments.filter((e) => e.learnerUsername === me?.u);
  const open = mine.find((e) => e.id === openId);
  const openProgram = open ? programOf(open, saved) : undefined;

  if (open && openProgram) {
    return <EnrollmentDetail enrollment={open} program={openProgram} onBack={() => setOpenId(null)} canLearn canSignoff={false} canCertify={false} />;
  }

  if (!mine.length) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">Bạn chưa ghi danh chương trình nào.</Typography>
        <Typography variant="caption" color="text.disabled">Mở tab <b>Thư viện chương trình</b> để ghi danh lộ trình phòng của bạn.</Typography>
      </Paper>
    );
  }

  return (
    <Stack spacing={1}>
      {mine.map((e) => {
        const program = programOf(e, saved);
        if (!program) return null;
        const pct = programProgressPct(program, e);
        const certified = e.status === 'certified' || isCertEligible(program, e);
        return (
          <Paper key={e.id} variant="outlined" onClick={() => setOpenId(e.id)}
            sx={{ p: 1.5, cursor: 'pointer', '&:hover': { boxShadow: 1 } }}>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Box sx={{ fontSize: 26 }}>{program.icon}</Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography fontSize={14} fontWeight={800} noWrap>{program.name}</Typography>
                <Typography variant="caption" color="text.secondary">{TRAINING_PHASES.find((p) => p.id === currentPhase(program, e))?.label}</Typography>
              </Box>
              {certified
                ? <Chip size="small" color="success" icon={<VerifiedOutlinedIcon />} label="Đủ điều kiện chứng nhận" />
                : <Box sx={{ width: 120 }}><LinearProgress variant="determinate" value={pct} sx={{ height: 7, borderRadius: 1 }} /></Box>}
              <Typography fontSize={13} fontWeight={800} sx={{ width: 44, textAlign: 'right' }}>{pct}%</Typography>
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
}

function EnrollmentDetail({ enrollment, program, onBack, canLearn, canSignoff, canCertify }: {
  enrollment: TrainingEnrollment; program: TrainingProgram; onBack: () => void;
  canLearn: boolean; canSignoff: boolean; canCertify: boolean;
}) {
  const me = useAuthStore((s) => s.currentUser);
  const saveEnrollment = useTrainingStore((s) => s.saveEnrollment);
  const [quizFor, setQuizFor] = useState<TrainingModule | null>(null);
  const [practiceFor, setPracticeFor] = useState<TrainingModule | null>(null);
  const [certifying, setCertifying] = useState(false);

  const persist = async (next: TrainingEnrollment) => {
    next.gates = recomputeGates(program, next);
    if (isCertEligible(program, next) && next.status === 'active') {
      // Đợt 1: chỉ đánh dấu đủ điều kiện qua gate, chưa tự cấp chứng nhận (đợt 3).
    }
    await saveEnrollment(next, me?.name ?? '');
  };

  const patchModule = async (moduleId: string, patch: Partial<ModuleProgress>) => {
    const prev = enrollment.progress[moduleId] ?? { status: 'in_progress' as const };
    const next: TrainingEnrollment = {
      ...enrollment,
      progress: { ...enrollment.progress, [moduleId]: { ...prev, ...patch } },
    };
    await persist(next);
  };

  const submitQuiz = async (m: TrainingModule, answers: Record<string, number>) => {
    const score = scoreQuiz(m.quiz ?? [], answers);
    await patchModule(m.id, { status: 'done', quizScore: score, completedAt: new Date().toISOString() });
    setQuizFor(null);
    toast(score >= QUIZ_PASS_PCT ? `Đạt quiz: ${score}% ✓` : `Chưa đạt: ${score}% (cần ≥${QUIZ_PASS_PCT}%)`, score >= QUIZ_PASS_PCT ? 'success' : 'warning');
  };

  const toggleSignoff = async (m: TrainingModule) => {
    const signed = !!enrollment.progress[m.id]?.signoffBy;
    await patchModule(m.id, signed
      ? { signoffBy: undefined, signoffAt: undefined }
      : { signoffBy: me?.name ?? me?.u ?? 'mentor', signoffAt: new Date().toISOString(), status: 'done' });
    toast(signed ? 'Đã bỏ xác nhận' : 'Đã ký xác nhận module ✓', signed ? 'info' : 'success');
  };

  const certify = async () => {
    if (!isCertEligible(program, enrollment) || enrollment.status === 'certified') return;
    setCertifying(true);
    try {
      const now = new Date().toISOString();
      const certCode = await sbNextCertCode();
      const next: TrainingEnrollment = { ...enrollment, status: 'certified', certifiedAt: now, certCode };
      next.gates = recomputeGates(program, next);
      await saveEnrollment(next, me?.name ?? '');
      // Nối HR: nếu học viên có hồ sơ nhân sự → ghi 1 kỳ đánh giá ĐÃ CHỐT.
      if (enrollment.employeeId) {
        const ev = buildCertEvaluation(program, next, {
          employeeId: enrollment.employeeId, evalId: newTrainingId('ev'),
          reviewerName: me?.name ?? '', nowISO: now,
        });
        await useHrEvalStore.getState().save(ev);
      }
      toast(`Đã cấp chứng nhận: ${certCode}${enrollment.employeeId ? ' · đã ghi hồ sơ HR' : ''}`, 'success');
    } catch (e) {
      toast('Lỗi cấp chứng nhận: ' + (e as Error).message, 'error');
    } finally {
      setCertifying(false);
    }
  };

  const pct = programProgressPct(program, enrollment);

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Button size="small" onClick={onBack}>← Quay lại</Button>
        <Typography fontWeight={900} fontSize={16} sx={{ flex: 1 }}>{program.icon} {program.name}</Typography>
        <Typography fontSize={13} fontWeight={800}>{pct}%</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={pct} sx={{ height: 7, borderRadius: 1, mb: 2 }} />

      {TRAINING_PHASES.map((ph) => {
        const mods = modulesOfPhase(program, ph.id);
        if (!mods.length) return null;
        const passed = isPhasePassed(program, enrollment, ph.id);
        return (
          <Box key={ph.id} sx={{ mb: 2 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
              <Typography fontWeight={800} fontSize={14} sx={{ color: '#0d7a6a' }}>{ph.label}</Typography>
              {passed
                ? <Chip size="small" color="success" label="Gate ✓ đậu" sx={{ height: 20 }} />
                : <Chip size="small" variant="outlined" label="Đang học" sx={{ height: 20 }} />}
            </Stack>
            <Stack spacing={1}>
              {mods.map((m) => (
                <ModuleCard key={m.id} module={m} progress={enrollment.progress[m.id]}
                  canLearn={canLearn} canSignoff={canSignoff}
                  onTogglePractice={(v) => void patchModule(m.id, { practiceDone: v, status: 'in_progress' })}
                  onOpenQuiz={() => setQuizFor(m)}
                  onPracticeAI={() => setPracticeFor(m)}
                  onToggleSignoff={() => void toggleSignoff(m)} />
              ))}
            </Stack>
          </Box>
        );
      })}

      {enrollment.status === 'certified' ? (
        <Paper variant="outlined" sx={{ p: 2, mt: 1, borderColor: 'success.main', bgcolor: 'success.50' }}>
          <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
            <VerifiedOutlinedIcon color="success" />
            <Box sx={{ flex: 1, minWidth: 180 }}>
              <Typography fontWeight={800} fontSize={14}>Đã cấp chứng nhận{program.certTitle ? `: ${program.certTitle}` : ''}</Typography>
              <Typography variant="caption" color="text.secondary">
                Mã {enrollment.certCode}{enrollment.certifiedAt ? ` · ${enrollment.certifiedAt.slice(0, 10)}` : ''}
              </Typography>
            </Box>
            <Button variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={() => void downloadCert(enrollment, program)}>
              Tải chứng nhận
            </Button>
          </Stack>
        </Paper>
      ) : isCertEligible(program, enrollment) && (
        <Paper variant="outlined" sx={{ p: 2, mt: 1, borderColor: 'success.main', bgcolor: 'success.50' }}>
          <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
            <VerifiedOutlinedIcon color="success" />
            <Box sx={{ flex: 1, minWidth: 180 }}>
              <Typography fontWeight={800} fontSize={14}>Đủ điều kiện chứng nhận{program.certTitle ? `: ${program.certTitle}` : ''}</Typography>
              <Typography variant="caption" color="text.secondary">Tất cả giai đoạn đã đậu gate.</Typography>
            </Box>
            {canCertify && (
              <Button variant="contained" color="success" startIcon={<VerifiedOutlinedIcon />}
                disabled={certifying} onClick={() => void certify()}>
                {certifying ? 'Đang cấp…' : 'Cấp chứng nhận'}
              </Button>
            )}
          </Stack>
        </Paper>
      )}

      {quizFor && <QuizDialog module={quizFor} onClose={() => setQuizFor(null)} onSubmit={submitQuiz} />}
      {practiceFor && <PracticeQuizDialog module={practiceFor} onClose={() => setPracticeFor(null)} />}
    </Box>
  );
}

function ModuleCard({ module: m, progress, canLearn, canSignoff, onTogglePractice, onOpenQuiz, onPracticeAI, onToggleSignoff }: {
  module: TrainingModule;
  progress: ModuleProgress | undefined;
  canLearn: boolean;
  canSignoff: boolean;
  onTogglePractice: (v: boolean) => void;
  onOpenQuiz: () => void;
  onPracticeAI: () => void;
  onToggleSignoff: () => void;
}) {
  const done = isModuleComplete(m, progress);
  const needQuiz = !!m.quiz?.length;
  const quizScore = progress?.quizScore;
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderLeft: done ? '3px solid #16a34a' : '3px solid transparent' }}>
      <Stack direction="row" alignItems="flex-start" spacing={1}>
        {done ? <CheckCircleIcon color="success" fontSize="small" /> : <RadioButtonUncheckedIcon color="disabled" fontSize="small" />}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
            <Chip size="small" label={m.code} sx={{ height: 18, fontSize: 10 }} />
            <Typography fontSize={13.5} fontWeight={700}>{m.title}</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>🎯 {m.objective}</Typography>
          {canLearn && (
            <Button size="small" startIcon={<AutoAwesomeIcon fontSize="small" />} onClick={onPracticeAI}
              sx={{ mt: 0.25, minWidth: 0, px: 0.5, fontSize: 11.5 }}>
              Luyện thêm với AI
            </Button>
          )}
          {m.contentMd && (
            <Typography fontSize={12.5} sx={{ mt: 0.5, whiteSpace: 'pre-line' }}>{m.contentMd}</Typography>
          )}
          {!!m.practice?.length && (
            <Box sx={{ mt: 0.5 }}>
              <FormControlLabel
                control={<Radio checked={!!progress?.practiceDone} disabled={!canLearn} onClick={() => canLearn && onTogglePractice(!progress?.practiceDone)} size="small" />}
                label={<Typography fontSize={12.5}>Đã hoàn thành thực hành: {m.practice.join('; ')}</Typography>}
              />
            </Box>
          )}
          {m.requiresMentorSignoff && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
              <Chip size="small" variant="outlined" color={progress?.signoffBy ? 'success' : 'warning'}
                label={progress?.signoffBy ? `Mentor đã ký: ${progress.signoffBy}` : 'Chờ mentor ký'}
                sx={{ height: 20 }} />
              {canSignoff && (
                <Button size="small" color={progress?.signoffBy ? 'inherit' : 'primary'} variant="text"
                  startIcon={<VerifiedOutlinedIcon fontSize="small" />} onClick={onToggleSignoff} sx={{ minWidth: 0 }}>
                  {progress?.signoffBy ? 'Bỏ ký' : 'Ký xác nhận'}
                </Button>
              )}
            </Stack>
          )}
        </Box>
        {needQuiz && (
          <Stack alignItems="flex-end" spacing={0.5}>
            {canLearn ? (
              <>
                <Button size="small" variant={quizScore != null ? 'outlined' : 'contained'} startIcon={<QuizOutlinedIcon />} onClick={onOpenQuiz}>
                  {quizScore != null ? 'Làm lại' : 'Làm quiz'}
                </Button>
                {quizScore != null && (
                  <Typography fontSize={11} fontWeight={800} color={quizScore >= QUIZ_PASS_PCT ? 'success.main' : 'warning.main'}>{quizScore}%</Typography>
                )}
              </>
            ) : (
              <Chip size="small" variant="outlined" label={quizScore != null ? `Quiz ${quizScore}%` : 'Chưa làm quiz'}
                color={quizScore != null && quizScore >= QUIZ_PASS_PCT ? 'success' : 'default'} sx={{ height: 22 }} />
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

function QuizDialog({ module: m, onClose, onSubmit }: {
  module: TrainingModule;
  onClose: () => void;
  onSubmit: (m: TrainingModule, answers: Record<string, number>) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const questions = m.quiz ?? [];
  const allAnswered = questions.every((q) => answers[q.id] != null);
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Quiz · {m.code} — {m.title}
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {questions.map((q, qi) => (
            <Box key={q.id}>
              <Typography fontSize={13.5} fontWeight={700} sx={{ mb: 0.5 }}>{qi + 1}. {q.q}</Typography>
              <FormControl>
                <RadioGroup value={answers[q.id] ?? -1}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: Number(e.target.value) }))}>
                  {q.options.map((opt, oi) => (
                    <FormControlLabel key={oi} value={oi} control={<Radio size="small" />} label={<Typography fontSize={13}>{opt}</Typography>} />
                  ))}
                </RadioGroup>
              </FormControl>
            </Box>
          ))}
        </Stack>
        <Divider sx={{ mt: 1 }} />
        <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: 'block' }}>Cần đúng ≥{QUIZ_PASS_PCT}% để qua module.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="contained" disabled={!allAnswered} onClick={() => void onSubmit(m, answers)}>Nộp bài</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Luyện tập với AI: sinh câu hỏi từ nội dung module, tự chấm tại chỗ, KHÔNG lưu
 *  (không ảnh hưởng tiến độ/quiz chuẩn). */
function PracticeQuizDialog({ module: m, onClose }: { module: TrainingModule; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const load = async () => {
    setLoading(true); setError(null); setSubmitted(false); setAnswers({});
    try {
      const { generatePracticeQuiz } = await import('@/lib/trainingQuiz');
      const qs = await generatePracticeQuiz(m);
      if (!qs.length) throw new Error('AI chưa tạo được câu hỏi. Thử lại nhé.');
      setQuestions(qs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  const score = submitted ? scoreQuiz(questions, answers) : null;
  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.id] != null);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <AutoAwesomeIcon fontSize="small" color="primary" />
          <span>Luyện tập AI · {m.code}</span>
        </Stack>
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Stack alignItems="center" spacing={1.5} sx={{ py: 4 }}>
            <CircularProgress size={28} />
            <Typography variant="caption" color="text.secondary">AI đang soạn câu hỏi ôn tập…</Typography>
          </Stack>
        ) : error ? (
          <Stack spacing={1.5} sx={{ py: 2 }}>
            <Typography color="error" fontSize={13}>{error}</Typography>
            <Button variant="outlined" onClick={() => void load()}>Thử lại</Button>
          </Stack>
        ) : (
          <Stack spacing={2}>
            {score != null && (
              <Paper variant="outlined" sx={{ p: 1.25, bgcolor: score >= QUIZ_PASS_PCT ? 'success.50' : 'warning.50' }}>
                <Typography fontWeight={800} fontSize={14} color={score >= QUIZ_PASS_PCT ? 'success.main' : 'warning.main'}>
                  Kết quả luyện tập: {score}% {score >= QUIZ_PASS_PCT ? '✓' : ''}
                </Typography>
                <Typography variant="caption" color="text.secondary">Bài luyện không tính vào tiến độ — chỉ để ôn.</Typography>
              </Paper>
            )}
            {questions.map((q, qi) => {
              const chosen = answers[q.id];
              return (
                <Box key={q.id}>
                  <Typography fontSize={13.5} fontWeight={700} sx={{ mb: 0.5 }}>{qi + 1}. {q.q}</Typography>
                  <FormControl>
                    <RadioGroup value={chosen ?? -1}
                      onChange={(e) => !submitted && setAnswers((a) => ({ ...a, [q.id]: Number(e.target.value) }))}>
                      {q.options.map((opt, oi) => {
                        const showRight = submitted && oi === q.answer;
                        const showWrong = submitted && chosen === oi && oi !== q.answer;
                        return (
                          <FormControlLabel key={oi} value={oi} disabled={submitted} control={<Radio size="small" />}
                            label={<Typography fontSize={13} sx={{ color: showRight ? 'success.main' : showWrong ? 'error.main' : undefined, fontWeight: showRight ? 700 : 400 }}>{opt}{showRight ? ' ✓' : ''}</Typography>} />
                        );
                      })}
                    </RadioGroup>
                  </FormControl>
                  {submitted && q.explain && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>💡 {q.explain}</Typography>
                  )}
                </Box>
              );
            })}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
        {!loading && !error && !submitted && (
          <Button variant="contained" disabled={!allAnswered} onClick={() => setSubmitted(true)}>Chấm điểm</Button>
        )}
        {submitted && <Button variant="outlined" startIcon={<AutoAwesomeIcon />} onClick={() => void load()}>Bộ câu mới</Button>}
      </DialogActions>
    </Dialog>
  );
}

// ── Học viên (Roster — mentor/quản lý theo dõi & ký sign-off) ────────────────

/** Số module yêu cầu ký mà CHƯA được mentor ký. */
function pendingSignoffs(program: TrainingProgram, e: TrainingEnrollment): number {
  return program.modules.filter((m) => m.requiresMentorSignoff && !e.progress[m.id]?.signoffBy).length;
}

function Roster({ canManage }: { canManage: boolean }) {
  const me = useAuthStore((s) => s.currentUser);
  const users = useAuthStore((s) => s.users);
  const saved = useTrainingStore((s) => s.programs);
  const enrollments = useTrainingStore((s) => s.enrollments);
  const saveEnrollment = useTrainingStore((s) => s.saveEnrollment);
  const [openId, setOpenId] = useState<string | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);

  // Mentor (không phải quản lý) chỉ thấy học viên mình kèm.
  const visible = enrollments.filter((e) => canManage || e.mentorUsername === me?.u);
  const open = visible.find((e) => e.id === openId);
  const openProgram = open ? programOf(open, saved) : undefined;

  if (open && openProgram) {
    const canSign = canManage || open.mentorUsername === me?.u;
    return <EnrollmentDetail enrollment={open} program={openProgram} onBack={() => setOpenId(null)} canLearn={false} canSignoff={canSign} canCertify={canManage} />;
  }

  const setMentor = async (e: TrainingEnrollment, mentorUsername: string) => {
    await saveEnrollment({ ...e, mentorUsername }, me?.name ?? '');
    toast('Đã gán mentor', 'success');
  };

  return (
    <Box>
      {canManage && (
        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
          <Button size="small" variant="outlined" startIcon={<AddCircleOutlineIcon />} onClick={() => setEnrollOpen(true)}>
            Ghi danh học viên
          </Button>
        </Stack>
      )}
      {!visible.length ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">Chưa có học viên nào đang đào tạo.</Typography>
        </Paper>
      ) : (
        <Stack spacing={1}>
          {visible.map((e) => {
        const program = programOf(e, saved);
        if (!program) return null;
        const pct = programProgressPct(program, e);
        const pend = pendingSignoffs(program, e);
        const certified = e.status === 'certified' || isCertEligible(program, e);
        return (
          <Paper key={e.id} variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
              <Box sx={{ flex: 1, minWidth: 180, cursor: 'pointer' }} onClick={() => setOpenId(e.id)}>
                <Typography fontSize={14} fontWeight={800} noWrap>{e.learnerName || e.learnerUsername}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {program.icon} {program.name} · {TRAINING_PHASES.find((p) => p.id === currentPhase(program, e))?.label}
                </Typography>
              </Box>

              {pend > 0 && <Chip size="small" color="warning" label={`${pend} chờ ký`} sx={{ height: 22 }} />}
              {certified && <Chip size="small" color="success" icon={<VerifiedOutlinedIcon />} label="Đủ chứng nhận" sx={{ height: 22 }} />}

              <Box sx={{ width: 110 }}><LinearProgress variant="determinate" value={pct} sx={{ height: 7, borderRadius: 1 }} /></Box>
              <Typography fontSize={13} fontWeight={800} sx={{ width: 40, textAlign: 'right' }}>{pct}%</Typography>

              {canManage && (
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <Select displayEmpty value={e.mentorUsername ?? ''} onChange={(ev) => void setMentor(e, ev.target.value)}>
                    <MenuItem value=""><em>— Gán mentor —</em></MenuItem>
                    {users.map((u) => <MenuItem key={u.u} value={u.u}>{u.name}</MenuItem>)}
                  </Select>
                </FormControl>
              )}
            </Stack>
          </Paper>
        );
          })}
        </Stack>
      )}

      {enrollOpen && <EnrollDialog onClose={() => setEnrollOpen(false)} />}
    </Box>
  );
}

/** Quản lý ghi danh một nhân viên (hồ sơ HR) vào một chương trình. Khớp hồ sơ HR
 *  → user đăng nhập qua email để học viên tự thấy lộ trình; gắn employeeId để khi
 *  cấp chứng nhận ghi được vào hồ sơ đánh giá HR. */
function EnrollDialog({ onClose }: { onClose: () => void }) {
  const me = useAuthStore((s) => s.currentUser);
  const users = useAuthStore((s) => s.users);
  const employees = useHrStore((s) => s.employees);
  const saved = useTrainingStore((s) => s.programs);
  const enrollments = useTrainingStore((s) => s.enrollments);
  const saveEnrollment = useTrainingStore((s) => s.saveEnrollment);
  const [programId, setProgramId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [busy, setBusy] = useState(false);

  const programs = [...saved, ...TRAINING_SEED];
  const activeEmps = employees.filter((e) => e.status !== 'resigned');

  const submit = async () => {
    const program = programs.find((p) => p.id === programId);
    const emp = activeEmps.find((e) => e.id === employeeId);
    if (!program || !emp || !me) return;
    const dup = enrollments.some((e) => e.employeeId === emp.id && e.programId === program.id);
    if (dup) { toast('Nhân viên này đã ghi danh chương trình đó', 'warning'); return; }
    setBusy(true);
    try {
      const learner = resolveLearner(emp, users);
      const e: TrainingEnrollment = {
        id: newTrainingId('te'),
        programId: program.id,
        employeeId: emp.id,
        learnerUsername: learner.u,
        learnerName: learner.name,
        department: (emp.department || program.department) as TrainingEnrollment['department'],
        status: 'active',
        startDate: todayISO(),
        progress: {},
        gates: {},
        createdByUsername: me.u,
        createdByName: me.name,
        createdAt: new Date().toISOString(),
      };
      await saveEnrollment(e, me.name);
      toast(`Đã ghi danh ${emp.fullName} vào "${program.name}"`, 'success');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Ghi danh học viên</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <FormControl size="small" fullWidth>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>Nhân viên</Typography>
            <Select displayEmpty value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <MenuItem value=""><em>— Chọn nhân viên —</em></MenuItem>
              {activeEmps.map((e) => (
                <MenuItem key={e.id} value={e.id}>{e.fullName}{e.department ? ` · ${DEPT_LABEL[e.department]}` : ''}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>Chương trình</Typography>
            <Select displayEmpty value={programId} onChange={(e) => setProgramId(e.target.value)}>
              <MenuItem value=""><em>— Chọn chương trình —</em></MenuItem>
              {programs.map((p) => <MenuItem key={p.id} value={p.id}>{p.icon} {p.name}</MenuItem>)}
            </Select>
          </FormControl>
          {!activeEmps.length && (
            <Typography variant="caption" color="text.disabled">Chưa có hồ sơ nhân sự nào (mục Nhân sự).</Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="contained" disabled={busy || !programId || !employeeId} onClick={() => void submit()}>Ghi danh</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Chứng nhận (danh sách đã cấp) ───────────────────────────────────────────

function CertList() {
  const saved = useTrainingStore((s) => s.programs);
  const enrollments = useTrainingStore((s) => s.enrollments);
  const certified = enrollments
    .filter((e) => e.status === 'certified')
    .sort((a, b) => (b.certifiedAt ?? '').localeCompare(a.certifiedAt ?? ''));

  if (!certified.length) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">Chưa cấp chứng nhận nào.</Typography>
        <Typography variant="caption" color="text.disabled">Học viên đủ điều kiện sẽ được cấp ở tab <b>Học viên</b>.</Typography>
      </Paper>
    );
  }

  return (
    <Stack spacing={1}>
      {certified.map((e) => {
        const program = programOf(e, saved);
        return (
          <Paper key={e.id} variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
              <VerifiedOutlinedIcon color="success" />
              <Box sx={{ flex: 1, minWidth: 180 }}>
                <Typography fontSize={14} fontWeight={800} noWrap>{e.learnerName || e.learnerUsername}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {program ? `${program.icon} ${program.certTitle ?? program.name}` : 'Chương trình đã xoá'}
                </Typography>
              </Box>
              <Chip size="small" color="success" variant="outlined" label={e.certCode ?? '—'} sx={{ height: 22, fontWeight: 800 }} />
              <Typography variant="caption" color="text.secondary" sx={{ width: 90, textAlign: 'right' }}>
                {e.certifiedAt ? e.certifiedAt.slice(0, 10) : ''}
              </Typography>
              <Tooltip title="Tải giấy chứng nhận PDF">
                <IconButton size="small" onClick={() => void downloadCert(e, program)}><DownloadOutlinedIcon fontSize="small" /></IconButton>
              </Tooltip>
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
}

// ── Báo cáo & phân tích (Kirkpatrick L4) ────────────────────────────────────

function StatCard({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 130 }}>
      <Typography fontSize={26} fontWeight={900} sx={{ color: color ?? '#0d7a6a', lineHeight: 1.1 }}>{value}</Typography>
      <Typography fontSize={12.5} fontWeight={700}>{label}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Paper>
  );
}

function TrainingReport() {
  const saved = useTrainingStore((s) => s.programs);
  const enrollments = useTrainingStore((s) => s.enrollments);
  const users = useAuthStore((s) => s.users);
  const a = useMemo(() => trainingAnalytics([...saved, ...TRAINING_SEED], enrollments), [saved, enrollments]);
  const nameOf = (u: string) => users.find((x) => x.u === u)?.name ?? u;

  if (!a.totalLearners) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">Chưa có dữ liệu đào tạo để báo cáo.</Typography>
      </Paper>
    );
  }

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
        <StatCard label="Tổng học viên" value={String(a.totalLearners)} />
        <StatCard label="Đang học" value={String(a.active)} color="#2563eb" />
        <StatCard label="Đã chứng nhận" value={String(a.certified)} color="#16a34a" />
        <StatCard label="Tỷ lệ chứng nhận" value={`${a.certRate}%`} color="#16a34a" />
        <StatCard label="Tiến độ TB (đang học)" value={`${a.avgProgress}%`} />
        <StatCard label="TG đạt chứng nhận" value={a.avgDaysToCert != null ? `${a.avgDaysToCert} ngày` : '—'} hint="trung bình" color="#7c3aed" />
      </Stack>

      <Box>
        <Typography fontWeight={800} fontSize={14} sx={{ mb: 1 }}>Theo phòng ban</Typography>
        <Stack spacing={1}>
          {a.byDept.map((d) => (
            <Paper key={d.dept} variant="outlined" sx={{ p: 1.25 }}>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Typography fontSize={13} fontWeight={700} sx={{ width: 160 }}>{DEPT_LABEL[d.dept]}</Typography>
                <Box sx={{ flex: 1 }}><LinearProgress variant="determinate" value={d.avgProgress} sx={{ height: 8, borderRadius: 1 }} /></Box>
                <Typography fontSize={12.5} sx={{ width: 50, textAlign: 'right' }}>{d.avgProgress}%</Typography>
                <Chip size="small" label={`${d.certified}/${d.total} đạt`} sx={{ height: 20 }} />
              </Stack>
            </Paper>
          ))}
        </Stack>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        <Box>
          <Typography fontWeight={800} fontSize={14} sx={{ mb: 1 }}>Module hay "kẹt"</Typography>
          {a.bottlenecks.length ? (
            <Stack spacing={0.75}>
              {a.bottlenecks.map((b) => (
                <Paper key={b.code + b.title} variant="outlined" sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip size="small" label={b.code} sx={{ height: 18, fontSize: 10 }} />
                  <Typography fontSize={12.5} sx={{ flex: 1 }} noWrap>{b.title}</Typography>
                  <Chip size="small" color="warning" label={`${b.stuck} người`} sx={{ height: 20 }} />
                </Paper>
              ))}
            </Stack>
          ) : <Typography variant="caption" color="text.disabled">Không có module nào tồn đọng.</Typography>}
        </Box>
        <Box>
          <Typography fontWeight={800} fontSize={14} sx={{ mb: 1 }}>Tải mentor (đang kèm)</Typography>
          {a.mentorLoad.length ? (
            <Stack spacing={0.75}>
              {a.mentorLoad.map((m) => (
                <Paper key={m.mentor} variant="outlined" sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography fontSize={12.5} sx={{ flex: 1 }} noWrap>{nameOf(m.mentor)}</Typography>
                  <Chip size="small" label={`${m.count} học viên`} sx={{ height: 20 }} />
                </Paper>
              ))}
            </Stack>
          ) : <Typography variant="caption" color="text.disabled">Chưa gán mentor cho học viên nào.</Typography>}
        </Box>
      </Box>
    </Stack>
  );
}
