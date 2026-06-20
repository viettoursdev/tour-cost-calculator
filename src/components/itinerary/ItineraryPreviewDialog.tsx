import { useRef, useState } from 'react';
import {
  Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography,
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { toast } from '@/stores/toastStore';
import type { Itinerary, Day } from '@/types';
import { dayLabel } from './itinCode';
import { parseInlineRich, splitLines } from '@/lib/richText';

/** Hiển thị nội dung hoạt động: xuống dòng + **đậm** + *nghiêng*. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {splitLines(text).map((ln, i) => (
        <Box component="span" key={i}>
          {i > 0 && <br />}
          {parseInlineRich(ln).map((r, j) => (
            <Box component="span" key={j}
              sx={{ fontWeight: r.bold ? 800 : undefined, fontStyle: r.italic ? 'italic' : undefined }}>
              {r.text}
            </Box>
          ))}
        </Box>
      ))}
    </>
  );
}

const MEALS: [keyof Day['meals'], string][] = [['B', 'Sáng'], ['L', 'Trưa'], ['D', 'Tối']];
const real = (d: Day) => d.segments.map((s) => ({ ...s, activities: s.activities.filter((a) => a.text.trim()) })).filter((s) => s.activities.length || s.transport.trim());

/** Xem trước chương trình (HTML đẹp) + xuất PDF từ chính bản xem trước (html2canvas). */
export function ItineraryPreviewDialog({ itinerary, code, onClose }: { itinerary: Itinerary | null; code?: string; onClose: () => void }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  if (!itinerary) return null;
  const it = itinerary;

  const exportPDF = async () => {
    if (!sheetRef.current) return;
    setBusy(true);
    try {
      const safe = (code || it.title || 'ChuongTrinh').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
      await (await import('@/lib/exports/exportPDFImage')).exportPDFImage(sheetRef.current, `ChuongTrinh_${safe}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) { toast('Xuất PDF lỗi: ' + (e as Error).message, 'error'); }
    finally { setBusy(false); }
  };

  const inc = (it.includes ?? []).filter((x) => x.trim());
  const exc = (it.excludes ?? []).filter((x) => x.trim());

  return (
    <Dialog open={!!itinerary} onClose={onClose} maxWidth="md" fullWidth
      slotProps={{ paper: { sx: { height: '92vh', display: 'flex', flexDirection: 'column' } } }}>
      <DialogTitle sx={{ py: 1.25 }}>👁 Xem trước chương trình</DialogTitle>
      <DialogContent dividers sx={{ bgcolor: '#eef2f3', p: { xs: 1, sm: 2 } }}>
        <Box ref={sheetRef} sx={{ maxWidth: 760, mx: 'auto', bgcolor: '#fff', p: 3.5, color: '#0f3a4a', fontSize: 13, lineHeight: 1.55 }}>
          {/* Tiêu đề */}
          <Box sx={{ borderBottom: '2px solid #14a08c', pb: 1.5, mb: 2 }}>
            {code && <Typography sx={{ fontSize: 11, color: '#14a08c', fontWeight: 800, letterSpacing: 1 }}>{code}</Typography>}
            <Typography sx={{ fontSize: 22, fontWeight: 900, color: '#0f3a4a' }}>{it.title || 'CHƯƠNG TRÌNH TOUR'}</Typography>
            <Typography sx={{ fontSize: 13, color: '#48606b' }}>
              {it.destination}{it.destination && (it.days ? ' · ' : '')}{it.days ? `${it.days} ngày ${it.nights} đêm` : ''}{it.startDate ? ` · Khởi hành: ${it.startDate}` : ''}
            </Typography>
          </Box>

          {it.intro?.trim() && <Typography sx={{ fontStyle: 'italic', color: '#48606b', mb: 2, whiteSpace: 'pre-wrap' }}>{it.intro}</Typography>}

          {/* Chuyến bay */}
          {(it.flights ?? []).length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontWeight: 800, color: '#14a08c', mb: 0.5 }}>✈ CHUYẾN BAY</Typography>
              {it.flights.map((f) => (
                <Typography key={f.id} sx={{ fontSize: 12.5 }}>
                  {[f.group, f.flightNo, (f.depAirport || f.dep), '→', (f.arrAirport || f.arr), [f.depTime, f.arrTime].filter(Boolean).join(' – ')].filter(Boolean).join('  ')}
                </Typography>
              ))}
            </Box>
          )}

          {/* Lịch trình */}
          {it.schedule.map((d) => (
            <Box key={d.id} sx={{ mb: 1.75, breakInside: 'avoid' }}>
              <Box sx={{ background: 'linear-gradient(135deg,#0f3a4a,#14566b)', color: '#fff', px: 1.5, py: 0.85, borderRadius: '6px 6px 0 0' }}>
                <Typography component="span" sx={{ fontWeight: 900, fontSize: 13 }}>NGÀY {dayLabel(d.dayNum, it.dayStart)}</Typography>
                {d.date && <Typography component="span" sx={{ fontSize: 12, opacity: 0.85, ml: 1 }}>({d.date})</Typography>}
                {d.title && <Typography component="span" sx={{ fontWeight: 700, fontSize: 13, ml: 1 }}>· {d.title}</Typography>}
              </Box>
              <Box sx={{ border: '1px solid #e0e8ea', borderTop: 'none', borderRadius: '0 0 6px 6px', px: 1.5, py: 1 }}>
                {real(d).map((seg) => (
                  <Box key={seg.id} sx={{ mb: 0.75 }}>
                    {seg.groupLabel?.trim() && <Typography sx={{ fontWeight: 700, color: '#2980b9', fontSize: 12.5 }}>{seg.groupLabel}</Typography>}
                    {seg.transport?.trim() && <Typography sx={{ color: '#14a08c', fontWeight: 600, fontSize: 12 }}>🚌 {seg.transport}</Typography>}
                    {seg.activities.map((a) => (
                      <Typography key={a.id} sx={{ fontSize: 12.5, pl: 1 }}>
                        {a.time && <Box component="span" sx={{ fontWeight: 700, color: '#0f3a4a', mr: 0.75 }}>{a.time}</Box>}<RichText text={a.text} />
                      </Typography>
                    ))}
                  </Box>
                ))}
                {(d.meals.B || d.meals.L || d.meals.D || d.mealNote.trim()) && (
                  <Typography sx={{ fontSize: 12, color: '#b9770f', mt: 0.5 }}>
                    🍽 Ăn: {MEALS.filter(([k]) => d.meals[k]).map(([, l]) => l).join(', ') || '—'}{d.mealNote.trim() ? ` (${d.mealNote})` : ''}
                  </Typography>
                )}
              </Box>
            </Box>
          ))}

          {/* Bao gồm / không bao gồm */}
          {(inc.length > 0 || exc.length > 0) && (
            <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
              {inc.length > 0 && (
                <Box sx={{ flex: '1 1 280px' }}>
                  <Typography sx={{ fontWeight: 800, color: '#0d7a6a', mb: 0.5 }}>✓ BAO GỒM</Typography>
                  {inc.map((x, i) => <Typography key={i} sx={{ fontSize: 12.5 }}>• {x}</Typography>)}
                </Box>
              )}
              {exc.length > 0 && (
                <Box sx={{ flex: '1 1 280px' }}>
                  <Typography sx={{ fontWeight: 800, color: '#c2410c', mb: 0.5 }}>✕ KHÔNG BAO GỒM</Typography>
                  {exc.map((x, i) => <Typography key={i} sx={{ fontSize: 12.5 }}>• {x}</Typography>)}
                </Box>
              )}
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">Đóng</Button>
        <Button onClick={() => void exportPDF()} disabled={busy} variant="contained" startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdfIcon />}
          sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
          {busy ? 'Đang tạo PDF…' : 'Xuất PDF'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
