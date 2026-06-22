import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, Paper, Stack, TextField, Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { sbGetPublicQuote, sbAcceptPublicQuote } from '@/lib/supabase';
import { VTE_LOGO } from '@/lib/exports/vteLogo';
import type { PublicQuoteAcceptance, PublicQuoteDoc } from '@/types';

const fmt = (n: number) => (n || 0).toLocaleString('vi-VN') + ' đ';
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

export function PublicQuoteView({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [doc, setDoc] = useState<PublicQuoteDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    setLoading(true);
    sbGetPublicQuote(token)
      .then((d) => { if (!on) return; if (d) setDoc(d); else setError('Không tìm thấy báo giá. Link có thể đã bị gỡ hoặc hết hạn.'); })
      .catch((e) => { if (on) setError('Không tải được báo giá: ' + (e as Error).message); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [token]);

  if (loading) {
    return <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: '#0369a1' }} /></Box>;
  }
  if (error || !doc) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: '#f4f7fb' }}>
        <Alert severity="warning" sx={{ maxWidth: 460 }}>{error ?? 'Không có dữ liệu.'}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#eef3f8', py: { xs: 0, sm: 4 } }}>
      <Box sx={{ maxWidth: 720, mx: 'auto', bgcolor: '#fff', boxShadow: { sm: '0 12px 40px rgba(15,58,74,0.12)' }, borderRadius: { sm: 3 }, overflow: 'hidden' }}>
        {/* Header */}
        <Box sx={{ background: 'linear-gradient(135deg,#0a5c50,#0d7a6a 45%,#14a08c)', color: '#fff', px: { xs: 2.5, sm: 4 }, py: 3 }}>
          <Box component="img" src={VTE_LOGO} alt="Viettours" sx={{ height: 34, filter: 'brightness(0) invert(1)', mb: 1.5 }} />
          <Typography sx={{ fontSize: { xs: 22, sm: 26 }, fontWeight: 900, lineHeight: 1.15 }}>{doc.tourName}</Typography>
          <Typography sx={{ opacity: 0.9, mt: 0.5 }}>
            {doc.dest ? `${doc.dest} · ` : ''}{doc.days}N{doc.nights}Đ · {doc.pax} khách
            {doc.startDate ? ` · Khởi hành ${fmtDate(doc.startDate)}` : ''}
          </Typography>
          {doc.quoteCode && <Chip size="small" label={doc.quoteCode} sx={{ mt: 1, bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700 }} />}
        </Box>

        <Box sx={{ px: { xs: 2.5, sm: 4 }, py: 3 }}>
          {doc.customerName && <Typography sx={{ mb: 1 }}>Kính gửi: <strong>{doc.customerName}</strong></Typography>}
          {doc.note && <Typography sx={{ mb: 2, whiteSpace: 'pre-wrap', color: 'text.secondary' }}>{doc.note}</Typography>}

          {/* Price */}
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, textAlign: 'center', borderColor: 'rgba(3,105,161,0.3)', bgcolor: 'rgba(3,105,161,0.04)' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>GIÁ TRỌN GÓI</Typography>
            <Typography sx={{ fontSize: 30, fontWeight: 900, color: '#0369a1', lineHeight: 1.1 }}>{fmt(doc.pricePerPax)}</Typography>
            <Typography variant="caption" color="text.secondary">/ khách · Tổng {fmt(doc.totalPrice)} cho {doc.pax} khách</Typography>
          </Paper>

          {doc.inclusions.length > 0 && <Section title="✅ Giá bao gồm" items={doc.inclusions} />}
          {doc.exclusions.length > 0 && <Section title="❌ Giá không bao gồm" items={doc.exclusions} />}

          {doc.payments.length > 0 && (
            <Box sx={{ mt: 2.5 }}>
              <Typography fontWeight={800} sx={{ mb: 1 }}>💳 Điều kiện thanh toán</Typography>
              <Stack spacing={0.75}>
                {doc.payments.map((p, i) => (
                  <Paper key={i} variant="outlined" sx={{ p: 1.25 }}>
                    <Stack direction="row" justifyContent="space-between" flexWrap="wrap" useFlexGap>
                      <Typography fontWeight={700} fontSize={14}>{p.label}</Typography>
                      {p.amount > 0 && <Typography fontWeight={700} fontSize={14} color="#0369a1">{fmt(p.amount)}</Typography>}
                    </Stack>
                    {p.note && <Typography variant="caption" color="text.secondary">{p.note}</Typography>}
                  </Paper>
                ))}
              </Stack>
            </Box>
          )}

          {doc.itinerary && doc.itinerary.length > 0 && (
            <Box sx={{ mt: 2.5 }}>
              <Typography fontWeight={800} sx={{ mb: 1 }}>🗺️ Lịch trình tóm tắt</Typography>
              <Stack spacing={1}>
                {doc.itinerary.map((d) => (
                  <Paper key={d.day} variant="outlined" sx={{ p: 1.25, borderLeft: '4px solid #14a08c' }}>
                    <Typography fontWeight={800} fontSize={14}>Ngày {d.day}{d.title ? `: ${d.title}` : ''}</Typography>
                    {d.lines.length > 0 && (
                      <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                        {d.lines.map((l, i) => <Typography key={i} component="li" variant="body2" sx={{ color: 'text.secondary' }}>{l}</Typography>)}
                      </Box>
                    )}
                  </Paper>
                ))}
              </Stack>
            </Box>
          )}

          <Divider sx={{ my: 3 }} />
          <AcceptBlock token={token} doc={doc} onAccepted={(a) => setDoc({ ...doc, acceptance: a })} />

          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 3, textAlign: 'center' }}>
            Báo giá lập bởi {doc.publishedBy} · Viettours · {fmtDate(doc.publishedAt)}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <Box sx={{ mt: 2.5 }}>
      <Typography fontWeight={800} sx={{ mb: 0.75 }}>{title}</Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {items.map((it, i) => <Typography key={i} component="li" variant="body2" sx={{ mb: 0.25 }}>{it}</Typography>)}
      </Box>
    </Box>
  );
}

