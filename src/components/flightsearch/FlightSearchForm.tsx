import {
  Autocomplete, Box, Button, Chip, MenuItem, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Typography, createFilterOptions,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import type { Cabin, FlightSearchParams } from '@/lib/flightSearch';
import { AIRPORTS, CABINS, CABIN_LABELS, type AirportOption } from './flightSearchConstants';

const TEAL = '#0d7a6a';

const filter = createFilterOptions<AirportOption | string>({ limit: 8 });

/** Ô nhập sân bay: autocomplete từ danh sách IATA, cho nhập tự do (free text). */
function AirportField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const selected = AIRPORTS.find((a) => a.code === value) ?? (value || null);
  return (
    <Autocomplete
      freeSolo
      fullWidth
      size="small"
      options={AIRPORTS as (AirportOption | string)[]}
      value={selected}
      filterOptions={(opts, state) => filter(opts, state)}
      getOptionLabel={(o) => (typeof o === 'string' ? o : o.code)}
      renderOption={(props, o) => (
        <li {...props} key={typeof o === 'string' ? o : o.code}>
          {typeof o === 'string' ? o : (
            <span><b>{o.code}</b> — {o.city}</span>
          )}
        </li>
      )}
      onChange={(_e, v) => onChange(typeof v === 'string' ? v : v?.code ?? '')}
      onInputChange={(_e, v, reason) => { if (reason === 'input') onChange(v); }}
      renderInput={(params) => <TextField {...params} label={label} placeholder="IATA hoặc thành phố" InputProps={{ ...params.InputProps, notched: true }} />}
    />
  );
}

interface Props {
  params: FlightSearchParams;
  onChange: (patch: Partial<FlightSearchParams>) => void;
  onSearch: () => void;
  loading: boolean;
}

export function FlightSearchForm({ params, onChange, onSearch, loading }: Props) {
  const roundTrip = params.returnDate != null;
  const setPax = (k: keyof FlightSearchParams['pax'], v: number) =>
    onChange({ pax: { ...params.pax, [k]: Math.max(0, v) } });
  const canSearch = !!params.origin.trim() && !!params.destination.trim() && !!params.departDate && !loading;

  const swap = () => onChange({ origin: params.destination, destination: params.origin });

  return (
    <Box sx={{ p: 2, borderRadius: 2, border: '1px solid rgba(0,0,0,0.1)', bgcolor: 'var(--vte-surface)' }}>
      <Stack spacing={1.5}>
        {/* Tuyến */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
          <AirportField label="Điểm đi" value={params.origin} onChange={(v) => onChange({ origin: v })} />
          <Button onClick={swap} sx={{ minWidth: 40, color: TEAL }} title="Đảo chiều"><SwapHorizIcon /></Button>
          <AirportField label="Điểm đến" value={params.destination} onChange={(v) => onChange({ destination: v })} />
        </Stack>

        {/* Loại vé + ngày */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <ToggleButtonGroup
            exclusive size="small" value={roundTrip ? 'rt' : 'ow'}
            onChange={(_e, v) => { if (v) onChange({ returnDate: v === 'rt' ? (params.returnDate || params.departDate) : undefined }); }}
            sx={{ '& .Mui-selected': { color: TEAL + ' !important', bgcolor: 'rgba(20,150,140,0.1) !important' } }}
          >
            <ToggleButton value="ow">Một chiều</ToggleButton>
            <ToggleButton value="rt">Khứ hồi</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            size="small" type="date" label="Ngày đi" InputLabelProps={{ shrink: true }}
            value={params.departDate} onChange={(e) => onChange({ departDate: e.target.value })} fullWidth
          />
          <TextField
            size="small" type="date" label="Ngày về" InputLabelProps={{ shrink: true }} disabled={!roundTrip}
            value={params.returnDate ?? ''} onChange={(e) => onChange({ returnDate: e.target.value })} fullWidth
          />
        </Stack>

        {/* Khách + hạng + điểm dừng */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField size="small" type="number" label="Người lớn" InputLabelProps={{ shrink: true }}
            value={params.pax.adults} onChange={(e) => setPax('adults', +e.target.value)} sx={{ width: 110 }} inputProps={{ min: 1 }} />
          <TextField size="small" type="number" label="Trẻ em" InputLabelProps={{ shrink: true }}
            value={params.pax.children} onChange={(e) => setPax('children', +e.target.value)} sx={{ width: 100 }} inputProps={{ min: 0 }} />
          <TextField size="small" type="number" label="Em bé" InputLabelProps={{ shrink: true }}
            value={params.pax.infants} onChange={(e) => setPax('infants', +e.target.value)} sx={{ width: 100 }} inputProps={{ min: 0 }} />
          <TextField size="small" select label="Hạng ghế" value={params.cabin}
            onChange={(e) => onChange({ cabin: e.target.value as Cabin })} sx={{ minWidth: 150 }}>
            {CABINS.map((c) => <MenuItem key={c} value={c}>{CABIN_LABELS[c]}</MenuItem>)}
          </TextField>
          <TextField size="small" select label="Điểm dừng"
            value={params.maxStops ?? -1}
            onChange={(e) => onChange({ maxStops: +e.target.value < 0 ? undefined : +e.target.value })}
            sx={{ minWidth: 130 }}>
            <MenuItem value={-1}>Không giới hạn</MenuItem>
            <MenuItem value={0}>Bay thẳng</MenuItem>
            <MenuItem value={1}>Tối đa 1</MenuItem>
            <MenuItem value={2}>Tối đa 2</MenuItem>
          </TextField>
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
          <Chip size="small" label="Giá & lịch mang tính THAM KHẢO — xác nhận lại với hãng/đại lý"
            sx={{ bgcolor: 'rgba(230,120,20,0.12)', color: '#b25a00', fontWeight: 600 }} />
          <Button variant="contained" startIcon={<SearchIcon />} disabled={!canSearch} onClick={onSearch}
            sx={{ bgcolor: TEAL, '&:hover': { bgcolor: '#0a5f52' }, fontWeight: 700 }}>
            {loading ? 'Đang tìm…' : 'Tìm chuyến bay'}
          </Button>
        </Stack>
        {loading && (
          <Typography fontSize={12} color="text.secondary">
            🔎 Đang tổng hợp từ nhiều nguồn (Google Flights, Skyscanner, Kayak, hãng bay)… có thể mất 15–40 giây.
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
