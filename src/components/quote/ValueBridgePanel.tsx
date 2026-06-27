import { useMemo } from 'react';
import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { fmtVND } from './calc';
import { computeValueBridge, resolveMilestones, hasBridgeData, type Milestone } from './valueBridge';

/** #1 — Panel cầu nối biên 3 mốc cho MỘT hồ sơ tour (Cockpit/Tổng quan).
 *  Tự đọc index báo giá; chỉ hiện khi đủ dữ liệu & người dùng được xem giá. */
export function ValueBridgePanel({ tourProfileId, currentQuoteId, contractFallbackRevenue }: {
  tourProfileId?: string;
  currentQuoteId?: string;
  contractFallbackRevenue?: number;
}) {
  const quotes = useQuoteHistoryStore((s) => s.quotes);

  const bridge = useMemo(() => {
    const list = quotes.filter((q) =>
      (!!tourProfileId && q.tourProfileId === tourProfileId) || q.cloudId === currentQuoteId);
    if (!list.length) return null;
    const ss = list.find((q) => q.settlementSummary)?.settlementSummary;
    const ms = resolveMilestones(list, { currentId: currentQuoteId, settlementSummary: ss, contractFallbackRevenue });
    return computeValueBridge(ms);
  }, [quotes, tourProfileId, currentQuoteId, contractFallbackRevenue]);

  if (!bridge || !hasBridgeData(bridge)) return null;

  const rows: { label: string; m: Milestone; color: string }[] = [
    { label: 'Báo giá hiện tại', m: bridge.current, color: '#0d7a6a' },
    { label: 'Ký hợp đồng', m: bridge.contract, color: '#2563eb' },
    { label: 'Nghiệm thu', m: bridge.settlement, color: '#7c3aed' },
  ];
  const maxRev = Math.max(1, ...rows.map((r) => r.m.revenue ?? 0));

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography fontWeight={800} fontSize={13.5} sx={{ flex: 1 }}>📊 Biên lợi nhuận 3 mốc</Typography>
        {bridge.eroded && (
          <Chip size="small" icon={<WarningAmberIcon sx={{ fontSize: 15 }} />} label="Xói mòn biên"
            sx={{ height: 22, bgcolor: 'rgba(217,119,6,0.12)', color: '#d97706', fontWeight: 700 }} />
        )}
      </Stack>

      <Stack spacing={1}>
        {rows.map((r) => {
          const has = typeof r.m.revenue === 'number';
          return (
            <Box key={r.label}>
              <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.25 }}>
                <Typography fontSize={12.5} sx={{ flex: 1 }} color="text.secondary">{r.label}</Typography>
                <Typography fontSize={12.5} fontWeight={700}>{has ? fmtVND(r.m.revenue!) : '—'}</Typography>
                {typeof r.m.marginPct === 'number' && (
                  <Chip size="small" label={`biên ${r.m.marginPct.toFixed(1)}%`}
                    sx={{ height: 18, fontSize: 10.5, bgcolor: `${r.color}1a`, color: r.color, fontWeight: 700 }} />
                )}
              </Stack>
              <Box sx={{ height: 8, borderRadius: 4, bgcolor: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <Box sx={{ height: '100%', width: `${((r.m.revenue ?? 0) / maxRev) * 100}%`, bgcolor: r.color, borderRadius: 4 }} />
              </Box>
            </Box>
          );
        })}
      </Stack>

      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
        {typeof bridge.dRevContract === 'number' && (
          <DeltaChip label="HĐ vs báo giá" value={bridge.dRevContract} />
        )}
        {typeof bridge.dRevSettlement === 'number' && (
          <DeltaChip label="Nghiệm thu vs mốc trước" value={bridge.dRevSettlement} />
        )}
        {typeof bridge.marginErosionPct === 'number' && (
          <Chip size="small"
            label={`Biên ${bridge.marginErosionPct >= 0 ? '+' : ''}${bridge.marginErosionPct.toFixed(1)} điểm`}
            sx={{ height: 20, fontWeight: 700,
              bgcolor: bridge.marginErosionPct < 0 ? 'rgba(220,50,50,0.1)' : 'rgba(39,174,96,0.1)',
              color: bridge.marginErosionPct < 0 ? '#c0392b' : '#27ae60' }} />
        )}
      </Stack>
    </Paper>
  );
}

function DeltaChip({ label, value }: { label: string; value: number }) {
  const pos = value >= 0;
  return (
    <Chip size="small"
      label={`${label}: ${pos ? '+' : '−'}${fmtVND(Math.abs(value))}`}
      variant="outlined"
      sx={{ height: 20, fontWeight: 600, borderColor: pos ? 'rgba(39,174,96,0.4)' : 'rgba(220,50,50,0.4)',
        color: pos ? '#27ae60' : '#c0392b' }} />
  );
}
