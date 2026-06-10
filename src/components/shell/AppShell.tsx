import { useState } from 'react';
import {
  AppBar, Avatar, Box, Button, IconButton, Stack,
  Tab, Tabs, Toolbar, Tooltip, Typography,
} from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import { RatesPanel } from '@/components/rates/RatesPanel';
import { QuoteView } from '@/components/quote/QuoteView';
import { CustomerView } from '@/components/customer/CustomerView';
import { NCCView } from '@/components/ncc/NCCView';
import { ContractView } from '@/components/contract/ContractView';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { UserManagementModal } from '@/components/admin/UserManagementModal';
import { RateCardSyncModal } from '@/components/admin/RateCardSyncModal';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { LEGACY } from '@/theme';

const TABS = [
  { key: 'rates', label: 'Rate Card' },
  { key: 'quote', label: 'Báo Giá' },
  { key: 'contract', label: 'Hợp Đồng' },
  { key: 'customer', label: 'Khách Hàng' },
  { key: 'ncc', label: 'NCC' },
] as const;
// 'payment' tab removed: PaymentView is a sub-view inside the Quote tab (same as Dashboard),
// not a standalone top-level tab in legacy. Payment tracking is accessible from
// the Hợp Đồng tab's accordion rows via PaymentPanel.

type TabKey = (typeof TABS)[number]['key'];

const isTabKey = (v: unknown): v is TabKey =>
  typeof v === 'string' && TABS.some((t) => t.key === v);

export function AppShell() {
  const [active, setActive] = useState<TabKey>('rates');
  const currentUser = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);
  const [userMgrOpen, setUserMgrOpen] = useState(false);
  const [rateSyncOpen, setRateSyncOpen] = useState(false);
  const canManageUsers = hasPerm(currentUser, 'manageUsers');

  // Legacy-style translucent pill button on the teal header bar.
  const pillSx = {
    color: '#fff', textTransform: 'none', fontWeight: 700, fontSize: 13,
    background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 2, px: 1.5, minWidth: 0,
    '&:hover': { background: 'rgba(255,255,255,0.26)' },
  } as const;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <AppBar position="static" color="primary" sx={{ background: LEGACY.headerGradient }}>
        <Toolbar sx={{ gap: 1 }}>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 800 }}>
            Viettours — Tour Cost Calculator
          </Typography>
          {currentUser && (
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
              {/* Tài khoản */}
              <Stack
                direction="row" alignItems="center" spacing={1}
                sx={{
                  background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: 5, pl: 0.5, pr: 1.5, py: 0.5,
                }}
              >
                <Avatar sx={{ width: 28, height: 28, bgcolor: '#dc3250', fontSize: 13, fontWeight: 800 }}>
                  {currentUser.name.charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ lineHeight: 1.1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{currentUser.name}</Typography>
                  <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>{currentUser.role}</Typography>
                </Box>
              </Stack>

              <Button startIcon={<CloudSyncIcon />} sx={pillSx} onClick={() => setRateSyncOpen(true)}>
                Master RC
              </Button>
              {canManageUsers && (
                <Button startIcon={<PeopleIcon />} sx={pillSx} onClick={() => setUserMgrOpen(true)}>
                  TK
                </Button>
              )}
              <NotificationBell />
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
        </Toolbar>
        <Tabs
          value={active}
          onChange={(_, v) => {
            if (isTabKey(v)) setActive(v);
          }}
          textColor="inherit"
          indicatorColor="secondary"
          variant="scrollable"
        >
          {TABS.map((t) => (
            <Tab key={t.key} value={t.key} label={t.label} />
          ))}
        </Tabs>
      </AppBar>
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {TABS.map((t) => {
          if (t.key !== active) return null;
          if (t.key === 'rates') return <RatesPanel key={t.key} />;
          if (t.key === 'quote') return <QuoteView key={t.key} />;
          if (t.key === 'customer') return <CustomerView key={t.key} />;
          if (t.key === 'contract') return <ContractView key={t.key} />;
          if (t.key === 'ncc') return <NCCView key={t.key} />;
        })}
      </Box>
      {userMgrOpen && currentUser && (
        <UserManagementModal
          open
          onClose={() => setUserMgrOpen(false)}
          currentUser={currentUser}
        />
      )}
      {rateSyncOpen && currentUser && (
        <RateCardSyncModal
          open
          onClose={() => setRateSyncOpen(false)}
          currentUser={currentUser}
        />
      )}
    </Box>
  );
}
