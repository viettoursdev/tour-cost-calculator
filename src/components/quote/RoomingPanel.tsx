import { useMemo, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, IconButton, MenuItem,
  Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HotelIcon from '@mui/icons-material/Hotel';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import { ROOM_KEYS, ROOM_LABELS, summarizeGuests, type RoomKey } from './guestStats';
import type { Passenger } from '@/types';

type Props = { rows: Passenger[]; onChange: (rows: Passenger[]) => void };

type Room = { no: string; type: RoomKey | ''; members: Passenger[] };

/** Số phòng tối đa mỗi loại (cảnh báo khi vượt). */
const ROOM_CAPACITY: Partial<Record<RoomKey, number>> = { single: 1, double: 2, twin: 2 };

function nextRoomNo(existing: string[]): string {
  let max = 0;
  for (const n of existing) {
    const m = /^P(\d+)$/i.exec(n.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `P${max + 1}`;
}

/** Panel sắp xếp phòng: gom khách theo số phòng, chọn loại, tự ghép đôi, cảnh báo. */
export function RoomingPanel({ rows, onChange }: Props) {
  const [emptyRooms, setEmptyRooms] = useState<string[]>([]);
  const s = summarizeGuests(rows);

  const { rooms, unassigned } = useMemo(() => {
    const byNo = new Map<string, Room>();
    const un: Passenger[] = [];
    for (const p of rows) {
      const no = p.roomNo?.trim();
      if (!no) { un.push(p); continue; }
      const r = byNo.get(no) ?? { no, type: '', members: [] };
      r.members.push(p);
      if (!r.type && p.roomType) r.type = p.roomType as RoomKey;
      byNo.set(no, r);
    }
    for (const no of emptyRooms) if (!byNo.has(no)) byNo.set(no, { no, type: '', members: [] });
    return { rooms: [...byNo.values()].sort((a, b) => a.no.localeCompare(b.no, undefined, { numeric: true })), unassigned: un };
  }, [rows, emptyRooms]);

  const upd = (id: string, patch: Partial<Passenger>) => onChange(rows.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const assign = (guestId: string, roomNo: string) => {
    const room = rooms.find((r) => r.no === roomNo);
    onChange(rows.map((p) => (p.id === guestId
      ? { ...p, roomNo, roomType: room?.type || p.roomType }
      : p)));
  };
  const removeFromRoom = (guestId: string) => upd(guestId, { roomNo: '' });

  const setRoomType = (no: string, type: RoomKey | '') =>
    onChange(rows.map((p) => (p.roomNo?.trim() === no ? { ...p, roomType: type } : p)));

  const renameRoom = (oldNo: string, newNo: string) => {
    setEmptyRooms((e) => e.map((n) => (n === oldNo ? newNo : n)));
    onChange(rows.map((p) => (p.roomNo?.trim() === oldNo ? { ...p, roomNo: newNo } : p)));
  };

  const addRoom = () => setEmptyRooms((e) => [...e, nextRoomNo([...rooms.map((r) => r.no), ...e])]);

  // Tự ghép đôi khách chưa xếp phòng thành các phòng Twin.
  const autoPair = () => {
    if (unassigned.length < 2) return;
    let base = rooms.map((r) => r.no);
    const updates = new Map<string, Partial<Passenger>>();
    for (let i = 0; i < unassigned.length; i += 2) {
      const no = nextRoomNo(base);
      base = [...base, no];
      const pair = unassigned.slice(i, i + 2);
      const type: RoomKey = pair.length === 2 ? 'twin' : 'single';
      for (const g of pair) updates.set(g.id, { roomNo: no, roomType: type });
    }
    onChange(rows.map((p) => (updates.has(p.id) ? { ...p, ...updates.get(p.id) } : p)));
  };

  const overfilled = rooms.filter((r) => r.type && ROOM_CAPACITY[r.type] && r.members.length > ROOM_CAPACITY[r.type]!);

  return (
    <Accordion variant="outlined" disableGutters sx={{ mb: 2, '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <HotelIcon sx={{ color: '#0d7a6a' }} />
          <Typography fontWeight={800}>Sắp xếp phòng</Typography>
          <Chip size="small" label={`${s.totalRooms} phòng`} sx={{ bgcolor: 'rgba(15,58,74,0.1)', color: '#0f3a4a', fontWeight: 700 }} />
          {unassigned.length > 0 && <Chip size="small" color="warning" variant="outlined" label={`${unassigned.length} chưa xếp`} />}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addRoom}>Thêm phòng</Button>
          <Button size="small" variant="outlined" startIcon={<AutoFixHighIcon />} onClick={autoPair}
            disabled={unassigned.length < 2}>Tự ghép đôi khách lẻ</Button>
        </Stack>

        {overfilled.length > 0 && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            Vượt sức chứa: {overfilled.map((r) => `${r.no} (${ROOM_LABELS[r.type as RoomKey]} có ${r.members.length} khách)`).join(', ')}
          </Alert>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 1.5 }}>
          {rooms.map((r) => (
            <Paper key={r.no} variant="outlined" sx={{ p: 1.25 }}>
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
                <TextField size="small" variant="standard" value={r.no} sx={{ width: 64 }}
                  onChange={(e) => renameRoom(r.no, e.target.value)} />
                <TextField select size="small" variant="standard" fullWidth value={r.type}
                  onChange={(e) => setRoomType(r.no, e.target.value as RoomKey | '')}>
                  <MenuItem value="">— loại —</MenuItem>
                  {ROOM_KEYS.map((k) => <MenuItem key={k} value={k}>{ROOM_LABELS[k]}</MenuItem>)}
                </TextField>
                <Chip size="small" label={r.members.length} />
              </Stack>
              <Stack spacing={0.25}>
                {r.members.length === 0 && <Typography variant="caption" color="text.disabled">Phòng trống — gán khách bên dưới.</Typography>}
                {r.members.map((m) => (
                  <Stack key={m.id} direction="row" alignItems="center" spacing={0.5}>
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>{m.name || '(chưa tên)'}</Typography>
                    <Tooltip title="Bỏ khỏi phòng"><IconButton size="small" onClick={() => removeFromRoom(m.id)}>
                      <PersonRemoveIcon fontSize="inherit" /></IconButton></Tooltip>
                  </Stack>
                ))}
              </Stack>
            </Paper>
          ))}
        </Box>

        {unassigned.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" fontWeight={800} color="text.secondary"
              sx={{ display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Khách chưa xếp phòng ({unassigned.length})
            </Typography>
            <Stack spacing={0.5}>
              {unassigned.map((g) => (
                <Stack key={g.id} direction="row" alignItems="center" spacing={1}>
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>{g.name || '(chưa tên)'}</Typography>
                  <TextField select size="small" value="" sx={{ minWidth: 150 }}
                    onChange={(e) => assign(g.id, e.target.value)} label="Xếp vào phòng">
                    <MenuItem value="" sx={{ display: 'none' }} />
                    {rooms.map((r) => <MenuItem key={r.no} value={r.no}>{r.no}{r.type ? ` · ${ROOM_LABELS[r.type as RoomKey]}` : ''}</MenuItem>)}
                    <MenuItem value={nextRoomNo([...rooms.map((r) => r.no), ...emptyRooms])}>+ Phòng mới</MenuItem>
                  </TextField>
                </Stack>
              ))}
            </Stack>
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
