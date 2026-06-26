import { type ReactNode } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Checkbox, Divider,
  FormControlLabel, IconButton, Stack, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { DebouncedTextField } from '@/components/common/DebouncedTextField';
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
              <DebouncedTextField size="small" label="Hotline 24/7" value={e.sosHotline ?? ''} onCommit={(v) => upd({ sosHotline: v })} />
              <DebouncedTextField size="small" label="Điều hành trực" value={e.sosOperator ?? ''} onCommit={(v) => upd({ sosOperator: v })} />
              <DebouncedTextField size="small" label="Bảo hiểm (hotline/đơn vị)" value={e.sosInsurance ?? ''} onCommit={(v) => upd({ sosInsurance: v })} />
              <DebouncedTextField size="small" label="Đại sứ quán / Lãnh sự" value={e.sosEmbassy ?? ''} onCommit={(v) => upd({ sosEmbassy: v })} />
              <DebouncedTextField size="small" label="Cấp cứu / Y tế" value={e.sosMedical ?? ''} onCommit={(v) => upd({ sosMedical: v })} />
            </Box>
          </Box>

          <ContactSection label="🧑‍✈️ Hướng dẫn viên" rolePh="HDV chính / phụ" rows={e.guides} onChange={(v) => upd({ guides: v })} />
          <ContactSection label="🚌 Tài xế & xe" rolePh="Tài xế / loại xe / biển số" rows={e.drivers} onChange={(v) => upd({ drivers: v })} />
          <ContactSection label="📇 Danh bạ nhà cung cấp" rolePh="Khách sạn / Nhà hàng / Điểm / Xe…" rows={e.suppliers} onChange={(v) => upd({ suppliers: v })} />

          {/* Guests */}
          <Box>
            <SectionLabel>👥 Danh sách khách & lưu ý đặc biệt</SectionLabel>
            <GuestTable rows={e.guests} onChange={(v) => upd({ guests: v })} />
            <DebouncedTextField fullWidth multiline minRows={2} size="small" sx={{ mt: 1 }}
              label="Lưu ý chung về đoàn khách"
              value={e.guestNotes ?? ''} onCommit={(v) => upd({ guestNotes: v })} />
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
                            <DebouncedTextField size="small" label="Khách sạn" value={ops.hotelName ?? ''} onCommit={(v) => setDayOps(d.dayNum, { hotelName: v })} />
                            <DebouncedTextField size="small" label="Contact khách sạn" value={ops.hotelContact ?? ''} onCommit={(v) => setDayOps(d.dayNum, { hotelContact: v })} />
                          </Box>
                          <ContactSection dense label="📍 Điểm tham quan & contact" rolePh="Tên điểm / lưu ý" rows={ops.venues} onChange={(v) => setDayOps(d.dayNum, { venues: v })} />
                          <DebouncedTextField size="small" fullWidth multiline minRows={2} label="Lưu ý điều hành trong ngày"
                            value={ops.notes ?? ''} onCommit={(v) => setDayOps(d.dayNum, { notes: v })} />
                          <ChecklistEditor rows={ops.checklist} onChange={(v) => setDayOps(d.dayNum, { checklist: v })} />
                        </Stack>
                      </AccordionDetails>
                    </Accordion>
                  );
                })}
              </Stack>
            </Box>
          )}

          <DebouncedTextField fullWidth multiline minRows={2} size="small" label="📝 Các lưu ý vận hành khác"
            value={e.generalNotes ?? ''} onCommit={(v) => upd({ generalNotes: v })} />
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
            <DebouncedTextField size="small" placeholder={rolePh} value={r.role} onCommit={(v) => upd(r.id, { role: v })} sx={{ width: 170 }} />
            <DebouncedTextField size="small" placeholder="Tên" value={r.name} onCommit={(v) => upd(r.id, { name: v })} sx={{ flex: 1, minWidth: 120 }} />
            <DebouncedTextField size="small" placeholder="SĐT" value={r.phone} onCommit={(v) => upd(r.id, { phone: v })} sx={{ width: 130 }} />
            <DebouncedTextField size="small" placeholder="Ghi chú" value={r.note ?? ''} onCommit={(v) => upd(r.id, { note: v })} sx={{ flex: 1, minWidth: 120 }} />
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
          <DebouncedTextField size="small" placeholder="Tên khách" value={g.name} onCommit={(v) => upd(g.id, { name: v })} sx={{ flex: 1, minWidth: 130 }} />
          <DebouncedTextField size="small" placeholder="Phòng" value={g.room ?? ''} onCommit={(v) => upd(g.id, { room: v })} sx={{ width: 90 }} />
          <DebouncedTextField size="small" placeholder="Ăn kiêng/dị ứng" value={g.dietary ?? ''} onCommit={(v) => upd(g.id, { dietary: v })} sx={{ width: 150 }} />
          <DebouncedTextField size="small" placeholder="Y tế" value={g.medical ?? ''} onCommit={(v) => upd(g.id, { medical: v })} sx={{ width: 120 }} />
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
            <DebouncedTextField size="small" fullWidth placeholder="Việc cần làm" value={c.text} onCommit={(v) => onChange(list.map((x) => (x.id === c.id ? { ...x, text: v } : x)))} />
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
