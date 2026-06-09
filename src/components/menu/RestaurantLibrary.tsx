import { useMemo, useState } from 'react';
import {
  Box, Button, IconButton, Link, MenuItem, Paper, Select, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useRestaurantStore } from '@/stores/restaurantStore';
import { useAuthStore } from '@/stores/authStore';
import { MENU_CUR, newRestMenu, newRestaurant } from './constants';
import { StarRating } from './StarRating';
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

  const persist = (next: Restaurant[]) => {
    const savedBy = user ? `${user.name} (${user.role})` : 'unknown';
    void useRestaurantStore.getState().save(next, savedBy);
  };

  const addR = () => persist([...list, newRestaurant()]);
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

  const filtered = list.filter((r) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (r.name ?? '').toLowerCase().includes(q) ||
      (r.city ?? '').toLowerCase().includes(q) ||
      (r.country ?? '').toLowerCase().includes(q)
    );
  });

  const contOpts = useMemo(() => uniq([...CONT_SEED, ...list.map((r) => r.continent)]), [list]);
  const countryOpts = (cont: string) => uniq(list.filter((r) => !cont || r.continent === cont).map((r) => r.country));
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
        <TextField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Tìm nhà hàng, thành phố..."
          size="small"
          sx={{ maxWidth: 420, mb: 2, width: '100%' }}
        />

        <Stack spacing={2}>
          {filtered.map((r) => (
            <Paper key={r.id} sx={{ p: 2.25 }} variant="outlined">
              <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 40px', gap: 1.5, mb: 1.5, alignItems: 'center' }}>
                <TextField size="small" value={r.name}
                  onChange={(e) => updR(r.id, { name: e.target.value })}
                  placeholder="Tên nhà hàng"
                  InputProps={{ sx: { fontWeight: 700 } }} />
                <TextField size="small" value={r.continent}
                  onChange={(e) => updR(r.id, { continent: e.target.value })}
                  placeholder="Châu lục ▾"
                  inputProps={{ list: `dl-cont-${r.id}` }} />
                <Box component="datalist" id={`dl-cont-${r.id}`}>
                  {contOpts.map((o) => <option key={o} value={o} />)}
                </Box>
                <TextField size="small" value={r.country}
                  onChange={(e) => updR(r.id, { country: e.target.value })}
                  placeholder="Quốc gia ▾"
                  inputProps={{ list: `dl-country-${r.id}` }} />
                <Box component="datalist" id={`dl-country-${r.id}`}>
                  {countryOpts(r.continent).map((o) => <option key={o} value={o} />)}
                </Box>
                <TextField size="small" value={r.city}
                  onChange={(e) => updR(r.id, { city: e.target.value })}
                  placeholder="Thành phố ▾"
                  inputProps={{ list: `dl-city-${r.id}` }} />
                <Box component="datalist" id={`dl-city-${r.id}`}>
                  {cityOpts(r.country).map((o) => <option key={o} value={o} />)}
                </Box>
                <IconButton size="small" color="error" onClick={() => delR(r.id)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>

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
    </Box>
  );
}
