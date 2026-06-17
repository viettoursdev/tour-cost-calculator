import { useMemo } from 'react';
import {
  Box, Button, Chip, Dialog, DialogContent, DialogTitle, Divider, IconButton, Paper, Stack, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { useContractStore } from '@/stores/contractStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { fmtVND } from '@/components/quote/calc';
import { QUOTE_STATUS_META } from '@/components/quote/constants';
import type { Customer } from '@/types';

const Stat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <Paper variant="outlined" sx={{ px: 1.5, py: 1, flex: 1, minWidth: 110, textAlign: 'center' }}>
    <Typography fontWeight={800} fontSize={16} sx={{ color: color ?? 'text.primary' }}>{value}</Typography>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
  </Paper>
);

export function Customer360({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const dmcQuotes = useQuoteHistoryStore((s) => s.dmcQuotes);
  const contracts = useContractStore((s) => s.contracts);
  const visaProjects = useVisaProjectStore((s) => s.projects);
  const loadCloud = useQuoteStore((s) => s.loadCloud);
  const setView = useQuoteStore((s) => s.setView);
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);

  const { tours, cloudIds, totalValue, totalOwing } = useMemo(() => {
    const all = [...quotes, ...dmcQuotes];
    const mine = all.filter((q) => (q.customerId ? q.customerId === customer.id : q.customerName === customer.name));
    const ids = new Set(mine.map((q) => q.cloudId));
    return {
      tours: mine.sort((a, b) => (b.departDate ?? b.updatedAt ?? '').localeCompare(a.departDate ?? a.updatedAt ?? '')),
      cloudIds: ids,
      totalValue: mine.reduce((s, q) => s + (q.totalCost ?? 0), 0),
      totalOwing: mine.reduce((s, q) => s + (q.paymentSummary?.remaining ?? 0), 0),
    };
  }, [quotes, dmcQuotes, customer]);

  const linkedContracts = useMemo(() => contracts.filter((c) => c.linkedQuoteId && cloudIds.has(c.linkedQuoteId)), [contracts, cloudIds]);
  const linkedVisa = useMemo(() => visaProjects.filter((p) => p.linkedQuoteId && cloudIds.has(p.linkedQuoteId)), [visaProjects, cloudIds]);

  const contact = customer.contacts?.[0];

  const openTour = async (cloudId: string, dmc: boolean) => {
    if (currentQuoteId && currentQuoteId !== cloudId && !window.confirm('Mở báo giá này? Thay đổi cục bộ chưa lưu có thể mất.')) return;
    const r = await loadCloud(cloudId, dmc ? { dmc: true } : undefined);
    if (!r.ok) { window.alert('⚠ ' + r.error); return; }
    onClose();
    setView('cost');
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pr: 6 }}>
        {customer.type === 'company' ? '🏢' : '👤'} {customer.name}
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
        {(contact?.phone || contact?.email || customer.taxCode) && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontWeight: 400 }}>
            {[contact?.name, contact?.phone, contact?.email, customer.taxCode ? `MST ${customer.taxCode}` : ''].filter(Boolean).join('  ·  ')}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          <Stat label="Tour / Báo giá" value={String(tours.length)} />
          <Stat label="Tổng giá trị" value={fmtVND(totalValue)} color="#0d7a6a" />
          <Stat label="Còn nợ NCC" value={fmtVND(totalOwing)} color={totalOwing > 0 ? '#dc3250' : 'text.secondary'} />
          <Stat label="Hợp đồng" value={String(linkedContracts.length)} />
          <Stat label="Dự án visa" value={String(linkedVisa.length)} />
        </Stack>

        <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase' }}>Tour & báo giá</Typography>
        {tours.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ py: 2 }}>Chưa có báo giá nào gắn khách hàng này.</Typography>
        ) : (
          <Stack spacing={1} sx={{ mt: 1 }}>
            {tours.map((q) => {
              const st = q.status ? QUOTE_STATUS_META[q.status] : null;
              const dmc = q.template === 'dmc';
              return (
                <Paper key={q.cloudId} variant="outlined" sx={{ p: 1.25, cursor: 'pointer' }} onClick={() => void openTour(q.cloudId, dmc)}>
                  <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
                    <Box sx={{ flex: 1, minWidth: 200 }}>
                      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                        <Typography fontWeight={700} fontSize={13.5}>{q.name}</Typography>
                        {st && <Chip size="small" label={st.label} sx={{ height: 18, bgcolor: st.color + '22', color: st.color, fontWeight: 700 }} />}
                        {dmc && <Chip size="small" variant="outlined" label="DMC" sx={{ height: 18 }} />}
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {q.quoteCode ? `${q.quoteCode} · ` : ''}{q.departDate ? `Khởi hành ${new Date(q.departDate).toLocaleDateString('vi-VN')} · ` : ''}{q.pax} khách
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography fontSize={13} fontWeight={700}>{fmtVND(q.totalCost ?? 0)}</Typography>
                      {(q.paymentSummary?.remaining ?? 0) > 0 && <Typography variant="caption" sx={{ color: '#dc3250' }}>Còn nợ {fmtVND(q.paymentSummary!.remaining)}</Typography>}
                    </Box>
                    <IconButton size="small" sx={{ color: '#0d7a6a' }}><OpenInNewIcon fontSize="small" /></IconButton>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}

        {(linkedContracts.length > 0 || linkedVisa.length > 0) && <Divider sx={{ my: 2 }} />}
        {linkedContracts.length > 0 && (
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase' }}>Hợp đồng ({linkedContracts.length})</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
              {linkedContracts.map((c) => <Chip key={c.id} size="small" variant="outlined" label={`📜 ${c.tourName || c.id}`} />)}
            </Stack>
          </Box>
        )}
        {linkedVisa.length > 0 && (
          <Box>
            <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase' }}>Dự án visa ({linkedVisa.length})</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
              {linkedVisa.map((p) => <Chip key={p.id} size="small" variant="outlined" label={`🛂 ${p.name || p.code || p.id}`} />)}
            </Stack>
          </Box>
        )}
      </DialogContent>
      <Box sx={{ p: 1.5, textAlign: 'right' }}>
        <Button onClick={onClose} color="inherit">Đóng</Button>
      </Box>
    </Dialog>
  );
}
