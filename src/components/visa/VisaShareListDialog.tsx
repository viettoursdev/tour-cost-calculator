import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, IconButton, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { toast } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';
import {
  sbApproveVisaList, sbGetVisaListForProject, sbRefreshVisaListPayload, sbRejectVisaList,
  sbRequestVisaList, sbRevokeVisaList, sbSendNotificationMany,
} from '@/lib/supabase';
import { DEFAULT_VISA_EXPORT_COLS, VISA_EXPORT_COLUMNS, VISA_EXPORT_PRESETS } from '@/lib/exports/visaExportColumns';
import { buildPublicVisaList, genVisaListToken, visaListUrl } from '@/lib/publicVisaList';
import { canApproveVisaShareLink } from './visaAccess';
import type { Passenger, PublicVisaListRecord, VisaProjectDoc } from '@/types';

const PREF_KEY = 'vte_visa_publiclist_cols_v1';
const ALL_KEYS = VISA_EXPORT_COLUMNS.map((c) => c.key);
const LABEL_BY_KEY = new Map(VISA_EXPORT_COLUMNS.map((c) => [c.key, c.label]));

type Pref = { order: string[]; enabled: string[] };

/** Bộ cột gợi ý cho khách: tình trạng & tiến độ (mặc định + tình trạng + hồ sơ). */
const DEFAULT_PUBLIC_COLS = ['stt', 'name', 'nationality', 'visaStatus', 'docProgress', 'result'];

function loadPref(): { order: string[]; enabled: Set<string> } {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Pref;
      const known = p.order.filter((k) => ALL_KEYS.includes(k));
      const order = [...known, ...ALL_KEYS.filter((k) => !known.includes(k))];
      return { order, enabled: new Set(p.enabled.filter((k) => ALL_KEYS.includes(k))) };
    }
  } catch { /* fallback */ }
  return { order: [...ALL_KEYS], enabled: new Set(DEFAULT_PUBLIC_COLS.length ? DEFAULT_PUBLIC_COLS : DEFAULT_VISA_EXPORT_COLS) };
}

type Props = { project: VisaProjectDoc; applicants: Passenger[]; onClose: () => void };

/**
 * Tạo & quản lý LINK cho khách xem danh sách + tình trạng xin visa.
 * Nhân viên chọn cột → GỬI YÊU CẦU; Trưởng phòng Visa (hoặc CEO/BGĐ) DUYỆT mới
 * sinh link hoạt động. Cùng một dialog phục vụ cả người gửi lẫn người duyệt.
 */
