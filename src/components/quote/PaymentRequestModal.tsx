import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  Avatar, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  ListItemButton, ListItemText, Menu, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { useAuthStore } from '@/stores/authStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { APPROVER_ROLES } from '@/auth/ROLES';
import { usePaymentStore } from '@/stores/paymentStore';
import { sbSendNotification, sbSendNotificationMany, sbEnsureNotifThread } from '@/lib/supabase';
import { uploadFileToWorker } from '@/lib/aiWorker';
import { openFilePreview } from '@/stores/filePreviewStore';
import { attMeta } from '@/lib/util';
import { slugifyTourKey } from './paymentUtils';
import { fmtVND } from './calc';
import type { PaymentRequestForm } from '@/lib/exports/exportPaymentRequestPDF';
import type {
  Installment, NotifLink, PaymentApprovalEntry, PaymentItem, QuoteInfo, TourPaymentApprovalData, User,
} from '@/types';

type Props = {
  open: boolean;
  onClose: () => void;
  ci: PaymentItem;
  inst: Installment;
  instIdx: number;
  info: QuoteInfo;
  currentUser: User;
  approvalEntry?: PaymentApprovalEntry;
};

export function PaymentRequestModal({
  open, onClose, ci, inst, instIdx, info, currentUser, approvalEntry,
}: Props) {
  const allUsers = useAuthStore((s) => s.users);
  const approverList = useMemo(
    () => allUsers.filter((u) => APPROVER_ROLES.includes(u.role)),
    [allUsers],
  );

  const tourKey = slugifyTourKey(info.name ?? '');

  const initialForm: PaymentRequestForm = {
    supplier: '',
    content: `Thanh toan ${inst.label.toLowerCase()} cho hang muc: ${ci.name}`,
    amount: +inst.amount || 0,
    approver1: '',
    approver1Username: '',
    approver2: '',
    approver2Username: '',
    requester: currentUser.name,
    note: '',
    attachments: [],
  };
  const [form, setForm] = useState<PaymentRequestForm>(initialForm);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const onPickFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      const at = new Date().toISOString();
      const uploaded = (await Promise.all(files.map((f) => uploadFileToWorker(f))))
        .map((u) => ({ ...u, uploadedBy: currentUser.name, uploadedAt: at }));
      setForm((p) => ({ ...p, attachments: [...(p.attachments ?? []), ...uploaded] }));
    } catch (err) {
      window.alert('❌ Tải file lỗi: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploading(false);
    }
  };
  const [anchor1, setAnchor1] = useState<HTMLElement | null>(null);
  const [anchor2, setAnchor2] = useState<HTMLElement | null>(null);

  // Pre-fill supplier from payment record; pre-fill approvers from existing entry.
  useEffect(() => {
    if (!open) return;
    const supplierFromRec = usePaymentStore.getState().getTour(tourKey).payments[ci.key]?.supplier ?? '';
    const a1 = approvalEntry?.intendedApprover1Name
      ?? (approvalEntry?.stage1?.approverName ?? '').split('(')[0].trim();
    const a1u = approvalEntry?.stage1?.approverUsername ?? '';
    const a2 = approvalEntry?.intendedApprover2Name
      ?? (approvalEntry?.stage2?.approverName ?? '').split('(')[0].trim();
    const a2u = approvalEntry?.stage2?.approverUsername ?? '';
    setForm({
      ...initialForm,
      supplier: supplierFromRec,
      approver1: a1 || '',
      approver1Username: a1u,
      approver2: a2 || '',
      approver2Username: a2u,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isReassign = !!(approvalEntry?.stage1 || approvalEntry?.finalStatus);
  const canSend = !!form.approver1Username && !!form.approver2Username && form.amount > 0 && !sending && !uploading;

  const setField = <K extends keyof PaymentRequestForm>(k: K, v: PaymentRequestForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleExport = () => {
    void import('@/lib/exports/exportPaymentRequestPDF').then((m) => m.exportPaymentRequestPDF(form, ci, info, currentUser, approvalEntry));
    onClose();
  };

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const approvalKey = `${tourKey}_${ci.key}_${instIdx}`;
      const threadId = `pay_${approvalKey}`;
      const quoteCloudId = useQuoteStore.getState().draft.currentQuoteId ?? undefined;
      const link: NotifLink | undefined = quoteCloudId
        ? { kind: 'payment', id: quoteCloudId, label: `${ci.name} · ${info.name || ''}`.trim() }
        : undefined;
      const data: TourPaymentApprovalData = {
        approvalKey,
        approvalStage: 1,
        requestedBy: currentUser.u,
        requestedByName: currentUser.name,
        tourName: info.name || '',
        tourKey,
        catName: ci.name,
        ciKey: ci.key,
        instIdx,
        supplier: form.supplier || '',
        amount: +form.amount || 0,
        content: form.content || '',
        approver1Username: form.approver1Username,
        approver1Name: form.approver1,
        approver2Username: form.approver2Username,
        approver2Name: form.approver2,
        threadId,
        ...(quoteCloudId ? { quoteCloudId } : {}),
        ...(form.attachments?.length ? { attachments: form.attachments } : {}),
      };

      // Shared activity — requester + both approvers subscribe; status + comments
      // are visible to all of them in place.
      const members = Array.from(new Set(
        [currentUser.u, form.approver1Username, form.approver2Username].filter(Boolean),
      ));
      // Best-effort: the shared activity thread powers 2-way status + comments,
      // but it must not block the actual request if the table is not yet
      // accessible (e.g. Supabase RLS not yet configured for notification_threads).
      try {
        await sbEnsureNotifThread({
          id: threadId,
          title: `Đề nghị thanh toán: ${ci.name}`,
          members,
          comments: [],
          createdAt: new Date().toISOString(),
          createdBy: currentUser.name,
          actType: 'payment_approval',
          status: 'pending',
          data: { ...data } as unknown as Record<string, unknown>,
          ...(link ? { link } : {}),
        });
      } catch (err) {
        console.warn('Tạo activity thread thất bại (rules?):', (err as Error).message);
      }

      // Actionable request → approver 1.
      await sbSendNotification(form.approver1Username, {
        type: 'payment_approval',
        title: '💰 Đề nghị xác nhận thanh toán NCC',
        message: `${currentUser.name} đề nghị duyệt: "${ci.name}" - ${form.supplier || '(NCC)'} - ${fmtVND(form.amount)} · Tour: ${info.name || ''}`,
        createdBy: `${currentUser.name} (${currentUser.role})`,
        data: { ...data } as unknown as Record<string, unknown>,
        threadId,
        ...(link ? { link } : {}),
      });

      // Mirror (no action buttons) → requester + approver 2 so they track status & comment.
      const others = members.filter((u) => u !== form.approver1Username);
      if (others.length) {
        await sbSendNotificationMany(others, {
          type: 'payment_approval',
          title: '📤 Đã gửi đề nghị thanh toán',
          message: `Đề nghị duyệt "${ci.name}" - ${fmtVND(form.amount)} · gửi ${form.approver1}${form.approver2 ? ` → ${form.approver2}` : ''}`,
          createdBy: currentUser.name,
          threadId,
          ...(link ? { link } : {}),
        });
      }
      onClose();
    } catch (e) {
      window.alert('❌ Lỗi gửi: ' + (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const renderApproverMenu = (
    anchor: HTMLElement | null,
    onAnchorClose: () => void,
    onPick: (name: string, username: string) => void,
    excludeUsername: string,
    allowClear: boolean,
  ) => (
    <Menu anchorEl={anchor} open={!!anchor} onClose={onAnchorClose}>
      {allowClear && (
        <MenuItem onClick={() => { onPick('', ''); onAnchorClose(); }}>
          <ListItemText primary="✕ Không chọn" sx={{ '& .MuiTypography-root': { fontStyle: 'italic', color: 'text.disabled' } }} />
        </MenuItem>
      )}
      {approverList
        .filter((a) => a.u !== excludeUsername)
        .map((a) => (
          <MenuItem
            key={a.u}
            onClick={() => { onPick(a.name, a.u); onAnchorClose(); }}
          >
            <Avatar sx={{ bgcolor: a.color || '#14a08c', width: 28, height: 28, fontSize: 12, mr: 1 }}>
              {(a.name || a.u)[0]}
            </Avatar>
            <ListItemText primary={a.name} secondary={a.role} />
          </MenuItem>
        ))}
    </Menu>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)', color: '#fff' }}>
        <Typography variant="h6" fontWeight={800}>📄 Phiếu đề nghị thanh toán</Typography>
        <Typography variant="caption" sx={{ opacity: 0.85 }}>
          Payment Request · {ci.catLabel}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.75} sx={{ pt: 1 }}>
          <TextField
            label="Nhà cung cấp / Người nhận"
            value={form.supplier}
            onChange={(e) => setField('supplier', e.target.value)}
            size="small" fullWidth
          />
          <TextField
            label="Nội dung đề nghị"
            value={form.content}
            onChange={(e) => setField('content', e.target.value)}
            size="small" fullWidth multiline minRows={2}
          />
          <TextField
            label="Số tiền (VND)"
            type="number"
            value={form.amount}
            onChange={(e) => setField('amount', +e.target.value)}
            size="small" fullWidth
          />

          <Box>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Người duyệt 1 <span style={{ color: '#dc3250' }}>*</span>
            </Typography>
            <ListItemButton
              onClick={(e) => setAnchor1(e.currentTarget)}
              sx={{ border: '1.5px solid', borderColor: form.approver1Username ? 'rgba(20,150,140,0.35)' : 'rgba(20,150,140,0.2)', borderRadius: 1.5, py: 0.75 }}
            >
              {form.approver1 ? (
                <Avatar sx={{ bgcolor: approverList.find((a) => a.u === form.approver1Username)?.color || '#14a08c',
                  width: 24, height: 24, fontSize: 11, mr: 1 }}>
                  {form.approver1[0]}
                </Avatar>
              ) : null}
              <ListItemText
                primary={form.approver1 || 'Chọn người duyệt 1...'}
                sx={{ '& .MuiTypography-root': { color: form.approver1 ? 'text.primary' : 'text.disabled' } }}
              />
            </ListItemButton>
            {renderApproverMenu(
              anchor1,
              () => setAnchor1(null),
              (name, u) => setForm((p) => ({ ...p, approver1: name, approver1Username: u })),
              form.approver2Username,
              false,
            )}
          </Box>

          <Box>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Người duyệt 2 <span style={{ color: '#dc3250' }}>*</span>
              <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400, color: 'rgba(15,58,74,0.4)' }}>
                · Nhận sau khi người duyệt 1 chấp thuận
              </span>
            </Typography>
            <ListItemButton
              onClick={(e) => setAnchor2(e.currentTarget)}
              sx={{ border: '1.5px solid', borderColor: form.approver2Username ? 'rgba(41,128,185,0.35)' : 'rgba(41,128,185,0.12)', borderRadius: 1.5, py: 0.75 }}
            >
              {form.approver2 ? (
                <Avatar sx={{ bgcolor: approverList.find((a) => a.u === form.approver2Username)?.color || '#2980b9',
                  width: 24, height: 24, fontSize: 11, mr: 1 }}>
                  {form.approver2[0]}
                </Avatar>
              ) : null}
              <ListItemText
                primary={form.approver2 || 'Chọn người duyệt 2...'}
                sx={{ '& .MuiTypography-root': { color: form.approver2 ? 'text.primary' : 'text.disabled' } }}
              />
            </ListItemButton>
            {renderApproverMenu(
              anchor2,
              () => setAnchor2(null),
              (name, u) => setForm((p) => ({ ...p, approver2: name, approver2Username: u })),
              form.approver1Username,
              true,
            )}
          </Box>

          <TextField
            label="Ghi chú (số TK, hình thức TT...)"
            value={form.note}
            onChange={(e) => setField('note', e.target.value)}
            size="small" fullWidth
            placeholder="VD: CK qua VCB - 0123456789 - Nguyễn Văn A"
          />

          {/* Tài liệu đính kèm (hoá đơn, hợp đồng, UNC… — nhiều file) */}
          <Box>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Tài liệu đính kèm (hoá đơn, hợp đồng… — nhiều file)
            </Typography>
            <Stack spacing={0.75}>
              {(form.attachments ?? []).map((att, i) => (
                <Stack key={att.key} direction="row" alignItems="center" spacing={1}>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Box
                      component="button" type="button" onClick={() => openFilePreview({ key: att.key, name: att.name })}
                      title={att.name}
                      sx={{
                        display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', p: 0,
                        fontSize: 13, fontWeight: 600, color: '#0d7a6a', fontFamily: 'inherit',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      📎 {att.name}
                    </Box>
                    {attMeta(att) && (
                      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', lineHeight: 1.3 }}>
                        {attMeta(att)}
                      </Typography>
                    )}
                  </Box>
                  <Button
                    size="small" color="error"
                    onClick={() => setForm((p) => ({ ...p, attachments: (p.attachments ?? []).filter((_, j) => j !== i) }))}
                  >
                    Gỡ
                  </Button>
                </Stack>
              ))}
              <Box>
                <Button
                  component="label" variant="outlined" size="small"
                  startIcon={uploading ? <CircularProgress size={14} /> : <span>📎</span>}
                  disabled={uploading || sending}
                >
                  {uploading
                    ? 'Đang tải lên…'
                    : (form.attachments?.length ? 'Thêm file' : 'Đính kèm file (PDF/ảnh/Excel…)')}
                  <Box
                    component="input" type="file" hidden multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*"
                    onChange={onPickFiles}
                  />
                </Button>
              </Box>
            </Stack>
          </Box>

          <Box sx={{ bgcolor: 'rgba(168,230,221,0.2)', borderRadius: 1.5, p: 1.5, fontSize: 13 }}>
            <Stack direction="row" justifyContent="space-between"><span>Hạng mục:</span><strong>{ci.name}</strong></Stack>
            <Stack direction="row" justifyContent="space-between"><span>Tổng chi phí khoản:</span><strong>{fmtVND(ci.amount)}</strong></Stack>
            <Stack direction="row" justifyContent="space-between" sx={{ pt: 0.75, mt: 0.75, borderTop: '1px solid rgba(20,150,140,0.2)' }}>
              <span style={{ fontWeight: 700, color: '#0d7a6a' }}>Số tiền đề nghị:</span>
              <strong style={{ color: '#dc3250', fontSize: 15 }}>{fmtVND(form.amount)}</strong>
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose}>Huỷ</Button>
        <Button onClick={handleExport} variant="outlined" color="primary">
          📄 Xuất PDF
        </Button>
        <Button
          onClick={handleSend}
          disabled={!canSend}
          variant="contained"
          color="warning"
        >
          {sending ? '⏳ Đang gửi...' : isReassign ? '🔄 Cập nhật người duyệt' : '📤 Gửi đề nghị'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
