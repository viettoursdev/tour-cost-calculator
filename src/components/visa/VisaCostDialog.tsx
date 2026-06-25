import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack,
  TextField, Typography,
} from '@mui/material';
import { useVisaProductsStore } from '@/stores/visaProductsStore';
import { normalizeVN } from '@/lib/search';
import { actualMargin, estimateVisaCost } from './visaCost';
import type { VisaProjectDoc } from '@/types';

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN') + ' đ';
const lsKey = (id: string) => `vte_visa_cost_${id}`;

/** Dự toán chi phí visa của đoàn theo bảng giá + đối chiếu thực chi (lưu localStorage). */
export function VisaCostDialog({ project, count, onClose }: {
  project: VisaProjectDoc; count: number; onClose: () => void;
}) {
  const products = useVisaProductsStore((s) => s.products);
  const rates = useVisaProductsStore((s) => s.rates);

  const matches = useMemo(() => {
    const c = normalizeVN(project.country);
    const m = products.filter((p) => p.active !== false && c && normalizeVN(p.country).includes(c));
    return (m.length ? m : products.filter((p) => p.active !== false));
  }, [products, project.country]);

  const [productId, setProductId] = useState('');
  const [pax, setPax] = useState(count || 0);
  const [actual, setActual] = useState(0);

  // Nạp lựa chọn đã lưu (localStorage theo dự án).
  useEffect(() => {
    let saved: { productId?: string; count?: number; actualSpend?: number } = {};
    try { saved = JSON.parse(localStorage.getItem(lsKey(project.id)) || '{}'); } catch { /* ignore */ }
    setProductId(saved.productId && products.some((p) => p.id === saved.productId) ? saved.productId : (matches[0]?.id ?? ''));
    if (saved.count) setPax(saved.count);
    if (saved.actualSpend) setActual(saved.actualSpend);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, products.length]);

  const product = products.find((p) => p.id === productId) ?? null;
  const est = product ? estimateVisaCost(product, pax, rates) : null;
  const margin = est ? actualMargin(est.totalSell, actual) : 0;

  const save = () => {
    try { localStorage.setItem(lsKey(project.id), JSON.stringify({ productId, count: pax, actualSpend: actual })); } catch { /* ignore */ }
    onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>💰 Chi phí visa — {project.name || project.code}</DialogTitle>
      <DialogContent>
        {products.length === 0 ? (
          <Alert severity="info" sx={{ mt: 1 }}>Chưa có bảng giá visa. Vào tab “📋 Danh mục giá” để thêm.</Alert>
        ) : (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Loại visa (bảng giá)" value={productId} onChange={(e) => setProductId(e.target.value)}>
              {matches.length === 0 && <MenuItem value="">(không có sản phẩm)</MenuItem>}
              {matches.map((p) => (
                <MenuItem key={p.id} value={p.id}>{p.country} · {p.visaType}{p.validity ? ` · ${p.validity}` : ''}</MenuItem>
              ))}
            </TextField>
            <TextField type="number" label="Số khách" value={pax}
              onChange={(e) => setPax(Math.max(0, +e.target.value || 0))} />

            {est && (
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1.5 }}>
                <Row label="Giá vốn / khách" value={fmt(est.basePerPax)} />
                <Row label="Giá bán / khách (đã markup)" value={fmt(est.sellPerPax)} />
                {est.perGroup > 0 && <Row label="Phí theo đoàn" value={fmt(est.perGroup)} />}
                <Box sx={{ my: 0.75, borderTop: '1px dashed', borderColor: 'divider' }} />
                <Row label={`Tổng giá vốn (${est.count} khách)`} value={fmt(est.totalCost)} />
                <Row label="Tổng giá bán (dự toán)" value={fmt(est.totalSell)} bold />
                <Row label="Lãi dự kiến" value={fmt(est.expectedProfit)} color="#27ae60" />
              </Box>
            )}

            <TextField type="number" label="Thực chi (VND)" value={actual}
              onChange={(e) => setActual(Math.max(0, +e.target.value || 0))}
              helperText="Tổng chi phí thực tế đã bỏ ra cho bộ visa này" />
            {est && actual > 0 && (
              <Alert severity={margin >= 0 ? 'success' : 'error'}>
                Biên lợi thực = giá bán − thực chi = <strong>{fmt(margin)}</strong>
                {margin < 0 ? ' (đang lỗ)' : ''}
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
        <Button variant="contained" onClick={save} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
          Lưu (máy này)
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" sx={{ py: 0.25 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={bold ? 800 : 600} sx={{ color }}>{value}</Typography>
    </Stack>
  );
}
