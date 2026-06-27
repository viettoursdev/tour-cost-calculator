import { useMemo, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Collapse, LinearProgress, Paper, Stack, Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { useAuthStore } from '@/stores/authStore';
import { visibleVisaProjects } from './visaAccess';
import { applicantRisk, countryApprovalRates, deadlineRadar, RISK_BAND_META, type VisaRisk } from './visaRisk';
import { explainVisaRisk } from '@/lib/dealAI';
import type { VisaApplicant, VisaProjectDoc } from '@/types';

type Row = { project: VisaProjectDoc; applicant: VisaApplicant; risk: VisaRisk };

/** #E — Radar rủi ro visa: tỷ lệ đậu theo nước + khách rủi ro cao (xếp theo điểm)
 *  + mốc sắp/quá hạn. Lõi heuristic thuần; nút "✨ AI" (tùy chọn) diễn giải bằng lời. */
export function VisaRiskPanel({ onOpenProject }: { onOpenProject?: (id: string) => void }) {
  const allProjects = useVisaProjectStore((s) => s.projects);
  const user = useAuthStore((s) => s.currentUser);
  const [open, setOpen] = useState(true);
  const [aiFor, setAiFor] = useState<string | null>(null);
  const [ai, setAi] = useState<{ text: string; loading: boolean } | null>(null);

  const { rates, rows, dueSoon } = useMemo(() => {
    const projects = visibleVisaProjects(user, allProjects);
    const rates = countryApprovalRates(projects);
    const out: Row[] = [];
    for (const project of projects) {
      if (project.status === 'cancelled' || project.status === 'completed') continue;
      for (const a of project.applicants ?? []) {
        if (a.result === 'passed' || a.result === 'have_visa' || a.result === 'failed' || a.visaStatus === 'cancelled') continue;
        const risk = applicantRisk(a, project, rates);
        if (risk.band !== 'an toàn') out.push({ project, applicant: a, risk });
      }
    }
    out.sort((x, y) => y.risk.score - x.risk.score);
    return { rates, rows: out.slice(0, 12), dueSoon: deadlineRadar(projects, { windowDays: 21 }) };
  }, [allProjects, user]);

  const topCountries = useMemo(
    () => [...rates.entries()].filter(([, r]) => r.n >= 3).sort((a, b) => a[1].rate - b[1].rate).slice(0, 8),
    [rates],
  );

  if (rows.length === 0 && topCountries.length === 0 && dueSoon.length === 0) return null;

  const runAI = async (row: Row) => {
    setAiFor(row.applicant.id);
    setAi({ text: '', loading: true });
    try {
      const text = await explainVisaRisk({
        name: row.applicant.name, country: row.project.country,
        score: row.risk.score, band: row.risk.band, factors: row.risk.factors,
      });
      setAi({ text, loading: false });
    } catch (e) {
      setAi({ text: '❌ ' + (e as Error).message, loading: false });
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.75, mb: 2, borderColor: 'rgba(220,50,80,0.35)' }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography fontWeight={800} fontSize={14} sx={{ flex: 1 }}>🛟 Radar rủi ro visa</Typography>
        <Chip size="small" label={`${rows.length} khách cần chú ý`} sx={{ height: 22, fontWeight: 700, bgcolor: 'rgba(220,50,80,0.12)', color: '#dc3250' }} />
        <Button size="small" onClick={() => setOpen((v) => !v)}>{open ? 'Thu gọn' : 'Mở'}</Button>
      </Stack>

      <Collapse in={open}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mt: 1.25 }}>
          {/* Khách rủi ro cao nhất */}
          <Box>
            <Typography variant="caption" fontWeight={800} color="text.secondary">KHÁCH RỦI RO CAO NHẤT</Typography>
            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
              {rows.length === 0 && <Typography variant="caption" color="text.secondary">Không có khách rủi ro.</Typography>}
              {rows.map((row) => {
                const bm = RISK_BAND_META[row.risk.band];
                const isAi = aiFor === row.applicant.id;
                return (
                  <Box key={row.project.id + row.applicant.id} sx={{ border: '1px solid', borderColor: `${bm.color}44`, borderRadius: 1.5, px: 1, py: 0.5 }}>
                    <Stack direction="row" alignItems="center" spacing={0.75}>
                      <Box sx={{ minWidth: 34, textAlign: 'center' }}>
                        <Typography fontWeight={800} fontSize={14} sx={{ color: bm.color, lineHeight: 1 }}>{row.risk.score}</Typography>
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography fontSize={12.5} fontWeight={700} noWrap>{row.applicant.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {row.project.country} · {row.risk.factors[0]?.label ?? row.project.name}
                        </Typography>
                      </Box>
                      <Chip size="small" label={bm.label} sx={{ height: 18, fontSize: 11, fontWeight: 700, bgcolor: `${bm.color}1a`, color: bm.color }} />
                      <Button size="small" startIcon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />} sx={{ minWidth: 0 }} onClick={() => void runAI(row)}>AI</Button>
                      {onOpenProject && <Button size="small" sx={{ minWidth: 0 }} onClick={() => onOpenProject(row.project.id)}>Mở</Button>}
                    </Stack>
                    {isAi && ai && (
                      <Box sx={{ mt: 0.5, pl: 4.5 }}>
                        {ai.loading
                          ? <Stack direction="row" spacing={1} alignItems="center"><CircularProgress size={13} /><Typography variant="caption" color="text.secondary">Đang phân tích…</Typography></Stack>
                          : <Typography variant="caption" sx={{ whiteSpace: 'pre-wrap' }}>{ai.text}</Typography>}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Stack>
          </Box>

          {/* Tỷ lệ đậu theo nước + sắp đến hạn */}
          <Box>
            <Typography variant="caption" fontWeight={800} color="text.secondary">TỶ LỆ ĐẬU THEO NƯỚC (lịch sử)</Typography>
            <Stack spacing={0.5} sx={{ mt: 0.5, mb: 1.5 }}>
              {topCountries.length === 0 && <Typography variant="caption" color="text.secondary">Chưa đủ dữ liệu lịch sử.</Typography>}
              {topCountries.map(([c, r]) => (
                <Box key={c}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" fontWeight={600}>{c}</Typography>
                    <Typography variant="caption" color="text.secondary">{Math.round(r.rate * 100)}% (n={r.n})</Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={r.rate * 100}
                    sx={{ height: 6, borderRadius: 3, '& .MuiLinearProgress-bar': { bgcolor: r.rate >= 0.7 ? '#27ae60' : r.rate >= 0.5 ? '#d97706' : '#dc3250' } }} />
                </Box>
              ))}
            </Stack>

            {dueSoon.length > 0 && (
              <>
                <Typography variant="caption" fontWeight={800} color="text.secondary">MỐC SẮP / QUÁ HẠN (21 ngày)</Typography>
                <Stack spacing={0.25} sx={{ mt: 0.5 }}>
                  {dueSoon.slice(0, 6).map((d, i) => (
                    <Stack key={i} direction="row" spacing={0.5} alignItems="center">
                      <Chip size="small" label={d.overdue ? `quá ${-d.daysUntil}n` : `${d.daysUntil}n`}
                        sx={{ height: 16, fontSize: 10, fontWeight: 700, bgcolor: d.overdue ? 'rgba(220,50,80,0.15)' : 'rgba(217,119,6,0.15)', color: d.overdue ? '#dc3250' : '#d97706' }} />
                      <Typography variant="caption" noWrap sx={{ flex: 1, minWidth: 0 }}>{d.projectName}: {d.label}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </>
            )}
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
}
