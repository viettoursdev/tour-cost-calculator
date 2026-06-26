import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Chip, IconButton, Link, MenuItem, Paper, Select, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import RestaurantMenuOutlinedIcon from '@mui/icons-material/RestaurantMenuOutlined';
import { NCC_CONTINENTS, NCC_COUNTRIES, NCC_ALL_COUNTRIES } from '@/components/ncc/constants';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { useRestaurantStore } from '@/stores/restaurantStore';
import { useMenuStore } from '@/stores/menuStore';
import { useAuthStore } from '@/stores/authStore';
import { uploadFileToWorker } from '@/lib/aiWorker';
import { openFilePreview } from '@/stores/filePreviewStore';
import { MENU_CUR, newRestMenu, newRestaurant } from './constants';
import { StarRating } from './StarRating';
import { AIRestaurantImportDialog } from './AIRestaurantImportDialog';
import type { ParsedRestaurant } from '@/lib/restaurantFileParse';
import { AiButton } from '@/components/common/AiButton';
import { DebouncedTextField } from '@/components/common/DebouncedTextField';
import { DebouncedAutocomplete } from '@/components/common/DebouncedAutocomplete';
import { filterFieldSx, filterSelectSx } from '@/components/common/filterStyles';
import type { ChangeEvent } from 'react';
import type { Restaurant, RestaurantMenu, RestaurantTourLink } from '@/types';

type Props = { onBack: () => void };

const CONT_SEED = ['Châu Á', 'Châu Âu', 'Châu Úc', 'Châu Mỹ', 'Châu Phi', 'Việt Nam'];

// sx ổn định (hoist khỏi render): tránh emotion serialize lại mỗi lần vẽ thẻ.
const PAPER_SX = {
  p: 1.75,
  '& .MuiOutlinedInput-input': { py: 0.6, fontSize: 13.5 },
  '& .MuiInputBase-inputMultiline': { py: 0 },
  '& .MuiAutocomplete-input': { py: '2.5px !important' },
} as const;
const HEADER_GRID_SX = { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 36px', gap: 1, mb: 1, alignItems: 'center' } as const;
const NAME_INPUT_SX = { sx: { fontWeight: 700 } } as const;
const ADDRESS_SX = { mb: 1, '& .MuiInputBase-input': { fontSize: 12 } } as const;
const FONT12_SX = { '& .MuiInputBase-input': { fontSize: 12 } } as const;
const REVIEW_SX = { flex: 1, minWidth: 200, '& .MuiInputBase-input': { fontSize: 12 } } as const;
const NOTE_SX = { mb: 1, '& .MuiInputBase-input': { fontSize: 12 } } as const;
const LINKS_GRID_SX = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.25, mb: 1 } as const;
const MENU_BOX_SX = {
  display: 'grid', gridTemplateColumns: '1.2fr 2.5fr 1.3fr 30px',
  gap: 1.25, alignItems: 'start',
  bgcolor: 'rgba(168,230,221,0.12)', borderRadius: 1.5, p: 1.25,
} as const;
const SET_NAME_INPUT_SX = { sx: { fontSize: 12, fontWeight: 600 } } as const;
const DISHES_INPUT_SX = { sx: { fontSize: 12 } } as const;
const PRICE_INPUT_SX = { sx: { fontSize: 12, textAlign: 'right' as const } } as const;

function uniq(a: string[]): string[] {
  return [...new Set(a.filter(Boolean).map((s) => s.trim()))].sort((x, y) => x.localeCompare(y, 'vi'));
}

function normalizeUrl(u: string | undefined): string {
  if (!u) return '';
  return /^https?:\/\//.test(u) ? u : 'https://' + u;
}

type CardProps = {
  r: Restaurant;
  tourLinks: RestaurantTourLink[] | undefined;
  contOpts: string[];
  countryOptsFor: (cont: string) => string[];
  cityOptsFor: (country: string) => string[];
  uploading: boolean;
  onUpdR: (id: string, patch: Partial<Restaurant>) => void;
  onDelR: (id: string) => void;
  onAddMenu: (rid: string) => void;
  onUpdMenu: (rid: string, mid: string, patch: Partial<RestaurantMenu>) => void;
  onDelMenu: (rid: string, mid: string) => void;
  onPickFile: (rid: string, e: ChangeEvent<HTMLInputElement>) => void;
  onDelFile: (rid: string, key: string) => void;
};

