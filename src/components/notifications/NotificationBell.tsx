import { useEffect, useMemo, useState } from 'react';
import {
  Badge, Box, Button, Chip, Divider, IconButton, Popover, Stack, Tooltip, Typography,
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useNotificationStore } from '@/stores/notificationStore';
import { isApprover } from '@/auth/ROLES';
import { useAuthStore } from '@/stores/authStore';
import { useContractStore } from '@/stores/contractStore';
import { usePaymentStore } from '@/stores/paymentStore';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import { fbSendNotification, fbSetApprovalStage, fbSetThreadStatus, fbSubscribeNotifThread } from '@/lib/firebase';
import { workerFileUrl } from '@/lib/aiWorker';
import { attMeta } from '@/lib/util';
import type { ActivityStatus, NotifLink, Notification, TourPaymentApprovalData } from '@/types';

const TYPE_COLOR: Record<string, string> = {
  payment_due:      '#f39c12',
  payment_approval: '#14A08C',
  collab_invite:    '#2980b9',
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending:        { label: '⏳ Chờ duyệt',        color: '#f39c12' },
  pending_stage2: { label: '⏳ Chờ duyệt bước 2',  color: '#e67e22' },
  approved:       { label: '✅ Đã duyệt',          color: '#27ae60' },
  rejected:       { label: '❌ Từ chối',           color: '#dc3250' },
  paid:           { label: '💸 Đã thanh toán',     color: '#16a085' },
};

const TYPE_SHORT: Record<string, string> = {
  payment_approval: '🧾 Duyệt chi', payment_due: '💰 Thanh toán', announcement: '📢 Thông báo',
  collab_comment: '💬 Cộng tác', collab_invite: '🤝 Mời', task: '✅ Yêu cầu',
};
const SOUND_KEY = 'vte_notif_sound';

export function NotificationBell() {
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount   = useNotificationStore((s) => s.unreadCount);
  const markAllRead   = useNotificationStore((s) => s.markAllRead);
  const markRead      = useNotificationStore((s) => s.markRead);
  const currentUser   = useAuthStore((s) => s.currentUser);
  const setCenterOpen = useNotificationStore((s) => s.setCenterOpen);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem(SOUND_KEY) !== 'off');

  const unreadByType = useMemo(() => {
    const m: Record<string, number> = {};
    notifications.forEach((n) => { if (!n.read) m[n.type] = (m[n.type] ?? 0) + 1; });
    return m;
  }, [notifications]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    try { localStorage.setItem(SOUND_KEY, next ? 'on' : 'off'); } catch { /* ignore */ }
  };

  if (!currentUser) return null;

  const canApprove = isApprover(currentUser.role);

  const handleMarkAllRead = () => {
    void markAllRead(currentUser.u);
  };

  return (
    <>
      <Tooltip title="Thông báo">
        <IconButton color="inherit" onClick={(e) => setAnchor(e.currentTarget)}>
          <Badge badgeContent={unreadCount} color="error" max={99}>
            <NotificationsIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        disableRestoreFocus
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ width: 380, maxHeight: 520, display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 1.5, pt: 1.5, pb: 0.5 }}>
            <Typography variant="subtitle1" fontWeight={700}>Thông báo</Typography>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Tooltip title={soundOn ? 'Tắt âm báo' : 'Bật âm báo'}>
                <IconButton size="small" onClick={toggleSound}>{soundOn ? '🔔' : '🔕'}</IconButton>
              </Tooltip>
              {unreadCount > 0 && (
                <Button size="small" onClick={handleMarkAllRead}>Đọc hết</Button>
              )}
            </Stack>
          </Stack>
          {Object.keys(unreadByType).length > 0 && (
            <Stack direction="row" sx={{ px: 1.5, pb: 1, flexWrap: 'wrap', gap: 0.5 }}>
              {Object.entries(unreadByType).map(([t, c]) => (
                <Chip
                  key={t} size="small" label={`${TYPE_SHORT[t] ?? '🔔'} ${c}`}
                  sx={{
                    height: 20, fontSize: 11, fontWeight: 700,
                    bgcolor: (TYPE_COLOR[t] ?? '#95a5a6') + '22', color: TYPE_COLOR[t] ?? '#95a5a6',
                  }}
                />
              ))}
            </Stack>
          )}
          <Divider />
          <Button
            fullWidth startIcon={<OpenInFullIcon />} size="small"
            onClick={() => { setCenterOpen(true); setAnchor(null); }}
            sx={{ justifyContent: 'flex-start', px: 1.5, py: 1, color: '#0d7a6a', fontWeight: 700, borderRadius: 0 }}
          >
            Mở trung tâm thông báo
          </Button>
          <Divider />
          <Box sx={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center', color: 'text.disabled' }}>
                <Typography variant="body2">Chưa có thông báo nào</Typography>
              </Box>
            ) : (
              notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notif={n}
                  canApprove={canApprove}
                  username={currentUser.u}
                  currentUserName={currentUser.name}
                  currentUserRole={currentUser.role}
                  onRead={() => void markRead(currentUser.u, n.id)}
                />
              ))
            )}
          </Box>
        </Box>
      </Popover>
    </>
  );
}

