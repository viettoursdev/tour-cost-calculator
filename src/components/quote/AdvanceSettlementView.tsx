import { useState } from 'react';
import { Box, Tab, Tabs } from '@mui/material';
import { useAuthStore } from '@/stores/authStore';
import { canSeePrices } from '@/auth/quotePerms';
import { AdvanceView } from './AdvanceView';
import { SettlementView } from './SettlementView';

/** Gộp "Đề nghị tạm ứng" + "Quyết toán tour" vào một tab "Tạm ứng - Quyết toán".
 *  Tab Quyết toán chỉ hiện cho người được xem giá (giữ nguyên gating price-only cũ). */
export function AdvanceSettlementView() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const canSettle = canSeePrices(currentUser);
  const [tab, setTab] = useState<'advance' | 'settlement'>('advance');

  return (
    <Box>
      <Box sx={{ px: 2, pt: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab value="advance" label="Đề nghị tạm ứng" />
          {canSettle && <Tab value="settlement" label="Quyết toán tour" />}
        </Tabs>
      </Box>
      {tab === 'settlement' && canSettle ? <SettlementView /> : <AdvanceView />}
    </Box>
  );
}
