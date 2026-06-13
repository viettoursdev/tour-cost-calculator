import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Chip, FormControlLabel, IconButton, MenuItem, Paper, Select, Stack, Switch, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DescriptionIcon from '@mui/icons-material/Description';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import SaveIcon from '@mui/icons-material/Save';
import { useMenuStore } from '@/stores/menuStore';
import { useRestaurantStore } from '@/stores/restaurantStore';
import { useQuoteHistoryStore } from '@/stores/quoteHistoryStore';
import { useItineraryStore } from '@/stores/itineraryStore';
import { ITIN_TYPE, ITIN_CONTINENT, ITIN_COUNTRY } from '@/components/itinerary/itinCode';
import { SortableList } from '@/components/itinerary/SortableList';
import {
  MEAL_TYPES, MENU_CUR, freshMenu, generateMenuCode, newMenuDay, newMenuMeal,
} from './constants';
import { StarRating } from './StarRating';
import { exportMenuDocx } from '@/lib/exports/exportMenuDocx';
import { exportMenuPDF } from '@/lib/exports/exportMenuPDF';
import { useHistoryState } from '@/lib/useHistoryState';
import { useUndoRedoShortcuts } from '@/lib/useUndoRedoShortcuts';
import { UndoRedoButtons } from '@/components/common/UndoRedoButtons';
import type { ItineraryType, Menu, MenuDay, MenuMeal, User } from '@/types';

type Props = {
  initial: Menu | null;
  user: User;
  onBack: () => void;
};

function reorder<T>(arr: T[], from: number, to: number): T[] {
  const a = [...arr];
  const [m] = a.splice(from, 1);
  a.splice(to, 0, m);
  return a;
}

