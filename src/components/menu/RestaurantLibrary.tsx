import { useMemo, useState } from 'react';
import {
  Autocomplete, Box, Button, Chip, IconButton, Link, MenuItem, Paper, Select, Stack, TextField, Typography,
} from '@mui/material';
import { NCC_CONTINENTS, NCC_COUNTRIES, NCC_ALL_COUNTRIES } from '@/components/ncc/constants';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { useRestaurantStore } from '@/stores/restaurantStore';
import { useAuthStore } from '@/stores/authStore';
import { uploadFileToWorker } from '@/lib/aiWorker';
import { openFilePreview } from '@/stores/filePreviewStore';
import { MENU_CUR, newRestMenu, newRestaurant } from './constants';
import { StarRating } from './StarRating';
import { AIRestaurantImportDialog } from './AIRestaurantImportDialog';
import type { ParsedRestaurant } from '@/lib/restaurantFileParse';
import { AiButton } from '@/components/common/AiButton';
import type { ChangeEvent } from 'react';
import type { Restaurant } from '@/types';

type Props = { onBack: () => void };

const CONT_SEED = ['Châu Á', 'Châu Âu', 'Châu Úc', 'Châu Mỹ', 'Châu Phi', 'Việt Nam'];

function uniq(a: string[]): string[] {
  return [...new Set(a.filter(Boolean).map((s) => s.trim()))].sort((x, y) => x.localeCompare(y, 'vi'));
}

function normalizeUrl(u: string | undefined): string {
  if (!u) return '';
  return /^https?:\/\//.test(u) ? u : 'https://' + u;
}

