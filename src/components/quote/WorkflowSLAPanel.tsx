import { useMemo, useState } from 'react';
import {
  Box, Button, Chip, LinearProgress, Paper, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, Tooltip, Typography,
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { sbGetQuoteProject } from '@/lib/supabase';
import { slaFromIndex, cycleStats, type StepCycle } from '@/lib/workflowSLA';
import type { WorkflowStep } from '@/types';

const SCAN_CAP = 200; // giới hạn quét sâu để tránh tải quá nhiều báo giá 1 lần

/** Phân tích SLA & nút thắt của Quy trình điều hành — nhúng trong view Điều phối. */
export function WorkflowSLAPanel() {
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const visibleQuotes = useQuoteHistoryStore((s) => s.visibleQuotes);

  const sla = useMemo(() => slaFromIndex(visibleQuotes()), [quotes]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxStuck = Math.max(1, ...sla.bottlenecks.map((b) => b.stuck));
  const top = sla.bottlenecks[0];

  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<{ done: number; total: number; capped: boolean } | null>(null);
  const [cycles, setCycles] = useState<StepCycle[] | null>(null);

  const deepScan = async () => {
    const withWf = visibleQuotes().filter((q) => q.workflowSummary && q.workflowSummary.total > 0);
    const targets = withWf.slice(0, SCAN_CAP);
    if (!targets.length) { window.alert('Chưa có báo giá nào có quy trình để phân tích.'); return; }
    setScanning(true);
    setScanned({ done: 0, total: targets.length, capped: withWf.length > SCAN_CAP });
    try {
      const workflows: WorkflowStep[][] = [];
      let done = 0;
      for (const q of targets) {
        const proj = await sbGetQuoteProject(q.cloudId).catch(() => null);
        const steps = proj?.currentState?.workflow;
        if (steps && steps.length) workflows.push(steps);
        done++;
        setScanned({ done, total: targets.length, capped: withWf.length > SCAN_CAP });
      }
      setCycles(cycleStats(workflows));
    } catch (e) {
      window.alert('❌ Quét sâu lỗi: ' + (e as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const maxAvg = Math.max(1, ...(cycles ?? []).map((c) => c.avgDays));
  const rateColor = (r: number | null) => (r == null ? 'text.disabled' : r >= 80 ? '#27ae60' : r >= 50 ? '#f5a623' : '#dc3250');

  return (
    <Box>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <Chip label={`${sla.totals.withWf} tour có quy trình`} />
        <Chip color="info" variant="outlined" label={`${sla.totals.running} đang chạy`} />
        <Chip color="error" variant={sla.totals.overdue ? 'filled' : 'outlined'} label={`${sla.totals.overdue} có bước quá hạn`} />
        <Chip variant="outlined" label={`Tiến độ TB ${sla.totals.avgDonePct}%`} />
      </Stack>

      {top && top.stuck > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderLeft: '4px solid #dc3250', display: 'flex', alignItems: 'center', gap: 1 }}>
          <BoltIcon sx={{ color: '#dc3250' }} />
          <Typography fontSize={14}>
            Nút thắt lớn nhất: <b>{top.label}</b> — {top.stuck} tour đang dừng ở bước này
            {top.stuckOverdue > 0 ? `, trong đó ${top.stuckOverdue} đã quá hạn` : ''}.
          </Typography>
        </Paper>
      )}

      {/* Nút thắt theo bước — tức thì từ chỉ mục */}
      <Typography fontWeight={800} fontSize={14} sx={{ mb: 0.5 }}>🚦 Tour đang kẹt ở bước nào</Typography>
      {sla.bottlenecks.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: 'text.disabled' }}>
          Chưa có dữ liệu. Quy trình được tổng hợp khi báo giá được <b>lưu cloud</b>.
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflowX: 'auto', mb: 3 }}>
          <Table size="small" sx={{ minWidth: 560, '& td, & th': { borderColor: 'rgba(0,0,0,0.06)' } }}>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 800, bgcolor: 'rgba(20,150,140,0.06)' } }}>
                <TableCell>Bước</TableCell>
                <TableCell sx={{ minWidth: 160 }}>Đang kẹt</TableCell>
                <TableCell align="right">Kẹt &amp; quá hạn</TableCell>
                <TableCell align="right">Lượt đến hạn còn tồn</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sla.bottlenecks.map((b) => (
                <TableRow key={b.label} hover>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13.5 }}>{b.label}</TableCell>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box sx={{ flex: 1, minWidth: 60 }}>
                        <LinearProgress variant="determinate" value={(b.stuck / maxStuck) * 100}
                          sx={{ height: 7, borderRadius: 4, '& .MuiLinearProgress-bar': { bgcolor: b.stuckOverdue ? '#dc3250' : '#14a08c' } }} />
                      </Box>
                      <Typography variant="caption" fontWeight={700} sx={{ width: 22 }}>{b.stuck}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    {b.stuckOverdue > 0 ? <Chip size="small" color="error" label={b.stuckOverdue} sx={{ height: 18, fontWeight: 700 }} /> : <Typography variant="caption" color="text.disabled">—</Typography>}
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="caption" fontWeight={700} sx={{ color: b.overdueDue ? '#dc3250' : 'text.disabled' }}>{b.overdueDue || '—'}</Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* Thời gian xử lý — quét sâu (đọc nhật ký từng báo giá) */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }} flexWrap="wrap" useFlexGap>
        <Typography fontWeight={800} fontSize={14} sx={{ flex: 1 }}>⏱ Thời gian xử lý mỗi bước (SLA)</Typography>
        <Button size="small" variant="outlined" startIcon={<TimerOutlinedIcon />} disabled={scanning} onClick={() => void deepScan()}>
          {scanning ? `Đang quét… ${scanned?.done ?? 0}/${scanned?.total ?? 0}` : cycles ? 'Quét lại' : 'Quét sâu (thời gian xử lý)'}
        </Button>
      </Stack>
      {scanning && <LinearProgress variant="determinate" value={scanned ? (scanned.done / scanned.total) * 100 : 0} sx={{ mb: 1, height: 6, borderRadius: 3 }} />}

      {cycles == null ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', color: 'text.disabled' }}>
          <Typography variant="caption">Bấm <b>Quét sâu</b> để tính thời gian xử lý trung bình & tỷ lệ đúng hạn của từng bước (đọc nhật ký từng báo giá — có thể mất chút thời gian).</Typography>
        </Paper>
      ) : cycles.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', color: 'text.disabled' }}>Chưa đủ nhật ký (Đang làm → Hoàn tất) để tính thời gian xử lý.</Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          {scanned?.capped && (
            <Typography variant="caption" color="warning.main" sx={{ display: 'block', p: 1 }}>
              ⚠ Chỉ quét {SCAN_CAP} báo giá gần nhất có quy trình (giới hạn để tránh tải quá nhiều).
            </Typography>
          )}
          <Table size="small" sx={{ minWidth: 620, '& td, & th': { borderColor: 'rgba(0,0,0,0.06)' } }}>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 800, bgcolor: 'rgba(20,150,140,0.06)' } }}>
                <TableCell>Bước</TableCell>
                <TableCell align="right">Số mẫu</TableCell>
                <TableCell sx={{ minWidth: 150 }}>TG xử lý TB</TableCell>
                <TableCell align="right">Median</TableCell>
                <TableCell align="right">% đúng hạn</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cycles.map((c) => (
                <TableRow key={c.label} hover>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13.5 }}>{c.label}</TableCell>
                  <TableCell align="right"><Typography variant="caption" color="text.secondary">{c.samples}</Typography></TableCell>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box sx={{ flex: 1, minWidth: 60 }}>
                        <LinearProgress variant="determinate" value={(c.avgDays / maxAvg) * 100}
                          sx={{ height: 7, borderRadius: 4, '& .MuiLinearProgress-bar': { bgcolor: '#7c3aed' } }} />
                      </Box>
                      <Typography variant="caption" fontWeight={700} sx={{ width: 52 }}>{c.avgDays} ngày</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell align="right"><Typography variant="caption">{c.medianDays} ngày</Typography></TableCell>
                  <TableCell align="right">
                    <Tooltip title={c.onTimeRate == null ? 'Chưa có bước done nào có Hạn' : `${c.doneWithDue - c.lateDone}/${c.doneWithDue} đúng hạn · ${c.lateDone} trễ`}>
                      <Typography variant="caption" fontWeight={800} sx={{ color: rateColor(c.onTimeRate) }}>
                        {c.onTimeRate == null ? '—' : `${c.onTimeRate}%`}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}
