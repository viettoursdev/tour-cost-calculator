import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useRateCardStore } from '@/stores/rateCardStore';
import { HOTEL_CITIES } from './constants';
import type { Item, Template } from '@/types';

type HotelOption = { label: string; price: number; note?: string };
type Hotel = {
  name: string;
  stars: number;
  note?: string;
  options: HotelOption[];
  custom?: boolean;
};

function asHotels(value: unknown): Hotel[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const options = Array.isArray(r.options) ? (r.options as unknown[]) : [];
    return {
      name: typeof r.name === 'string' ? r.name : '',
      stars: typeof r.stars === 'number' ? r.stars : 4,
      note: typeof r.note === 'string' ? r.note : '',
      custom: r.custom === true,
      options: options.map((o) => {
        const oo = (o ?? {}) as Record<string, unknown>;
        return {
          label: typeof oo.label === 'string' ? oo.label : '',
          price: typeof oo.price === 'number' ? oo.price : Number(oo.price) || 0,
          note: typeof oo.note === 'string' ? oo.note : '',
        };
      }),
    };
  });
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** When set, the modal switches to picker mode: rows render a "Chọn" button
   *  and price editing is hidden. The picker emits a partial Item to the caller. */
  onPick?: (line: Partial<Item>) => void;
  /** Pax count used to compute `customQty = ceil(pax/2)` (rooms). */
  pax?: number;
  /** Active quote template. When 'intl' the modal shows an info banner only
   *  (intl hotels are typically priced inside the DMC package). */
  template?: Template;
};

