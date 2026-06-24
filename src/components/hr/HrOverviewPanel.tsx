import { useMemo, useState } from 'react';
import {
  Box, Button, Chip, Divider, Paper, Stack, Typography,
} from '@mui/material';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useHrGuideStore } from '@/stores/hrGuideStore';
import { useHrRecruitStore } from '@/stores/hrRecruitStore';
import { useHrEvalStore } from '@/stores/hrEvalStore';
import { DEPT_LABEL, DEPARTMENTS } from '@/auth/departments';
import { daysUntil } from '@/lib/dateUtils';
import { toast } from '@/stores/toastStore';
import { CANDIDATE_STAGE_LABEL, type HrEmployee } from '@/types';

const STUCK_DAYS = 14;
const deptLabel = (d: string) => (d ? (DEPT_LABEL[d as keyof typeof DEPT_LABEL] ?? d) : '—');
const daysSince = (iso?: string) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0);

function AlertCard({ icon, title, color, count, children }: {
  icon: React.ReactNode; title: string; color: string; count: number; children: React.ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, flex: '1 1 320px', minWidth: 300 }}>
      <Stack direction="row" alignItems="center" spacing={1} mb={1}>
        <Box sx={{ color }}>{icon}</Box>
        <Typography fontWeight={800} fontSize={14}>{title}</Typography>
        <Chip size="small" label={count} sx={{ ml: 'auto', bgcolor: count ? color : undefined, color: count ? '#fff' : undefined }} />
      </Stack>
      {count === 0 ? <Typography variant="body2" color="text.secondary">Không có.</Typography> : children}
    </Paper>
  );
}

export function HrOverviewPanel({ employees }: { employees: HrEmployee[] }) {
  const guides = useHrGuideStore((s) => s.guides);
  const candidates = useHrRecruitStore((s) => s.candidates);
  const evaluations = useHrEvalStore((s) => s.evaluations);
  const [exporting, setExporting] = useState(false);

  // Giấy tờ NV sắp/đã hết hạn (≤90 ngày).
  const docAlerts = useMemo(() => {
    const out: { emp: string; kind: string; name: string; days: number }[] = [];
    employees.forEach((e) => e.documents.forEach((d) => {
      const n = d.expiresAt ? daysUntil(d.expiresAt) : null;
      if (n !== null && n <= 90) out.push({ emp: e.fullName, kind: d.kind, name: d.name, days: n });
    }));
    return out.sort((a, b) => a.days - b.days);
  }, [employees]);

  // Thẻ HDV sắp/đã hết hạn.
  const cardAlerts = useMemo(() => {
    return guides
      .map((g) => ({ name: g.fullName, days: g.guideCardExpires ? daysUntil(g.guideCardExpires) : null }))
      .filter((x): x is { name: string; days: number } => x.days !== null && x.days <= 90)
      .sort((a, b) => a.days - b.days);
  }, [guides]);

  // Ứng viên kẹt > 14 ngày ở 1 giai đoạn (trừ Mới/Nhận việc/Loại).
  const stuck = useMemo(() => {
    return candidates
      .filter((c) => !['new', 'hired', 'rejected'].includes(c.stage))
      .map((c) => ({ name: c.fullName, stage: c.stage, days: daysSince(c.updatedAt ?? c.createdAt) }))
      .filter((c) => c.days >= STUCK_DAYS)
      .sort((a, b) => b.days - a.days);
  }, [candidates]);

  // Đánh giá: NV chính thức chưa có đánh giá nào.
  const noEval = useMemo(() => {
    const evaluated = new Set(evaluations.map((e) => e.employeeId));
    return employees.filter((e) => e.status !== 'resigned' && !evaluated.has(e.id));
  }, [employees, evaluations]);

  // Headcount theo phòng (NV chưa nghỉ).
  const headcount = useMemo(() => {
    const m = new Map<string, number>();
    employees.filter((e) => e.status !== 'resigned').forEach((e) => m.set(e.department, (m.get(e.department) ?? 0) + 1));
    return DEPARTMENTS.map((d) => ({ label: d.label, icon: d.icon, n: m.get(d.id) ?? 0 })).filter((x) => x.n > 0);
  }, [employees]);

  const onExport = async () => {
    setExporting(true);
    try {
      const { exportHrExcel } = await import('@/lib/exports/exportHrExcel');
      await exportHrExcel({ employees, guides, candidates });
      toast('📊 Đã xuất Excel nhân sự.');
    } catch (e) {
      window.alert('❌ Lỗi xuất Excel: ' + (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const dchip = (days: number) =>
    days < 0 ? <Chip size="small" color="error" label={`hết hạn ${-days}n`} />
      : days <= 30 ? <Chip size="small" color="error" variant="outlined" label={`${days}n`} />
        : <Chip size="small" color="warning" variant="outlined" label={`${days}n`} />;

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1.5} flexWrap="wrap" gap={1}>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          {headcount.map((h) => <Chip key={h.label} size="small" variant="outlined" label={`${h.icon} ${h.label}: ${h.n}`} />)}
        </Stack>
        <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={onExport} disabled={exporting}>
          {exporting ? 'Đang xuất…' : 'Xuất Excel'}
        </Button>
      </Stack>

      <Divider sx={{ mb: 1.5 }} />

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        <AlertCard icon={<DescriptionOutlinedIcon />} title="Giấy tờ NV sắp hết hạn" color="#f5a623" count={docAlerts.length}>
          <Stack spacing={0.5}>
            {docAlerts.slice(0, 8).map((a, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="center">
                {dchip(a.days)}
                <Typography variant="body2" noWrap>{a.emp} · {a.kind}{a.name ? ` (${a.name})` : ''}</Typography>
              </Stack>
            ))}
            {docAlerts.length > 8 && <Typography variant="caption" color="text.secondary">…và {docAlerts.length - 8} mục khác</Typography>}
          </Stack>
        </AlertCard>

        <AlertCard icon={<BadgeOutlinedIcon />} title="Thẻ HDV sắp hết hạn" color="#dc3250" count={cardAlerts.length}>
          <Stack spacing={0.5}>
            {cardAlerts.slice(0, 8).map((a, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="center">{dchip(a.days)}<Typography variant="body2" noWrap>{a.name}</Typography></Stack>
            ))}
            {cardAlerts.length > 8 && <Typography variant="caption" color="text.secondary">…và {cardAlerts.length - 8} mục khác</Typography>}
          </Stack>
        </AlertCard>

        <AlertCard icon={<HourglassBottomIcon />} title={`Ứng viên kẹt > ${STUCK_DAYS} ngày`} color="#7c3aed" count={stuck.length}>
          <Stack spacing={0.5}>
            {stuck.slice(0, 8).map((c, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="center">
                <Chip size="small" variant="outlined" label={`${c.days}n`} />
                <Typography variant="body2" noWrap>{c.name} · {CANDIDATE_STAGE_LABEL[c.stage]}</Typography>
              </Stack>
            ))}
          </Stack>
        </AlertCard>

        <AlertCard icon={<RateReviewOutlinedIcon />} title="Chưa có kỳ đánh giá" color="#2563eb" count={noEval.length}>
          <Stack spacing={0.5}>
            {noEval.slice(0, 8).map((e) => (
              <Typography key={e.id} variant="body2" noWrap>{e.fullName}{e.department ? ` · ${deptLabel(e.department)}` : ''}</Typography>
            ))}
            {noEval.length > 8 && <Typography variant="caption" color="text.secondary">…và {noEval.length - 8} người khác</Typography>}
          </Stack>
        </AlertCard>
      </Box>
    </Box>
  );
}
