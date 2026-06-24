import { useMemo, useState } from 'react';
import {
  Box, Button, Chip, IconButton, LinearProgress, Paper, Rating, Stack, Tab, Tabs,
  Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useHrRecruitStore } from '@/stores/hrRecruitStore';
import { useHrStore } from '@/stores/hrStore';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { DEPT_LABEL } from '@/auth/departments';
import { toast } from '@/stores/toastStore';
import {
  CANDIDATE_STAGE_LABEL, CANDIDATE_STAGE_ORDER, JOB_STATUS_LABEL,
  type CandidateStage, type Department, type HrCandidate, type HrEmployee, type HrJobPosting,
  type ProcessRun, type WorkflowStep,
} from '@/types';
import { useProcessStore } from '@/stores/processStore';
import { JobPostingModal } from './JobPostingModal';
import { CandidateModal } from './CandidateModal';
import { ONBOARDING_STEPS } from './hrSeed';

const STAGE_COLOR: Partial<Record<CandidateStage, string>> = {
  hired: '#14a08c', rejected: '#dc3250', offer: '#f5a623',
};
const newEmpId = () => 'hr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const newRunId = () => 'run' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function RecruitView({ embedded = false }: { embedded?: boolean } = {}) {
  const { postings, candidates, loading, syncing } = useHrRecruitStore();
  const savePosting = useHrRecruitStore((s) => s.savePosting);
  const deletePosting = useHrRecruitStore((s) => s.deletePosting);
  const saveCandidate = useHrRecruitStore((s) => s.saveCandidate);
  const deleteCandidate = useHrRecruitStore((s) => s.deleteCandidate);
  const moveCandidate = useHrRecruitStore((s) => s.moveCandidate);
  const saveEmployee = useHrStore((s) => s.save);
  const saveRun = useProcessStore((s) => s.saveRun);
  const currentUser = useAuthStore((s) => s.currentUser);
  const canEdit = hasPerm(currentUser, 'manageHR');

  const [tab, setTab] = useState<'jobs' | 'pipeline'>('pipeline');
  const [jobModal, setJobModal] = useState<{ posting: HrJobPosting | null } | null>(null);
  const [candModal, setCandModal] = useState<{ candidate: HrCandidate | null } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const m = new Map<CandidateStage, HrCandidate[]>();
    CANDIDATE_STAGE_ORDER.forEach((s) => m.set(s, []));
    candidates.forEach((c) => m.get(c.stage)?.push(c));
    return m;
  }, [candidates]);

  const handleConvert = (c: HrCandidate) => {
    if (!window.confirm(`Tạo hồ sơ nhân sự từ ứng viên "${c.fullName}"? Ứng viên sẽ chuyển sang "Nhận việc".`)) return;
    const empId = newEmpId();
    const emp: HrEmployee = {
      id: empId, employeeCode: '', fullName: c.fullName, email: c.email, phone: c.phone,
      department: c.department, title: c.position, level: '', status: 'probation',
      joinDate: new Date().toISOString().slice(0, 10),
      notes: `Tuyển từ ứng viên (nguồn: ${c.source || '—'}).`,
      documents: [], emergencyContact: {}, createdAt: '', createdBy: '',
    };
    void saveEmployee(emp);
    void saveCandidate({ ...c, stage: 'hired', convertedEmployeeId: empId });

    // Tự sinh quy trình Onboarding cho nhân viên mới (tái dùng feature SOP).
    if (currentUser) {
      const steps: WorkflowStep[] = ONBOARDING_STEPS.map((s, i) => ({
        id: `ob${i}`, label: s.label, status: 'todo', output: s.output,
      }));
      const run: ProcessRun = {
        id: newRunId(),
        department: (c.department || 'dh_noidia') as Department,
        title: `Onboarding — ${c.fullName}`,
        steps,
        status: 'active',
        assignee: currentUser.u,
        startDate: new Date().toISOString().slice(0, 10),
      };
      void saveRun(run, currentUser.name);
    }

    setCandModal(null);
    toast(`✅ Đã tạo hồ sơ NV + quy trình onboarding cho ${c.fullName}.`);
  };

  const onDrop = (stage: CandidateStage) => {
    if (dragId) { void moveCandidate(dragId, stage); setDragId(null); }
  };

  return (
    <Box sx={{ p: embedded ? 0 : 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1.5} flexWrap="wrap" gap={1}>
        <Typography variant="h6" fontWeight={800}>🧑‍💼 Tuyển dụng</Typography>
        {canEdit && tab === 'jobs' && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setJobModal({ posting: null })}>Tin tuyển dụng</Button>}
        {canEdit && tab === 'pipeline' && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCandModal({ candidate: null })}>Thêm ứng viên</Button>}
      </Stack>

      {(loading || syncing) && <LinearProgress sx={{ mb: 1 }} />}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1.5 }}>
        <Tab value="pipeline" label={`Ứng viên (${candidates.length})`} />
        <Tab value="jobs" label={`Tin tuyển dụng (${postings.length})`} />
      </Tabs>

      {/* ── Kanban ứng viên ── */}
      {tab === 'pipeline' && (
        candidates.length === 0 ? (
          <Typography color="text.secondary">Chưa có ứng viên nào. Bấm “Thêm ứng viên”.</Typography>
        ) : (
          <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 1 }}>
            {CANDIDATE_STAGE_ORDER.map((stage) => {
              const list = byStage.get(stage) ?? [];
              return (
                <Box
                  key={stage}
                  onDragOver={(e) => { if (canEdit) e.preventDefault(); }}
                  onDrop={() => canEdit && onDrop(stage)}
                  sx={{ minWidth: 210, width: 210, flexShrink: 0, bgcolor: 'action.hover', borderRadius: 1.5, p: 1 }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                    <Typography fontWeight={700} fontSize={13} sx={{ color: STAGE_COLOR[stage] }}>{CANDIDATE_STAGE_LABEL[stage]}</Typography>
                    <Chip size="small" label={list.length} />
                  </Stack>
                  <Stack spacing={0.75}>
                    {list.map((c) => (
                      <Paper
                        key={c.id} variant="outlined"
                        draggable={canEdit}
                        onDragStart={() => setDragId(c.id)}
                        onClick={() => setCandModal({ candidate: c })}
                        sx={{ p: 1, cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }}
                      >
                        <Typography fontWeight={700} fontSize={13} noWrap>{c.fullName}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap component="div">
                          {c.position || (c.department ? DEPT_LABEL[c.department as keyof typeof DEPT_LABEL] : '') || '—'}
                        </Typography>
                        {c.rating ? <Rating size="small" value={c.rating} precision={0.5} readOnly /> : null}
                      </Paper>
                    ))}
                  </Stack>
                </Box>
              );
            })}
          </Box>
        )
      )}

      {/* ── Danh sách tin tuyển dụng ── */}
      {tab === 'jobs' && (
        postings.length === 0 ? (
          <Typography color="text.secondary">Chưa có tin tuyển dụng. Bấm “Tin tuyển dụng”.</Typography>
        ) : (
          <Stack spacing={0.75}>
            {postings.map((p) => {
              const applicants = candidates.filter((c) => c.postingId === p.id).length;
              return (
                <Stack
                  key={p.id} direction="row" alignItems="center" spacing={1.5}
                  sx={{ px: 1.5, py: 1, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={700} noWrap>{p.title}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {p.department ? DEPT_LABEL[p.department as keyof typeof DEPT_LABEL] : '—'}
                      {p.level ? ` · ${p.level}` : ''} · SL {p.headcount}
                      {p.salaryRange ? ` · ${p.salaryRange}` : ''}
                    </Typography>
                  </Box>
                  <Tooltip title="Số ứng viên gắn tin này"><Chip size="small" variant="outlined" label={`${applicants} UV`} /></Tooltip>
                  <Chip size="small" color={p.status === 'open' ? 'success' : p.status === 'closed' ? 'default' : 'warning'} label={JOB_STATUS_LABEL[p.status]} />
                  <IconButton size="small" onClick={() => setJobModal({ posting: p })}><EditIcon fontSize="small" /></IconButton>
                  {canEdit && <IconButton size="small" color="error" onClick={() => { if (window.confirm(`Xoá tin "${p.title}"?`)) void deletePosting(p.id); }}><DeleteOutlineIcon fontSize="small" /></IconButton>}
                </Stack>
              );
            })}
          </Stack>
        )
      )}

      {jobModal && (
        <JobPostingModal
          posting={jobModal.posting}
          canEdit={canEdit}
          onClose={() => setJobModal(null)}
          onSave={(p) => { void savePosting(p); setJobModal(null); }}
        />
      )}
      {candModal && (
        <CandidateModal
          candidate={candModal.candidate}
          postings={postings}
          canEdit={canEdit}
          reviewerName={currentUser?.name}
          onClose={() => setCandModal(null)}
          onSave={(c) => { void saveCandidate(c); setCandModal(null); }}
          onConvert={handleConvert}
          onDelete={(c) => { if (window.confirm(`Xoá ứng viên "${c.fullName}"?`)) { void deleteCandidate(c.id); setCandModal(null); } }}
        />
      )}

      {canEdit && tab === 'pipeline' && candidates.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Kéo-thả thẻ ứng viên giữa các cột để đổi giai đoạn. Mở thẻ để sửa & “Nhận việc”.
        </Typography>
      )}
    </Box>
  );
}
