import { useState } from 'react';
import { AppBar, Box, Button, Tab, Tabs, Toolbar, Typography } from '@mui/material';
import { RatesPanel } from '@/components/rates/RatesPanel';
import { QuoteView } from '@/components/quote/QuoteView';
import { CustomerView } from '@/components/customer/CustomerView';
import { NCCView } from '@/components/ncc/NCCView';
import { ContractView } from '@/components/contract/ContractView';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { useAuthStore } from '@/stores/authStore';

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
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <AppBar position="static" color="primary">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Viettours — Tour Cost Calculator
          </Typography>
          {currentUser && (
            <>
              <Typography variant="body2" sx={{ mr: 2 }}>
                {currentUser.name} ({currentUser.role})
              </Typography>
              <NotificationBell />
              <Button color="inherit" onClick={logout}>
                Đăng xuất
              </Button>
            </>
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
    </Box>
  );
}
