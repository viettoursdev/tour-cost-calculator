import { useEffect, useState } from 'react';
import {
  Box, Button, Stack, Tab, Tabs, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useAuthStore } from '@/stores/authStore';
import { useLinkNavStore } from '@/stores/linkNavStore';
import { useVisaProcStore } from '@/stores/visaProcStore';
import { VisaCatalog } from './VisaCatalog';
import { VisaProcBuilder } from './VisaProcBuilder';
import { VisaProcManager } from './VisaProcManager';
import { VisaProjectManager } from './VisaProjectManager';
import { VisaPipeline } from './VisaPipeline';
import { VisaTimeline } from './VisaTimeline';
import { VisaDashboard } from './VisaDashboard';
import { VisaResultsDashboard } from './VisaResultsDashboard';
import { VisaGuestHistory } from './VisaGuestHistory';
import { canViewVisaReports } from './visaAccess';
import type { VisaProcDoc } from '@/types';

type Tab = 'projects' | 'pipeline' | 'timeline' | 'dashboard' | 'reports' | 'guests' | 'catalog' | 'procedures';

type Props = { onExit: () => void };

export function VisaApp({ onExit }: Props) {
  const [tab, setTab] = useState<Tab>('projects');
  const [editingProc, setEditingProc] = useState<VisaProcDoc | null>(null);
  const [pendingProjId, setPendingProjId] = useState<string | null>(null);
  const user = useAuthStore((s) => s.currentUser);
  const canReports = canViewVisaReports(user);

  const openProject = (id: string) => { setPendingProjId(id); setTab('projects'); };

  // Mở sâu một dự án / hồ sơ visa khi điều hướng từ hub liên kết hoặc tìm kiếm.
  useEffect(() => {
    const projId = useLinkNavStore.getState().consume('visaProject');
    if (projId) { setPendingProjId(projId); setTab('projects'); return; }
    const procId = useLinkNavStore.getState().consume('visaProc');
    if (procId) {
      setTab('procedures');
      void useVisaProcStore.getState().load(procId).then((full) => { if (full) setEditingProc(full); });
    }
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
      <Box sx={{ background: 'linear-gradient(135deg,#0a5c50,#0d7a6a 40%,#14a08c)', color: '#fff', px: 2.5, pt: 1.25 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={900} noWrap>🛂 Quản lý Visa</Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>
              Bảng giá visa &amp; hồ sơ thủ tục · đồng bộ Cloud
            </Typography>
          </Box>
          <Button size="small" color="inherit" variant="outlined" startIcon={<ArrowBackIcon />} onClick={onExit}
            sx={{ textTransform: 'none', fontWeight: 700, borderColor: 'rgba(255,255,255,0.55)' }}>
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
          <Tab value="pipeline" label="🧲 Điều phối" />
          <Tab value="timeline" label="🗓️ Timeline" />
          <Tab value="dashboard" label="📊 Tổng quan" />
          {canReports && <Tab value="reports" label="📈 Thống kê visa" />}
          <Tab value="guests" label="🔗 Lịch sử khách" />
          <Tab value="catalog" label="📋 Danh mục giá" />
          <Tab value="procedures" label="🗂️ Hồ sơ thủ tục" />
        </Tabs>
      </Box>

      {tab === 'projects' ? (
        <VisaProjectManager initialOpenId={pendingProjId} onConsumeInitial={() => setPendingProjId(null)} />
      ) : tab === 'pipeline' ? (
        <VisaPipeline onOpenProject={openProject} />
      ) : tab === 'timeline' ? (
        <VisaTimeline />
      ) : tab === 'dashboard' ? (
        <VisaDashboard />
      ) : tab === 'reports' ? (
        canReports ? <VisaResultsDashboard onOpenProject={openProject} /> : <VisaDashboard />
      ) : tab === 'guests' ? (
        <VisaGuestHistory />
      ) : tab === 'catalog' ? (
        <VisaCatalog />
      ) : (
        <VisaProcManager onOpenEditor={setEditingProc} />
      )}
    </Box>
  );
}
