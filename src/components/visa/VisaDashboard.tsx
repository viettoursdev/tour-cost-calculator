import { useMemo } from 'react';
import {
  Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material';
import { useAuthStore } from '@/stores/authStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { VISA_STATUS_META, VISA_STATUS_ORDER } from './constants';
import type { VisaProjectDoc } from '@/types';

type Agg = { projects: number; apply: number; passed: number; failed: number; haveVisa: number; pending: number };
const emptyAgg = (): Agg => ({ projects: 0, apply: 0, passed: 0, failed: 0, haveVisa: 0, pending: 0 });
function addAgg(a: Agg, p: VisaProjectDoc) {
  a.projects += 1;
  a.apply += p.applyCount; a.passed += p.passedCount; a.failed += p.failedCount;
  a.haveVisa += p.haveVisaCount; a.pending += p.pendingCount;
}
const passRate = (a: Agg) => (a.passed + a.failed > 0 ? Math.round((a.passed / (a.passed + a.failed)) * 100) : null);

export function VisaDashboard() {
  const projects = useVisaProjectStore((s) => s.projects);
  const users = useAuthStore((s) => s.users);
  const user = useAuthStore((s) => s.currentUser);
  const nameOf = (u: string) => users.find((x) => x.u === u)?.name ?? u;

  const visible = useMemo(() => {
    if (!user) return [];
    return projects.filter((p) =>
      user.role === 'CEO'
      || p.createdByUsername === user.u
      || (p.mainStaff ?? []).includes(user.u)
      || (p.supportStaff ?? []).includes(user.u)
      || (p.collaborators ?? []).includes(user.u));
  }, [projects, user]);

  const total = useMemo(() => { const a = emptyAgg(); visible.forEach((p) => addAgg(a, p)); return a; }, [visible]);

  const byStatus = useMemo(() => {
    const m = new Map<string, number>();
    visible.forEach((p) => m.set(p.status, (m.get(p.status) ?? 0) + 1));
    return m;
  }, [visible]);

  const byCountry = useMemo(() => {
    const m = new Map<string, Agg>();
    visible.forEach((p) => {
      const k = p.country || '(Chưa rõ)';
      if (!m.has(k)) m.set(k, emptyAgg());
      addAgg(m.get(k)!, p);
    });
    return [...m.entries()].sort((a, b) => b[1].apply - a[1].apply);
  }, [visible]);

  const byStaff = useMemo(() => {
    const m = new Map<string, Agg>();
    visible.forEach((p) => (p.mainStaff ?? []).forEach((u) => {
      if (!m.has(u)) m.set(u, emptyAgg());
      addAgg(m.get(u)!, p);
    }));
    return [...m.entries()].sort((a, b) => b[1].apply - a[1].apply);
  }, [visible]);

  if (!user) return null;

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      {/* KPI cards */}
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <Kpi label="Dự án" value={total.projects} color="#0f3a4a" />
        <Kpi label="Khách apply" value={total.apply} color="#0d7a6a" />
        <Kpi label="Đậu visa" value={total.passed} color="#27ae60" />
        <Kpi label="Rớt visa" value={total.failed} color="#dc3250" />
        <Kpi label="Đã có visa" value={total.haveVisa} color="#2563eb" />
        <Kpi label="Pending" value={total.pending} color="#a855f7" />
        <Kpi label="Tỉ lệ đậu" value={passRate(total) == null ? '—' : `${passRate(total)}%`}
          color={(passRate(total) ?? 0) >= 50 ? '#27ae60' : '#dc3250'} />
      </Stack>

      {/* Status breakdown */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>Trạng thái dự án</Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {VISA_STATUS_ORDER.map((s) => (
            <Chip key={s} label={`${VISA_STATUS_META[s].label}: ${byStatus.get(s) ?? 0}`}
              sx={{ bgcolor: VISA_STATUS_META[s].color + '22', color: VISA_STATUS_META[s].color, fontWeight: 700 }} />
          ))}
        </Stack>
      </Paper>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <BreakdownTable title="Theo quốc gia" head="Quốc gia" rows={byCountry} />
        <BreakdownTable title="Theo nhân sự phụ trách" head="Nhân sự" rows={byStaff} labelFn={nameOf} />
      </Stack>
    </Box>
  );
}

function Kpi({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.25, minWidth: 120, flex: 1, borderTop: `3px solid ${color}` }}>
      <Typography fontWeight={900} fontSize={26} sx={{ color, lineHeight: 1.1 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Paper>
  );
}

function BreakdownTable({
  title, head, rows, labelFn,
}: {
  title: string; head: string; rows: [string, Agg][]; labelFn?: (k: string) => string;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 0 }}>
      <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>{title}</Typography>
      {rows.length === 0 ? (
        <Typography color="text.disabled" variant="body2">Chưa có dữ liệu.</Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{head}</TableCell>
              <TableCell align="right">Dự án</TableCell>
              <TableCell align="right">Apply</TableCell>
              <TableCell align="right">Đậu</TableCell>
              <TableCell align="right">Rớt</TableCell>
              <TableCell align="right">Tỉ lệ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(([k, a]) => {
              const pr = passRate(a);
              return (
                <TableRow key={k}>
                  <TableCell sx={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {labelFn ? labelFn(k) : k}
                  </TableCell>
                  <TableCell align="right">{a.projects}</TableCell>
                  <TableCell align="right">{a.apply}</TableCell>
                  <TableCell align="right" sx={{ color: '#27ae60', fontWeight: 700 }}>{a.passed}</TableCell>
                  <TableCell align="right" sx={{ color: '#dc3250', fontWeight: 700 }}>{a.failed}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, color: (pr ?? 0) >= 50 ? '#27ae60' : '#dc3250' }}>
                    {pr == null ? '—' : `${pr}%`}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Paper>
  );
}
