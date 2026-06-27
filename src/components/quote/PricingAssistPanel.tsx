import { useMemo, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Collapse, Paper, Stack, Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { suggestPricing, type PricingVerdict } from './pricingAssist';
import { explainPricing } from '@/lib/dealAI';
import type { Template } from '@/types';

const VERDICT_META: Record<PricingVerdict, { color: string; hint: string }> = {
  'chưa đủ mẫu': { color: '#9aa0a6', hint: 'Chưa đủ báo giá thắng tương đương để gợi ý.' },
  'thấp biên': { color: '#2563eb', hint: 'Biên thấp hơn dải dễ thắng — có thể nâng giá để tăng lợi nhuận.' },
  'trong dải dễ thắng': { color: '#27ae60', hint: 'Biên đang nằm trong dải dễ thắng của tour tương đương.' },
  'cao rủi ro thua': { color: '#c0392b', hint: 'Biên cao hơn dải dễ thắng — rủi ro mất deal, cân nhắc giảm.' },
};

/** #5 — Gợi ý giá: đối chiếu biên hiện tại với dải biên báo giá THẮNG tương đương.
 *  Lõi heuristic; nút "✨ AI" (tùy chọn) diễn giải bằng lời. */
export function PricingAssistPanel({ template, dest, pax, currentMarginPct }: {
  template: Template; dest?: string; pax: number; currentMarginPct?: number;
}) {
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const visibleQuotes = useQuoteHistoryStore((s) => s.visibleQuotes);
  const [open, setOpen] = useState(false);
  const [ai, setAi] = useState<{ text: string; loading: boolean } | null>(null);

  const sug = useMemo(
    () => suggestPricing({ template, dest, pax, currentMarginPct }, visibleQuotes()),
    [quotes, template, dest, pax, currentMarginPct], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Chỉ chào mời khi có dữ liệu so sánh (tránh nhiễu cho báo giá hiếm).
  if (sug.sampleWon + sug.sampleLost === 0) return null;
  const vm = VERDICT_META[sug.verdict];

  const runAI = async () => {
    setAi({ text: '', loading: true });
    try {
      const text = await explainPricing({
        template, dest, pax, currentMarginPct: sug.currentMarginPct, wonBand: sug.wonBand,
        sampleN: sug.sampleWon, verdict: sug.verdict,
      });
      setAi({ text, loading: false });
    } catch (e) {
      setAi({ text: '❌ ' + (e as Error).message, loading: false });
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderColor: `${vm.color}55` }}>
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
        <Typography fontWeight={800} fontSize={13.5} sx={{ flex: 1 }}>💡 Gợi ý giá</Typography>
        <Chip size="small" label={sug.verdict} sx={{ height: 22, fontWeight: 700, bgcolor: `${vm.color}1a`, color: vm.color }} />
        <Button size="small" onClick={() => setOpen((v) => !v)}>{open ? 'Thu gọn' : 'Chi tiết'}</Button>
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{vm.hint}</Typography>

      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
        {typeof sug.currentMarginPct === 'number' && (
          <Chip size="small" variant="outlined" label={`Biên hiện tại ${sug.currentMarginPct.toFixed(1)}%`} sx={{ height: 20, fontWeight: 700 }} />
        )}
        {sug.wonBand && (
          <Chip size="small" variant="outlined"
            label={`Dải dễ thắng ${sug.wonBand[0].toFixed(1)}–${sug.wonBand[1].toFixed(1)}%`}
            sx={{ height: 20, color: '#27ae60', borderColor: 'rgba(39,174,96,0.4)' }} />
        )}
        <Chip size="small" variant="outlined" label={`${sug.sampleWon} thắng · ${sug.sampleLost} thua`} sx={{ height: 20, color: 'text.secondary' }} />
      </Stack>

      <Collapse in={open}>
        <Box sx={{ mt: 1.25 }}>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            {typeof sug.wonMedian === 'number' && <Mini label="Biên thắng (trung vị)" value={`${sug.wonMedian.toFixed(1)}%`} />}
            {typeof sug.lostMedian === 'number' && <Mini label="Biên thua (trung vị)" value={`${sug.lostMedian.toFixed(1)}%`} />}
          </Stack>
          <Button size="small" startIcon={<AutoAwesomeIcon sx={{ fontSize: 15 }} />} onClick={() => void runAI()} sx={{ mt: 1 }}>
            Giải thích bằng AI
          </Button>
          {ai && (
            <Box sx={{ mt: 1 }}>
              {ai.loading ? (
                <Stack direction="row" spacing={1} alignItems="center">
                  <CircularProgress size={16} /><Typography variant="caption" color="text.secondary">Đang hỏi AI…</Typography>
                </Stack>
              ) : (
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{ai.text}</Typography>
              )}
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography fontWeight={800} fontSize={15}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}
