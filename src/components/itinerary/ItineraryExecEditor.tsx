import { type ReactNode } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Checkbox, Divider,
  FormControlLabel, IconButton, Stack, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { newExecChecklistItem, newExecContact, newExecGuest } from './constants';
import type { Day, ExecChecklistItem, ExecContact, ExecData, ExecDayOps, ExecGuest } from '@/types';

type Props = {
  exec: ExecData | undefined;
  days: Day[];
  onChange: (exec: ExecData) => void;
};

const TEAL = '#0d7a6a';

export function ItineraryExecEditor({ exec, days, onChange }: Props) {
  const e: ExecData = exec ?? {};
  const upd = (patch: Partial<ExecData>) => onChange({ ...e, ...patch });

  const dayOpsFor = (dayNum: number): ExecDayOps =>
    (e.dayOps ?? []).find((d) => d.dayNum === dayNum) ?? { dayNum };
  const setDayOps = (dayNum: number, patch: Partial<ExecDayOps>) => {
    const list = [...(e.dayOps ?? [])];
    const i = list.findIndex((d) => d.dayNum === dayNum);
    const next = { ...dayOpsFor(dayNum), ...patch };
    if (i >= 0) list[i] = next; else list.push(next);
    upd({ dayOps: list });
  };

  return (
    <Accordion defaultExpanded={false} sx={{ mt: 2, border: '1px solid rgba(20,150,140,0.3)', '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: 'rgba(20,150,140,0.08)' }}>
        <Typography fontWeight={800}>🧭 Thông tin vận hành (Itinerary Execution — cho HDV)</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2.5}>
          {/* SOS */}
          <Box>
            <SectionLabel>🆘 Thẻ liên hệ khẩn cấp (SOS 24/7)</SectionLabel>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField size="small" label="Hotline 24/7" value={e.sosHotline ?? ''} onChange={(ev) => upd({ sosHotline: ev.target.value })} />
              <TextField size="small" label="Điều hành trực" value={e.sosOperator ?? ''} onChange={(ev) => upd({ sosOperator: ev.target.value })} />
              <TextField size="small" label="Bảo hiểm (hotline/đơn vị)" value={e.sosInsurance ?? ''} onChange={(ev) => upd({ sosInsurance: ev.target.value })} />
              <TextField size="small" label="Đại sứ quán / Lãnh sự" value={e.sosEmbassy ?? ''} onChange={(ev) => upd({ sosEmbassy: ev.target.value })} />
              <TextField size="small" label="Cấp cứu / Y tế" value={e.sosMedical ?? ''} onChange={(ev) => upd({ sosMedical: ev.target.value })} />
            </Box>
          </Box>

          <ContactSection label="🧑‍✈️ Hướng dẫn viên" rolePh="HDV chính / phụ" rows={e.guides} onChange={(v) => upd({ guides: v })} />
          <ContactSection label="🚌 Tài xế & xe" rolePh="Tài xế / loại xe / biển số" rows={e.drivers} onChange={(v) => upd({ drivers: v })} />
          <ContactSection label="📇 Danh bạ nhà cung cấp" rolePh="Khách sạn / Nhà hàng / Điểm / Xe…" rows={e.suppliers} onChange={(v) => upd({ suppliers: v })} />

          {/* Guests */}
          <Box>
            <SectionLabel>👥 Danh sách khách & lưu ý đặc biệt</SectionLabel>
            <GuestTable rows={e.guests} onChange={(v) => upd({ guests: v })} />
            <TextField fullWidth multiline minRows={2} size="small" sx={{ mt: 1 }}
              label="Lưu ý chung về đoàn khách"
              value={e.guestNotes ?? ''} onChange={(ev) => upd({ guestNotes: ev.target.value })} />
          </Box>

          {/* Per-day ops */}
          {days.length > 0 && (
            <Box>
              <SectionLabel>🗓️ Vận hành theo ngày (khách sạn · điểm · lưu ý · checklist)</SectionLabel>
              <Stack spacing={1}>
                {days.map((d) => {
                  const ops = dayOpsFor(d.dayNum);
                  return (
                    <Accordion key={d.id} disableGutters sx={{ border: '1px solid rgba(15,58,74,0.12)', '&:before': { display: 'none' } }}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Typography fontWeight={700} fontSize={14}>
                          Ngày {d.dayNum}{d.title ? ` — ${d.title}` : ''}
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Stack spacing={1.25}>
                          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
                            <TextField size="small" label="Khách sạn" value={ops.hotelName ?? ''} onChange={(ev) => setDayOps(d.dayNum, { hotelName: ev.target.value })} />
                            <TextField size="small" label="Contact khách sạn" value={ops.hotelContact ?? ''} onChange={(ev) => setDayOps(d.dayNum, { hotelContact: ev.target.value })} />
                          </Box>
                          <ContactSection dense label="📍 Điểm tham quan & contact" rolePh="Tên điểm / lưu ý" rows={ops.venues} onChange={(v) => setDayOps(d.dayNum, { venues: v })} />
                          <TextField size="small" fullWidth multiline minRows={2} label="Lưu ý điều hành trong ngày"
                            value={ops.notes ?? ''} onChange={(ev) => setDayOps(d.dayNum, { notes: ev.target.value })} />
                          <ChecklistEditor rows={ops.checklist} onChange={(v) => setDayOps(d.dayNum, { checklist: v })} />
                        </Stack>
                      </AccordionDetails>
                    </Accordion>
                  );
                })}
              </Stack>
            </Box>
          )}

          <TextField fullWidth multiline minRows={2} size="small" label="📝 Các lưu ý vận hành khác"
            value={e.generalNotes ?? ''} onChange={(ev) => upd({ generalNotes: ev.target.value })} />
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <Typography fontWeight={700} fontSize={13.5} sx={{ color: TEAL, mb: 1 }}>{children}</Typography>;
}

function ContactSection({
  label, rolePh, rows, onChange, dense,
}: {
  label: string; rolePh: string; rows: ExecContact[] | undefined;
  onChange: (rows: ExecContact[]) => void; dense?: boolean;
}) {
  const list = rows ?? [];
  const upd = (id: string, patch: Partial<ExecContact>) => onChange(list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <Box>
      {!dense && <SectionLabel>{label}</SectionLabel>}
      {dense && <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{label}</Typography>}
      <Stack spacing={0.75}>
        {list.map((r) => (
          <Stack key={r.id} direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField size="small" placeholder={rolePh} value={r.role} onChange={(e) => upd(r.id, { role: e.target.value })} sx={{ width: 170 }} />
            <TextField size="small" placeholder="Tên" value={r.name} onChange={(e) => upd(r.id, { name: e.target.value })} sx={{ flex: 1, minWidth: 120 }} />
            <TextField size="small" placeholder="SĐT" value={r.phone} onChange={(e) => upd(r.id, { phone: e.target.value })} sx={{ width: 130 }} />
            <TextField size="small" placeholder="Ghi chú" value={r.note ?? ''} onChange={(e) => upd(r.id, { note: e.target.value })} sx={{ flex: 1, minWidth: 120 }} />
            <IconButton size="small" color="error" onClick={() => onChange(list.filter((x) => x.id !== r.id))}><DeleteOutlineIcon fontSize="inherit" /></IconButton>
          </Stack>
        ))}
        <Box>
          <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...list, newExecContact()])}>Thêm</Button>
        </Box>
      </Stack>
    </Box>
  );
}

