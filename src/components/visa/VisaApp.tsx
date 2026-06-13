import { useEffect, useState } from 'react';
import {
  Box, Button, Stack, Tab, Tabs, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useAuthStore } from '@/stores/authStore';
import { useLinkNavStore } from '@/stores/linkNavStore';
import { VisaCatalog } from './VisaCatalog';
import { VisaProcBuilder } from './VisaProcBuilder';
import { VisaProcManager } from './VisaProcManager';
import { VisaProjectManager } from './VisaProjectManager';
import { VisaTimeline } from './VisaTimeline';
import { VisaDashboard } from './VisaDashboard';
import type { VisaProcDoc } from '@/types';

type Tab = 'projects' | 'timeline' | 'dashboard' | 'catalog' | 'procedures';

type Props = { onExit: () => void };

export function VisaApp({ onExit }: Props) {
  const [tab, setTab] = useState<Tab>('projects');
  const [editingProc, setEditingProc] = useState<VisaProcDoc | null>(null);
  const [pendingProjId, setPendingProjId] = useState<string | null>(null);
  const user = useAuthStore((s) => s.currentUser);

  // Mở sâu một dự án visa khi điều hướng từ hub "🔗 Liên kết" của báo giá.
  useEffect(() => {
    const id = useLinkNavStore.getState().consume('visaProject');
    if (id) { setPendingProjId(id); setTab('projects'); }
  }, []);

  if (!user) return null;

  if (editingProc) {
    return (
      <VisaProcBuilder
        initial={editingProc}
        user={user}
        onBack={() => setEditingProc(null)}
      />
    );
  }

  return (
    <Box sx={{ minHeight: '100%' }}>
      <Box sx={{ background: 'linear-gradient(135deg,#0a5c50,#0d7a6a 40%,#14a08c)', color: '#fff', px: 3, pt: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
          <Box>
            <Typography variant="h6" fontWeight={900}>🛂 Quản lý Visa</Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>
              Bảng giá visa &amp; hồ sơ thủ tục · đồng bộ Cloud
            </Typography>
          </Box>
          <Button color="inherit" variant="outlined" startIcon={<ArrowBackIcon />} onClick={onExit}>
            Quay lại
          </Button>
        </Stack>
        <Tabs
          value={tab}
          onChange={(_, v: Tab) => setTab(v)}
          sx={{
            mt: 1.5,
            '& .MuiTab-root': { color: '#fff', fontWeight: 700 },
            '& .MuiTab-root.Mui-selected': { color: '#fff', bgcolor: 'rgba(243,251,250,0.12)' },
            '& .MuiTabs-indicator': { bgcolor: '#fff' },
          }}
        >
          <Tab value="projects" label="📁 Dự án visa" />
          <Tab value="timeline" label="🗓️ Timeline" />
          <Tab value="dashboard" label="📊 Tổng quan" />
          <Tab value="catalog" label="📋 Danh mục giá" />
          <Tab value="procedures" label="🗂️ Hồ sơ thủ tục" />
        </Tabs>
      </Box>

      {tab === 'projects' ? (
        <VisaProjectManager initialOpenId={pendingProjId} onConsumeInitial={() => setPendingProjId(null)} />
      ) : tab === 'timeline' ? (
        <VisaTimeline />
      ) : tab === 'dashboard' ? (
        <VisaDashboard />
      ) : tab === 'catalog' ? (
        <VisaCatalog />
      ) : (
        <VisaProcManager onOpenEditor={setEditingProc} />
      )}
    </Box>
  );
}
