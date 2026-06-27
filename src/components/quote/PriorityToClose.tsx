import { useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, Paper, Stack, Tooltip, Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { fmtVND } from './calc';
import { WIN_BAND_META, type WinScore } from './winScore';
import { explainWinScore } from '@/lib/dealAI';
import type { CloudQuoteEntry } from '@/types';

export type ScoredDeal = { entry: CloudQuoteEntry; score: WinScore };

/** #3 — "Ưu tiên chốt": xếp hạng deal đang mở theo điểm khả năng chốt, kèm nút
 *  "✨ AI" (tùy chọn) diễn giải. Lõi điểm là heuristic; AI chỉ giải thích. */
export function PriorityToClose({ items, onOpen }: {
  items: ScoredDeal[];
  onOpen?: (entry: CloudQuoteEntry) => void;
}) {
  const [ai, setAi] = useState<{ name: string; text: string; loading: boolean } | null>(null);

  const runAI = async (d: ScoredDeal) => {
    setAi({ name: d.entry.name, text: '', loading: true });
    try {
      const text = await explainWinScore({
        name: d.entry.name, customer: d.entry.customerName, score: d.score.score,
        band: d.score.band, value: d.entry.totalCost ?? 0, factors: d.score.factors,
      });
      setAi({ name: d.entry.name, text, loading: false });
    } catch (e) {
      setAi({ name: d.entry.name, text: '❌ ' + (e as Error).message, loading: false });
    }
  };

  if (!items.length) return null;

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
      <Typography fontWeight={800} fontSize={13.5} sx={{ mb: 1 }}>🎯 Ưu tiên chốt</Typography>
      <Stack spacing={0.75}>
        {items.map((d) => {
          const bm = WIN_BAND_META[d.score.band];
          return (
            <Stack key={d.entry.cloudId} direction="row" alignItems="center" spacing={1}
              sx={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1.5, px: 1, py: 0.5 }}>
              <Tooltip title={d.score.factors.map((f) => `${f.label}: ${f.impact > 0 ? '+' : ''}${f.impact}`).join(' · ') || 'Không có yếu tố nổi bật'}>
                <Chip size="small" label={d.score.score} sx={{ height: 22, minWidth: 34, fontWeight: 800, bgcolor: `${bm.color}1a`, color: bm.color }} />
              </Tooltip>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography fontSize={12.5} fontWeight={700} noWrap
                  sx={{ cursor: onOpen ? 'pointer' : 'default' }} onClick={() => onOpen?.(d.entry)}>
                  {d.entry.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {d.entry.customerName || d.entry.createdByName} · {fmtVND(d.entry.totalCost ?? 0)}
                </Typography>
              </Box>
              <Button size="small" startIcon={<AutoAwesomeIcon sx={{ fontSize: 15 }} />} onClick={() => void runAI(d)} sx={{ minWidth: 0 }}>AI</Button>
            </Stack>
          );
        })}
      </Stack>

      <Dialog open={!!ai} onClose={() => setAi(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, fontSize: 15 }}>
          <AutoAwesomeIcon sx={{ fontSize: 17, mr: 0.5, verticalAlign: 'text-bottom', color: '#7c3aed' }} />
          Vì sao điểm này? — {ai?.name}
        </DialogTitle>
        <DialogContent>
          {ai?.loading ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 1 }}>
              <CircularProgress size={18} /><Typography variant="body2" color="text.secondary">Đang hỏi AI…</Typography>
            </Stack>
          ) : (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{ai?.text}</Typography>
          )}
        </DialogContent>
      </Dialog>
    </Paper>
  );
}
