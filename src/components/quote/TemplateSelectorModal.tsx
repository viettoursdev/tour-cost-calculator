import { useState } from 'react';
import {
  Alert, Avatar, Box, Button, Card, CardActionArea, CardContent, Dialog, DialogContent,
  DialogTitle, IconButton, Stack, Tooltip, Typography,
} from '@mui/material';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import { TEMPLATES } from './constants';
import { TPL_ACCENT } from './templateStyle';
import { useQuoteStore } from '@/stores/quoteStore';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { canViewStaffRole } from '@/auth/ROLES';
import { DEPT_LABEL } from '@/auth/departments';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { VTE_LOGO } from '@/lib/exports/vteLogo';
import type { Template } from '@/types';

type Props = { open: boolean; onClose?: () => void; canCancel?: boolean };

export function TemplateSelectorModal({ open, onClose, canCancel = false }: Props) {
  // Narrow selectors — modal only needs to know whether a draft exists and whether
  // it has items. Subscribing to the whole `draft` would re-render this on every
  // keystroke in the cost view.
  const hasDraft = useQuoteStore((s) => s.draft.template !== null);
  const hasItems = useQuoteStore((s) => Object.keys(s.draft.items).length > 0);
  const newDraft = useQuoteStore((s) => s.newDraft);
  const setView = useQuoteStore((s) => s.setView);
  const currentUser = useAuthStore((s) => s.currentUser);
  const signOut = useAuthStore((s) => s.signOut);
  const [pendingConfirm, setPendingConfirm] = useState<Template | null>(null);

  const canCust = hasPerm(currentUser, 'manageCustomers');
  const canNcc = hasPerm(currentUser, 'manageNCC');
  const canHR = hasPerm(currentUser, 'viewHR');
  const canInv = hasPerm(currentUser, 'manageInventory');
  const canTraining = hasPerm(currentUser, 'viewTraining');
  // Vào thẳng màn quản lý dùng chung (Khách hàng / NCC / Nhân sự / Kho / Đào tạo). Cần
  // có draft để render — chưa có thì tạo nháp báo giá nội địa (dữ liệu này độc lập).
  const gotoManage = (v: 'customer' | 'ncc' | 'hr' | 'inventory' | 'training') => {
    if (!hasDraft) newDraft('domestic');
    setView(v);
    onClose?.();
  };

  // Bấm thẻ Trang chủ → tạo báo giá & vào thẳng sheet. Popup "Tạo báo giá mới" CHỈ
  // bật từ nút ＋ trong sheet (QuoteView), không từ màn chọn loại hồ sơ này.
  const proceed = (key: Template) => {
    newDraft(key);
    onClose?.();
  };

  const handlePick = (key: Template) => {
    if (hasDraft && hasItems) {
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

  return (
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
                  {canViewStaffRole(currentUser) && (
                    <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>
                      {currentUser.role}{currentUser.department ? ` · ${DEPT_LABEL[currentUser.department]}` : ''}
                    </Typography>
                  )}
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

          {/* Thẻ Đào tạo (view, không phải template) — cạnh "Lịch đi tour HDV". */}
          {canTraining && (() => {
            const grad = 'linear-gradient(135deg, #0d7a6a, #14a08c)';
            const accent = '#0d7a6a';
            return (
              <Card
                elevation={0}
                sx={{
                  position: 'relative', borderRadius: 3, overflow: 'hidden',
                  border: '1px solid rgba(15,58,74,0.08)', background: '#fff',
                  transition: 'transform .28s cubic-bezier(.2,.8,.2,1), box-shadow .28s, border-color .28s',
                  boxShadow: '0 2px 10px rgba(15,58,74,0.05)',
                  '&:hover': {
                    transform: 'translateY(-6px)',
                    boxShadow: `0 20px 44px ${accent}26`,
                    borderColor: `${accent}55`,
                  },
                  '&:hover .tpl-badge': { transform: 'scale(1.08) rotate(-3deg)' },
                  '&:hover .tpl-go': { opacity: 1, transform: 'translateX(0)' },
                  '&:hover .tpl-bar': { opacity: 1 },
                }}
              >
                <Box className="tpl-bar" sx={{ height: 4, background: grad, opacity: 0.75, transition: 'opacity .28s' }} />
                <CardActionArea onClick={() => gotoManage('training')} sx={{ height: '100%', p: 2.5, alignItems: 'flex-start' }}>
                  <CardContent sx={{ p: 0, width: '100%' }}>
                    <Box
                      className="tpl-badge"
                      sx={{
                        width: 58, height: 58, borderRadius: '17px', mb: 1.75,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: grad, color: '#fff',
                        boxShadow: `0 10px 24px ${accent}55, inset 0 1px 0 rgba(255,255,255,0.45)`,
                        transition: 'transform .28s cubic-bezier(.2,.8,.2,1), box-shadow .28s',
                        '& svg': { fontSize: 30, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.18))' },
                      }}
                    >
                      <SchoolOutlinedIcon />
                    </Box>
                    <Typography sx={{ fontWeight: 800, fontSize: 15.5, color: '#0f3a4a', lineHeight: 1.3 }}>
                      Đào tạo
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.6, lineHeight: 1.55 }}>
                      Onboarding & nghiệp vụ nhân viên mới
                    </Typography>
                    <Box className="tpl-go" sx={{ mt: 1.5, display: 'inline-flex', alignItems: 'center', gap: 0.4, color: accent, fontWeight: 800, fontSize: 13, opacity: 0, transform: 'translateX(-6px)', transition: 'opacity .28s, transform .28s' }}>
                      Bắt đầu →
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            );
          })()}
        </Box>

        {(canCust || canNcc || canHR || canInv) && (
          <Box sx={{ maxWidth: 1200, mx: 'auto', mb: 5 }}>
            <Typography sx={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'rgba(15,58,74,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, mb: 1.5 }}>
              Quản lý danh mục
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap" useFlexGap>
              {canCust && (
                <Button onClick={() => gotoManage('customer')} startIcon={<PeopleAltOutlinedIcon />}
                  sx={{ textTransform: 'none', fontWeight: 800, fontSize: 14.5, px: 3, py: 1.25, borderRadius: 2.5,
                    color: '#0d7a6a', border: '1.5px solid rgba(13,122,106,0.35)', bgcolor: '#fff',
                    '&:hover': { bgcolor: 'rgba(13,122,106,0.06)', borderColor: '#0d7a6a' } }}>
                  Thông tin khách hàng
                </Button>
              )}
              {canNcc && (
                <Button onClick={() => gotoManage('ncc')} startIcon={<StorefrontOutlinedIcon />}
                  sx={{ textTransform: 'none', fontWeight: 800, fontSize: 14.5, px: 3, py: 1.25, borderRadius: 2.5,
                    color: '#7c3aed', border: '1.5px solid rgba(124,58,237,0.35)', bgcolor: '#fff',
                    '&:hover': { bgcolor: 'rgba(124,58,237,0.06)', borderColor: '#7c3aed' } }}>
                  Quản lý NCC
                </Button>
              )}
              {canHR && (
                <Button onClick={() => gotoManage('hr')} startIcon={<BadgeOutlinedIcon />}
                  sx={{ textTransform: 'none', fontWeight: 800, fontSize: 14.5, px: 3, py: 1.25, borderRadius: 2.5,
                    color: '#0369a1', border: '1.5px solid rgba(3,105,161,0.35)', bgcolor: '#fff',
                    '&:hover': { bgcolor: 'rgba(3,105,161,0.06)', borderColor: '#0369a1' } }}>
                  Nhân sự
                </Button>
              )}
              {canInv && (
                <Button onClick={() => gotoManage('inventory')} startIcon={<Inventory2OutlinedIcon />}
                  sx={{ textTransform: 'none', fontWeight: 800, fontSize: 14.5, px: 3, py: 1.25, borderRadius: 2.5,
                    color: '#0d7a6a', border: '1.5px solid rgba(13,122,106,0.35)', bgcolor: '#fff',
                    '&:hover': { bgcolor: 'rgba(13,122,106,0.06)', borderColor: '#0d7a6a' } }}>
                  Quản lý kho
                </Button>
              )}
            </Stack>
          </Box>
        )}

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
