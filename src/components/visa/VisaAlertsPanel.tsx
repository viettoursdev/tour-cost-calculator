import { useMemo } from 'react';
import { Alert, Box, Chip, Paper, Stack, Typography } from '@mui/material';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { useAuthStore } from '@/stores/authStore';
import { visibleVisaProjects } from './visaAccess';
import { computeVisaAlerts, alertCounts, type VisaAlert, type VisaAlertKind } from './visaAlerts';

const KIND_META: Record<VisaAlertKind, { icon: string; label: string }> = {
  passport: { icon: '🛂', label: 'Hộ chiếu' },
  milestone: { icon: '⏰', label: 'Mốc trễ' },
  docs: { icon: '📄', label: 'Hồ sơ' },
  stuck: { icon: '🐢', label: 'Tiến độ' },
};
const SEV_COLOR = { high: '#dc3250', medium: '#f5a623' } as const;

/** Visa Đợt 4 — Bảng cảnh báo thông minh: gom hộ chiếu sắp hết hạn, mốc trễ, hồ
 *  sơ thiếu sát ngày đi, dự án kẹt. Bấm để mở dự án liên quan. */
export function VisaAlerts({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const projects = useVisaProjectStore((s) => s.projects);
  const user = useAuthStore((s) => s.currentUser);
  const today = new Date().toISOString().slice(0, 10);

  const alerts = useMemo(
    () => computeVisaAlerts(visibleVisaProjects(user, projects), today),
    [projects, user, today],
  );
  const counts = alertCounts(alerts);

  // Gom cảnh báo theo bộ hồ sơ (dự án) để hiển thị gọn.
  const byProject = useMemo(() => {
    const m = new Map<string, { name: string; country: string; requestName: string; items: VisaAlert[] }>();
    for (const a of alerts) {
      const g = m.get(a.projectId) ?? { name: a.projectName, country: a.country, requestName: a.requestName, items: [] };
      g.items.push(a);
      m.set(a.projectId, g);
    }
    return [...m.entries()];
  }, [alerts]);

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2 }, maxWidth: 900, mx: 'auto' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Typography fontWeight={900} fontSize={16}>⚠️ Cảnh báo quy trình visa</Typography>
        <Chip size="small" label={`${counts.high} khẩn`} sx={{ bgcolor: SEV_COLOR.high + '22', color: SEV_COLOR.high, fontWeight: 700 }} />
        <Chip size="small" label={`${counts.medium} lưu ý`} sx={{ bgcolor: SEV_COLOR.medium + '22', color: SEV_COLOR.medium, fontWeight: 700 }} />
      </Stack>

      {alerts.length === 0 ? (
        <Alert severity="success">Không có cảnh báo nào — mọi dự án visa đang trong tầm kiểm soát. ✅</Alert>
      ) : (
        <Stack spacing={1.25}>
          {byProject.map(([id, g]) => (
            <Paper key={id} variant="outlined" sx={{ p: 1.5, cursor: 'pointer', '&:hover': { boxShadow: 2 } }} onClick={() => onOpenProject(id)}>
              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75 }} flexWrap="wrap" useFlexGap>
                <Typography fontWeight={800} fontSize={14}>{g.name}</Typography>
                {g.country && <Chip size="small" label={g.country} sx={{ height: 18, fontSize: 11 }} />}
                {g.requestName && <Chip size="small" label={`📋 ${g.requestName}`} sx={{ height: 18, fontSize: 11 }} />}
              </Stack>
              <Stack spacing={0.5}>
                {g.items.map((a, i) => (
                  <Stack key={i} direction="row" spacing={1} alignItems="center">
                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: SEV_COLOR[a.severity], flex: '0 0 auto' }} />
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      <Typography component="span" sx={{ fontWeight: 700, color: SEV_COLOR[a.severity] }}>
                        {KIND_META[a.kind].icon} {KIND_META[a.kind].label}:
                      </Typography>{' '}
                      {a.message}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Box>
  );
}
