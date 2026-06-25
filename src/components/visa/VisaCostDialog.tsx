import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack,
  TextField, Typography,
} from '@mui/material';
import { toast } from '@/stores/toastStore';
import { useVisaProductsStore } from '@/stores/visaProductsStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { normalizeVN } from '@/lib/search';
import { actualMargin, estimateVisaCost } from './visaCost';
import type { VisaProjectDoc } from '@/types';

const fmt = (n: number) => Math.round(n).toLocaleString('vi-VN') + ' đ';

/** Dự toán chi phí visa của đoàn theo bảng giá + đối chiếu thực chi (lưu cloud trên dự án). */
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
  const [busy, setBusy] = useState(false);

  // Nạp chi phí đã lưu trên dự án (cloud).
  useEffect(() => {
    const c = project.costing;
    setProductId(c?.productId && products.some((p) => p.id === c.productId) ? c.productId : (matches[0]?.id ?? ''));
    if (c?.count) setPax(c.count);
    if (c?.actualSpend) setActual(c.actualSpend);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, products.length]);

  const product = products.find((p) => p.id === productId) ?? null;
  const est = product ? estimateVisaCost(product, pax, rates) : null;
  const margin = est ? actualMargin(est.totalSell, actual) : 0;

  // Lưu vào dự án (merge vào bản MỚI NHẤT trong store để không đè applicants chưa lưu).
  const save = async () => {
    setBusy(true);
    try {
      const cur = useVisaProjectStore.getState().projects.find((p) => p.id === project.id) ?? project;
      await useVisaProjectStore.getState().save({
        ...cur,
        costing: {
          productId, count: pax, actualSpend: actual,
          estTotalCost: est?.totalCost, estTotalSell: est?.totalSell,
          updatedAt: new Date().toISOString(),
        },
      });
      toast('✅ Đã lưu chi phí visa lên dự án.');
      onClose();
    } catch (e) {
      toast('Lỗi lưu chi phí: ' + (e as Error).message, 'warning');
    } finally { setBusy(false); }
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
        <Button onClick={onClose} disabled={busy}>Đóng</Button>
        <Button variant="contained" onClick={() => void save()} disabled={busy || products.length === 0}
          sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
          {busy ? 'Đang lưu…' : 'Lưu lên dự án'}
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
