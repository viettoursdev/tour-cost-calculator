import { Box, Chip, Stack, Typography } from '@mui/material';
import { deriveAirline, deriveAirport, fareTotal, migrateFlight } from './flightConstants';
import type { FlightFare, FlightSegment, QuoteFlight, LegacyQuoteFlight } from '@/types';

const airName = (no: string, override?: string) => override || deriveAirline(no).name;
const off = (n?: number) => ((n ?? 0) > 0 ? `+${n}` : '');
const fmtFare = (fr: FlightFare) => `${Math.round(fareTotal(fr)).toLocaleString('vi-VN')} ${fr.cur}`;

/** Tuyến rút gọn của booking: HAN→DOH→EDI… */
const routeOf = (segs: FlightSegment[]) =>
  segs.length ? [segs[0].depAirport || '?', ...segs.map((s) => s.arrAirport || '?')].join('→') : '—';

/**
 * Hiển thị CHỈ-ĐỌC thông tin chuyến bay (tái dùng cho khung "✈️ Chuyến bay" trong
 * Hồ sơ tour). Tự chuẩn hoá dữ liệu cũ (phẳng/khứ hồi) qua `migrateFlight`.
 */
export function FlightSummary({ flights }: { flights: (QuoteFlight | LegacyQuoteFlight)[] }) {
  const list = flights.map(migrateFlight);
  if (list.length === 0) {
    return <Typography variant="body2" color="text.secondary">Báo giá chính chưa có thông tin chuyến bay.</Typography>;
  }
  return (
    <Stack spacing={0.75}>
      {list.map((f, i) => (
        <Box key={f.id || i} sx={{ border: '1px solid rgba(15,58,74,0.12)', borderRadius: 1.5, px: 1, py: 0.5 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.25 }}>
            <Typography fontWeight={800} fontSize={13}>{routeOf(f.segments)}</Typography>
            {(f.fares ?? []).map((fr) => (
              <Chip key={fr.id} size="small" variant="outlined" sx={{ height: 19 }}
                label={`${fr.label ? fr.label + ': ' : ''}${fmtFare(fr)}`} />
            ))}
          </Stack>
          {f.segments.map((s, j) => (
            <Stack key={j} direction="row" spacing={1} alignItems="baseline" flexWrap="wrap" useFlexGap>
              {s.date && <Chip size="small" variant="outlined" label={s.date} sx={{ height: 18 }} />}
              {s.flightNo && <Typography fontWeight={700} fontSize={12.5}>{s.flightNo}</Typography>}
              {airName(s.flightNo, s.airlineName) && (
                <Typography variant="caption" color="text.secondary">· {airName(s.flightNo, s.airlineName)}</Typography>
              )}
              <Typography fontSize={12.5}>
                <b>{s.depAirport}</b>{deriveAirport(s.depAirport) ? ` (${deriveAirport(s.depAirport)})` : ''} {s.depTime}{off(s.depDayOffset)}
                {'  →  '}
                <b>{s.arrAirport}</b>{deriveAirport(s.arrAirport) ? ` (${deriveAirport(s.arrAirport)})` : ''} {s.arrTime}{off(s.arrDayOffset)}
              </Typography>
            </Stack>
          ))}
          {f.note && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>📝 {f.note}</Typography>}
        </Box>
      ))}
    </Stack>
  );
}
