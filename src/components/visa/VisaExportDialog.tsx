import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, IconButton, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import CloseIcon from '@mui/icons-material/Close';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { toast } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';
import { isApprover } from '@/auth/ROLES';
import { sbSetVisaExportPassword, sbVerifyVisaExportPassword, sbVisaExportPasswordIsSet } from '@/lib/supabase';
import { fetchUserPref, pushUserPref } from '@/lib/userPrefSync';
import { DEFAULT_VISA_EXPORT_COLS, VISA_EXPORT_COLUMNS, VISA_EXPORT_PRESETS } from '@/lib/exports/visaExportColumns';
import type { Passenger, VisaProjectDoc } from '@/types';

const PREF_KEY = 'vte_visa_export_cols_v1';
const ALL_KEYS = VISA_EXPORT_COLUMNS.map((c) => c.key);
const LABEL_BY_KEY = new Map(VISA_EXPORT_COLUMNS.map((c) => [c.key, c.label]));

type Pref = { order: string[]; enabled: string[] };

/** Blob thô (localStorage/cloud) đúng hình dạng Pref? */
function validPref(raw: unknown): Pref | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Pref;
  return Array.isArray(p.order) && Array.isArray(p.enabled) ? p : null;
}

/** Reconcile tuỳ chọn với danh mục cột hiện tại (bỏ cột không còn, thêm cột mới vào cuối). */
function reconcilePref(p: Pref): { order: string[]; enabled: Set<string> } {
  const known = p.order.filter((k) => ALL_KEYS.includes(k));
  const order = [...known, ...ALL_KEYS.filter((k) => !known.includes(k))];
  const enabled = new Set(p.enabled.filter((k) => ALL_KEYS.includes(k)));
  return { order, enabled };
}

/** Đọc tuỳ chọn cột đã lưu ở máy này (cache nhanh; bản cloud đè sau nếu có). */
function loadPref(): { order: string[]; enabled: Set<string> } {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) {
      const p = validPref(JSON.parse(raw));
      if (p) return reconcilePref(p);
    }
  } catch { /* fallback mặc định */ }
  return { order: [...ALL_KEYS], enabled: new Set(DEFAULT_VISA_EXPORT_COLS) };
}

type Props = { project: VisaProjectDoc; applicants: Passenger[]; onClose: () => void };

