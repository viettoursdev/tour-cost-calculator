import { useState } from 'react';
import {
  Alert, Avatar, Box, Button, Card, CardActionArea, CardContent, Dialog, DialogContent,
  DialogTitle, IconButton, Stack, Tooltip, Typography,
} from '@mui/material';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { TEMPLATES } from './constants';
import { TPL_ACCENT } from './templateStyle';
import { NewQuoteDialog } from './NewQuoteDialog';
import { useQuoteStore } from '@/stores/quoteStore';
import { useAuthStore } from '@/stores/authStore';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { VTE_LOGO } from '@/lib/exports/vteLogo';
import type { NewQuoteMeta, Template } from '@/types';

type Props = { open: boolean; onClose?: () => void; canCancel?: boolean };

export function TemplateSelectorModal({ open, onClose, canCancel = false }: Props) {
  // Narrow selectors — modal only needs to know whether a draft exists and whether
  // it has items. Subscribing to the whole `draft` would re-render this on every
  // keystroke in the cost view.
  const hasDraft = useQuoteStore((s) => s.draft.template !== null);
  const hasItems = useQuoteStore((s) => Object.keys(s.draft.items).length > 0);
  const cloudDirty = useQuoteStore((s) => s.cloudDirty);
  const newDraft = useQuoteStore((s) => s.newDraft);
  const currentUser = useAuthStore((s) => s.currentUser);
  const signOut = useAuthStore((s) => s.signOut);
  const [pendingConfirm, setPendingConfirm] = useState<Template | null>(null);
  // Báo giá nội địa/nước ngoài → mở bảng nhập thông tin trước khi tạo draft.
  const [metaTemplate, setMetaTemplate] = useState<'domestic' | 'intl' | null>(null);

  const isMetaTemplate = (k: Template): k is 'domestic' | 'intl' => k === 'domestic' || k === 'intl';

  const proceed = (key: Template) => {
    if (isMetaTemplate(key)) {
      setMetaTemplate(key);
    } else {
      newDraft(key);
      onClose?.();
    }
  };

  const handlePick = (key: Template) => {
    // Báo giá nội địa/nước ngoài: LUÔN mở bảng nhập thông tin trước (xác nhận thay
    // thế báo giá đang dở sẽ hỏi khi bấm "Tạo báo giá"). Các loại khác giữ cảnh báo
    // thay thế như cũ.
    if (isMetaTemplate(key)) {
      setMetaTemplate(key);
    } else if (hasDraft && hasItems) {
      setPendingConfirm(key);
    } else {
      proceed(key);
    }
  };

  const confirmReplace = () => {
    if (pendingConfirm) {
      const key = pendingConfirm;
      setPendingConfirm(null);
      proceed(key);
    }
  };

  const handleMetaConfirm = (template: 'domestic' | 'intl', meta: NewQuoteMeta) => {
    // Chỉ hỏi khi báo giá đang mở có thay đổi chưa lưu (tránh mất dữ liệu).
    if (hasItems && cloudDirty && !window.confirm('Báo giá hiện tại có thay đổi chưa lưu sẽ bị thay thế. Tiếp tục?')) return;
    newDraft(template, meta);
    setMetaTemplate(null);
    onClose?.();
  };

  return (
   <>
    <Dialog open={open} onClose={canCancel ? onClose : undefined} fullScreen>
      <DialogTitle
        sx={{
          background: 'linear-gradient(135deg,#0a5c50,#0d7a6a 45%,#14a08c)',
          color: '#fff',
          px: 5, py: 2.25,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative orbs (legacy public/legacy.html:2492–2493). */}
        <Box sx={{ position: 'absolute', right: -40, top: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', right: 60, bottom: -60, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />

        {/* Top bar: white logo + brand (with subtitle) · account / notifications / logout */}
        <Stack direction="row" alignItems="center" sx={{ position: 'relative' }} flexWrap="wrap" gap={1.5}>
          <Stack direction="row" alignItems="center" spacing={1.75} sx={{ flexGrow: 1, minWidth: 0 }}>
            <Box component="img" src={VTE_LOGO} alt="Viettours" sx={{ height: 38, width: 'auto', filter: 'brightness(0) invert(1)' }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.2 }} noWrap>
                Phần mềm quản lý - Viettours
              </Typography>
              <Typography sx={{ fontSize: 13, opacity: 0.82 }}>
                Hệ thống sẽ cấu hình yêu cầu dịch vụ phù hợp lựa chọn
              </Typography>
            </Box>
          </Stack>
          {currentUser && (
            <Stack direction="row" alignItems="center" spacing={1}>
              {canCancel && (
                <Button
                  onClick={onClose} startIcon={<ArrowBackIcon />}
                  sx={{ color: '#fff', textTransform: 'none', fontWeight: 700, background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.3)', '&:hover': { background: 'rgba(255,255,255,0.28)' } }}
                >
                  Đóng
                </Button>
              )}
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
                  onClick={() => { void signOut(); }}
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
      </DialogTitle>
      <DialogContent sx={{ background: 'linear-gradient(180deg,#f4faf9,#ffffff 60%)', pt: 4 }}>
        <Box sx={{ textAlign: 'center', mt: 2, mb: 0.5 }}>
          <Typography sx={{ fontSize: 24, fontWeight: 900, color: '#0f3a4a', letterSpacing: 0.2 }}>
            Bạn muốn tạo gì hôm nay?
          </Typography>
          <Typography sx={{ fontSize: 14, color: 'rgba(15,58,74,0.55)', mt: 0.5 }}>
            Chọn loại hồ sơ — hệ thống tự cấu hình quy trình & biểu mẫu phù hợp.
          </Typography>
          <Box sx={{ width: 56, height: 3, borderRadius: 3, background: 'linear-gradient(90deg,#0d7a6a,#14a08c)', mx: 'auto', mt: 1.5 }} />
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 3,
            mb: 5,
            mt: 4,
            maxWidth: 1200,
            mx: 'auto',
          }}
        >
          {(Object.values(TEMPLATES) as Array<typeof TEMPLATES[Template]>).map((tpl) => {
            const ac = TPL_ACCENT[tpl.key];
            return (
              <Card
                key={tpl.key}
                elevation={0}
                sx={{
                  position: 'relative', borderRadius: 3, overflow: 'hidden',
                  border: '1px solid rgba(15,58,74,0.08)',
                  background: '#fff',
                  transition: 'transform .28s cubic-bezier(.2,.8,.2,1), box-shadow .28s, border-color .28s',
                  boxShadow: '0 2px 10px rgba(15,58,74,0.05)',
                  '&:hover': {
                    transform: 'translateY(-6px)',
                    boxShadow: `0 20px 44px ${ac.accent}26`,
                    borderColor: `${ac.accent}55`,
                  },
                  '&:hover .tpl-badge': { transform: 'scale(1.08) rotate(-3deg)' },
                  '&:hover .tpl-go': { opacity: 1, transform: 'translateX(0)' },
                  '&:hover .tpl-bar': { opacity: 1 },
                }}
              >
                <Box className="tpl-bar" sx={{ height: 4, background: ac.grad, opacity: 0.75, transition: 'opacity .28s' }} />
                <CardActionArea onClick={() => handlePick(tpl.key)} sx={{ height: '100%', p: 2.5, alignItems: 'flex-start' }}>
                  <CardContent sx={{ p: 0, width: '100%' }}>
                    <Box
                      className="tpl-badge"
                      sx={{
                        width: 58, height: 58, borderRadius: '17px', mb: 1.75,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: ac.grad, color: '#fff',
                        boxShadow: `0 10px 24px ${ac.accent}55, inset 0 1px 0 rgba(255,255,255,0.45)`,
                        transition: 'transform .28s cubic-bezier(.2,.8,.2,1), box-shadow .28s',
                        '& svg': { fontSize: 30, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.18))' },
                      }}
                    >
                      <ac.Icon />
                    </Box>
                    <Typography sx={{ fontWeight: 800, fontSize: 15.5, color: '#0f3a4a', lineHeight: 1.3 }}>
                      {tpl.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.6, lineHeight: 1.55 }}>
                      {tpl.desc}
                    </Typography>
                    <Box className="tpl-go" sx={{ mt: 1.5, display: 'inline-flex', alignItems: 'center', gap: 0.4, color: ac.accent, fontWeight: 800, fontSize: 13, opacity: 0, transform: 'translateX(-6px)', transition: 'opacity .28s, transform .28s' }}>
                      Bắt đầu →
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            );
          })}
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

    {/* Render NGOÀI modal toàn màn hình để không bị lồng dialog (kẹt focus). */}
    {metaTemplate && (
      <NewQuoteDialog
        open
        initialTemplate={metaTemplate}
        onClose={() => setMetaTemplate(null)}
        onConfirm={handleMetaConfirm}
      />
    )}
   </>
  );
}