function GuestTable({ rows, onChange }: { rows: ExecGuest[] | undefined; onChange: (rows: ExecGuest[]) => void }) {
  const list = rows ?? [];
  const upd = (id: string, patch: Partial<ExecGuest>) => onChange(list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <Stack spacing={0.75}>
      {list.map((g, i) => (
        <Stack key={g.id} direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="caption" color="text.disabled" sx={{ width: 16, textAlign: 'right' }}>{i + 1}</Typography>
          <TextField size="small" placeholder="Tên khách" value={g.name} onChange={(e) => upd(g.id, { name: e.target.value })} sx={{ flex: 1, minWidth: 130 }} />
          <TextField size="small" placeholder="Phòng" value={g.room ?? ''} onChange={(e) => upd(g.id, { room: e.target.value })} sx={{ width: 90 }} />
          <TextField size="small" placeholder="Ăn kiêng/dị ứng" value={g.dietary ?? ''} onChange={(e) => upd(g.id, { dietary: e.target.value })} sx={{ width: 150 }} />
          <TextField size="small" placeholder="Y tế" value={g.medical ?? ''} onChange={(e) => upd(g.id, { medical: e.target.value })} sx={{ width: 120 }} />
          <FormControlLabel sx={{ mr: 0 }} control={<Checkbox size="small" checked={!!g.vip} onChange={(e) => upd(g.id, { vip: e.target.checked })} />} label="VIP" />
          <IconButton size="small" color="error" onClick={() => onChange(list.filter((x) => x.id !== g.id))}><DeleteOutlineIcon fontSize="inherit" /></IconButton>
        </Stack>
      ))}
      <Box>
        <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...list, newExecGuest()])}>Thêm khách</Button>
      </Box>
    </Stack>
  );
}

function ChecklistEditor({ rows, onChange }: { rows: ExecChecklistItem[] | undefined; onChange: (rows: ExecChecklistItem[]) => void }) {
  const list = rows ?? [];
  return (
    <Box>
      <Divider textAlign="left" sx={{ mb: 0.5 }}><Typography variant="caption" color="text.secondary">Checklist HDV</Typography></Divider>
      <Stack spacing={0.5}>
        {list.map((c) => (
          <Stack key={c.id} direction="row" spacing={0.5} alignItems="center">
            <Checkbox size="small" checked={!!c.done} onChange={(e) => onChange(list.map((x) => (x.id === c.id ? { ...x, done: e.target.checked } : x)))} sx={{ p: 0.5 }} />
            <TextField size="small" fullWidth placeholder="Việc cần làm" value={c.text} onChange={(e) => onChange(list.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)))} />
            <IconButton size="small" color="error" onClick={() => onChange(list.filter((x) => x.id !== c.id))}><DeleteOutlineIcon fontSize="inherit" /></IconButton>
          </Stack>
        ))}
        <Box>
          <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...list, newExecChecklistItem()])}>Thêm việc</Button>
        </Box>
      </Stack>
    </Box>
  );
}
