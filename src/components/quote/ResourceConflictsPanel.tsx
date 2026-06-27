import { useMemo } from 'react';
import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { useGuideScheduleStore } from '@/stores/guideScheduleStore';
import { useInventoryStore } from '@/stores/inventoryStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { detectConflicts } from '@/lib/guideSchedule';
import { overdueAssetHoldings } from './resourceConflicts';

/** #F — Cảnh báo nguồn lực (bản gọn): trùng lịch HDV (tái dùng detectConflicts) +
 *  tài sản quá hạn hoàn trả (từ nhật ký kho). Gắn ở Bảng điều hành (ExecBoard). */
export function ResourceConflictsPanel() {
  const assignments = useGuideScheduleStore((s) => s.assignments);
  const assetLogs = useInventoryStore((s) => s.assetLogs);
  const assets = useInventoryStore((s) => s.assets);
  const setView = useQuoteStore((s) => s.setView);

  const guideRows = useMemo(() => {
    const guideName = new Map<string, string>();
    const tourName = new Map<string, string>();
    for (const a of Object.values(assignments)) {
      tourName.set(a.tourCloudId, a.tourName);
      for (const g of a.guides) guideName.set(g.id, g.name);
    }
    const allLegs = Object.values(assignments).flatMap((a) => a.legs);
    return detectConflicts(allLegs)
      .map((c) => ({
        guide: guideName.get(c.guideId) ?? c.guideId,
        tourA: tourName.get(c.legA.tourCloudId) ?? c.legA.tourCloudId,
        tourB: tourName.get(c.legB.tourCloudId) ?? c.legB.tourCloudId,
        kind: c.kind,
      }))
      // 'overlap' (chồng thật) lên trước 'buffer' (sát giờ).
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'overlap' ? -1 : 1));
  }, [assignments]);

  const overdue = useMemo(() => {
    const nameOf = (id: string) => assets.find((a) => a.id === id)?.name ?? id;
    return overdueAssetHoldings(assetLogs, nameOf, { graceDays: 7 });
  }, [assetLogs, assets]);

  if (guideRows.length === 0 && overdue.length === 0) return null;

  return (
    <Paper variant="outlined" sx={{ p: 1.75, mb: 2, borderColor: 'rgba(217,119,6,0.4)' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography fontWeight={800} fontSize={14} sx={{ flex: 1 }}>🧩 Cảnh báo nguồn lực</Typography>
        {guideRows.length > 0 && <Chip size="small" label={`${guideRows.length} trùng HDV`} sx={{ height: 22, fontWeight: 700, bgcolor: 'rgba(220,50,80,0.12)', color: '#dc3250' }} />}
        {overdue.length > 0 && <Chip size="small" label={`${overdue.length} tài sản quá hạn`} sx={{ height: 22, fontWeight: 700, bgcolor: 'rgba(217,119,6,0.14)', color: '#d97706' }} />}
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {guideRows.length > 0 && (
          <Box>
            <Stack direction="row" alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ flex: 1 }}>TRÙNG LỊCH HDV</Typography>
              <Button size="small" sx={{ minWidth: 0 }} onClick={() => setView('departures')}>Lịch HDV</Button>
            </Stack>
            <Stack spacing={0.5}>
              {guideRows.slice(0, 8).map((r, i) => (
                <Box key={i} sx={{ border: '1px solid', borderColor: r.kind === 'overlap' ? 'rgba(220,50,80,0.35)' : 'rgba(217,119,6,0.3)', borderRadius: 1.5, px: 1, py: 0.5 }}>
                  <Stack direction="row" alignItems="center" spacing={0.75}>
                    <Chip size="small" label={r.kind === 'overlap' ? 'Chồng' : 'Sát giờ'}
                      sx={{ height: 17, fontSize: 10.5, fontWeight: 700, bgcolor: r.kind === 'overlap' ? 'rgba(220,50,80,0.15)' : 'rgba(217,119,6,0.15)', color: r.kind === 'overlap' ? '#dc3250' : '#d97706' }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography fontSize={12.5} fontWeight={700} noWrap>{r.guide}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>{r.tourA} ↔ {r.tourB}</Typography>
                    </Box>
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        {overdue.length > 0 && (
          <Box>
            <Stack direction="row" alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ flex: 1 }}>TÀI SẢN QUÁ HẠN HOÀN TRẢ</Typography>
              <Button size="small" sx={{ minWidth: 0 }} onClick={() => setView('inventory')}>Kho</Button>
            </Stack>
            <Stack spacing={0.5}>
              {overdue.slice(0, 8).map((o) => (
                <Box key={o.assetId} sx={{ border: '1px solid rgba(217,119,6,0.3)', borderRadius: 1.5, px: 1, py: 0.5 }}>
                  <Stack direction="row" alignItems="center" spacing={0.75}>
                    <Chip size="small" label={`${o.daysHeld}n`} sx={{ height: 17, fontSize: 10.5, fontWeight: 700, bgcolor: 'rgba(217,119,6,0.15)', color: '#d97706' }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography fontSize={12.5} fontWeight={700} noWrap>{o.assetName}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>Tour {o.refLabel} · chưa hoàn trả</Typography>
                    </Box>
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