export function VisaShareListDialog({ project, applicants, onClose }: Props) {
  const me = useAuthStore((s) => s.currentUser);
  const users = useAuthStore((s) => s.users);
  const isApprover = canApproveVisaShareLink(me);

  const init = useMemo(loadPref, []);
  const [order, setOrder] = useState<string[]>(init.order);
  const [enabled, setEnabled] = useState<Set<string>>(init.enabled);
  const [note, setNote] = useState('');

  const [record, setRecord] = useState<PublicVisaListRecord | null>(null);
  const [loadingRec, setLoadingRec] = useState(true);
  const [editCols, setEditCols] = useState(false);   // mở picker khi đã có link duyệt
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshRecord = () => {
    setLoadingRec(true);
    sbGetVisaListForProject(project.id)
      .then((r) => { setRecord(r); if (r?.note) setNote(r.note); })
      .catch((e) => toast('❌ ' + (e as Error).message, 'error'))
      .finally(() => setLoadingRec(false));
  };
  useEffect(refreshRecord, [project.id]);

  const selectedKeys = order.filter((k) => enabled.has(k));
  const selectedCount = selectedKeys.length;

  const toggle = (k: string) =>
    setEnabled((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const move = (idx: number, dir: -1 | 1) =>
    setOrder((prev) => {
      const next = [...prev]; const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]]; return next;
    });
  const applyPreset = (keys: string[]) => {
    const valid = keys.filter((k) => ALL_KEYS.includes(k));
    setOrder([...valid, ...ALL_KEYS.filter((k) => !valid.includes(k))]);
    setEnabled(new Set(valid));
  };
  const persistPref = () => {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ order, enabled: [...enabled] } satisfies Pref)); } catch { /* ignore */ }
  };

  const status = record?.status;
  const link = record && (status === 'approved') ? visaListUrl(record.token) : null;
  const copy = () => { if (link) void navigator.clipboard?.writeText(link).then(() => toast('Đã copy link.')); };

  // Báo cho người duyệt (Trưởng phòng Visa + CEO/BGĐ), trừ chính mình.
  const notifyApprovers = async () => {
    if (!me) return;
    const targets = users.filter((u) => u.u !== me.u && canApproveVisaShareLink(u)).map((u) => u.u);
    if (!targets.length) return;
    await sbSendNotificationMany(targets, {
      type: 'announcement', priority: 'high',
      title: '🛂 Yêu cầu duyệt link xem danh sách visa',
      message: `${me.name} xin tạo link cho khách xem danh sách "${project.name || project.code}" (${applicants.length} khách). Vào màn Visa → mở dự án → "Link khách xem" để Duyệt/Từ chối.`,
      createdBy: me.name,
    });
  };

  // Gửi/cập nhật yêu cầu (→ pending). Nếu chính mình là người duyệt → duyệt luôn.
  const submitRequest = async (autoApprove: boolean) => {
    if (!me) return;
    if (selectedCount === 0) { toast('Chọn ít nhất một cột để hiển thị.', 'warning'); return; }
    setBusy(true);
    try {
      const token = record?.token ?? genVisaListToken();
      const doc = buildPublicVisaList({ project, applicants, columnKeys: selectedKeys, token, publishedBy: me.name, note });
      await sbRequestVisaList({ token, doc, columns: selectedKeys, note, requestedByUsername: me.u, requestedByName: me.name });
      if (autoApprove) {
        await sbApproveVisaList(token);
        toast('✅ Đã tạo & duyệt link cho khách.');
      } else {
        await notifyApprovers();
        toast('📨 Đã gửi yêu cầu — chờ Trưởng phòng Visa duyệt.');
      }
      persistPref();
      setEditCols(false);
      refreshRecord();
    } catch (e) {
      toast('❌ ' + (e as Error).message, 'error');
    } finally { setBusy(false); }
  };

  const approve = async () => {
    if (!record) return;
    setBusy(true);
    try { await sbApproveVisaList(record.token); toast('✅ Đã duyệt — link cho khách đã hoạt động.'); refreshRecord(); }
    catch (e) { toast('❌ ' + (e as Error).message, 'error'); }
    finally { setBusy(false); }
  };
  const reject = async () => {
    if (!record) return;
    setBusy(true);
    try { await sbRejectVisaList(record.token, rejectReason.trim()); toast('Đã từ chối yêu cầu.'); setRejectMode(false); setRejectReason(''); refreshRecord(); }
    catch (e) { toast('❌ ' + (e as Error).message, 'error'); }
    finally { setBusy(false); }
  };
  const revoke = async () => {
    if (!record) return;
    if (!window.confirm('Gỡ link? Khách sẽ không xem được nữa.')) return;
    setBusy(true);
    try { await sbRevokeVisaList(record.token); toast('Đã gỡ link.'); refreshRecord(); }
    catch (e) { toast('❌ ' + (e as Error).message, 'error'); }
    finally { setBusy(false); }
  };
  // Làm mới số liệu của link đã duyệt — giữ NGUYÊN cột đã duyệt, không cần duyệt lại.
  const refreshData = async () => {
    if (!me || !record) return;
    setBusy(true);
    try {
      const doc = buildPublicVisaList({ project, applicants, columnKeys: record.columns, token: record.token, publishedBy: me.name, note: record.note });
      await sbRefreshVisaListPayload(record.token, doc);
      toast('🔄 Đã cập nhật số liệu mới nhất cho khách.');
      refreshRecord();
    } catch (e) { toast('❌ ' + (e as Error).message, 'error'); }
    finally { setBusy(false); }
  };

  const showPicker = !record || status === 'rejected' || status === 'revoked' || (status === 'approved' && editCols);

  const ColumnPicker = (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
        Chọn trường dữ liệu khách thấy ({selectedCount} cột)
      </Typography>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="caption" color="text.secondary">Chọn nhanh:</Typography>
        {VISA_EXPORT_PRESETS.map((p) => (
          <Chip key={p.id} label={p.label} size="small" variant="outlined" clickable
            icon={<RestartAltIcon style={{ fontSize: 15 }} />} onClick={() => applyPreset(p.keys)}
            sx={{ borderColor: '#0d7a6a', color: '#0d7a6a', '& .MuiChip-icon': { color: '#0d7a6a' } }} />
        ))}
      </Stack>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, maxHeight: 240, overflowY: 'auto' }}>
        {order.map((k, idx) => {
          const on = enabled.has(k);
          return (
            <Stack key={k} direction="row" alignItems="center" spacing={0.5}
              sx={{ px: 1, py: 0.25, borderBottom: idx < order.length - 1 ? '1px solid' : 'none', borderColor: 'divider', bgcolor: on ? 'transparent' : 'action.hover' }}>
              <Checkbox size="small" checked={on} onChange={() => toggle(k)} sx={{ p: 0.5 }} />
              <Typography variant="body2" sx={{ flex: 1, fontWeight: on ? 600 : 400, color: on ? 'text.primary' : 'text.disabled' }}>{LABEL_BY_KEY.get(k)}</Typography>
              <IconButton size="small" disabled={idx === 0} onClick={() => move(idx, -1)}><ArrowUpwardIcon fontSize="inherit" /></IconButton>
              <IconButton size="small" disabled={idx === order.length - 1} onClick={() => move(idx, 1)}><ArrowDownwardIcon fontSize="inherit" /></IconButton>
            </Stack>
          );
        })}
      </Box>
      <TextField label="Lời nhắn cho khách (tuỳ chọn)" value={note} onChange={(e) => setNote(e.target.value)}
        multiline rows={2} size="small" fullWidth sx={{ mt: 1.5 }} placeholder="VD: Kính gửi Quý khách, Viettours cập nhật tình trạng hồ sơ visa của đoàn…" />
    </Box>
  );

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pr: 6, fontWeight: 800 }}>
        🔗 Link cho khách xem danh sách visa
        <Typography variant="caption" display="block" color="text.secondary" sx={{ fontWeight: 400 }}>
          {project.name || project.code} · {applicants.length} khách · khách xem qua link, không cần đăng nhập
        </Typography>
        <IconButton onClick={onClose} disabled={busy} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {loadingRec ? (
          <Stack direction="row" alignItems="center" spacing={1}><CircularProgress size={16} /><Typography variant="body2" color="text.secondary">Đang tải trạng thái…</Typography></Stack>
        ) : (
          <Stack spacing={2}>
            {/* Trạng thái hiện tại */}
            {status === 'pending' && (
              <Alert severity="info" icon={<VerifiedUserOutlinedIcon fontSize="inherit" />}>
                Đang chờ <strong>Trưởng phòng Visa</strong> duyệt
                {record?.requestedByName ? ` — ${record.requestedByName} gửi yêu cầu` : ''}.
                {!isApprover && ' Link sẽ hoạt động ngay khi được duyệt.'}
              </Alert>
            )}
            {status === 'rejected' && (
              <Alert severity="warning">
                Yêu cầu bị từ chối{record?.approvedByName ? ` bởi ${record.approvedByName}` : ''}.
                {record?.rejectReason ? ` Lý do: “${record.rejectReason}”.` : ''} Có thể chỉnh cột rồi gửi lại.
              </Alert>
            )}
            {status === 'revoked' && <Alert severity="warning">Link đã được gỡ. Gửi yêu cầu mới để chia sẻ lại.</Alert>}
            {status === 'approved' && (
              <Alert severity="success">
                Đã duyệt{record?.approvedByName ? ` bởi ${record.approvedByName}` : ''} — link đang hoạt động.
              </Alert>
            )}

            {/* Link (khi đã duyệt) */}
            {link && (
              <Box>
                <Typography variant="caption" fontWeight={700} color="text.secondary">Link chia sẻ cho khách</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField value={link} size="small" fullWidth InputProps={{ readOnly: true }} />
                  <Tooltip title="Copy"><IconButton onClick={copy}><ContentCopyIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="Mở thử"><IconButton component="a" href={link} target="_blank" rel="noopener"><OpenInNewIcon fontSize="small" /></IconButton></Tooltip>
                </Stack>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                  <Button size="small" variant="outlined" startIcon={<RestartAltIcon />} disabled={busy} onClick={() => void refreshData()}
                    sx={{ color: '#0d7a6a', borderColor: '#0d7a6a' }}>
                    Cập nhật số liệu
                  </Button>
                  <Button size="small" onClick={() => setEditCols((v) => !v)}>{editCols ? 'Đóng đổi cột' : 'Đổi cột (gửi duyệt lại)'}</Button>
                  <Button size="small" color="error" disabled={busy} onClick={() => void revoke()}>Gỡ link</Button>
                </Stack>
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
                  “Cập nhật số liệu” làm mới tình trạng theo dữ liệu hiện tại mà không cần duyệt lại. Đổi cột phải gửi duyệt lại.
                </Typography>
              </Box>
            )}

            {/* Khu duyệt (chỉ người duyệt, khi đang pending) */}
            {status === 'pending' && isApprover && (
              <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'rgba(13,122,106,0.3)', bgcolor: 'rgba(13,122,106,0.05)' }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>Duyệt yêu cầu</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Trường khách sẽ thấy: {(record?.payload.columns ?? []).map((c) => c.label).join(', ') || '—'}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Button variant="contained" disabled={busy} onClick={() => void approve()}
                    sx={{ bgcolor: '#0d7a6a', fontWeight: 700, '&:hover': { bgcolor: '#0a5c50' } }}>Duyệt & tạo link</Button>
                  <Button color="error" disabled={busy} onClick={() => setRejectMode((v) => !v)}>Từ chối</Button>
                </Stack>
                <Collapse in={rejectMode}>
                  <Stack spacing={1} sx={{ mt: 1 }}>
                    <TextField size="small" fullWidth label="Lý do từ chối (tuỳ chọn)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                    <Box><Button size="small" color="error" variant="outlined" disabled={busy} onClick={() => void reject()}>Xác nhận từ chối</Button></Box>
                  </Stack>
                </Collapse>
              </Box>
            )}

            {showPicker && (
              <>
                {(status === 'approved') && <Divider />}
                {ColumnPicker}
              </>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} disabled={busy} color="inherit">Đóng</Button>
        {showPicker && (
          isApprover ? (
            <Button variant="contained" disabled={busy || selectedCount === 0} onClick={() => void submitRequest(true)}
              sx={{ bgcolor: '#0d7a6a', fontWeight: 700, '&:hover': { bgcolor: '#0a5c50' } }}>
              {busy ? 'Đang xử lý…' : 'Tạo & duyệt link'}
            </Button>
          ) : (
            <Button variant="contained" disabled={busy || selectedCount === 0} onClick={() => void submitRequest(false)}
              sx={{ bgcolor: '#0d7a6a', fontWeight: 700, '&:hover': { bgcolor: '#0a5c50' } }}>
              {busy ? 'Đang gửi…' : status === 'pending' ? 'Cập nhật & gửi lại' : 'Gửi yêu cầu tạo link'}
            </Button>
          )
        )}
      </DialogActions>
    </Dialog>
  );
}
