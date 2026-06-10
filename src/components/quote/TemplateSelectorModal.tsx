import { useState } from 'react';
import {
  Alert, Avatar, Box, Button, Card, CardActionArea, CardContent, Dialog, DialogContent,
  DialogTitle, IconButton, Stack, Tooltip, Typography,
} from '@mui/material';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import { TEMPLATES } from './constants';
import { useQuoteStore } from '@/stores/quoteStore';
import { useAuthStore } from '@/stores/authStore';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { VTE_LOGO_WHITE } from '@/lib/exports/vteLogo';
import type { Template } from '@/types';

type Props = { open: boolean; onClose?: () => void; canCancel?: boolean };

export function TemplateSelectorModal({ open, onClose, canCancel = false }: Props) {
  // Narrow selectors — modal only needs to know whether a draft exists and whether
  // it has items. Subscribing to the whole `draft` would re-render this on every
  // keystroke in the cost view.
  const hasDraft = useQuoteStore((s) => s.draft.template !== null);
  const hasItems = useQuoteStore((s) => Object.keys(s.draft.items).length > 0);
  const newDraft = useQuoteStore((s) => s.newDraft);
  const currentUser = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);
  const [pendingConfirm, setPendingConfirm] = useState<Template | null>(null);

  const handlePick = (key: Template) => {
    if (hasDraft && hasItems) {
      setPendingConfirm(key);
    } else {
      newDraft(key);
      onClose?.();
    }
  };

  const confirmReplace = () => {
    if (pendingConfirm) {
      newDraft(pendingConfirm);
      setPendingConfirm(null);
      onClose?.();
    }
  };

  return (
    <Dialog open={open} onClose={canCancel ? onClose : undefined} fullScreen>
      <DialogTitle
        sx={{
          background: 'linear-gradient(135deg,#0a5c50,#0d7a6a 45%,#14a08c)',
          color: '#fff',
          px: 5, py: 3.25,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative orbs (legacy public/legacy.html:2492–2493). */}
        <Box sx={{ position: 'absolute', right: -40, top: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', right: 60, bottom: -60, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />

        {/* Top bar: white logo + brand · account / notifications / logout */}
        <Stack direction="row" alignItems="center" sx={{ position: 'relative', mb: 2.5 }} flexWrap="wrap" gap={1.5}>
          <Stack direction="row" alignItems="center" spacing={1.75} sx={{ flexGrow: 1, minWidth: 0 }}>
            <Box component="img" src={VTE_LOGO_WHITE} alt="Viettours" sx={{ height: 48, width: 'auto' }} />
            <Typography sx={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.2 }} noWrap>
              Phần mềm quản lý - Viettours
            </Typography>
          </Stack>
          {currentUser && (
            <Stack direction="row" alignItems="center" spacing={1}>
              {/* Account */}
              <Stack
                direction="row" alignItems="center" spacing={1}
                sx={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 5, pl: 0.5, pr: 1.5, py: 0.5 }}
              >
                <Avatar sx={{ width: 28, height: 28, bgcolor: currentUser.color || '#dc3250', fontSize: 13, fontWeight: 800 }}>
                  {currentUser.name.charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ lineHeight: 1.1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{currentUser.name}</Typography>
                  <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>{currentUser.role}</Typography>
                </Box>
              </Stack>
              {/* Notifications */}
              <NotificationBell />
              {/* Logout */}
              <Tooltip title="Đăng xuất">
                <IconButton
                  onClick={logout}
                  sx={{
                    color: '#fff', background: 'rgba(255,255,255,0.14)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    '&:hover': { background: 'rgba(220,50,80,0.5)' },
                  }}
                >
                  <PowerSettingsNewIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          )}
        </Stack>

        <Box sx={{ position: 'relative' }}>
          <Typography sx={{ fontSize: 24, fontWeight: 900, letterSpacing: 0.2 }}>
            🎯 Chọn yêu cầu Báo giá
          </Typography>
          <Typography sx={{ fontSize: 14, opacity: 0.82, mt: 0.75 }}>
            Hệ thống sẽ cấu hình yêu cầu dịch vụ phù hợp lựa chọn
          </Typography>
        </Box>
        {canCancel && (
          <Button onClick={onClose} sx={{ position: 'absolute', bottom: 20, right: 24, color: '#fff', background: 'rgba(255,255,255,0.16)', '&:hover': { background: 'rgba(255,255,255,0.28)' } }}>
            Đóng
          </Button>
        )}
      </DialogTitle>
      <DialogContent sx={{ background: 'linear-gradient(180deg,#f7fbfa,#ffffff)', pt: 4}}>


        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
            gap: 4,
            mb: 4,
            mt: 4
          }}
        >
          {(Object.values(TEMPLATES) as Array<typeof TEMPLATES[Template]>).map((tpl) => (
            <Card key={tpl.key} variant="outlined">
              <CardActionArea onClick={() => handlePick(tpl.key)} sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h3" sx={{ mb: 1 }}>{tpl.icon}</Typography>
                  <Typography fontWeight={700}>{tpl.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {tpl.desc}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>

        {pendingConfirm && (
          <Alert
            severity="warning"
            sx={{ mt: 3 }}
            action={
              <>
                <Button color="inherit" size="small" onClick={() => setPendingConfirm(null)}>
                  Huỷ
                </Button>
                <Button color="inherit" size="small" onClick={confirmReplace}>
                  Thay thế
                </Button>
              </>
            }
          >
            Báo giá hiện tại sẽ bị thay thế. Tiếp tục?
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
