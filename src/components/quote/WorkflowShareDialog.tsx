import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';
import { isApprover } from '@/auth/ROLES';
import {
  sbGetWorkflowLinkForQuote, sbRequestWorkflowLink, sbApproveWorkflowLink, sbRejectWorkflowLink,
  sbRevokeWorkflowLink, sbRefreshWorkflowPayload, sbSendNotification,
} from '@/lib/supabase';
import { buildPublicWorkflow, genWorkflowToken, workflowLinkUrl } from '@/lib/publicWorkflow';
import type { PublicWorkflowRecord, QuoteInfo, WorkflowStep } from '@/types';

type Props = { quoteId: string | undefined; info: QuoteInfo; steps: WorkflowStep[]; onClose: () => void };

const STATUS_LABEL: Record<string, { label: string; color: 'default' | 'success' | 'warning' | 'error' }> = {
  pending: { label: 'Chờ duyệt', color: 'warning' },
  approved: { label: 'Đang chia sẻ', color: 'success' },
  rejected: { label: 'Đã từ chối', color: 'error' },
  revoked: { label: 'Đã gỡ', color: 'default' },
};

/** Tạo/duyệt/gỡ link cho KHÁCH xem tiến độ vận hành tour (duyệt-trước). */
export function WorkflowShareDialog({ quoteId, info, steps, onClose }: Props) {
  const me = useAuthStore((s) => s.currentUser);
  const users = useAuthStore((s) => s.users);
  const iAmApprover = !!me && isApprover(me.role);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState<PublicWorkflowRecord | null>(null);
  const [note, setNote] = useState('');
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const refresh = useCallback(async () => {
    if (!quoteId) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await sbGetWorkflowLinkForQuote(quoteId);
      setRecord(r);
      if (r?.note) setNote(r.note);
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setLoading(false); }
  }, [quoteId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const status = record?.status;
  const link = record && status === 'approved' ? workflowLinkUrl(record.token) : null;
  const copy = () => { if (link) void navigator.clipboard?.writeText(link).then(() => toast('Đã copy link.')); };

  const buildDoc = (token: string) =>
    buildPublicWorkflow({ info, steps, token, quoteId: quoteId!, publishedBy: me!.name, note: note.trim() || undefined });

  const submit = async () => {
    if (!me || !quoteId) return;
    setBusy(true);
    try {
      const token = record?.token ?? genWorkflowToken();
      await sbRequestWorkflowLink({ token, doc: buildDoc(token), note: note.trim() || undefined, requestedByUsername: me.u, requestedByName: me.name });
      if (iAmApprover) {
        await sbApproveWorkflowLink(token);
        toast('✅ Đã tạo & duyệt — link cho khách đã hoạt động.', 'success');
      } else {
        toast('Đã gửi yêu cầu duyệt. Link hoạt động khi được duyệt.', 'success');
        // Báo cho những người có quyền duyệt.
        const approvers = users.filter((u) => u.u !== me.u && isApprover(u.role)).map((u) => u.u);
        await Promise.all(approvers.map((u) => sbSendNotification(u, {
          type: 'task', title: '🔗 Yêu cầu duyệt link tiến độ cho khách',
          message: `${me.name} xin chia sẻ tiến độ tour "${info.name || 'báo giá'}" cho khách — cần duyệt.`,
          createdBy: 'Hệ thống',
        }).catch(() => {})));
      }
      await refresh();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  };

  const approve = async () => {
    if (!record) return;
    setBusy(true);
    try { await sbApproveWorkflowLink(record.token); toast('✅ Đã duyệt — link cho khách đã hoạt động.', 'success'); await refresh(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const reject = async () => {
    if (!record || !rejectReason.trim()) return;
    setBusy(true);
    try { await sbRejectWorkflowLink(record.token, rejectReason.trim()); toast('Đã từ chối yêu cầu.'); setRejectMode(false); setRejectReason(''); await refresh(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const revoke = async () => {
    if (!record || !window.confirm('Gỡ link? Khách sẽ không xem được nữa.')) return;
    setBusy(true);
    try { await sbRevokeWorkflowLink(record.token); toast('Đã gỡ link.'); await refresh(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const refreshPayload = async () => {
    if (!record) return;
    setBusy(true);
    try { await sbRefreshWorkflowPayload(record.token, buildDoc(record.token)); toast('Đã cập nhật số liệu mới nhất cho khách.'); await refresh(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>🔗 Chia sẻ tiến độ cho khách</DialogTitle>
      <DialogContent dividers>
        {!quoteId ? (
          <Alert severity="info">Hãy <b>Lưu báo giá lên cloud</b> trước khi chia sẻ tiến độ cho khách.</Alert>
        ) : loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress sx={{ color: '#0d7a6a' }} /></Box>
        ) : (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Khách xem được: các <b>mốc + trạng thái + % tiến độ + ngày dự kiến</b>. KHÔNG lộ người phụ trách, ghi chú, rủi ro, nhà cung cấp hay nhật ký.
              {!iAmApprover && ' Link chỉ hoạt động sau khi được duyệt.'}
            </Typography>

            {status && (
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Chip size="small" color={STATUS_LABEL[status].color} label={STATUS_LABEL[status].label} />
                {record?.requestedByName && <Typography variant="caption" color="text.secondary">Yêu cầu: {record.requestedByName}</Typography>}
                {record?.approvedByName && status === 'approved' && <Typography variant="caption" color="text.secondary">· Duyệt: {record.approvedByName}</Typography>}
              </Stack>
            )}
            {status === 'rejected' && record?.rejectReason && <Alert severity="error">Bị từ chối: {record.rejectReason}</Alert>}

            {link && (
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField value={link} size="small" fullWidth InputProps={{ readOnly: true }} />
                <Tooltip title="Copy"><IconButton onClick={copy}><ContentCopyIcon fontSize="small" /></IconButton></Tooltip>
              </Stack>
            )}

            <TextField label="Ghi chú cho khách (tuỳ chọn)" value={note} onChange={(e) => setNote(e.target.value)} fullWidth multiline minRows={2} />

            {rejectMode && (
              <Stack spacing={1}>
                <TextField label="Lý do từ chối" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} fullWidth autoFocus />
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button size="small" onClick={() => setRejectMode(false)}>Huỷ</Button>
                  <Button size="small" color="error" variant="contained" disabled={busy || !rejectReason.trim()} onClick={() => void reject()}>Xác nhận từ chối</Button>
                </Stack>
              </Stack>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose} color="inherit">Đóng</Button>
        {quoteId && !loading && (
          <>
            {status === 'pending' && iAmApprover && !rejectMode && (
              <>
                <Button color="error" disabled={busy} onClick={() => setRejectMode(true)}>Từ chối</Button>
                <Button variant="contained" color="success" disabled={busy} onClick={() => void approve()}>Duyệt</Button>
              </>
            )}
            {status === 'approved' && (
              <>
                <Button color="error" disabled={busy} onClick={() => void revoke()}>Gỡ link</Button>
                <Button variant="outlined" disabled={busy} onClick={() => void refreshPayload()}>Cập nhật số liệu</Button>
              </>
            )}
            {(!status || status === 'rejected' || status === 'revoked') && (
              <Button variant="contained" disabled={busy || !steps.length} onClick={() => void submit()}
                sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
                {iAmApprover ? 'Tạo & duyệt link' : 'Gửi yêu cầu duyệt'}
              </Button>
            )}
            {status === 'pending' && !iAmApprover && (
              <Button variant="outlined" disabled={busy} onClick={() => void submit()}>Gửi lại yêu cầu</Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
