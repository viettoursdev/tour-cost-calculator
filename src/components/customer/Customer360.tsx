import { useMemo, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogContent, DialogTitle, Divider, IconButton, MenuItem, Paper,
  Select, Stack, TextField, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { useContractStore } from '@/stores/contractStore';
import { useVisaProjectStore } from '@/stores/visaProjectStore';
import { useCustomerStore } from '@/stores/customerStore';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { canViewTravelerDocs } from '@/auth/customerDocs';
import { fmtVND } from '@/components/quote/calc';
import { QUOTE_STATUS_META } from '@/components/quote/constants';
import { EmailLinksPanel } from '@/components/email/EmailLinksPanel';
import { TravelerDocsPanel } from './TravelerDocs';
import type { Customer, CustomerInteractionType } from '@/types';

const ITYPE_META: Record<CustomerInteractionType, { label: string; icon: string }> = {
  call: { label: 'Gọi điện', icon: '📞' },
  email: { label: 'Email', icon: '✉️' },
  meeting: { label: 'Gặp mặt', icon: '🤝' },
  note: { label: 'Ghi chú', icon: '📝' },
};

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
  // Bản LIVE từ store để timeline cập nhật ngay sau khi ghi.
  const live = useCustomerStore((s) => s.customers.find((c) => c.id === customer.id));
  const addInteraction = useCustomerStore((s) => s.addInteraction);
  const deleteInteraction = useCustomerStore((s) => s.deleteInteraction);
  const setFollowUp = useCustomerStore((s) => s.setFollowUp);
  const clearFollowUp = useCustomerStore((s) => s.clearFollowUp);
  const cust = live ?? customer;
  const currentUser = useAuthStore((s) => s.currentUser);
  const canDocs = canViewTravelerDocs(currentUser, cust);
  const canEditDocs = canDocs && hasPerm(currentUser, 'manageCustomers');
  const interactions = [...(cust.interactions ?? [])].reverse(); // mới nhất lên đầu
  const fu = cust.nextFollowUp;
  const fuOverdue = !!fu && fu.date < new Date().toISOString().slice(0, 10);
  const [itype, setItype] = useState<CustomerInteractionType>('call');
  const [itext, setItext] = useState('');
  const [fuDate, setFuDate] = useState('');
  const [fuNote, setFuNote] = useState('');
  const submitInteraction = () => {
    if (!itext.trim()) return;
    void addInteraction(customer.id, itype, itext);
    setItext('');
  };

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

        <Divider sx={{ my: 2 }} />
        <EmailLinksPanel
          targetType="customer" targetId={customer.id} targetName={customer.name}
          searchHint={contact?.email || customer.name}
          composeDefaults={contact?.email ? {
            to: [contact.email],
            subject: `Viettours · ${customer.name}`,
            bodyHtml: `Kính gửi Anh/Chị,\n\nViettours xin gửi tới Anh/Chị thông tin theo trao đổi.\n\nTrân trọng,\nViettours`,
          } : undefined}
        />

        {canDocs && (
          <>
            <Divider sx={{ my: 2 }} />
            <TravelerDocsPanel customer={cust} canEdit={canEditDocs} />
          </>
        )}

        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase' }}>Lịch hẹn liên hệ lại</Typography>
        {fu ? (
          <Paper variant="outlined" sx={{ p: 1.25, mt: 0.75, mb: 1.5, borderLeft: `4px solid ${fuOverdue ? '#dc3250' : '#14a08c'}` }}>
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
              <Typography fontSize={13} fontWeight={700} sx={{ flex: 1, minWidth: 0 }}>
                📅 {new Date(fu.date).toLocaleDateString('vi-VN')}{fuOverdue ? ' · QUÁ HẠN' : ''}{fu.note ? ` — ${fu.note}` : ''}
                <Typography component="span" variant="caption" color="text.secondary"> · {fu.byName}</Typography>
              </Typography>
              <Button size="small" variant="outlined" color="success" onClick={() => void clearFollowUp(customer.id)}>✓ Hoàn tất</Button>
            </Stack>
          </Paper>
        ) : (
          <Stack direction="row" spacing={1} sx={{ mt: 0.75, mb: 1.5 }} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField size="small" type="date" value={fuDate} onChange={(e) => setFuDate(e.target.value)} slotProps={{ inputLabel: { shrink: true }, input: { notched: true } }} label="Hẹn ngày" />
            <TextField size="small" value={fuNote} onChange={(e) => setFuNote(e.target.value)} placeholder="Nội dung cần làm…" sx={{ flex: 1, minWidth: 160 }} />
            <Button size="small" variant="contained" disabled={!fuDate} onClick={() => { void setFollowUp(customer.id, fuDate, fuNote); setFuDate(''); setFuNote(''); }} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>Đặt lịch</Button>
          </Stack>
        )}

        <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase' }}>Chăm sóc khách hàng ({interactions.length})</Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 0.75, mb: 1 }} alignItems="flex-start">
          <Select size="small" value={itype} onChange={(e) => setItype(e.target.value as CustomerInteractionType)} sx={{ minWidth: 120 }}>
            {(Object.keys(ITYPE_META) as CustomerInteractionType[]).map((t) => <MenuItem key={t} value={t}>{ITYPE_META[t].icon} {ITYPE_META[t].label}</MenuItem>)}
          </Select>
          <TextField size="small" fullWidth multiline maxRows={3} value={itext} onChange={(e) => setItext(e.target.value)}
            placeholder="Nội dung trao đổi với khách…"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitInteraction(); }} />
          <Button variant="contained" disabled={!itext.trim()} onClick={submitInteraction} sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)', whiteSpace: 'nowrap' }}>Ghi nhận</Button>
        </Stack>
        {interactions.length === 0 ? (
          <Typography variant="caption" color="text.disabled">Chưa có lịch sử chăm sóc. Ghi lại cuộc gọi/email/gặp để theo dõi.</Typography>
        ) : (
          <Stack spacing={0.75}>
            {interactions.map((it) => (
              <Stack key={it.id} direction="row" spacing={1} alignItems="flex-start" sx={{ borderLeft: '2px solid rgba(20,150,140,0.3)', pl: 1 }}>
                <Typography fontSize={15} sx={{ lineHeight: 1.4 }}>{ITYPE_META[it.type].icon}</Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontSize={13} sx={{ whiteSpace: 'pre-wrap' }}>{it.text}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {ITYPE_META[it.type].label} · {it.byName} · {new Date(it.at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </Typography>
                </Box>
                <IconButton size="small" color="error" onClick={() => { if (window.confirm('Xoá dòng chăm sóc này?')) void deleteInteraction(customer.id, it.id); }}><DeleteOutlineIcon fontSize="small" /></IconButton>
              </Stack>
            ))}
          </Stack>
        )}
      </DialogContent>
      <Box sx={{ p: 1.5, textAlign: 'right' }}>
        <Button onClick={onClose} color="inherit">Đóng</Button>
      </Box>
    </Dialog>
  );
}
