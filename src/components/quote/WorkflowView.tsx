import { useEffect, useMemo, useState } from 'react';
import {
  Badge, Box, Button, Chip, LinearProgress, ListItemText, Menu, MenuItem, Paper, Stack,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import SyncIcon from '@mui/icons-material/Sync';
// exportWorkflowPDF nạp động khi bấm.
import EventIcon from '@mui/icons-material/Event';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import ViewListIcon from '@mui/icons-material/ViewList';
import ChecklistIcon from '@mui/icons-material/Checklist';
import ViewTimelineIcon from '@mui/icons-material/ViewTimeline';
import { useQuoteStore } from '@/stores/quoteStore';
import { useAuthStore } from '@/stores/authStore';
import { useContractStore } from '@/stores/contractStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { buildAllItems, buildSourceItems, computePaymentTotals, slugifyTourKey } from './paymentUtils';
import { getCATS } from './constants';
import {
  appendLog, applySignals, defaultWorkflow, fillDueDates, newWorkflowStep, setStepStatus, suggestionFor,
  workflowProgress, workflowSignals, WORKFLOW_STATUS_META, WORKFLOW_PRESET_META, type WorkflowPreset,
  isGate, approvalOf, unmetDeps, APPROVE_ACTION, playbookNotices,
} from './workflowConstants';
import { isApprover } from '@/auth/ROLES';
import { sbSendNotification } from '@/lib/supabase';
import { WorkflowKanban } from './WorkflowKanban';
import { WorkflowList } from './WorkflowList';
import { WorkflowChecklist } from './WorkflowChecklist';
import { WorkflowGantt } from './WorkflowGantt';
import { WorkflowStepDialog } from './WorkflowStepDialog';
import { WorkflowShareDialog } from './WorkflowShareDialog';
import type { WorkflowStatus, WorkflowStep } from '@/types';

type Mode = 'kanban' | 'list' | 'checklist' | 'gantt';
const MODE_KEY = 'vte_workflow_view';
const NO_STEPS: WorkflowStep[] = [];

export function WorkflowView() {
  const draft = useQuoteStore((s) => s.draft);
  const setWorkflow = useQuoteStore((s) => s.setWorkflow);
  const users = useAuthStore((s) => s.users);
  const currentUser = useAuthStore((s) => s.currentUser);
  const byName = currentUser?.name ?? '?';
  const nameOf = (u?: string) => users.find((x) => x.u === u)?.name ?? u ?? '';
  const contracts = useContractStore((s) => s.contracts);
  const visaProjects = useVisaProjectStore((s) => s.projects);
  const steps = draft.workflow ?? NO_STEPS;

  const tourName = draft.info.name ?? '';
  const tourKey = slugifyTourKey(tourName);
  const slot = usePaymentStore((s) => s.slots[tourKey]);

  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem(MODE_KEY) as Mode) || 'kanban');
  const [editing, setEditing] = useState<WorkflowStep | null>(null);
  const [presetEl, setPresetEl] = useState<null | HTMLElement>(null);
  const [pdfEl, setPdfEl] = useState<null | HTMLElement>(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    // Seed lần đầu: nội địa bỏ visa, còn lại dùng mẫu tiêu chuẩn.
    if (!useQuoteStore.getState().draft.workflow?.length) {
      setWorkflow(defaultWorkflow(draft.template === 'domestic' ? 'domestic' : 'standard'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!tourName.trim()) return;
    usePaymentStore.getState().ensureSubscribed(tourKey);
    return () => usePaymentStore.getState().releaseSubscription(tourKey);
  }, [tourKey, tourName]);

  const changeMode = (m: Mode | null) => { if (m) { setMode(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ } } };

  // Gom tín hiệu từ dữ liệu thật của báo giá.
  const signals = useMemo(() => {
    const cid = draft.currentQuoteId;
    const hasContract = !!cid && contracts.some((c) => c.linkedQuoteId === cid);
    const vp = cid ? visaProjects.find((p) => p.linkedQuoteId === cid) : undefined;
    let pay = { totalPaid: 0, totalRemaining: 0, totalCost: 0 };
    if (slot && draft.template) {
      const payments = slot.data.payments ?? {};
      const allItems = buildAllItems(buildSourceItems(draft, getCATS(draft.template)), payments, slot.data.customItems ?? [], draft.rates);
      const t = computePaymentTotals(allItems, payments);
      pay = { totalPaid: t.totalPaid, totalRemaining: t.totalRemaining, totalCost: t.totalCost };
    }
    return workflowSignals({
      quoteStatus: draft.status, hasContract, hasVisa: !!vp, visaCompleted: vp?.status === 'completed',
      paymentPaid: pay.totalPaid, paymentRemaining: pay.totalRemaining, paymentCost: pay.totalCost,
      departureDate: draft.info.startDate,
    });
  }, [draft, contracts, visaProjects, slot]);

  const suggestions = useMemo(() => {
    const m: Record<string, WorkflowStatus> = {};
    for (const s of steps) { const sug = suggestionFor(s, signals); if (sug) m[s.id] = sug; }
    return m;
  }, [steps, signals]);
  const suggCount = Object.keys(suggestions).length;

  // Playbook "chuyền gậy": khi 1 bước hoàn tất → nhắc người phụ trách bước kế.
  const firePlaybook = (updated: WorkflowStep[], id: string, status: WorkflowStatus) => {
    const notices = playbookNotices(updated, id, status, currentUser?.u ?? '', tourName);
    if (!notices.length) return;
    void Promise.all(notices.map((n) =>
      sbSendNotification(n.to, { type: 'task', title: n.title, message: n.message, createdBy: 'Hệ thống' }),
    )).catch(() => { /* best-effort, không chặn UI */ });
  };

  const update = (id: string, patch: Partial<WorkflowStep>) => {
    const before = steps.find((s) => s.id === id);
    let next = steps.map((s) => (s.id === id ? { ...s, ...patch } : s));
    if (patch.status) next = setStepStatus(next, id, patch.status);
    // Ghi nhật ký các thay đổi đáng kể.
    const acts: string[] = [];
    if (before) {
      if (patch.status && patch.status !== before.status) acts.push(`Trạng thái → ${WORKFLOW_STATUS_META[patch.status].label}`);
      if ('assignee' in patch && patch.assignee !== before.assignee) acts.push(patch.assignee ? `Giao cho ${nameOf(patch.assignee)}` : 'Bỏ người phụ trách');
      const nBefore = before.attachments?.length ?? 0;
      const nAfter = patch.attachments?.length ?? nBefore;
      if (nAfter !== nBefore) acts.push(nAfter > nBefore ? 'Đính kèm file' : 'Gỡ file đính kèm');
      if (!acts.length) acts.push('Cập nhật chi tiết');
    }
    next = next.map((s) => (s.id === id ? appendLog(s, acts, byName) : s));
    setWorkflow(next);
    if (patch.status) firePlaybook(next, id, patch.status);
  };
  const setStatus = (id: string, status: WorkflowStatus) => {
    const before = steps.find((s) => s.id === id);
    if (before && before.status === status) return;
    // Cổng phê duyệt & phụ thuộc bước — chỉ chặn khi HOÀN TẤT.
    let approve = false;
    if (status === 'done' && before) {
      if (isGate(before) && !approvalOf(before)) {
        if (!(currentUser && isApprover(currentUser.role))) {
          window.alert(`"${before.label}" là cổng phê duyệt — cần CEO/BGĐ/Trưởng Phòng duyệt trước khi hoàn tất. Nhờ người có quyền mở chi tiết bước để bấm "Phê duyệt".`);
          return;
        }
        if (!window.confirm(`"${before.label}" là cổng phê duyệt. Bạn (${currentUser.name}) phê duyệt & hoàn tất bước này?`)) return;
        approve = true;
      } else {
        const unmet = unmetDeps(before, steps);
        if (unmet.length && !window.confirm(`Bước "${before.label}" còn phụ thuộc bước chưa xong:\n• ${unmet.join('\n• ')}\n\nVẫn đánh dấu HOÀN TẤT?`)) return;
      }
    }
    // Tạm hoãn cần lý do — ghi vào ghi chú (nếu chưa có) + nhật ký.
    let reason: string | undefined;
    if (status === 'blocked' && !before?.note?.trim()) {
      const r = window.prompt('Lý do tạm hoãn bước này?');
      if (r == null) return;               // huỷ
      reason = r.trim();
      if (!reason) { window.alert('Cần nhập lý do để Tạm hoãn.'); return; }
    }
    let next = setStepStatus(steps, id, status);
    if (reason) next = next.map((s) => (s.id === id ? { ...s, note: s.note?.trim() ? s.note : reason } : s));
    const label = `Trạng thái → ${WORKFLOW_STATUS_META[status].label}${reason ? ` (${reason})` : ''}`;
    const actions = approve ? [APPROVE_ACTION, label] : [label];
    next = next.map((s) => (s.id === id ? appendLog(s, actions, byName) : s));
    setWorkflow(next);
    firePlaybook(next, id, status);
  };
  const del = (id: string) => { if (window.confirm('Xoá bước này khỏi quy trình?')) setWorkflow(steps.filter((s) => s.id !== id)); };
  const add = () => setWorkflow([...steps, newWorkflowStep()]);
  const applyPreset = (preset: WorkflowPreset) => {
    setPresetEl(null);
    if (window.confirm(`Áp mẫu "${WORKFLOW_PRESET_META[preset].label}"? Mọi bước đã thêm/sửa và trạng thái hiện tại sẽ bị thay thế.`)) {
      setWorkflow(defaultWorkflow(preset));
    }
  };
  const reorder = (from: number, to: number) => { const a = [...steps]; const [m] = a.splice(from, 1); a.splice(to, 0, m); setWorkflow(a); };
  const syncNow = () => setWorkflow(applySignals(steps, signals));
  const exportPdf = (lang: 'vi' | 'en') => {
    setPdfEl(null);
    if (!steps.length) { window.alert('Chưa có bước quy trình để xuất.'); return; }
    void import('@/lib/exports/exportWorkflowPDF').then((m) => m.exportWorkflowPDF(draft.info, steps, nameOf, lang));
  };
  const fillDue = () => {
    if (!draft.info.startDate) { window.alert('Báo giá chưa có ngày khởi hành — đặt ở phần thông tin tour trước.'); return; }
    setWorkflow(fillDueDates(steps, draft.info.startDate));
  };

  const prog = workflowProgress(steps);
  const current = steps.find((s) => s.status !== 'done');

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1200, mx: 'auto' }}>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5}>
          <Box sx={{ flex: 1, minWidth: 260 }}>
            <Typography fontWeight={900} fontSize={16}>🚦 Quy trình điều hành</Typography>
            <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mt: 0.75 }}>
              <Box sx={{ flex: 1, maxWidth: 320 }}>
                <LinearProgress variant="determinate" value={prog.pct} sx={{ height: 8, borderRadius: 4, '& .MuiLinearProgress-bar': { bgcolor: '#27ae60' } }} />
              </Box>
              <Typography variant="caption" fontWeight={800} color="text.secondary">{prog.done}/{prog.total} bước · {prog.pct}%</Typography>
            </Stack>
            {current && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                ▶ Bước hiện tại: <Chip size="small" label={current.label} sx={{ bgcolor: WORKFLOW_STATUS_META[current.status].color + '22', color: WORKFLOW_STATUS_META[current.status].color, fontWeight: 700, height: 20 }} />
              </Typography>
            )}
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Tooltip title="Tự điền Hạn cho các bước còn trống (ngược từ ngày khởi hành)">
              <Button variant="outlined" size="small" startIcon={<EventIcon />} onClick={fillDue}>Tự tính hạn</Button>
            </Tooltip>
            <Tooltip title="Đồng bộ trạng thái từ dữ liệu thật (báo giá/hợp đồng/visa/thanh toán) — chỉ nâng cấp, không ghi đè">
              <span>
                <Badge badgeContent={suggCount} color="warning">
                  <Button variant="outlined" size="small" startIcon={<SyncIcon />} onClick={syncNow} disabled={suggCount === 0}>Đồng bộ</Button>
                </Badge>
              </span>
            </Tooltip>
            <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, m) => changeMode(m)}>
              <ToggleButton value="kanban"><ViewKanbanIcon fontSize="small" sx={{ mr: 0.5 }} />Kanban</ToggleButton>
              <ToggleButton value="list"><ViewListIcon fontSize="small" sx={{ mr: 0.5 }} />List</ToggleButton>
              <ToggleButton value="checklist"><ChecklistIcon fontSize="small" sx={{ mr: 0.5 }} />Checklist</ToggleButton>
              <ToggleButton value="gantt"><ViewTimelineIcon fontSize="small" sx={{ mr: 0.5 }} />Gantt</ToggleButton>
            </ToggleButtonGroup>
            <Tooltip title="Xuất checklist quy trình ra PDF để in / bàn giao (chọn ngôn ngữ)">
              <Button variant="outlined" size="small" startIcon={<PictureAsPdfIcon />} onClick={(e) => setPdfEl(e.currentTarget)} sx={{ whiteSpace: 'nowrap' }}>Xuất PDF</Button>
            </Tooltip>
            <Menu anchorEl={pdfEl} open={!!pdfEl} onClose={() => setPdfEl(null)}>
              <MenuItem onClick={() => exportPdf('vi')}>🇻🇳 Tiếng Việt</MenuItem>
              <MenuItem onClick={() => exportPdf('en')}>🇬🇧 English (bàn giao đối tác)</MenuItem>
            </Menu>
            <Tooltip title="Chia sẻ tiến độ cho khách xem qua link (cần duyệt)">
              <Button variant="outlined" size="small" startIcon={<ShareOutlinedIcon />} onClick={() => setShareOpen(true)} sx={{ whiteSpace: 'nowrap' }}>Chia sẻ khách</Button>
            </Tooltip>
            <Tooltip title="Áp một mẫu quy trình theo loại tour (thay toàn bộ bước hiện tại)">
              <Button variant="outlined" size="small" color="warning" startIcon={<RestartAltIcon />} onClick={(e) => setPresetEl(e.currentTarget)} sx={{ whiteSpace: 'nowrap' }}>Mẫu quy trình</Button>
            </Tooltip>
            <Menu anchorEl={presetEl} open={!!presetEl} onClose={() => setPresetEl(null)}>
              {(Object.keys(WORKFLOW_PRESET_META) as WorkflowPreset[]).map((p) => (
                <MenuItem key={p} onClick={() => applyPreset(p)} sx={{ maxWidth: 320 }}>
                  <ListItemText primary={WORKFLOW_PRESET_META[p].label} secondary={WORKFLOW_PRESET_META[p].desc}
                    primaryTypographyProps={{ fontWeight: 700, fontSize: 14 }} secondaryTypographyProps={{ fontSize: 12 }} />
                </MenuItem>
              ))}
            </Menu>
            <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={add} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)', whiteSpace: 'nowrap' }}>Thêm bước</Button>
          </Stack>
        </Stack>
      </Paper>

      {mode === 'kanban' && <WorkflowKanban steps={steps} users={users} suggestions={suggestions} onMove={setStatus} onOpen={setEditing} />}
      {mode === 'list' && <WorkflowList steps={steps} users={users} suggestions={suggestions} onUpdate={update} onDelete={del} onReorder={reorder} />}
      {mode === 'checklist' && <WorkflowChecklist steps={steps} users={users} suggestions={suggestions} onSetStatus={setStatus} />}
      {mode === 'gantt' && <WorkflowGantt steps={steps} onOpen={setEditing} />}

      {editing && (
        <WorkflowStepDialog step={editing} users={users} onClose={() => setEditing(null)} onSave={(patch) => { update(editing.id, patch); setEditing(null); }} />
      )}
      {shareOpen && (
        <WorkflowShareDialog quoteId={draft.currentQuoteId ?? undefined} info={draft.info} steps={steps} onClose={() => setShareOpen(false)} />
      )}
    </Box>
  );
}
