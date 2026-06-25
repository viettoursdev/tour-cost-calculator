import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useQuoteStore } from '@/stores/quoteStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useItineraryStore } from '@/stores/itineraryStore';
import { useAuthStore } from '@/stores/authStore';
import { sbPublishQuote, sbUnpublishQuote, sbSetQuoteShare, sbGetPublicQuote } from '@/lib/supabase';
import { buildPublicQuote, genShareToken, shareUrl, itineraryToSummary } from '@/lib/publicQuote';
import { computeTotals, fmtVND } from './calc';
import { effectiveValidUntil, fmtDateVN, isoDate, validityStatus } from './quoteValidity';
import { toast } from '@/stores/toastStore';
import { normalizeVN } from '@/lib/search';
import type { PublicQuoteAcceptance } from '@/types';

type Props = { open: boolean; onClose: () => void };

export function SharePublicQuoteModal({ open, onClose }: Props) {
  const draft = useQuoteStore((s) => s.draft);
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const itinList = useItineraryStore((s) => s.list);
  const itinLoad = useItineraryStore((s) => s.load);
  const currentUser = useAuthStore((s) => s.currentUser);

  const entry = useMemo(() => quotes.find((q) => q.cloudId === currentQuoteId), [quotes, currentQuoteId]);
  const totals = computeTotals(draft);
  const effValidUntil = effectiveValidUntil(draft.validUntil, isoDate(new Date()));
  const validity = validityStatus(effValidUntil);

  // Lịch trình gợi ý: khớp theo khách hàng hoặc tên tour.
  const itinMatches = useMemo(() => {
    const cust = normalizeVN(entry?.customerName ?? draft.customerName ?? '');
    const tour = normalizeVN(draft.info.name ?? '');
    return itinList.filter((it) => {
      const c = normalizeVN(it.customerName ?? '');
      const t = normalizeVN(it.title ?? '');
      return (cust && c && c === cust) || (tour && t && (t.includes(tour) || tour.includes(t)));
    });
  }, [itinList, entry, draft]);

  const [itinId, setItinId] = useState('');
  const [note, setNote] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<PublicQuoteAcceptance | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNote('');
    setItinId(itinMatches[0]?.id ?? '');
    const token = entry?.share?.token;
    if (token) {
      setLink(shareUrl(token));
      void sbGetPublicQuote(token).then((d) => setAccepted(d?.acceptance ?? null));
    } else {
      setLink(null); setAccepted(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const publish = async () => {
    if (!currentQuoteId || !currentUser) { window.alert('Hãy lưu báo giá lên cloud trước khi chia sẻ cho khách.'); return; }
    setBusy(true);
    try {
      const token = entry?.share?.token ?? genShareToken();
      let itinerary;
      if (itinId) {
        const it = await itinLoad(itinId);
        if (it) itinerary = itineraryToSummary(it);
      }
      const docData = buildPublicQuote({
        draft, token, cloudId: currentQuoteId, quoteCode: entry?.quoteCode,
        publishedBy: currentUser.name, customerName: entry?.customerName ?? draft.customerName,
        itinerary, note: note.trim() || undefined,
      });
      await sbPublishQuote(docData);
      await sbSetQuoteShare(currentQuoteId, { token, publishedAt: docData.publishedAt });
      // Vừa chia sẻ link cho khách → tự nâng trạng thái lên "Đã gửi KH"
      // (CHỈ tiến tới từ "Đang triển khai", không hạ cấp deal/won/thua).
      const bumped = (draft.status ?? 'in_progress') === 'in_progress';
      if (bumped) useQuoteStore.getState().setStatus('sent');
      setLink(shareUrl(token));
      setAccepted(null);
      toast(bumped ? '🔗 Đã tạo link chia sẻ & chuyển trạng thái → Đã gửi KH.' : '🔗 Đã tạo link chia sẻ báo giá cho khách.');
    } catch (e) {
      window.alert('❌ Lỗi chia sẻ: ' + (e as Error).message);
    } finally { setBusy(false); }
  };

  const unpublish = async () => {
    if (!currentQuoteId || !entry?.share?.token) return;
    if (!window.confirm('Gỡ link chia sẻ? Khách sẽ không xem được nữa.')) return;
    setBusy(true);
    try {
      await sbUnpublishQuote(entry.share.token);
      await sbSetQuoteShare(currentQuoteId, null);
      setLink(null); setAccepted(null);
      toast('Đã gỡ link chia sẻ.');
    } catch (e) {
      window.alert('❌ Lỗi gỡ: ' + (e as Error).message);
    } finally { setBusy(false); }
  };

  const copy = () => { if (link) void navigator.clipboard?.writeText(link).then(() => toast('Đã copy link.')); };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        🔗 Chia sẻ báo giá cho khách
        <Typography variant="caption" display="block" color="text.secondary">
          Khách xem qua link (không cần đăng nhập) · chỉ thấy giá bán & điều khoản, ẩn giá vốn
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {!currentQuoteId && <Alert severity="warning">Hãy lưu báo giá lên cloud trước, rồi mới chia sẻ được.</Alert>}

          <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(3,105,161,0.06)', border: '1px solid rgba(3,105,161,0.15)' }}>
            <Typography fontWeight={800}>{draft.info.name || 'Chương trình tour'}</Typography>
            <Typography variant="caption" color="text.secondary">
              {draft.pax} khách · {draft.info.days}N{draft.info.nights}Đ{entry?.customerName ? ` · ${entry.customerName}` : ''}
            </Typography>
            <Typography sx={{ mt: 0.5, fontWeight: 800, color: '#0369a1' }}>
              {fmtVND(totals.roundedPPax)}/khách · Tổng {fmtVND(totals.grandTotal)}
            </Typography>
            <Typography variant="caption" sx={{ color: validity.expired ? '#dc3250' : 'text.secondary' }}>
              Hiệu lực đến hết {fmtDateVN(effValidUntil)}
              {draft.validUntil ? '' : ' (mặc định)'}
              {validity.expired ? ' — đã hết hạn, khách sẽ không chốt được' : ''}
            </Typography>
          </Box>

          {accepted && (
            <Alert severity="success">
              ✅ Khách đã đồng ý {accepted.name ? `(${accepted.name})` : ''} lúc {new Date(accepted.at).toLocaleString('vi-VN')}
              {accepted.note ? ` — “${accepted.note}”` : ''}
            </Alert>
          )}

          <TextField
            select label="Kèm lịch trình tóm tắt (tuỳ chọn)" value={itinId} onChange={(e) => setItinId(e.target.value)}
            helperText={itinMatches.length ? 'Gợi ý theo khách/tên tour.' : 'Không tìm thấy chương trình khớp — có thể bỏ qua.'}
          >
            <MenuItem value="">— Không kèm lịch trình —</MenuItem>
            {itinMatches.map((it) => <MenuItem key={it.id} value={it.id}>{it.title}{it.customerName ? ` · ${it.customerName}` : ''}</MenuItem>)}
          </TextField>

          <TextField label="Lời nhắn cho khách (tuỳ chọn)" value={note} onChange={(e) => setNote(e.target.value)} multiline rows={2}
            placeholder="VD: Kính gửi Quý khách, Viettours xin gửi báo giá chương trình…" />

          {link && (
            <Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary">Link chia sẻ</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField value={link} size="small" fullWidth InputProps={{ readOnly: true }} />
                <Tooltip title="Copy"><IconButton onClick={copy}><ContentCopyIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Mở thử"><IconButton component="a" href={link} target="_blank" rel="noopener"><OpenInNewIcon fontSize="small" /></IconButton></Tooltip>
              </Stack>
              <Typography variant="caption" color="text.disabled">Xuất bản lại sẽ cập nhật nội dung khách thấy (giữ nguyên link).</Typography>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {link && <Button color="error" disabled={busy} onClick={() => void unpublish()}>Gỡ chia sẻ</Button>}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} disabled={busy}>Đóng</Button>
        <Button variant="contained" disabled={!currentQuoteId || busy} onClick={() => void publish()}
          sx={{ background: 'linear-gradient(135deg,#0369a1,#0ea5e9)', fontWeight: 800 }}>
          {busy ? 'Đang xử lý…' : link ? 'Cập nhật bản chia sẻ' : 'Tạo link chia sẻ'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
