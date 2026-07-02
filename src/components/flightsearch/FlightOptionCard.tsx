import { useState } from 'react';
import {
  Box, Card, CardContent, Chip, Collapse, Divider, IconButton, Link, Stack, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import FlightTakeoffOutlinedIcon from '@mui/icons-material/FlightTakeoffOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { fmtDuration, layoverIsWarn, type FlightOption, type Layover } from '@/lib/flightSearch';
import { fmtVnd, fmtOrig, tagLabel, tagIsWarn } from './flightSearchConstants';

const TEAL = '#0d7a6a';

function LayoverChip({ l }: { l: Layover }) {
  const warn = layoverIsWarn(l);
  const text = `${l.airport}${l.city ? ` (${l.city})` : ''} · chờ ${fmtDuration(l.durationMin)}`;
  return (
    <Tooltip title={l.note || (warn ? 'Nối chuyến cần lưu ý' : 'Nối chuyến')}>
      <Chip
        size="small"
        icon={warn ? <WarningAmberIcon sx={{ fontSize: 15 }} /> : undefined}
        label={text}
        sx={{
          height: 22, fontSize: 12, fontWeight: 600,
          bgcolor: warn ? 'rgba(230,120,20,0.14)' : 'rgba(20,150,140,0.12)',
          color: warn ? '#b25a00' : TEAL,
          '& .MuiChip-icon': { color: '#b25a00' },
        }}
      />
    </Tooltip>
  );
}

export function FlightOptionCard({ option, onPush }: { option: FlightOption; onPush: (o: FlightOption) => void }) {
  const [open, setOpen] = useState(false);
  const first = option.legs[0];
  const last = option.legs[option.legs.length - 1];
  const routeTimes = first && last
    ? `${first.depTime || '—'} → ${last.arrTime || '—'}`
    : '—';
  const route = first && last ? `${first.depAirport} → ${last.arrAirport}` : '';
  const stopsLabel = option.stops === 0 ? 'Bay thẳng' : `${option.stops} điểm dừng`;

  return (
    <Card variant="outlined" sx={{ borderColor: 'rgba(0,0,0,0.12)', borderRadius: 2, '&:hover': { borderColor: TEAL } }}>
      <CardContent sx={{ pb: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} justifyContent="space-between">
          {/* Trái: hãng + giờ + tuyến */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <FlightTakeoffOutlinedIcon sx={{ color: TEAL, fontSize: 20 }} />
              <Typography fontWeight={800} fontSize={15}>{routeTimes}</Typography>
              <Typography color="text.secondary" fontSize={13}>· {fmtDuration(option.totalDurationMin)} · {stopsLabel}</Typography>
            </Stack>
            <Typography color="text.secondary" fontSize={13} sx={{ mt: 0.3 }}>
              {option.airlines.join(', ') || '—'}{route ? ` · ${route}` : ''}
            </Typography>
            {/* Layover chips */}
            {option.layovers.length > 0 && (
              <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap sx={{ mt: 0.8 }}>
                {option.layovers.map((l, i) => <LayoverChip key={i} l={l} />)}
              </Stack>
            )}
            {/* Tags */}
            {option.tags.length > 0 && (
              <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap sx={{ mt: 0.8 }}>
                {option.tags.map((t) => (
                  <Chip key={t} size="small" label={tagLabel(t)}
                    sx={{
                      height: 20, fontSize: 11, fontWeight: 700,
                      bgcolor: tagIsWarn(t) ? 'rgba(230,120,20,0.14)' : 'rgba(20,150,140,0.12)',
                      color: tagIsWarn(t) ? '#b25a00' : TEAL,
                    }} />
                ))}
              </Stack>
            )}
          </Box>

          {/* Phải: giá + hành động */}
          <Stack alignItems={{ xs: 'flex-start', md: 'flex-end' }} spacing={0.5} sx={{ minWidth: 160 }}>
            <Typography fontWeight={900} fontSize={18} color={TEAL}>{fmtVnd(option.priceVnd)}</Typography>
            {option.priceOrig != null && option.priceCur && option.priceCur !== 'VND' && (
              <Typography color="text.secondary" fontSize={12}>≈ {fmtOrig(option.priceOrig, option.priceCur)}</Typography>
            )}
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Tooltip title="Đẩy vào tab Chuyến bay của báo giá">
                <IconButton size="small" onClick={() => onPush(option)} sx={{ color: TEAL }}>
                  <AddCircleOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <IconButton size="small" onClick={() => setOpen((v) => !v)}>
                {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            </Stack>
          </Stack>
        </Stack>

        {option.priceNote && (
          <Typography color="text.secondary" fontSize={12} sx={{ mt: 0.5 }}>💳 {option.priceNote}</Typography>
        )}
        {option.note && (
          <Typography fontSize={12} sx={{ mt: 0.5, color: '#b25a00' }}>⚠️ {option.note}</Typography>
        )}

        {/* Chi tiết từng chặng + nguồn đặt */}
        <Collapse in={open} unmountOnExit>
          <Divider sx={{ my: 1.2 }} />
          <Stack spacing={1}>
            {option.legs.map((leg, i) => (
              <Box key={i}>
                <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap" useFlexGap>
                  <Typography fontWeight={700} fontSize={13}>
                    {leg.depTime} {leg.depAirport}{leg.depCity ? ` (${leg.depCity})` : ''}
                    {' → '}
                    {leg.arrTime} {leg.arrAirport}{leg.arrCity ? ` (${leg.arrCity})` : ''}
                  </Typography>
                  <Typography color="text.secondary" fontSize={12}>
                    {leg.airline} {leg.flightNo}{leg.durationMin ? ` · ${fmtDuration(leg.durationMin)}` : ''}
                    {leg.aircraft ? ` · ${leg.aircraft}` : ''}
                  </Typography>
                </Stack>
                {/* Nối chuyến sau chặng này */}
                {option.layovers[i] && (
                  <Typography fontSize={12} sx={{ pl: 1.5, color: layoverIsWarn(option.layovers[i]) ? '#b25a00' : 'text.secondary' }}>
                    ↳ Nối tại {option.layovers[i].airport}: chờ {fmtDuration(option.layovers[i].durationMin)}
                    {option.layovers[i].changeAirport ? ' · đổi sân bay' : ''}
                    {option.layovers[i].overnight ? ' · qua đêm' : ''}
                    {option.layovers[i].note ? ` — ${option.layovers[i].note}` : ''}
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
          {option.bookingSources.length > 0 && (
            <>
              <Divider sx={{ my: 1.2 }} />
              <Stack direction="row" spacing={1.2} flexWrap="wrap" useFlexGap alignItems="center">
                <Typography fontSize={12} color="text.secondary">Nguồn đặt:</Typography>
                {option.bookingSources.map((s, i) => s.url ? (
                  <Link key={i} href={s.url} target="_blank" rel="noopener" fontSize={12}
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3, color: TEAL }}>
                    {s.name} <OpenInNewIcon sx={{ fontSize: 13 }} />
                  </Link>
                ) : (
                  <Typography key={i} fontSize={12}>{s.name}</Typography>
                ))}
              </Stack>
            </>
          )}
        </Collapse>
      </CardContent>
    </Card>
  );
}