// ── Inline notification item ──

function NotificationItem({
  notif, canApprove, username, currentUserName, currentUserRole, onRead,
}: {
  notif: Notification;
  canApprove: boolean;
  username: string;
  currentUserName: string;
  currentUserRole: string;
  onRead: () => void;
}) {
  const updatePayments = useContractStore((s) => s.updatePayments);
  const [acting, setActing] = useState(false);
  const [acted, setActed] = useState(false);

  // Live status from the shared activity thread (if any) — lets every member's
  // bell hide the action buttons once the request is resolved by anyone.
  const [threadStatus, setThreadStatus] = useState<ActivityStatus | undefined>(undefined);
  useEffect(() => {
    if (!notif.threadId) { setThreadStatus(undefined); return; }
    return fbSubscribeNotifThread(notif.threadId, (t) => setThreadStatus(t?.status));
  }, [notif.threadId]);
  const resolved = threadStatus === 'approved' || threadStatus === 'rejected' || threadStatus === 'paid';

  const borderColor = TYPE_COLOR[notif.type] ?? '#95a5a6';
  const attachments = (notif.data as Partial<TourPaymentApprovalData> | undefined)?.attachments ?? [];
  const isTourPaymentApproval =
    notif.type === 'payment_approval'
    // Require approvalStage (a genuine request) — result/mirror notifs carry
    // approvalKey but no approvalStage and must NOT be actionable.
    && (notif.data as { approvalStage?: number } | undefined)?.approvalStage != null
    && canApprove
    && !acted && !resolved;
  // Contract-payment approvals (separate flow keyed by contractId).
  const isApprovalRequest =
    notif.type === 'payment_approval'
    && (notif.data as { contractId?: string } | undefined)?.contractId != null
    && canApprove && !acted;

  const handleTourPaymentApproval = async (approved: boolean) => {
    if (acting) return;
    setActing(true);
    try {
      const data = notif.data as unknown as TourPaymentApprovalData;
      const stage = data.approvalStage;
      if (stage !== 1 && stage !== 2) return; // guard: not a genuine approval request
      const status: 'approved' | 'rejected' = approved ? 'approved' : 'rejected';
      const approverLabel = `${currentUserName} (${currentUserRole})`;
      await fbSetApprovalStage(
        data.approvalKey, stage, status, username, approverLabel, '',
        {
          intendedApprover1Name: data.approver1Name,
          intendedApprover2Name: data.approver2Name,
        },
      );

      // Deep-link back to the quote's payment tab (rebuilt from the approval data).
      const link: NotifLink | undefined = data.quoteCloudId
        ? { kind: 'payment', id: data.quoteCloudId, label: `${data.catName} · ${data.tourName}` }
        : undefined;

      // Update the shared activity status so the requester + both approvers see
      // it live. Best-effort — must not block approval if notification_threads
      // is locked down (Firestore rules not yet deployed).
      if (data.threadId) {
        const newStatus: ActivityStatus =
          !approved ? 'rejected'
            : stage === 1 && data.approver2Username ? 'pending_stage2'
              : 'paid';
        try {
          await fbSetThreadStatus(data.threadId, newStatus, currentUserName);
        } catch (err) {
          console.warn('Cập nhật trạng thái activity thất bại (rules?):', (err as Error).message);
        }
      }

      // If stage 1 approved and stage 2 designated, forward to stage 2 approver.
      if (approved && stage === 1 && data.approver2Username) {
        const stage2Data: TourPaymentApprovalData = { ...data, approvalStage: 2 };
        await fbSendNotification(data.approver2Username, {
          type: 'payment_approval',
          title: '💰 Đề nghị duyệt (Stage 2) thanh toán NCC',
          message: `${data.requestedByName} đề nghị duyệt (stage 2): "${data.catName}" - ${data.supplier || '(NCC)'} - ${(data.amount || 0).toLocaleString('vi-VN')} đ · Tour: ${data.tourName}`,
          createdBy: approverLabel,
          data: { ...stage2Data } as unknown as Record<string, unknown>,
          ...(data.threadId ? { threadId: data.threadId } : {}),
          ...(link ? { link } : {}),
        });
      }

      // If final stage approved, mark installment paid in tour_payments.
      if (approved && stage === 2) {
        const store = usePaymentStore.getState();
        store.ensureSubscribed(data.tourKey);
        const tour = store.getTour(data.tourKey);
        const rec = tour.payments[data.ciKey] ?? {};
        const insts = [...(rec.installments ?? [])];
        if (insts[data.instIdx]) {
          insts[data.instIdx] = {
            ...insts[data.instIdx],
            status: 'paid',
            paidDate: new Date().toISOString().slice(0, 10),
          };
          store.setPayments(data.tourKey, {
            ...tour.payments,
            [data.ciKey]: { ...rec, installments: insts },
          });
        }
        store.releaseSubscription(data.tourKey);
      }

      // Reply to requester (links back to the shared activity thread).
      await fbSendNotification(data.requestedBy, {
        type: 'payment_approval',
        title: approved ? '✅ Thanh toán đã được duyệt' : '❌ Đề nghị thanh toán bị từ chối',
        message: `"${data.catName}" · ${(data.amount || 0).toLocaleString('vi-VN')} đ · Tour: ${data.tourName}`,
        createdBy: currentUserName,
        data: { approved, approvalKey: data.approvalKey, stage } as Record<string, unknown>,
        ...(data.threadId ? { threadId: data.threadId } : {}),
        ...(link ? { link } : {}),
      });

      setActed(true);
      onRead();
    } catch (e) {
      window.alert('❌ Lỗi: ' + (e as Error).message);
    } finally {
      setActing(false);
    }
  };

  const handleApproval = async (approved: boolean) => {
    if (acting) return;
    setActing(true);
    try {
      const data = notif.data as {
        contractId?: string; paymentId?: string; requestedBy?: string;
        paymentLabel?: string; amount?: number; contractNo?: string;
      };

      // 1. Update contract payment status
      if (data?.contractId && data?.paymentId) {
        const { contracts } = useContractStore.getState();
        const contract = contracts.find((c) => c.id === data.contractId);
        if (contract) {
          const today = new Date().toISOString().slice(0, 10);
          const updatedPayments = (contract.payments ?? []).map((p) =>
            p.id === data.paymentId
              ? {
                  ...p,
                  status: approved ? ('paid' as const) : ('pending' as const),
                  paidDate: approved ? today : undefined,
                }
              : p,
          );
          await updatePayments(data.contractId, updatedPayments);
        }
      }

      // 2. Send reply notification to requester
      if (data?.requestedBy) {
        await fbSendNotification(data.requestedBy, {
          type: 'payment_approval',
          title: approved ? '✅ Thanh toán đã được duyệt' : '❌ Đề nghị thanh toán bị từ chối',
          message: `HĐ #${data.contractNo || data.contractId} - "${data.paymentLabel}": ${(data.amount ?? 0).toLocaleString('vi-VN')} đ`,
          createdBy: currentUserName,
          data: { ...data, approved },
        });
      }

      // 3. Mark this notification as read
      await fbSendNotification(username, {
        type: 'payment_approval',
        title: approved ? '✅ Bạn đã duyệt thanh toán' : '❌ Bạn đã từ chối thanh toán',
        message: `HĐ #${(data?.contractNo) || data?.contractId}`,
        createdBy: currentUserName,
        data: { ...data, approved },
      });

      setActed(true);
      onRead();
    } catch (e) {
      window.alert('❌ Lỗi: ' + (e as Error).message);
    } finally {
      setActing(false);
    }
  };

  return (
    <Box
      sx={{
        borderLeft: `4px solid ${borderColor}`,
        bgcolor: notif.read ? 'inherit' : 'action.hover',
        px: 2, py: 1.5,
        borderBottom: '1px solid',
        borderBottomColor: 'divider',
        cursor: 'default',
      }}
      onClick={!notif.read ? onRead : undefined}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Typography variant="body2" fontWeight={notif.read ? 400 : 700} sx={{ flex: 1, mr: 1 }}>
          {notif.title}
        </Typography>
        {!notif.read && <Chip label="Mới" size="small" color="primary" sx={{ fontSize: 10, height: 18 }} />}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {notif.message}
      </Typography>
      {threadStatus && STATUS_META[threadStatus] && (
        <Chip
          size="small"
          label={STATUS_META[threadStatus].label}
          sx={{
            mt: 0.5, height: 20, fontSize: 11, fontWeight: 800,
            bgcolor: STATUS_META[threadStatus].color + '22', color: STATUS_META[threadStatus].color,
          }}
        />
      )}
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.25 }}>
        {new Date(notif.createdAt).toLocaleString('vi-VN')} · {notif.createdBy}
      </Typography>

      {attachments.length > 0 && (
        <Stack spacing={0.25} sx={{ mt: 0.75 }}>
          {attachments.map((a) => (
            <Box key={a.key}>
              <Box
                component="a"
                href={workerFileUrl(a.key)}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                sx={{
                  display: 'block', fontSize: 12, fontWeight: 600, color: '#0d7a6a', textDecoration: 'none',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                📎 {a.name}
              </Box>
              {attMeta(a) && (
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', lineHeight: 1.3 }}>
                  {attMeta(a)}
                </Typography>
              )}
            </Box>
          ))}
        </Stack>
      )}

      {isApprovalRequest && (
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Button
            size="small"
            color="success"
            variant="outlined"
            disabled={acting}
            onClick={(e) => { e.stopPropagation(); void handleApproval(true); }}
          >
            ✅ Duyệt
          </Button>
          <Button
            size="small"
            color="error"
            variant="outlined"
            disabled={acting}
            onClick={(e) => { e.stopPropagation(); void handleApproval(false); }}
          >
            ❌ Từ chối
          </Button>
        </Stack>
      )}
      {isTourPaymentApproval && (
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Button
            size="small"
            color="success"
            variant="outlined"
            disabled={acting}
            onClick={(e) => { e.stopPropagation(); void handleTourPaymentApproval(true); }}
          >
            ✅ Duyệt
          </Button>
          <Button
            size="small"
            color="error"
            variant="outlined"
            disabled={acting}
            onClick={(e) => { e.stopPropagation(); void handleTourPaymentApproval(false); }}
          >
            ❌ Từ chối
          </Button>
        </Stack>
      )}
      {acted && (
        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
          Đã xử lý
        </Typography>
      )}
    </Box>
  );
}