export function HotelModal({ open, onClose, onPick, pax, template }: Props) {
  const isPicker = !!onPick;
  const isIntl = template === 'intl';
  const hotelsByCity = useRateCardStore((s) => s.rates.hotels);
  const updateHotels = useRateCardStore((s) => s.updateHotels);

  const [city, setCity] = useState<string>(HOTEL_CITIES[0].id);
  const [search, setSearch] = useState('');
  const [starFilter, setStarFilter] = useState<number>(0);

  const hotels = useMemo(() => asHotels(hotelsByCity[city]), [hotelsByCity, city]);

  const save = (next: Hotel[]) => updateHotels(city, next as unknown as Record<string, unknown>[]);

  const filtered = hotels.filter((h) => {
    if (starFilter > 0 && h.stars !== starFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      return h.name.toLowerCase().includes(q) || (h.note ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const addHotel = () => {
    save([
      ...hotels,
      { name: 'Khách sạn mới', stars: 4, note: '', options: [], custom: true },
    ]);
  };

  const deleteHotel = (idx: number) => {
    if (!confirm(`Xoá khách sạn "${hotels[idx].name}" khỏi danh sách?`)) return;
    save(hotels.filter((_, i) => i !== idx));
  };

  const editHotel = (idx: number, patch: Partial<Hotel>) => {
    save(hotels.map((h, i) => (i === idx ? { ...h, ...patch } : h)));
  };

  const addOption = (idx: number) => {
    save(
      hotels.map((h, i) =>
        i === idx ? { ...h, options: [...h.options, { label: '', price: 0, note: '' }] } : h,
      ),
    );
  };

  const editOption = (hIdx: number, oIdx: number, patch: Partial<HotelOption>) => {
    save(
      hotels.map((h, i) => {
        if (i !== hIdx) return h;
        const opts = h.options.map((o, j) => (j === oIdx ? { ...o, ...patch } : o));
        return { ...h, options: opts };
      }),
    );
  };

  const pickOption = (h: Hotel, o: HotelOption) => {
    if (!onPick) return;
    const cityLabel = HOTEL_CITIES.find((c) => c.id === city)?.label ?? city;
    const optionLabel = o.label || `${h.stars}★`;
    onPick({
      name: `Khách sạn ${h.name} · ${cityLabel} · ${optionLabel}`,
      cur: 'VND',
      price: o.price,
      unit: '/phòng/đêm',
      qtyMode: 'custom',
      customQty: pax ? Math.ceil(pax / 2) : 1,
      note: [o.note, h.note].filter(Boolean).join(' · '),
    });
    onClose();
  };

  const deleteOption = (hIdx: number, oIdx: number) => {
    save(
      hotels.map((h, i) =>
        i === hIdx ? { ...h, options: h.options.filter((_, j) => j !== oIdx) } : h,
      ),
    );
  };

  // For intl tours, the legacy app shows an info card explaining that hotel
  // pricing is normally inside the DMC package. We do the same — early-return
  // so users don't accidentally edit/pick from the domestic VN hotel list.
  if (isIntl) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)', color: '#fff' }}>
          <Typography variant="h6" fontWeight={800}>🏨 Khách sạn quốc tế</Typography>
          <Typography variant="caption" sx={{ opacity: 0.85 }}>
            Tour outbound: dùng DMC hoặc nhập thủ công
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ fontSize: 13, lineHeight: 1.7 }}>
            💡 <strong>Tour quốc tế:</strong> Giá khách sạn outbound thường đã bao gồm trong gói DMC.
            Vui lòng dùng rate card <strong>📋 DMC</strong> hoặc nhập trực tiếp vào dòng
            "Khách sạn" với tiền tệ địa phương.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Đóng</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        🏨 {isPicker ? 'Chọn Khách sạn từ rate card' : 'Quản lý Khách sạn'}
      </DialogTitle>
      <DialogContent dividers>
        <Tabs
          value={city}
          onChange={(_, v) => setCity(String(v))}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 2 }}
        >
          {HOTEL_CITIES.map((c) => (
            <Tab key={c.id} value={c.id} label={c.label} />
          ))}
        </Tabs>

        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <TextField
            size="small"
            label="Tìm theo tên / ghi chú"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flexGrow: 1 }}
          />
          <Select
            size="small"
            value={starFilter}
            onChange={(e) => setStarFilter(Number(e.target.value))}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value={0}>Tất cả sao</MenuItem>
            {[3, 4, 5].map((s) => (
              <MenuItem key={s} value={s}>
                {s} sao
              </MenuItem>
            ))}
          </Select>
          {!isPicker && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={addHotel}>
              Thêm KS
            </Button>
          )}
        </Stack>

        {filtered.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            Chưa có khách sạn nào cho{' '}
            {HOTEL_CITIES.find((c) => c.id === city)?.label ?? city}.
          </Typography>
        )}

        <Stack spacing={2}>
          {filtered.map((h) => {
            const idx = hotels.indexOf(h);
            return (
              <Paper key={`${idx}-${h.name}`} sx={{ p: 2 }} variant="outlined">
                {isPicker ? (
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <Typography fontWeight={700} sx={{ flexGrow: 1 }}>
                      {h.name} <Typography component="span" color="text.secondary">· {h.stars}★</Typography>
                    </Typography>
                    {h.note && <Typography variant="caption" color="text.secondary">{h.note}</Typography>}
                  </Stack>
                ) : (
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <TextField
                      size="small"
                      label="Tên KS"
                      value={h.name}
                      onChange={(e) => editHotel(idx, { name: e.target.value })}
                      sx={{ flexGrow: 1 }}
                    />
                    <Select
                      size="small"
                      value={h.stars}
                      onChange={(e) => editHotel(idx, { stars: Number(e.target.value) })}
                      sx={{ minWidth: 90 }}
                    >
                      {[3, 4, 5].map((s) => (
                        <MenuItem key={s} value={s}>
                          {s} ★
                        </MenuItem>
                      ))}
                    </Select>
                    <TextField
                      size="small"
                      label="Ghi chú"
                      value={h.note ?? ''}
                      onChange={(e) => editHotel(idx, { note: e.target.value })}
                      sx={{ flexGrow: 2 }}
                    />
                    <IconButton color="error" onClick={() => deleteHotel(idx)}>
                      <DeleteIcon />
                    </IconButton>
                  </Stack>
                )}

                <Box sx={{ pl: 1 }}>
                  <Stack direction="row" alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
                      Phương án phòng
                    </Typography>
                    {!isPicker && (
                      <Button size="small" startIcon={<AddIcon />} onClick={() => addOption(idx)}>
                        Thêm phương án
                      </Button>
                    )}
                  </Stack>
                  {h.options.length === 0 ? (
                    <Typography variant="caption" color="text.disabled">
                      Chưa có phương án nào.
                    </Typography>
                  ) : (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Tên phương án</TableCell>
                          <TableCell align="right">Giá (VND)</TableCell>
                          <TableCell>Ghi chú</TableCell>
                          <TableCell width={48} />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {h.options.map((o, oIdx) => (
                          <TableRow key={oIdx}>
                            <TableCell>
                              {isPicker ? (
                                <Typography variant="body2">{o.label || `${h.stars}★`}</Typography>
                              ) : (
                                <TextField
                                  size="small"
                                  value={o.label}
                                  onChange={(e) => editOption(idx, oIdx, { label: e.target.value })}
                                  fullWidth
                                />
                              )}
                            </TableCell>
                            <TableCell align="right">
                              {isPicker ? (
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                  {Math.round(o.price).toLocaleString('vi-VN')} ₫
                                </Typography>
                              ) : (
                                <TextField
                                  size="small"
                                  type="number"
                                  value={o.price}
                                  onChange={(e) =>
                                    editOption(idx, oIdx, { price: Number(e.target.value) })
                                  }
                                  slotProps={{ htmlInput: { min: 0, style: { textAlign: 'right' } } }}
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              {isPicker ? (
                                <Typography variant="caption" color="text.secondary">
                                  {o.note ?? ''}
                                </Typography>
                              ) : (
                                <TextField
                                  size="small"
                                  value={o.note ?? ''}
                                  onChange={(e) => editOption(idx, oIdx, { note: e.target.value })}
                                  fullWidth
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              {isPicker ? (
                                <Button size="small" variant="contained"
                                  onClick={() => pickOption(h, o)}>
                                  Chọn →
                                </Button>
                              ) : (
                                <IconButton size="small" onClick={() => deleteOption(idx, oIdx)}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Box>
              </Paper>
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Đóng</Button>
      </DialogActions>
    </Dialog>
  );
}