/** Dialog tải danh sách khách xin visa: chọn cột + thứ tự, cổng mật khẩu Trưởng Phòng. */
export function VisaExportDialog({ project, applicants, onClose }: Props) {
  const me = useAuthStore((s) => s.currentUser);
  const canSetPw = !!me && isApprover(me.role);

  const init = useMemo(loadPref, []);
  const [order, setOrder] = useState<string[]>(init.order);
  const [enabled, setEnabled] = useState<Set<string>>(init.enabled);

  const [pwIsSet, setPwIsSet] = useState<boolean | null>(null); // null = đang tải
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // Khu vực đặt/đổi mật khẩu (chỉ Trưởng Phòng+)
  const [pwMode, setPwMode] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    let alive = true;
    sbVisaExportPasswordIsSet()
      .then((v) => { if (alive) setPwIsSet(v); })
      .catch(() => { if (alive) setPwIsSet(false); });
    return () => { alive = false; };
  }, []);

  // Tuỳ chọn cột đồng bộ theo tài khoản (user_prefs key `visaExportCols`) —
  // bản cloud (nếu có) đè cache localStorage; offline giữ nguyên local.
  useEffect(() => {
    if (!me?.u) return;
    let alive = true;
    fetchUserPref(me.u, 'visaExportCols')
      .then((raw) => {
        const p = validPref(raw);
        if (!alive || !p) return;
        const r = reconcilePref(p);
        setOrder(r.order);
        setEnabled(r.enabled);
      })
      .catch(() => { /* offline → giữ local */ });
    return () => { alive = false; };
  }, [me?.u]);

  const selectedCount = order.filter((k) => enabled.has(k)).length;

  const toggle = (k: string) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });

  const move = (idx: number, dir: -1 | 1) =>
    setOrder((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });

  // Chọn nhanh một preset: đưa các cột của preset lên đầu (đúng thứ tự đó),
  // phần còn lại xếp sau & bỏ tích.
  const applyPreset = (keys: string[]) => {
    const valid = keys.filter((k) => ALL_KEYS.includes(k));
    setOrder([...valid, ...ALL_KEYS.filter((k) => !valid.includes(k))]);
    setEnabled(new Set(valid));
  };

  const persistPref = () => {
    const pref: Pref = { order, enabled: [...enabled] };
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(pref));
    } catch { /* bỏ qua nếu localStorage đầy */ }
    if (me?.u) void pushUserPref(me.u, 'visaExportCols', pref).catch(() => { /* offline */ });
  };

  const savePassword = async () => {
    if (newPw.length < 4) { toast('Mật khẩu tối thiểu 4 ký tự.', 'warning'); return; }
    if (newPw !== newPw2) { toast('Hai lần nhập mật khẩu không khớp.', 'warning'); return; }
    setSavingPw(true);
    try {
      await sbSetVisaExportPassword(newPw);
      setPwIsSet(true); setPwMode(false); setNewPw(''); setNewPw2('');
      toast('✅ Đã lưu mật khẩu xuất. Mọi người sẽ dùng mật khẩu này.');
    } catch (e) {
      toast('❌ ' + (e as Error).message, 'error');
    } finally {
      setSavingPw(false);
    }
  };

  const doExport = async () => {
    if (selectedCount === 0) { toast('Chọn ít nhất một cột để xuất.', 'warning'); return; }
    if (!password) { toast('Nhập mật khẩu xuất (do Trưởng phòng cấp).', 'warning'); return; }
    setBusy(true);
    try {
      const ok = await sbVerifyVisaExportPassword(password);
      if (!ok) { toast('❌ Mật khẩu xuất không đúng.', 'error'); setBusy(false); return; }
      const keys = order.filter((k) => enabled.has(k));
      const { exportVisaApplicantListExcel } = await import('@/lib/exports/exportVisaApplicantList');
      await exportVisaApplicantListExcel(project, applicants, keys);
      persistPref();
      toast(`✅ Đã xuất ${applicants.length} khách (${keys.length} cột).`);
      onClose();
    } catch (e) {
      toast('❌ Lỗi xuất file: ' + (e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pr: 6, fontWeight: 800 }}>
        Tải danh sách khách xin visa
        <Typography variant="caption" display="block" color="text.secondary" sx={{ fontWeight: 400 }}>
          {project.name || project.code} · {applicants.length} khách
        </Typography>
        <IconButton onClick={onClose} disabled={busy} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.75 }}>
          Chọn cột & thứ tự ({selectedCount} cột)
        </Typography>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.25 }}>Chọn nhanh:</Typography>
          {VISA_EXPORT_PRESETS.map((p) => (
            <Chip key={p.id} label={p.label} size="small" variant="outlined" clickable
              icon={<RestartAltIcon style={{ fontSize: 15 }} />}
              onClick={() => applyPreset(p.keys)}
              sx={{ borderColor: '#0d7a6a', color: '#0d7a6a', '& .MuiChip-icon': { color: '#0d7a6a' } }} />
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Tích chọn cột cần xuất; dùng mũi tên để đổi thứ tự cột trong file Excel.
        </Typography>

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, maxHeight: 300, overflowY: 'auto' }}>
          {order.map((k, idx) => {
            const on = enabled.has(k);
            return (
              <Stack key={k} direction="row" alignItems="center" spacing={0.5}
                sx={{ px: 1, py: 0.25, borderBottom: idx < order.length - 1 ? '1px solid' : 'none', borderColor: 'divider', bgcolor: on ? 'transparent' : 'action.hover' }}>
                <Checkbox size="small" checked={on} onChange={() => toggle(k)} sx={{ p: 0.5 }} />
                <Typography variant="body2" sx={{ flex: 1, fontWeight: on ? 600 : 400, color: on ? 'text.primary' : 'text.disabled' }}>
                  {LABEL_BY_KEY.get(k)}
                </Typography>
                <IconButton size="small" disabled={idx === 0} onClick={() => move(idx, -1)}>
                  <ArrowUpwardIcon fontSize="inherit" />
                </IconButton>
                <IconButton size="small" disabled={idx === order.length - 1} onClick={() => move(idx, 1)}>
                  <ArrowDownwardIcon fontSize="inherit" />
                </IconButton>
              </Stack>
            );
          })}
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Cổng mật khẩu */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <LockOutlinedIcon fontSize="small" sx={{ color: '#0d7a6a' }} />
          <Typography variant="subtitle2" fontWeight={700}>Mật khẩu xuất</Typography>
        </Stack>

        {pwIsSet === null ? (
          <Stack direction="row" alignItems="center" spacing={1}><CircularProgress size={16} /><Typography variant="body2" color="text.secondary">Đang kiểm tra…</Typography></Stack>
        ) : pwIsSet ? (
          <TextField
            type="password" size="small" fullWidth label="Nhập mật khẩu xuất" value={password}
            onChange={(e) => setPassword(e.target.value)} autoComplete="off"
            onKeyDown={(e) => { if (e.key === 'Enter') void doExport(); }}
            helperText="Mật khẩu do Trưởng phòng đặt — bắt buộc cho mỗi lần xuất Excel."
          />
        ) : (
          <Alert severity="warning" sx={{ py: 0.5 }}>
            Chưa có mật khẩu xuất.{canSetPw ? ' Hãy đặt mật khẩu bên dưới.' : ' Liên hệ Trưởng phòng để được cấp.'}
          </Alert>
        )}

        {canSetPw && (
          <Box sx={{ mt: 1 }}>
            <Button size="small" onClick={() => setPwMode((v) => !v)} sx={{ color: '#0d7a6a' }}>
              {pwMode ? 'Đóng' : pwIsSet ? '🔑 Đổi mật khẩu xuất' : '🔑 Đặt mật khẩu xuất'}
            </Button>
            <Collapse in={pwMode}>
              <Stack spacing={1} sx={{ mt: 1 }}>
                <TextField type="password" size="small" fullWidth label="Mật khẩu mới" value={newPw}
                  onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
                <TextField type="password" size="small" fullWidth label="Nhập lại mật khẩu" value={newPw2}
                  onChange={(e) => setNewPw2(e.target.value)} autoComplete="new-password" />
                <Box>
                  <Button variant="contained" size="small" onClick={savePassword} disabled={savingPw}
                    sx={{ bgcolor: '#0d7a6a', '&:hover': { bgcolor: '#0a5c50' } }}>
                    {savingPw ? 'Đang lưu…' : 'Lưu mật khẩu'}
                  </Button>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    Áp dụng cho mọi người, mọi máy.
                  </Typography>
                </Box>
              </Stack>
            </Collapse>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} disabled={busy} color="inherit">Huỷ</Button>
        <Tooltip title={!pwIsSet ? 'Cần có mật khẩu xuất trước' : ''}>
          <span>
            <Button
              variant="contained" startIcon={<FileDownloadIcon />} onClick={doExport}
              disabled={busy || !pwIsSet || selectedCount === 0}
              sx={{ bgcolor: '#0d7a6a', fontWeight: 700, '&:hover': { bgcolor: '#0a5c50' } }}
            >
              {busy ? 'Đang xuất…' : 'Tải Excel'}
            </Button>
          </span>
        </Tooltip>
      </DialogActions>
    </Dialog>
  );
}