function AcceptBlock({ token, doc, onAccepted }: { token: string; doc: PublicQuoteDoc; onAccepted: (a: PublicQuoteAcceptance) => void }) {
  const [name, setName] = useState(doc.customerName ?? '');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (doc.acceptance) {
    return (
      <Alert icon={<CheckCircleIcon fontSize="inherit" />} severity="success">
        Cảm ơn Quý khách! Báo giá đã được xác nhận{doc.acceptance.name ? ` bởi ${doc.acceptance.name}` : ''} lúc {new Date(doc.acceptance.at).toLocaleString('vi-VN')}. Viettours sẽ liên hệ ngay.
      </Alert>
    );
  }

  const accept = async () => {
    setBusy(true); setError(null);
    try {
      const a: PublicQuoteAcceptance = { name: name.trim() || undefined, contact: contact.trim() || undefined, note: note.trim() || undefined, at: new Date().toISOString() };
      await sbAcceptPublicQuote(token, a);
      onAccepted(a);
    } catch (e) {
      setError('Gửi xác nhận lỗi: ' + (e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <Box>
      <Typography fontWeight={800} sx={{ mb: 1 }}>Xác nhận chốt tour</Typography>
      <Stack spacing={1.5}>
        <TextField size="small" label="Họ tên người xác nhận" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField size="small" label="Số điện thoại / Email (tuỳ chọn)" value={contact} onChange={(e) => setContact(e.target.value)} />
        <TextField size="small" label="Ghi chú (tuỳ chọn)" value={note} onChange={(e) => setNote(e.target.value)} multiline rows={2} />
        {error && <Alert severity="error">{error}</Alert>}
        <Button variant="contained" size="large" disabled={busy} onClick={() => void accept()}
          sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)', fontWeight: 800 }}>
          {busy ? 'Đang gửi…' : '✓ Đồng ý chốt báo giá này'}
        </Button>
        <Typography variant="caption" color="text.disabled" sx={{ textAlign: 'center' }}>
          Bấm đồng ý để Viettours tiến hành các bước tiếp theo. Mọi thắc mắc xin liên hệ nhân viên phụ trách.
        </Typography>
      </Stack>
    </Box>
  );
}