/**
 * Một thẻ nhà hàng — memo hoá để khi sửa MỘT nhà hàng không kéo theo vẽ lại CẢ
 * danh sách. Nhờ `restaurantStore` giữ nguyên tham chiếu cho các nhà hàng KHÔNG
 * đổi (updR dùng map có điều kiện), props `r` của thẻ không liên quan giữ
 * nguyên → React.memo bỏ qua. Callback + options đều ổn định (xem cha).
 */
const RestaurantCard = memo(function RestaurantCard({
  r, tourLinks, contOpts, countryOptsFor, cityOptsFor, uploading,
  onUpdR, onDelR, onAddMenu, onUpdMenu, onDelMenu, onPickFile, onDelFile,
}: CardProps) {
  return (
    <Paper variant="outlined" sx={PAPER_SX}>
      <Box sx={HEADER_GRID_SX}>
        <DebouncedTextField size="small" value={r.name ?? ''}
          onCommit={(v) => onUpdR(r.id, { name: v })}
          placeholder="Tên nhà hàng"
          InputProps={NAME_INPUT_SX} />
        <DebouncedAutocomplete options={contOpts} value={r.continent ?? ''}
          onCommit={(v) => onUpdR(r.id, { continent: v })} placeholder="Châu lục ▾" />
        <DebouncedAutocomplete options={countryOptsFor(r.continent)} value={r.country ?? ''}
          onCommit={(v) => onUpdR(r.id, { country: v })} placeholder="Quốc gia ▾" />
        <DebouncedAutocomplete options={cityOptsFor(r.country)} value={r.city ?? ''}
          onCommit={(v) => onUpdR(r.id, { city: v })} placeholder="Thành phố ▾" />
        <IconButton size="small" color="error" onClick={() => onDelR(r.id)}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Box>

      <DebouncedTextField fullWidth size="small" value={r.address ?? ''}
        onCommit={(v) => onUpdR(r.id, { address: v })}
        placeholder="📍 Địa chỉ"
        sx={ADDRESS_SX} />

      {/* Tour (menu) đang dùng nhà hàng này */}
      {(tourLinks?.length ?? 0) > 0 && (
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4 }}>
            <RestaurantMenuOutlinedIcon sx={{ fontSize: 15 }} /> Đang dùng trong {tourLinks!.length} tour:
          </Typography>
          {tourLinks!.map((t) => (
            <Tooltip key={t.menuId} title={t.destination ? `Điểm đến: ${t.destination}` : ''} disableHoverListener={!t.destination}>
              <Chip size="small" label={t.title}
                sx={{ height: 20, fontSize: 11, fontWeight: 600, bgcolor: 'rgba(13,122,106,0.1)', color: '#0d7a6a', maxWidth: 240 }} />
            </Tooltip>
          ))}
        </Stack>
      )}

      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="caption" fontWeight={700} color="text.secondary">
          Đánh giá chất lượng:
        </Typography>
        <StarRating value={r.rating} onChange={(v) => onUpdR(r.id, { rating: v })} size={17} />
        <DebouncedTextField
          size="small" fullWidth value={r.review ?? ''}
          onCommit={(v) => onUpdR(r.id, { review: v })}
          placeholder="Lưu ý cho tour sau (phục vụ, vị trí, chất lượng...)"
          sx={REVIEW_SX}
        />
      </Stack>

      <Box sx={LINKS_GRID_SX}>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <DebouncedTextField fullWidth size="small" value={r.website ?? ''}
            onCommit={(v) => onUpdR(r.id, { website: v })}
            placeholder="Website"
            sx={FONT12_SX} />
          {r.website && (
            <Link href={normalizeUrl(r.website)} target="_blank" rel="noopener" title="Mở website">🌐</Link>
          )}
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <DebouncedTextField fullWidth size="small" value={r.menuLink ?? ''}
            onCommit={(v) => onUpdR(r.id, { menuLink: v })}
            placeholder="Link menu"
            sx={FONT12_SX} />
          {r.menuLink && (
            <Link href={normalizeUrl(r.menuLink)} target="_blank" rel="noopener" title="Mở link menu">📋</Link>
          )}
        </Stack>
        <DebouncedTextField fullWidth size="small" value={r.contact ?? ''}
          onCommit={(v) => onUpdR(r.id, { contact: v })}
          placeholder="Contact (SĐT / email / người LH)"
          sx={FONT12_SX} />
      </Box>

      <DebouncedTextField fullWidth size="small" multiline minRows={2} value={r.note ?? ''}
        onCommit={(v) => onUpdR(r.id, { note: v })}
        placeholder="📝 Thông tin / ghi chú (đặc sản, lưu ý đặt bàn, sức chứa…)"
        sx={NOTE_SX} />

      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
        <Button component="label" size="small" variant="outlined" startIcon={<AttachFileIcon fontSize="small" />} disabled={uploading}
          sx={{ fontSize: 12 }}>
          {uploading ? 'Đang tải…' : 'Thêm file'}
          <input type="file" hidden onChange={(e) => void onPickFile(r.id, e)} />
        </Button>
        {(r.files ?? []).map((f) => (
          <Chip key={f.key} size="small" icon={<AttachFileIcon />} label={f.name}
            onClick={() => openFilePreview({ key: f.key, name: f.name })}
            onDelete={() => onDelFile(r.id, f.key)} sx={{ maxWidth: 240 }} />
        ))}
      </Stack>

      <Typography variant="caption" fontWeight={700} color="text.secondary"
        sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Thực đơn mẫu (mỗi món 1 dòng)
      </Typography>

      <Stack spacing={1.25}>
        {(r.menus ?? []).map((m) => (
          <Box key={m.id} sx={MENU_BOX_SX}>
            <Stack spacing={0.75}>
              <DebouncedTextField size="small" value={m.name ?? ''}
                onCommit={(v) => onUpdMenu(r.id, m.id, { name: v })}
                placeholder="Tên set"
                InputProps={SET_NAME_INPUT_SX} />
              <StarRating value={m.rating} onChange={(v) => onUpdMenu(r.id, m.id, { rating: v })} size={14} />
            </Stack>
            <DebouncedTextField size="small" multiline minRows={3} value={m.dishes ?? ''}
              onCommit={(v) => onUpdMenu(r.id, m.id, { dishes: v })}
              placeholder={'Gỏi cuốn\nCá kho tộ\nCanh chua...'}
              InputProps={DISHES_INPUT_SX} />
            <Stack spacing={0.75}>
              <Stack direction="row" spacing={0.5}>
                <DebouncedTextField size="small" type="number" value={m.price ? String(m.price) : ''}
                  onCommit={(v) => onUpdMenu(r.id, m.id, { price: +v || 0 })}
                  placeholder="Giá"
                  InputProps={PRICE_INPUT_SX} />
                <Select size="small" value={m.cur}
                  onChange={(e) => onUpdMenu(r.id, m.id, { cur: e.target.value })}
                  sx={{ width: 70, fontSize: 11 }}>
                  {MENU_CUR.map((c) => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </Select>
              </Stack>
              <DebouncedTextField size="small" value={m.review ?? ''}
                onCommit={(v) => onUpdMenu(r.id, m.id, { review: v })}
                placeholder="Nhận xét set"
                InputProps={{ sx: { fontSize: 11, fontStyle: m.review ? 'normal' : 'italic' } }} />
            </Stack>
            <IconButton size="small" color="error" onClick={() => onDelMenu(r.id, m.id)}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
      </Stack>

      <Button size="small" startIcon={<AddIcon />} onClick={() => onAddMenu(r.id)}
        sx={{ mt: 1, color: '#0d7a6a' }}>
        Thêm set thực đơn
      </Button>
    </Paper>
  );
});

export function RestaurantLibrary({ onBack }: Props) {
  const list = useRestaurantStore((s) => s.list);
  // Bản đồ nhà hàng → các tour (menu) đang dùng. Nạp 1 lần khi mở thư viện.
  const [tourLinks, setTourLinks] = useState<Record<string, RestaurantTourLink[]>>({});
  useEffect(() => {
    let alive = true;
    void useMenuStore.getState().restaurantLinks()
      .then((m) => { if (alive) setTourLinks(m); })
      .catch(() => { /* không chặn UI nếu lỗi tải liên kết */ });
    return () => { alive = false; };
  }, []);
  // Flush any debounced restaurant write when leaving the library, so the last
  // edit before navigating away is never lost.
  useEffect(() => () => { void useRestaurantStore.getState().flush(); }, []);

  const [search, setSearch] = useState('');
  const [filterCont, setFilterCont] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterRating, setFilterRating] = useState(0);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  // Tất cả mutator dùng `getState()` để lấy danh sách MỚI NHẤT (không phụ thuộc
  // `list` của closure) → tham chiếu callback ỔN ĐỊNH qua các lần render, nhờ đó
  // React.memo trên từng thẻ phát huy tác dụng.
  const persist = useCallback((next: Restaurant[]) => {
    const u = useAuthStore.getState().currentUser;
    const savedBy = u ? `${u.name} (${u.role})` : 'unknown';
    useRestaurantStore.getState().save(next, savedBy);
  }, []);
  const updR = useCallback((id: string, patch: Partial<Restaurant>) => {
    persist(useRestaurantStore.getState().list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, [persist]);
  const patchFresh = useCallback((rid: string, fn: (r: Restaurant) => Restaurant) =>
    persist(useRestaurantStore.getState().list.map((r) => (r.id === rid ? fn(r) : r))), [persist]);
  const delR = useCallback((id: string) => {
    if (!window.confirm('Xoá nhà hàng này khỏi thư viện?')) return;
    persist(useRestaurantStore.getState().list.filter((r) => r.id !== id));
  }, [persist]);

  const addMenu = useCallback((rid: string) => {
    const r = useRestaurantStore.getState().list.find((x) => x.id === rid);
    if (!r) return;
    updR(rid, { menus: [...(r.menus ?? []), newRestMenu()] });
  }, [updR]);
  const updMenu = useCallback((rid: string, mid: string, patch: Partial<RestaurantMenu>) => {
    const r = useRestaurantStore.getState().list.find((x) => x.id === rid);
    if (!r) return;
    updR(rid, { menus: r.menus.map((m) => (m.id === mid ? { ...m, ...patch } : m)) });
  }, [updR]);
  const delMenu = useCallback((rid: string, mid: string) => {
    const r = useRestaurantStore.getState().list.find((x) => x.id === rid);
    if (!r) return;
    updR(rid, { menus: r.menus.filter((m) => m.id !== mid) });
  }, [updR]);

  const onPickFile = useCallback(async (rid: string, e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { window.alert('File vượt quá 20MB.'); return; }
    setUploadingId(rid);
    try {
      const up = await uploadFileToWorker(f);
      const uname = useAuthStore.getState().currentUser?.name;
      patchFresh(rid, (r) => ({ ...r, files: [...(r.files ?? []), { key: up.key, name: up.name, uploadedBy: uname, uploadedAt: new Date().toISOString() }] }));
    } catch (e2) { window.alert('Tải file lỗi: ' + (e2 as Error).message); }
    finally { setUploadingId(null); }
  }, [patchFresh]);
  const delFile = useCallback((rid: string, key: string) =>
    patchFresh(rid, (r) => ({ ...r, files: (r.files ?? []).filter((f) => f.key !== key) })), [patchFresh]);

  const topRef = useRef<HTMLDivElement>(null);
  // Thêm nhà hàng mới → đưa lên ĐẦU danh sách + xoá lọc (để thẻ trống không bị
  // ẩn) + cuộn lên đầu cho thấy ngay.
  const addR = useCallback(() => {
    persist([newRestaurant(), ...useRestaurantStore.getState().list]);
    setSearch(''); setFilterCont(''); setFilterCountry(''); setFilterCity(''); setFilterRating(0);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [persist]);
  const addRestaurant = useCallback((r: Restaurant) =>
    persist([...useRestaurantStore.getState().list, r]), [persist]);
  const mergeIntoR = useCallback((rid: string, p: ParsedRestaurant) => patchFresh(rid, (r) => ({
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
  })), [patchFresh]);

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

  // Danh mục gợi ý (như NCC) + giá trị đang có. CHỈ tính lại khi tập địa lý
  // (châu lục/quốc gia/thành phố trong dữ liệu) đổi — KHÔNG phải mỗi phím gõ —
  // nên `contOpts`/`countryOptsFor`/`cityOptsFor` giữ tham chiếu ổn định, không
  // làm hỏng memo của thẻ khi sửa các trường khác.
  const geoSig = useMemo(
    () => list.map((r) => `${r.continent}${r.country}${r.city}`).join(''),
    [list],
  );
  const { contOpts, countryOptsFor, cityOptsFor } = useMemo(() => {
    const cur = useRestaurantStore.getState().list;
    const conts = uniq([...NCC_CONTINENTS, ...CONT_SEED, ...cur.map((r) => r.continent)]);
    const countryCache = new Map<string, string[]>();
    const countryOptsFor = (cont: string) => {
      let v = countryCache.get(cont);
      if (!v) {
        v = uniq([
          ...(cont ? (NCC_COUNTRIES[cont] ?? []) : NCC_ALL_COUNTRIES),
          ...cur.filter((r) => !cont || r.continent === cont).map((r) => r.country),
        ]);
        countryCache.set(cont, v);
      }
      return v;
    };
    const cityCache = new Map<string, string[]>();
    const cityOptsFor = (country: string) => {
      let v = cityCache.get(country);
      if (!v) {
        v = uniq(cur.filter((r) => !country || r.country === country).map((r) => r.city));
        cityCache.set(country, v);
      }
      return v;
    };
    return { contOpts: conts, countryOptsFor, cityOptsFor };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoSig]);

  return (
    <Box ref={topRef} sx={{ minHeight: '100%' }}>
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
            sx={{ flex: 1, minWidth: 220, maxWidth: 340, ...filterFieldSx }}
          />
          <Select size="small" displayEmpty value={filterCont}
            onChange={(e) => { setFilterCont(e.target.value); setFilterCountry(''); setFilterCity(''); }}
            sx={{ minWidth: 140, ...filterSelectSx }}>
            <MenuItem value="">Tất cả châu lục</MenuItem>
            {contOpts.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
          </Select>
          <Select size="small" displayEmpty value={filterCountry}
            onChange={(e) => { setFilterCountry(e.target.value); setFilterCity(''); }}
            sx={{ minWidth: 140, ...filterSelectSx }}>
            <MenuItem value="">Tất cả quốc gia</MenuItem>
            {countryOptsFor(filterCont).map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
          </Select>
          <Select size="small" displayEmpty value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)} sx={{ minWidth: 140, ...filterSelectSx }}>
            <MenuItem value="">Tất cả thành phố</MenuItem>
            {cityOptsFor(filterCountry).map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
          </Select>
          <Select size="small" value={filterRating}
            onChange={(e) => setFilterRating(Number(e.target.value))} sx={{ minWidth: 130, ...filterSelectSx }}>
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

        <Stack spacing={1.5}>
          {filtered.map((r) => (
            <RestaurantCard
              key={r.id}
              r={r}
              tourLinks={tourLinks[r.id]}
              contOpts={contOpts}
              countryOptsFor={countryOptsFor}
              cityOptsFor={cityOptsFor}
              uploading={uploadingId === r.id}
              onUpdR={updR}
              onDelR={delR}
              onAddMenu={addMenu}
              onUpdMenu={updMenu}
              onDelMenu={delMenu}
              onPickFile={onPickFile}
              onDelFile={delFile}
            />
          ))}
        </Stack>
      </Box>

      <AIRestaurantImportDialog open={aiOpen} onClose={() => setAiOpen(false)} onAdd={addRestaurant} onMerge={mergeIntoR} restaurants={list} />
    </Box>
  );
}