export function RestaurantLibrary({ onBack }: Props) {
  const list = useRestaurantStore((s) => s.list);
  const user = useAuthStore((s) => s.currentUser);
  const [search, setSearch] = useState('');
  const [filterCont, setFilterCont] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterRating, setFilterRating] = useState(0);

  const persist = (next: Restaurant[]) => {
    const savedBy = user ? `${user.name} (${user.role})` : 'unknown';
    void useRestaurantStore.getState().save(next, savedBy);
  };

  const addR = () => persist([...list, newRestaurant()]);
  const [aiOpen, setAiOpen] = useState(false);
  const addRestaurant = (r: Restaurant) => persist([...useRestaurantStore.getState().list, r]);
  const updR = (id: string, patch: Partial<Restaurant>) =>
    persist(list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const delR = (id: string) => {
    if (!window.confirm('Xoá nhà hàng này khỏi thư viện?')) return;
    persist(list.filter((r) => r.id !== id));
  };

  const addMenu = (rid: string) => {
    const r = list.find((x) => x.id === rid);
    if (!r) return;
    updR(rid, { menus: [...(r.menus ?? []), newRestMenu()] });
  };
  const updMenu = (rid: string, mid: string, patch: Partial<Restaurant['menus'][number]>) => {
    const r = list.find((x) => x.id === rid);
    if (!r) return;
    updR(rid, { menus: r.menus.map((m) => (m.id === mid ? { ...m, ...patch } : m)) });
  };
  const delMenu = (rid: string, mid: string) => {
    const r = list.find((x) => x.id === rid);
    if (!r) return;
    updR(rid, { menus: r.menus.filter((m) => m.id !== mid) });
  };

  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const patchFresh = (rid: string, fn: (r: Restaurant) => Restaurant) =>
    persist(useRestaurantStore.getState().list.map((r) => (r.id === rid ? fn(r) : r)));
  const onPickFile = async (rid: string, e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { window.alert('File vượt quá 20MB.'); return; }
    setUploadingId(rid);
    try {
      const up = await uploadFileToWorker(f);
      patchFresh(rid, (r) => ({ ...r, files: [...(r.files ?? []), { key: up.key, name: up.name, uploadedBy: user?.name, uploadedAt: new Date().toISOString() }] }));
    } catch (e2) { window.alert('Tải file lỗi: ' + (e2 as Error).message); }
    finally { setUploadingId(null); }
  };
  const delFile = (rid: string, key: string) => patchFresh(rid, (r) => ({ ...r, files: (r.files ?? []).filter((f) => f.key !== key) }));

  const mergeIntoR = (rid: string, p: ParsedRestaurant) => patchFresh(rid, (r) => ({
    ...r,
    name: r.name || p.name,
    address: r.address || p.address,
    city: r.city || p.city,
    country: r.country || p.country,
    continent: r.continent || p.continent,
    contact: r.contact || p.contact,
    note: r.note ? (p.note ? `${r.note}\n${p.note}` : r.note) : p.note,
    rating: r.rating || p.rating,
    menus: [...(r.menus ?? []), ...p.menus.map((m) => ({ ...newRestMenu(m.name), name: m.name, dishes: m.dishes, price: m.price, cur: m.cur, review: m.review }))],
  }));

  const filtered = list.filter((r) => {
    if (filterCont && r.continent !== filterCont) return false;
    if (filterCountry && r.country !== filterCountry) return false;
    if (filterCity && r.city !== filterCity) return false;
    if (filterRating && (r.rating ?? 0) < filterRating) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (r.name ?? '').toLowerCase().includes(q) ||
      (r.city ?? '').toLowerCase().includes(q) ||
      (r.country ?? '').toLowerCase().includes(q) ||
      (r.address ?? '').toLowerCase().includes(q)
    );
  });

  // Danh mục chuẩn (như NCC) + giá trị đang có trong dữ liệu.
  const contOpts = useMemo(() => uniq([...NCC_CONTINENTS, ...CONT_SEED, ...list.map((r) => r.continent)]), [list]);
  const countryOpts = (cont: string) =>
    uniq([...(cont ? (NCC_COUNTRIES[cont] ?? []) : NCC_ALL_COUNTRIES), ...list.filter((r) => !cont || r.continent === cont).map((r) => r.country)]);
  const cityOpts = (country: string) => uniq(list.filter((r) => !country || r.country === country).map((r) => r.city));

  return (
    <Box sx={{ minHeight: '100%' }}>
      <Box sx={{ background: 'linear-gradient(135deg,#0a5c50,#0d7a6a 40%,#14a08c)', color: '#fff', px: 3, py: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
          <Typography variant="h6" fontWeight={900}>
            🏪 Thư viện Nhà hàng
            <Typography component="span" variant="caption" sx={{ ml: 1, opacity: 0.85 }}>
              · {list.length} nhà hàng
            </Typography>
          </Typography>
          <Stack direction="row" spacing={1}>
            <AiButton size="small" onClick={() => setAiOpen(true)}
              title="Tải file/ảnh thực đơn để AI tự phân tích & thêm">
              AI từ thực đơn
            </AiButton>
            <Button variant="contained" color="inherit" startIcon={<AddIcon />} onClick={addR}
              sx={{ bgcolor: '#fff', color: '#0d7a6a', fontWeight: 800 }}>
              Thêm nhà hàng
            </Button>
            <Button variant="outlined" color="inherit" startIcon={<ArrowBackIcon />} onClick={onBack}>
              Thực đơn
            </Button>
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
        <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          <TextField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Tìm tên, địa chỉ, thành phố..."
            size="small"
            sx={{ flex: 1, minWidth: 220 }}
          />
          <Select size="small" displayEmpty value={filterCont}
            onChange={(e) => { setFilterCont(e.target.value); setFilterCountry(''); setFilterCity(''); }}
            sx={{ minWidth: 140 }}>
            <MenuItem value="">Tất cả châu lục</MenuItem>
            {contOpts.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
          </Select>
          <Select size="small" displayEmpty value={filterCountry}
            onChange={(e) => { setFilterCountry(e.target.value); setFilterCity(''); }}
            sx={{ minWidth: 140 }}>
            <MenuItem value="">Tất cả quốc gia</MenuItem>
            {countryOpts(filterCont).map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
          </Select>
          <Select size="small" displayEmpty value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)} sx={{ minWidth: 140 }}>
            <MenuItem value="">Tất cả thành phố</MenuItem>
            {cityOpts(filterCountry).map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
          </Select>
          <Select size="small" value={filterRating}
            onChange={(e) => setFilterRating(Number(e.target.value))} sx={{ minWidth: 130 }}>
            <MenuItem value={0}>Mọi đánh giá</MenuItem>
            <MenuItem value={5}>★ 5</MenuItem>
            <MenuItem value={4}>★ ≥ 4</MenuItem>
            <MenuItem value={3}>★ ≥ 3</MenuItem>
          </Select>
          {(search || filterCont || filterCountry || filterCity || filterRating > 0) && (
            <Button size="small" color="error" variant="outlined"
              onClick={() => { setSearch(''); setFilterCont(''); setFilterCountry(''); setFilterCity(''); setFilterRating(0); }}>
              ✕ Xoá lọc
            </Button>
          )}
        </Stack>

        <Stack spacing={2}>
          {filtered.map((r) => (
            <Paper key={r.id} sx={{ p: 2.25 }} variant="outlined">
              <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 40px', gap: 1.5, mb: 1.5, alignItems: 'center' }}>
                <TextField size="small" value={r.name}
                  onChange={(e) => updR(r.id, { name: e.target.value })}
                  placeholder="Tên nhà hàng"
                  InputProps={{ sx: { fontWeight: 700 } }} />
                <Autocomplete freeSolo size="small" options={contOpts} value={r.continent || ''}
                  onInputChange={(_, v) => { if (v !== (r.continent || '')) updR(r.id, { continent: v }); }}
                  renderInput={(params) => <TextField {...params} placeholder="Châu lục ▾" />} />
                <Autocomplete freeSolo size="small" options={countryOpts(r.continent)} value={r.country || ''}
                  onInputChange={(_, v) => { if (v !== (r.country || '')) updR(r.id, { country: v }); }}
                  renderInput={(params) => <TextField {...params} placeholder="Quốc gia ▾" />} />
                <Autocomplete freeSolo size="small" options={cityOpts(r.country)} value={r.city || ''}
                  onInputChange={(_, v) => { if (v !== (r.city || '')) updR(r.id, { city: v }); }}
                  renderInput={(params) => <TextField {...params} placeholder="Thành phố ▾" />} />
                <IconButton size="small" color="error" onClick={() => delR(r.id)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>

              <TextField fullWidth size="small" value={r.address ?? ''}
                onChange={(e) => updR(r.id, { address: e.target.value })}
                placeholder="📍 Địa chỉ"
                sx={{ mb: 1.5, '& .MuiInputBase-input': { fontSize: 12 } }} />

              <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap' }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary">
                  Đánh giá chất lượng:
                </Typography>
                <StarRating value={r.rating} onChange={(v) => updR(r.id, { rating: v })} size={17} />
                <TextField
                  size="small" fullWidth value={r.review}
                  onChange={(e) => updR(r.id, { review: e.target.value })}
                  placeholder="Lưu ý cho tour sau (phục vụ, vị trí, chất lượng...)"
                  sx={{ flex: 1, minWidth: 200, '& .MuiInputBase-input': { fontSize: 12 } }}
                />
              </Stack>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.25, mb: 1.5 }}>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <TextField fullWidth size="small" value={r.website ?? ''}
                    onChange={(e) => updR(r.id, { website: e.target.value })}
                    placeholder="Website"
                    sx={{ '& .MuiInputBase-input': { fontSize: 12 } }} />
                  {r.website && (
                    <Link href={normalizeUrl(r.website)} target="_blank" rel="noopener" title="Mở website">🌐</Link>
                  )}
                </Stack>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <TextField fullWidth size="small" value={r.menuLink ?? ''}
                    onChange={(e) => updR(r.id, { menuLink: e.target.value })}
                    placeholder="Link menu"
                    sx={{ '& .MuiInputBase-input': { fontSize: 12 } }} />
                  {r.menuLink && (
                    <Link href={normalizeUrl(r.menuLink)} target="_blank" rel="noopener" title="Mở link menu">📋</Link>
                  )}
                </Stack>
                <TextField fullWidth size="small" value={r.contact ?? ''}
                  onChange={(e) => updR(r.id, { contact: e.target.value })}
                  placeholder="Contact (SĐT / email / người LH)"
                  sx={{ '& .MuiInputBase-input': { fontSize: 12 } }} />
              </Box>

              <TextField fullWidth size="small" multiline minRows={2} value={r.note ?? ''}
                onChange={(e) => updR(r.id, { note: e.target.value })}
                placeholder="📝 Thông tin / ghi chú (đặc sản, lưu ý đặt bàn, sức chứa…)"
                sx={{ mb: 1.5, '& .MuiInputBase-input': { fontSize: 12 } }} />

              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                <Button component="label" size="small" variant="outlined" startIcon={<AttachFileIcon fontSize="small" />} disabled={uploadingId === r.id}
                  sx={{ fontSize: 12 }}>
                  {uploadingId === r.id ? 'Đang tải…' : 'Thêm file'}
                  <input type="file" hidden onChange={(e) => void onPickFile(r.id, e)} />
                </Button>
                {(r.files ?? []).map((f) => (
                  <Chip key={f.key} size="small" icon={<AttachFileIcon />} label={f.name}
                    onClick={() => openFilePreview({ key: f.key, name: f.name })}
                    onDelete={() => delFile(r.id, f.key)} sx={{ maxWidth: 240 }} />
                ))}
              </Stack>

              <Typography variant="caption" fontWeight={700} color="text.secondary"
                sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Thực đơn mẫu (mỗi món 1 dòng)
              </Typography>

              <Stack spacing={1.25}>
                {(r.menus ?? []).map((m) => (
                  <Box key={m.id} sx={{
                    display: 'grid', gridTemplateColumns: '1.2fr 2.5fr 1.3fr 30px',
                    gap: 1.25, alignItems: 'start',
                    bgcolor: 'rgba(168,230,221,0.12)', borderRadius: 1.5, p: 1.25,
                  }}>
                    <Stack spacing={0.75}>
                      <TextField size="small" value={m.name}
                        onChange={(e) => updMenu(r.id, m.id, { name: e.target.value })}
                        placeholder="Tên set"
                        InputProps={{ sx: { fontSize: 12, fontWeight: 600 } }} />
                      <StarRating value={m.rating} onChange={(v) => updMenu(r.id, m.id, { rating: v })} size={14} />
                    </Stack>
                    <TextField size="small" multiline minRows={3} value={m.dishes}
                      onChange={(e) => updMenu(r.id, m.id, { dishes: e.target.value })}
                      placeholder={'Gỏi cuốn\nCá kho tộ\nCanh chua...'}
                      InputProps={{ sx: { fontSize: 12 } }} />
                    <Stack spacing={0.75}>
                      <Stack direction="row" spacing={0.5}>
                        <TextField size="small" type="number" value={m.price}
                          onChange={(e) => updMenu(r.id, m.id, { price: +e.target.value })}
                          placeholder="Giá"
                          InputProps={{ sx: { fontSize: 12, textAlign: 'right' } }} />
                        <Select size="small" value={m.cur}
                          onChange={(e) => updMenu(r.id, m.id, { cur: e.target.value })}
                          sx={{ width: 70, fontSize: 11 }}>
                          {MENU_CUR.map((c) => (
                            <MenuItem key={c} value={c}>{c}</MenuItem>
                          ))}
                        </Select>
                      </Stack>
                      <TextField size="small" value={m.review}
                        onChange={(e) => updMenu(r.id, m.id, { review: e.target.value })}
                        placeholder="Nhận xét set"
                        InputProps={{ sx: { fontSize: 11, fontStyle: m.review ? 'normal' : 'italic' } }} />
                    </Stack>
                    <IconButton size="small" color="error" onClick={() => delMenu(r.id, m.id)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Stack>

              <Button size="small" startIcon={<AddIcon />} onClick={() => addMenu(r.id)}
                sx={{ mt: 1, color: '#0d7a6a' }}>
                Thêm set thực đơn
              </Button>
            </Paper>
          ))}
        </Stack>
      </Box>

      <AIRestaurantImportDialog open={aiOpen} onClose={() => setAiOpen(false)} onAdd={addRestaurant} onMerge={mergeIntoR} restaurants={list} />
    </Box>
  );
}
