import { useState, type ChangeEvent } from 'react';
import {
  Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  Link, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useAuthStore } from '@/stores/authStore';
import { useNccStore } from '@/stores/nccStore';
import { useNccProductsStore } from '@/stores/nccProductsStore';
import { uploadFileToWorker, workerFileUrl } from '@/lib/aiWorker';
import { CATS } from '@/components/quote/constants';
import { MENU_CUR } from '@/components/menu/constants';
import type { CategoryId, FileAttachment, NccPrice, NccProduct } from '@/types';

const newRowId = () => 'pr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const emptyRow = (): NccPrice => ({ id: newRowId(), label: '', amount: 0, cur: 'VND', unit: 'người' });

export function NccProductEditor({ product, onClose }: { product: NccProduct; onClose: () => void }) {
  const user = useAuthStore((s) => s.currentUser);
  const suppliers = useNccStore((s) => s.suppliers);
  const saveNcc = useNccStore((s) => s.save);
  const saveProduct = useNccProductsStore((s) => s.save);

  const [nccName, setNccName] = useState(product.nccName);
  const [nccId, setNccId] = useState<string | null>(product.nccId);
  const [category, setCategory] = useState<CategoryId>(product.category);
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? '');
  const [note, setNote] = useState(product.note ?? '');
  const [prices, setPrices] = useState<NccPrice[]>(product.prices?.length ? product.prices.map((p) => ({ ...p })) : [emptyRow()]);
  const [files, setFiles] = useState<FileAttachment[]>(product.files ? product.files.map((f) => ({ ...f })) : []);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const updRow = (id: string, patch: Partial<NccPrice>) => setPrices((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const onPickFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files;
    e.target.value = '';
    if (!picked?.length) return;
    setUploading(true);
    try {
      const uploaded: FileAttachment[] = [];
      for (const f of Array.from(picked)) {
        const r = await uploadFileToWorker(f);
        uploaded.push({ key: r.key, name: r.name, uploadedBy: user?.name, uploadedAt: new Date().toISOString() });
      }
      setFiles((prev) => [...prev, ...uploaded]);
    } catch (err) {
      window.alert('❌ Tải file thất bại: ' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { window.alert('Nhập tên sản phẩm.'); return; }
    setBusy(true);
    try {
      // Nếu là NCC mới (chưa có trong master) → thêm vào NCC master để tái dùng.
      let resolvedId = nccId;
      const trimmedNcc = nccName.trim();
      if (trimmedNcc && !suppliers.some((s) => s.name === trimmedNcc)) {
        const id = 'ncc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        await saveNcc({ id, name: trimmedNcc, sectors: [], location: '', contacts: [], note: '', createdAt: '', createdBy: '' });
        resolvedId = id;
      }
      const clean = prices.filter((p) => p.label.trim() || p.amount > 0);
      await saveProduct({
        ...product,
        nccId: resolvedId,
        nccName: trimmedNcc,
        category,
        name: name.trim(),
        description: description.trim() || undefined,
        prices: clean,
        files,
        note: note.trim() || undefined,
      });
      onClose();
    } catch (e) {
      window.alert('❌ Lỗi lưu sản phẩm: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>{product.id ? 'Sửa sản phẩm NCC' : 'Thêm sản phẩm NCC'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <Autocomplete
              freeSolo options={suppliers.map((s) => s.name)} value={nccName}
              onInputChange={(_, v) => { setNccName(v); setNccId(suppliers.find((s) => s.name === v)?.id ?? null); }}
              renderInput={(p) => <TextField {...p} label="Nhà cung cấp" placeholder="Chọn NCC có sẵn hoặc gõ tên mới" />}
            />
            <TextField select label="Hạng mục" value={category} onChange={(e) => setCategory(e.target.value as CategoryId)}>
              {CATS.map((c) => <MenuItem key={c.id} value={c.id}>{c.icon} {c.label}</MenuItem>)}
            </TextField>
          </Box>
          <TextField label="Tên sản phẩm / dịch vụ" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
          <TextField label="Mô tả (tuỳ chọn)" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline minRows={2} />

          <Box>
            <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Bảng giá tham khảo
            </Typography>
            <Stack spacing={1} sx={{ mt: 0.75 }}>
              {prices.map((r) => (
                <Box key={r.id} sx={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.9fr 1fr 32px', gap: 1, alignItems: 'center' }}>
                  <TextField size="small" placeholder="Mức giá (vd: Mùa cao điểm)" value={r.label} onChange={(e) => updRow(r.id, { label: e.target.value })} />
                  <TextField size="small" type="number" placeholder="Đơn giá" value={r.amount || ''} onChange={(e) => updRow(r.id, { amount: +e.target.value })}
                    slotProps={{ htmlInput: { min: 0, style: { textAlign: 'right' } } }} />
                  <TextField select size="small" value={r.cur} onChange={(e) => updRow(r.id, { cur: e.target.value })}>
                    {MENU_CUR.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                  </TextField>
                  <TextField size="small" placeholder="Đơn vị" value={r.unit} onChange={(e) => updRow(r.id, { unit: e.target.value })} />
                  <IconButton size="small" color="error" onClick={() => setPrices((prev) => prev.filter((x) => x.id !== r.id))}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Stack>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setPrices((prev) => [...prev, emptyRow()])} sx={{ mt: 0.5, color: '#0d7a6a' }}>
              Thêm dòng giá
            </Button>
          </Box>

          <Box>
            <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              File báo giá tham khảo
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 0.75 }}>
              {files.map((f, i) => (
                <Stack key={f.key} direction="row" alignItems="center" spacing={1}>
                  <Link href={workerFileUrl(f.key)} target="_blank" rel="noreferrer" sx={{ flex: 1, wordBreak: 'break-all' }}>📎 {f.name}</Link>
                  <Button size="small" color="error" onClick={() => setFiles((prev) => prev.filter((_, k) => k !== i))}>Gỡ</Button>
                </Stack>
              ))}
              <Box>
                <Button component="label" variant="outlined" size="small" startIcon={<AttachFileIcon />} disabled={uploading}>
                  {uploading ? 'Đang tải lên…' : 'Đính kèm file (PDF/ảnh/Word…)'}
                  <input type="file" hidden multiple accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={onPickFiles} />
                </Button>
              </Box>
            </Stack>
          </Box>

          <TextField label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} fullWidth multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy} color="inherit">Huỷ</Button>
        <Button onClick={() => void handleSave()} disabled={busy} variant="contained" sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
          {busy ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
