import { useMemo, useState } from 'react';
import {
  Box, Button, Dialog, DialogContent, DialogTitle, Stack, TextField, Typography,
} from '@mui/material';
import { useVisaProductsStore } from '@/stores/visaProductsStore';
import { fmtVND } from './calc';
import { mkItem } from './constants';
import type { Item, VisaProduct } from '@/types';

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (items: Partial<Item>[]) => void;
};

function calcUnit(p: VisaProduct, rates: Record<string, number>) {
  const toVND = (amt: number, cur: string) => (+amt || 0) * (rates[cur] || 1);
  const base = (p.fees ?? []).filter((f) => f.perPax !== false).reduce((s, f) => s + toVND(f.amount, f.cur), 0);
  const grp = (p.fees ?? []).filter((f) => f.perPax === false).reduce((s, f) => s + toVND(f.amount, f.cur), 0);
  let unit = base;
  if (p.markupType === 'fixed') unit += toVND(p.markupValue, p.markupCur || 'VND');
  else unit *= (1 + (+p.markupValue || 0) / 100);
  return { unit, grp };
}

/**
 * Pick a visa product from the shared catalog and insert it as line items
 * into the quote's `visa` category.
 * Source: public/legacy.html:7732-7795.
 */
export function VisaPickerModal({ open, onClose, onPick }: Props) {
  const products = useVisaProductsStore((s) => s.products);
  const rates = useVisaProductsStore((s) => s.rates);
  const [search, setSearch] = useState('');

  const active = useMemo(
    () => products.filter((p) => p.active !== false),
    [products],
  );
  const filtered = active.filter((p) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return [p.country, p.visaType, p.validity, p.location].join(' ').toLowerCase().includes(q);
  });

  const toVND = (amt: number, cur: string) => (+amt || 0) * (rates[cur] || 1);

  const handlePick = (p: VisaProduct) => {
    const { unit, grp } = calcUnit(p, rates);
    const feeTxt = (p.fees ?? [])
      .filter((f) => (+f.amount) > 0)
      .map((f) => `${f.name}: ${(+f.amount).toLocaleString('vi-VN')} ${f.cur}${f.perPax === false ? '/đoàn' : ''}`)
      .join('; ');
    const markupTxt = p.markupValue
      ? ` · markup ${p.markupType === 'percent'
        ? `${p.markupValue}%`
        : fmtVND(toVND(p.markupValue, p.markupCur || 'VND'))}`
      : '';
    const note = `Nơi nộp ${p.location}${markupTxt}${feeTxt ? ` · ${feeTxt}` : ''}`;
    const lines: Partial<Item>[] = [
      mkItem({
        name: `Visa ${p.country} · ${p.visaType} · ${p.validity}`,
        note,
        cur: 'VND',
        price: Math.round(unit),
        unit: '/khách',
        qtyMode: 'per_pax',
      }),
    ];
    if (grp > 0) {
      lines.push(mkItem({
        name: `Visa ${p.country} – phí theo đoàn`,
        cur: 'VND',
        price: Math.round(grp),
        unit: '/đoàn',
        qtyMode: 'per_group',
      }));
    }
    onPick(lines);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)', color: '#fff' }}>
        <Typography variant="h6" fontWeight={900}>🛂 Chọn Visa từ thư viện</Typography>
        <Typography variant="caption" sx={{ opacity: 0.85 }}>
          Giá lấy từ Quản lý Visa · tự chèn vào hạng mục Visa
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <TextField
          fullWidth size="small" value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Tìm quốc gia, loại, nơi nộp..."
          sx={{ mb: 2 }}
        />

        {products.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 5, color: 'text.disabled' }}>
            <Typography fontSize={34} sx={{ mb: 1 }}>🛂</Typography>
            <Typography variant="subtitle2" fontWeight={600}>
              Thư viện chưa có sản phẩm visa
            </Typography>
            <Typography variant="caption" sx={{ mt: 0.5, display: 'block' }}>
              Vào 🛂 Quản lý Visa để thêm sản phẩm.
            </Typography>
          </Box>
        )}
        {products.length > 0 && filtered.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 5, color: 'text.disabled' }}>
            Không tìm thấy
          </Box>
        )}

        <Stack spacing={1.25}>
          {filtered.map((p) => {
            const { unit, grp } = calcUnit(p, rates);
            return (
              <Stack key={p.id} direction="row" alignItems="center" spacing={1.5}
                sx={{ p: 1.25, bgcolor: '#fff', border: '1px solid rgba(20,150,140,0.18)', borderRadius: 1.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontWeight={800} fontSize={14}>
                    {p.country || '(Chưa đặt QG)'}
                    <Typography component="span" variant="caption" sx={{ ml: 0.5, color: 'text.secondary' }}>
                      · {p.visaType} · {p.validity}
                    </Typography>
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Nơi nộp {p.location} · {(p.fees ?? []).filter((f) => (+f.amount) > 0).length} khoản phí
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography fontWeight={900} fontSize={14} sx={{ color: '#0d7a6a', whiteSpace: 'nowrap' }}>
                    {fmtVND(unit)}
                    <Typography component="span" variant="caption" sx={{ ml: 0.25, color: 'text.secondary' }}>
                      /khách
                    </Typography>
                  </Typography>
                  {grp > 0 && (
                    <Typography variant="caption" fontWeight={700} sx={{ color: '#b8761e', whiteSpace: 'nowrap' }}>
                      + {fmtVND(grp)}/đoàn
                    </Typography>
                  )}
                </Box>
                <Button size="small" variant="contained" onClick={() => handlePick(p)}
                  sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)', flexShrink: 0 }}>
                  Chọn →
                </Button>
              </Stack>
            );
          })}
        </Stack>

        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 2 }}>
          💡 Giá đã quy đổi về VND theo tỷ giá trong Quản lý Visa, gồm markup. Bạn có thể chỉnh lại dòng sau khi chèn.
        </Typography>
      </DialogContent>
    </Dialog>
  );
}
