import { useMemo, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem,
  Select, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { NCC_SECTORS } from './constants';
import { suggestNcc, NCC_BAND_META } from './nccScore';
import type { Ncc } from '@/types';

/** #B — Gợi ý nhà cung cấp cho một nhu cầu dịch vụ: chọn lĩnh vực + địa điểm →
 *  xếp hạng NCC theo điểm tổng hợp (sao + tần suất + thâm niên + trạng thái). */
export function NccSuggestDialog({ open, suppliers, onClose, onOpenNcc }: {
  open: boolean;
  suppliers: Ncc[];
  onClose: () => void;
  onOpenNcc: (ncc: Ncc) => void;
}) {
  const [sector, setSector] = useState('');
  const [location, setLocation] = useState('');

  const results = useMemo(
    () => (open ? suggestNcc(suppliers, { sector, location }, { limit: 12 }) : []),
    [open, suppliers, sector, location],
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>🎯 Gợi ý nhà cung cấp</DialogTitle>
      <DialogContent dividers>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
          <Select size="small" displayEmpty value={sector} onChange={(e) => setSector(e.target.value)} sx={{ minWidth: 160 }}>
            <MenuItem value="">Mọi lĩnh vực</MenuItem>
            {NCC_SECTORS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
          <TextField size="small" value={location} onChange={(e) => setLocation(e.target.value)}
            placeholder="Địa điểm / quốc gia (vd: Đà Nẵng)" fullWidth />
        </Stack>

        {results.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            Không có NCC phù hợp. Thử bỏ bớt điều kiện lọc.
          </Typography>
        ) : (
          <Stack spacing={0.75}>
            {results.map(({ ncc, score }, i) => {
              const bm = NCC_BAND_META[score.band];
              return (
                <Box key={ncc.id} sx={{ border: '1px solid', borderColor: `${bm.color}44`, borderRadius: 1.5, px: 1.25, py: 0.75 }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography fontWeight={800} color="text.secondary" sx={{ width: 18 }}>{i + 1}</Typography>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography fontWeight={700} fontSize={13.5} noWrap>{ncc.name}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {(ncc.sectors ?? []).join(', ') || '—'}{ncc.location ? ` · ${ncc.location}` : ''}
                        {score.avgStars !== undefined ? ` · ${score.avgStars.toFixed(1)}★ (${score.ratingCount})` : ' · chưa có đánh giá'}
                      </Typography>
                    </Box>
                    <Tooltip title={score.factors.map((f) => `${f.label}: ${f.impact > 0 ? '+' : ''}${f.impact}`).join('\n') || 'Điểm nền'}>
                      <Chip size="small" label={`${bm.label} ${score.score}`}
                        sx={{ height: 20, fontWeight: 700, bgcolor: `${bm.color}1a`, color: bm.color }} />
                    </Tooltip>
                    <Button size="small" sx={{ minWidth: 0 }} onClick={() => onOpenNcc(ncc)}>Mở</Button>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
      </DialogActions>
    </Dialog>
  );
}
