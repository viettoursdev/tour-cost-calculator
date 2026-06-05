import { useState } from 'react';
import {
  Badge, Box, Button, Chip, Divider, IconButton, Popover, Stack, Tooltip, Typography,
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useNotificationStore } from '@/stores/notificationStore';
import { useAuthStore } from '@/stores/authStore';
import { useContractStore } from '@/stores/contractStore';
import { fbSendNotification } from '@/lib/firebase';
import type { Notification } from '@/types';

const TYPE_COLOR: Record<string, string> = {
  payment_due:      '#f39c12',
  payment_approval: '#14A08C',
  collab_invite:    '#2980b9',
};

export function NotificationBell() {
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount   = useNotificationStore((s) => s.unreadCount);
  const markAllRead   = useNotificationStore((s) => s.markAllRead);
  const markRead      = useNotificationStore((s) => s.markRead);
  const currentUser   = useAuthStore((s) => s.currentUser);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (!currentUser) return null;

  const canApprove = ['CEO', 'Trưởng Phòng'].includes(currentUser.role);

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
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ width: 380, maxHeight: 520, display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={700}>Thông báo</Typography>
            {unreadCount > 0 && (
              <Button size="small" onClick={handleMarkAllRead}>Đọc hết</Button>
            )}
          </Stack>
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
  notif, canApprove, username, currentUserName, onRead,
}: {
  notif: Notification;
  canApprove: boolean;
  username: string;
  currentUserName: string;
  onRead: () => void;
}) {
  const updatePayments = useContractStore((s) => s.updatePayments);
  const [acting, setActing] = useState(false);
  const [acted, setActed] = useState(false);

  const borderColor = TYPE_COLOR[notif.type] ?? '#95a5a6';
  const isApprovalRequest = notif.type === 'payment_approval' && canApprove && !acted;

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
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.25 }}>
        {new Date(notif.createdAt).toLocaleString('vi-VN')} · {notif.createdBy}
      </Typography>

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
      {acted && (
        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
          Đã xử lý
        </Typography>
      )}
    </Box>
  );
}
