import { useState, type ChangeEvent } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  IconButton, MenuItem, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useAuthStore } from '@/stores/authStore';
import { useCustomerStore } from '@/stores/customerStore';
import { uploadFileToWorker } from '@/lib/aiWorker';
import { openFilePreview } from '@/stores/filePreviewStore';
import { daysUntil } from '@/lib/dateUtils';
import { toast } from '@/stores/toastStore';
import type { Customer, FileAttachment, TravelerDoc } from '@/types';

const newId = () => 'trv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtD = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—');

/** Chip ngày hết hạn — đỏ nếu đã/ sắp hết hạn. */
function ExpiryChip({ label, iso }: { label: string; iso?: string }) {
  if (!iso) return null;
  const d = daysUntil(iso);
  const color = d == null ? 'default' : d < 0 ? 'error' : d <= 90 ? 'warning' : 'default';
  const txt = d == null ? '' : d < 0 ? ` · HẾT HẠN` : d <= 90 ? ` · còn ${d}n` : '';
  return <Chip size="small" color={color} variant={d != null && d <= 90 ? 'filled' : 'outlined'} label={`${label}: ${fmtD(iso)}${txt}`} sx={{ height: 20, fontWeight: 600 }} />;
}

/** Khu vực hồ sơ hộ chiếu/visa của khách (đã được gate quyền ở Customer360). */
export function TravelerDocsPanel({ customer, canEdit }: { customer: Customer; canEdit: boolean }) {
  const saveCustomer = useCustomerStore((s) => s.save);
  const [edit, setEdit] = useState<{ traveler: TravelerDoc | null } | null>(null);

  const travelers = customer.travelers ?? [];

  const removeTraveler = async (id: string) => {
    if (!window.confirm('Xoá hồ sơ giấy tờ của người này?')) return;
    const fresh = useCustomerStore.getState().customers.find((c) => c.id === customer.id) ?? customer;
    await saveCustomer({ ...fresh, travelers: (fresh.travelers ?? []).filter((t) => t.id !== id) });
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
        <LockOutlinedIcon sx={{ fontSize: 16, color: '#7c3aed', mr: 0.5 }} />
        <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase' }}>
          Hồ sơ hộ chiếu / Visa ({travelers.length})
        </Typography>
        <Box sx={{ flex: 1 }} />
        {canEdit && (
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setEdit({ traveler: null })}
            sx={{ color: '#7c3aed', borderColor: 'rgba(124,58,237,0.4)' }}>Thêm người</Button>
        )}
      </Stack>
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1 }}>
        🔒 Dữ liệu nhạy cảm — chỉ người tạo khách, quản lý &amp; phòng Visa/Operations xem được.
      </Typography>

      {travelers.length === 0 ? (
        <Typography variant="caption" color="text.disabled">Chưa có hồ sơ giấy tờ.</Typography>
      ) : (
        <Stack spacing={1}>
          {travelers.map((t) => (
            <Paper key={t.id} variant="outlined" sx={{ p: 1.25, borderLeft: '4px solid #7c3aed' }}>
              <Stack direction="row" alignItems="flex-start" spacing={1}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontWeight={700} fontSize={14}>{t.fullName || '(chưa có tên)'}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {[t.nationality, t.passportNo ? `HC ${t.passportNo}` : '', t.dob ? `NS ${fmtD(t.dob)}` : ''].filter(Boolean).join(' · ') || '—'}
                  </Typography>
                  <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }} flexWrap="wrap" useFlexGap>
                    <ExpiryChip label="HC" iso={t.passportExpiry} />
                    {(t.visaCountry || t.visaExpiry) && <ExpiryChip label={`Visa${t.visaCountry ? ' ' + t.visaCountry : ''}`} iso={t.visaExpiry} />}
                    {t.visaStatus && <Chip size="small" variant="outlined" label={t.visaStatus} sx={{ height: 20 }} />}
                    {[...(t.passportFiles ?? []), ...(t.visaFiles ?? [])].length > 0 &&
                      <Chip size="small" variant="outlined" label={`📎 ${[...(t.passportFiles ?? []), ...(t.visaFiles ?? [])].length} file`} sx={{ height: 20 }} />}
                  </Stack>
                </Box>
                {canEdit && (
                  <>
                    <IconButton size="small" onClick={() => setEdit({ traveler: t })}><EditIcon sx={{ fontSize: 16 }} /></IconButton>
                    <IconButton size="small" color="error" onClick={() => void removeTraveler(t.id)}><DeleteOutlineIcon sx={{ fontSize: 16 }} /></IconButton>
                  </>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      {edit && <TravelerDocModal customer={customer} traveler={edit.traveler} onClose={() => setEdit(null)} />}
    </Box>
  );
}

function FileList({ label, files, busy, onAdd, onRemove }: {
  label: string; files: FileAttachment[]; busy: boolean;
  onAdd: (e: ChangeEvent<HTMLInputElement>) => void; onRemove: (key: string) => void;
}) {
  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <Typography variant="caption" fontWeight={700} color="text.secondary">{label}</Typography>
        <Button component="label" size="small" startIcon={<UploadFileIcon />} disabled={busy}>
          {busy ? 'Đang tải…' : 'Tải file'}
          <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,image/*" onChange={onAdd} />
        </Button>
      </Stack>
      {files.length === 0 ? <Typography variant="caption" color="text.disabled">Chưa có file.</Typography> : (
        <Stack spacing={0.5}>
          {files.map((f) => (
            <Stack key={f.key} direction="row" alignItems="center" spacing={1}>
              <Box component="button" type="button" onClick={() => openFilePreview({ key: f.key, name: f.name })}
                sx={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', bgcolor: 'transparent', cursor: 'pointer', p: 0, fontSize: 13, fontWeight: 600, color: '#7c3aed', fontFamily: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', '&:hover': { textDecoration: 'underline' } }}>
                📎 {f.name}
              </Box>
              <Tooltip title="Mở"><IconButton size="small" component="a" href="#" onClick={(e) => { e.preventDefault(); openFilePreview({ key: f.key, name: f.name }); }}><OpenInNewIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
              <Button size="small" color="error" onClick={() => onRemove(f.key)}>Gỡ</Button>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  );
}

function TravelerDocModal({ customer, traveler, onClose }: { customer: Customer; traveler: TravelerDoc | null; onClose: () => void }) {
  const user = useAuthStore((s) => s.currentUser);
  const saveCustomer = useCustomerStore((s) => s.save);
  const [f, setF] = useState<TravelerDoc>(() => traveler ?? { id: newId(), fullName: customer.type === 'individual' ? customer.name : '' });
  const [pBusy, setPBusy] = useState(false);
  const [vBusy, setVBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<TravelerDoc>) => setF((p) => ({ ...p, ...patch }));

  const uploadInto = async (e: ChangeEvent<HTMLInputElement>, key: 'passportFiles' | 'visaFiles', setLoading: (b: boolean) => void) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLoading(true);
    try {
      const up = await uploadFileToWorker(file);
      const att: FileAttachment = { ...up, uploadedBy: user?.name, uploadedAt: new Date().toISOString() };
      setF((p) => ({ ...p, [key]: [...(p[key] ?? []), att] }));
    } catch (err) { window.alert('❌ Tải file lỗi: ' + (err as Error).message); }
    finally { setLoading(false); }
  };
  const removeFile = (key: 'passportFiles' | 'visaFiles', fileKey: string) =>
    setF((p) => ({ ...p, [key]: (p[key] ?? []).filter((x) => x.key !== fileKey) }));

  const save = async () => {
    if (!f.fullName.trim()) { window.alert('Nhập họ tên người.'); return; }
    setBusy(true);
    try {
      const fresh = useCustomerStore.getState().customers.find((c) => c.id === customer.id) ?? customer;
      const rec: TravelerDoc = { ...f, fullName: f.fullName.trim(), updatedAt: new Date().toISOString(), updatedBy: user?.name };
      const list = fresh.travelers ?? [];
      const travelers = list.some((x) => x.id === rec.id) ? list.map((x) => (x.id === rec.id ? rec : x)) : [...list, rec];
      await saveCustomer({ ...fresh, travelers });
      toast('✅ Đã lưu hồ sơ giấy tờ.');
      onClose();
    } catch (e) { window.alert('❌ Lỗi lưu: ' + (e as Error).message); }
    finally { setBusy(false); }
  };

  const dateField = (label: string, key: keyof TravelerDoc) => (
    <TextField label={label} type="date" size="small" value={(f[key] as string) ?? ''} onChange={(e) => set({ [key]: e.target.value })} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
  );

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{traveler ? 'Sửa hồ sơ giấy tờ' : 'Thêm hồ sơ giấy tờ'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="caption" fontWeight={800} color="text.secondary">THÔNG TIN NGƯỜI</Typography>
          <TextField label="Họ tên (như hộ chiếu)" required size="small" value={f.fullName} onChange={(e) => set({ fullName: e.target.value })} autoFocus />
          <Stack direction="row" spacing={1.5}>
            <TextField select label="Giới tính" size="small" value={f.gender ?? ''} onChange={(e) => set({ gender: e.target.value as TravelerDoc['gender'] })} sx={{ width: 110 }}>
              <MenuItem value="">—</MenuItem><MenuItem value="M">Nam</MenuItem><MenuItem value="F">Nữ</MenuItem>
            </TextField>
            {dateField('Ngày sinh', 'dob')}
            <TextField label="Quốc tịch" size="small" value={f.nationality ?? ''} onChange={(e) => set({ nationality: e.target.value })} sx={{ flex: 1 }} />
          </Stack>

          <Divider>Hộ chiếu</Divider>
          <Stack direction="row" spacing={1.5}>
            <TextField label="Số hộ chiếu" size="small" value={f.passportNo ?? ''} onChange={(e) => set({ passportNo: e.target.value.toUpperCase() })} sx={{ flex: 1 }} />
            <TextField label="Nơi cấp" size="small" value={f.passportIssuePlace ?? ''} onChange={(e) => set({ passportIssuePlace: e.target.value })} sx={{ flex: 1 }} />
          </Stack>
          <Stack direction="row" spacing={1.5}>
            {dateField('Ngày cấp', 'passportIssueDate')}
            {dateField('Hết hạn', 'passportExpiry')}
          </Stack>
          <FileList label="File hộ chiếu (scan)" files={f.passportFiles ?? []} busy={pBusy}
            onAdd={(e) => void uploadInto(e, 'passportFiles', setPBusy)} onRemove={(k) => removeFile('passportFiles', k)} />

          <Divider>Visa</Divider>
          <Stack direction="row" spacing={1.5}>
            <TextField label="Quốc gia" size="small" value={f.visaCountry ?? ''} onChange={(e) => set({ visaCountry: e.target.value })} sx={{ flex: 1 }} />
            <TextField label="Loại visa" size="small" value={f.visaType ?? ''} onChange={(e) => set({ visaType: e.target.value })} sx={{ flex: 1 }} />
            <TextField label="Số visa" size="small" value={f.visaNo ?? ''} onChange={(e) => set({ visaNo: e.target.value })} sx={{ flex: 1 }} />
          </Stack>
          <Stack direction="row" spacing={1.5}>
            {dateField('Ngày cấp', 'visaIssueDate')}
            {dateField('Hết hạn', 'visaExpiry')}
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <TextField label="Số lần nhập cảnh" size="small" value={f.visaEntries ?? ''} onChange={(e) => set({ visaEntries: e.target.value })} sx={{ flex: 1 }} placeholder="1 lần / nhiều lần" />
            <TextField label="Trạng thái" size="small" value={f.visaStatus ?? ''} onChange={(e) => set({ visaStatus: e.target.value })} sx={{ flex: 1 }} placeholder="Đang xử lý / Đã cấp…" />
          </Stack>
          <FileList label="File visa (scan)" files={f.visaFiles ?? []} busy={vBusy}
            onAdd={(e) => void uploadInto(e, 'visaFiles', setVBusy)} onRemove={(k) => removeFile('visaFiles', k)} />

          <TextField label="Ghi chú" size="small" multiline rows={2} value={f.note ?? ''} onChange={(e) => set({ note: e.target.value })} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Huỷ</Button>
        <Button variant="contained" disabled={busy || pBusy || vBusy} onClick={() => void save()} sx={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', fontWeight: 800 }}>
          {busy ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