export function MenuBuilder({ initial, user, onBack }: Props) {
  const initialMenu = useMemo(() => initial ?? freshMenu(), [initial]);
  const { state: it, set: setIt, undo, redo, canUndo, canRedo } = useHistoryState<Menu>(initialMenu);
  useUndoRedoShortcuts(undo, redo);
  const [saving, setSaving] = useState(false);
  const [includePrices, setIncludePrices] = useState(true);
  const restaurants = useRestaurantStore((s) => s.list);
  const quotes = useQuoteHistoryStore((s) => s.quotes);
  const itins = useItineraryStore((s) => s.list);
  const savedBy = `${user.name} (${user.role})`;
  const code = useMemo(
    () => generateMenuCode(it.type, it.continent, it.country, it.seq),
    [it.type, it.continent, it.country, it.seq],
  );

  // Auto-save (1.5s debounce). Source: legacy 7430-7435.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void useMenuStore.getState().save({ ...it, code }, savedBy).catch(() => { /* swallow */ });
    }, 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [it, code, savedBy]);

  const set = <K extends keyof Menu>(k: K, v: Menu[K]) =>
    setIt((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await useMenuStore.getState().save({ ...it, code }, savedBy);
    } catch (e) {
      window.alert('Lỗi lưu: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ── Day / Meal ops ──
  const updDayById = (id: string, fn: (d: MenuDay) => MenuDay) =>
    setIt((p) => ({ ...p, schedule: p.schedule.map((d) => (d.id === id ? fn(d) : d)) }));

  const addDay = () => setIt((p) => ({
    ...p,
    schedule: [...p.schedule, newMenuDay(p.schedule.length + 1)],
  }));
  const delDay = (id: string) => setIt((p) => ({
    ...p,
    schedule: p.schedule.filter((d) => d.id !== id).map((d, i) => ({ ...d, dayNum: i + 1 })),
  }));
  const updDay = (id: string, patch: Partial<MenuDay>) => updDayById(id, (d) => ({ ...d, ...patch }));
  const reorderDays = (from: number, to: number) =>
    setIt((p) => ({
      ...p,
      schedule: reorder(p.schedule, from, to).map((d, i) => ({ ...d, dayNum: i + 1 })),
    }));

  const addMeal = (dayId: string) =>
    updDayById(dayId, (d) => ({ ...d, meals: [...d.meals, newMenuMeal('Ăn tối')] }));
  const delMeal = (dayId: string, mid: string) =>
    updDayById(dayId, (d) => ({ ...d, meals: d.meals.filter((m) => m.id !== mid) }));
  const updMeal = (dayId: string, mid: string, patch: Partial<MenuMeal>) =>
    updDayById(dayId, (d) => ({ ...d, meals: d.meals.map((m) => (m.id === mid ? { ...m, ...patch } : m)) }));

  const pickRestaurant = (dayId: string, mid: string, rid: string) => {
    const r = restaurants.find((x) => x.id === rid);
    if (!r) {
      updMeal(dayId, mid, { restaurantId: '', restaurantName: '', city: '', restMenuId: '' });
      return;
    }
    updMeal(dayId, mid, {
      restaurantId: rid,
      restaurantName: r.name,
      city: r.city ?? '',
      restMenuId: '',
    });
  };
  const pickRestMenu = (dayId: string, mid: string, rid: string, menuId: string) => {
    const r = restaurants.find((x) => x.id === rid);
    const m = r?.menus.find((x) => x.id === menuId);
    if (!m) return;
    const cur = m.cur || 'VND';
    updMeal(dayId, mid, {
      restMenuId: menuId,
      suggestedDishes: m.dishes ?? '',
      suggestedPrice: m.price ?? 0,
      suggestedCur: cur,
      cur,
      adjustedDishes: m.dishes ?? '',
      adjustedPrice: m.price ?? 0,
      adjustedCur: cur,
    });
  };

  const linkQuote = (qId: string) => {
    if (!qId) {
      setIt((p) => ({ ...p, linkedQuoteId: null, linkedQuoteName: '' }));
      return;
    }
    const q = quotes.find((x) => x.cloudId === qId);
    if (!q) return;
    setIt((p) => ({
      ...p,
      linkedQuoteId: q.cloudId,
      linkedQuoteName: q.name ?? '',
    }));
  };
  const linkItin = (iId: string) => {
    if (!iId) {
      setIt((p) => ({ ...p, linkedItineraryId: null, linkedItineraryName: '' }));
      return;
    }
    const i = itins.find((x) => x.id === iId);
    if (!i) return;
    setIt((p) => ({
      ...p,
      linkedItineraryId: i.id,
      linkedItineraryName: i.destination || i.title || '',
      destination: p.destination || (i.destination ?? ''),
    }));
  };

  return (
    <Box sx={{ minHeight: '100%', bgcolor: '#f4fefa' }}>
      <Box sx={{ background: 'linear-gradient(135deg,#0a5c50,#0d7a6a 40%,#14a08c)', color: '#fff', px: 3, py: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
          <Box>
            <Typography variant="h6" fontWeight={900}>🍽️ Trình tạo Thực đơn</Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>
              Mã: <strong style={{ fontFamily: 'monospace' }}>{code}</strong>
              <span style={{ marginLeft: 8, opacity: 0.7 }}>· tự lưu</span>
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={includePrices}
                  onChange={(e) => setIncludePrices(e.target.checked)}
                  sx={{ '& .MuiSwitch-thumb': { color: '#fff' }, '& .Mui-checked + .MuiSwitch-track': { backgroundColor: '#ffe082', opacity: 1 } }}
                />
              }
              label="Kèm giá"
              sx={{ color: '#fff', mr: 0.5, '& .MuiFormControlLabel-label': { fontSize: 13, fontWeight: 600 } }}
            />
            <Button color="inherit" variant="contained"
              startIcon={<DescriptionIcon />}
              onClick={() => void exportMenuDocx(it, code, includePrices)}
              sx={{ bgcolor: '#fff', color: '#0d7a6a' }}>
              Word
            </Button>
            <Button color="inherit" variant="contained"
              startIcon={<PictureAsPdfIcon />}
              onClick={() => exportMenuPDF(it, code, includePrices)}
              sx={{ bgcolor: '#fff', color: '#c0392b' }}>
              PDF
            </Button>
            <Button color="inherit" variant="outlined" startIcon={<SaveIcon />}
              onClick={() => void handleSave()} disabled={saving}>
              {saving ? '⏳ Lưu...' : 'Lưu'}
            </Button>
            <UndoRedoButtons undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} color="#fff" />
            <Button color="inherit" variant="outlined" startIcon={<ArrowBackIcon />} onClick={onBack}>
              Quay lại
            </Button>
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ maxWidth: 1100, mx: 'auto', p: 3 }}>
        <Paper sx={{ p: 3, mb: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr 0.7fr', gap: 1.5, mb: 1.5 }}>
            <Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary">Loại</Typography>
              <Select fullWidth size="small" value={it.type}
                onChange={(e) => set('type', e.target.value as ItineraryType)}>
                {Object.entries(ITIN_TYPE).map(([k, v]) => (
                  <MenuItem key={k} value={k}>{k} · {v}</MenuItem>
                ))}
              </Select>
            </Box>
            <Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary">Châu lục</Typography>
              <Select fullWidth size="small" value={it.continent}
                onChange={(e) => {
                  const c = e.target.value;
                  const first = Object.keys(ITIN_COUNTRY[c] ?? {})[0] ?? '';
                  setIt((p) => ({ ...p, continent: c, country: first }));
                }}>
                {Object.entries(ITIN_CONTINENT).map(([k, v]) => (
                  <MenuItem key={k} value={k}>{k} · {v}</MenuItem>
                ))}
              </Select>
            </Box>
            <Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary">Quốc gia</Typography>
              <Select fullWidth size="small" value={it.country}
                onChange={(e) => set('country', e.target.value)}>
                {Object.entries(ITIN_COUNTRY[it.continent] ?? {}).map(([k, v]) => (
                  <MenuItem key={k} value={k}>{k} · {v}</MenuItem>
                ))}
              </Select>
            </Box>
            <Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary">STT</Typography>
              <TextField fullWidth size="small" type="number"
                value={it.seq} onChange={(e) => set('seq', +e.target.value)} />
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 1.5, mb: 1.5 }}>
            <TextField label="Điểm đến" size="small" value={it.destination}
              onChange={(e) => set('destination', e.target.value)}
              placeholder="VD: BẮC KINH" />
            <TextField label="Số ngày" size="small" type="number"
              value={it.days} onChange={(e) => set('days', +e.target.value)} />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                🗺️ Link Chương trình tour
              </Typography>
              <Select fullWidth size="small" value={it.linkedItineraryId ?? ''}
                onChange={(e) => linkItin(e.target.value)} displayEmpty>
                <MenuItem value="">— Không —</MenuItem>
                {itins.map((i) => (
                  <MenuItem key={i.id} value={i.id}>
                    {i.code ? `[${i.code}] ` : ''}{i.destination || i.title}
                  </MenuItem>
                ))}
              </Select>
            </Box>
            <Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                🔗 Link Báo giá
              </Typography>
              <Select fullWidth size="small" value={it.linkedQuoteId ?? ''}
                onChange={(e) => linkQuote(e.target.value)} displayEmpty>
                <MenuItem value="">— Không —</MenuItem>
                {quotes.map((q) => (
                  <MenuItem key={q.cloudId} value={q.cloudId}>
                    {q.quoteCode ? `[${q.quoteCode}] ` : ''}{q.name}
                  </MenuItem>
                ))}
              </Select>
            </Box>
          </Box>
        </Paper>

        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={800}>
            🍽️ Thực đơn theo ngày
            <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 1 }}>
              · kéo ⋮⋮ đổi thứ tự
            </Typography>
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={addDay}
            sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
            Thêm ngày
          </Button>
        </Stack>

        <SortableList
          onReorder={reorderDays}
          handle=".mday-handle"
          deps={[it.schedule.length]}
          sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          {it.schedule.map((d) => (
            <Paper key={d.id} data-sid={d.id} variant="outlined" sx={{ overflow: 'hidden' }}>
              <Box sx={{ background: 'linear-gradient(135deg,#0f3a4a,#14566b)', color: '#fff', px: 1.75, py: 1.25, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Box component="span" className="mday-handle" sx={{ cursor: 'grab', fontSize: 16, opacity: 0.7, userSelect: 'none' }}>⋮⋮</Box>
                <Typography fontWeight={900} fontSize={14}>NGÀY {d.dayNum}</Typography>
                <TextField size="small" variant="outlined"
                  value={d.date} onChange={(e) => updDay(d.id, { date: e.target.value })}
                  placeholder="Date"
                  sx={{ width: 130, '& .MuiInputBase-input': { color: '#fff', fontSize: 12 },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' } }} />
                <TextField size="small" variant="outlined" fullWidth
                  value={d.city} onChange={(e) => updDay(d.id, { city: e.target.value })}
                  placeholder="Khu vực / TP chính (mỗi bữa lấy TP theo nhà hàng)"
                  sx={{ flex: 1, minWidth: 200, '& .MuiInputBase-input': { color: '#fff' },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' } }} />
                <IconButton size="small" sx={{ bgcolor: 'rgba(220,50,80,0.25)', color: '#fff' }}
                  onClick={() => delDay(d.id)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>

              <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {d.meals.map((meal) => {
                  const r = restaurants.find((x) => x.id === meal.restaurantId);
                  const rm = r && (r.menus ?? []).find((x) => x.id === meal.restMenuId);
                  return (
                    <Paper key={meal.id} variant="outlined" sx={{ p: 1.5, bgcolor: 'rgba(168,230,221,0.06)' }}>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '120px 1.6fr 1.4fr 40px', gap: 1, mb: 1, alignItems: 'center' }}>
                        <Select size="small" value={meal.mealType}
                          onChange={(e) => updMeal(d.id, meal.id, { mealType: e.target.value })}
                          sx={{ fontSize: 12, fontWeight: 700, color: '#14a08c' }}>
                          {MEAL_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                        </Select>
                        <Select size="small" value={meal.restaurantId}
                          onChange={(e) => pickRestaurant(d.id, meal.id, e.target.value)}
                          displayEmpty>
                          <MenuItem value=""><em>— Chọn nhà hàng —</em></MenuItem>
                          {restaurants.map((x) => (
                            <MenuItem key={x.id} value={x.id}>
                              {x.name}{x.city ? ` · ${x.city}` : ''}
                            </MenuItem>
                          ))}
                        </Select>
                        <Select size="small" value={meal.restMenuId ?? ''}
                          onChange={(e) => {
                            if (e.target.value) pickRestMenu(d.id, meal.id, meal.restaurantId, e.target.value);
                          }}
                          disabled={!r}
                          displayEmpty>
                          <MenuItem value=""><em>{r ? '+ Lấy set thực đơn' : '(chọn NH trước)'}</em></MenuItem>
                          {r && (r.menus ?? []).map((m) => (
                            <MenuItem key={m.id} value={m.id}>
                              {m.name} · {(m.price ?? 0).toLocaleString('vi-VN')} {m.cur}
                              {m.rating ? ` · ${'★'.repeat(m.rating)}` : ''}
                            </MenuItem>
                          ))}
                        </Select>
                        <IconButton size="small" color="error" onClick={() => delMeal(d.id, meal.id)}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Box>

                      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" sx={{ mb: 1.25 }}>
                        {meal.city && (
                          <Chip label={`📍 ${meal.city}`} size="small"
                            sx={{ bgcolor: 'rgba(20,150,140,0.12)', color: '#0d7a6a', fontSize: 11, fontWeight: 700, height: 22 }} />
                        )}
                        {r && (r.rating || r.review) && (
                          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ fontSize: 11, color: 'text.secondary' }}>
                            <StarRating value={r.rating} size={12} />
                            {r.review && <Box component="em" sx={{ fontStyle: 'italic' }}>{r.review}</Box>}
                          </Stack>
                        )}
                        {rm?.review && (
                          <Box component="span" sx={{ fontSize: 11, color: '#c2410c', fontStyle: 'italic' }}>
                            · set: {rm.review}
                          </Box>
                        )}
                      </Stack>

                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                        <Box>
                          <Chip label="📋 Đề xuất từ nhà hàng" size="small"
                            sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)', color: '#fff',
                                  fontSize: 10, fontWeight: 800, mb: 0.75 }} />
                          <TextField size="small" multiline minRows={4} fullWidth
                            value={meal.suggestedDishes}
                            onChange={(e) => updMeal(d.id, meal.id, { suggestedDishes: e.target.value })}
                            placeholder="Mỗi món 1 dòng..."
                            sx={{ mb: 0.75, '& .MuiInputBase-input': { fontSize: 12 } }} />
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Typography variant="caption" color="text.disabled">Giá:</Typography>
                            <TextField size="small" type="number" value={meal.suggestedPrice}
                              onChange={(e) => updMeal(d.id, meal.id, { suggestedPrice: +e.target.value })}
                              InputProps={{ sx: { fontSize: 12, textAlign: 'right' } }} />
                            <Select size="small" value={meal.suggestedCur || meal.cur}
                              onChange={(e) => updMeal(d.id, meal.id, { suggestedCur: e.target.value })}
                              sx={{ width: 70, fontSize: 11 }}>
                              {MENU_CUR.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                            </Select>
                          </Stack>
                        </Box>
                        <Box>
                          <Chip label="✏️ Điều chỉnh theo feedback" size="small"
                            sx={{ background: 'linear-gradient(135deg,#9a3412,#ea580c)', color: '#fff',
                                  fontSize: 10, fontWeight: 800, mb: 0.75 }} />
                          <TextField size="small" multiline minRows={4} fullWidth
                            value={meal.adjustedDishes}
                            onChange={(e) => updMeal(d.id, meal.id, { adjustedDishes: e.target.value })}
                            placeholder="Mỗi món 1 dòng..."
                            sx={{ mb: 0.75, '& .MuiInputBase-input': { fontSize: 12 } }} />
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Typography variant="caption" color="text.disabled">Giá:</Typography>
                            <TextField size="small" type="number" value={meal.adjustedPrice}
                              onChange={(e) => updMeal(d.id, meal.id, { adjustedPrice: +e.target.value })}
                              InputProps={{ sx: { fontSize: 12, textAlign: 'right' } }} />
                            <Select size="small" value={meal.adjustedCur || meal.cur}
                              onChange={(e) => updMeal(d.id, meal.id, { adjustedCur: e.target.value })}
                              sx={{ width: 70, fontSize: 11 }}>
                              {MENU_CUR.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                            </Select>
                          </Stack>
                        </Box>
                      </Box>

                      <TextField fullWidth size="small" sx={{ mt: 1.25 }}
                        value={meal.note ?? ''}
                        onChange={(e) => updMeal(d.id, meal.id, { note: e.target.value })}
                        placeholder="📝 Lưu ý bữa ăn (dị ứng, yêu cầu riêng, đánh giá thực tế...)" />
                    </Paper>
                  );
                })}

                <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => addMeal(d.id)}
                  sx={{ borderStyle: 'dashed', borderColor: 'rgba(20,150,140,0.3)', color: '#0d7a6a' }}>
                  Thêm bữa ăn
                </Button>
              </Box>
            </Paper>
          ))}
        </SortableList>

        <Box sx={{ height: 40 }} />
      </Box>
    </Box>
  );
}
