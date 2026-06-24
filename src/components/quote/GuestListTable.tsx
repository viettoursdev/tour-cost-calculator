import { Fragment, useState, type ReactNode } from 'react';
import {
  Box, Chip, Collapse, IconButton, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { APPLICANT_DOC_META, APPLICANT_RESULT_META } from '../visa/constants';
import { ROOM_KEYS, ROOM_LABELS, summarizeGuests } from './guestStats';
import type { Passenger } from '@/types';

export type GuestMode = 'tour' | 'visa';

/** Bỏ dấu nhưng GIỮ hoa/thường → tên không dấu (đồng bộ tự động ở mode visa). */
function stripAccentsKeepCase(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

const ROOM_OPTIONS: { v: NonNullable<Passenger['roomType']>; label: string }[] = [
  { v: '', label: '—' },
  ...ROOM_KEYS.map((k) => ({ v: k, label: ROOM_LABELS[k] })),
];

const cell = { px: 0.5, py: 0.25 };
const Inp = (props: React.ComponentProps<typeof TextField>) => (
  <TextField variant="standard" size="small" InputProps={{ disableUnderline: true }} {...props}
    sx={{ '& input, & .MuiSelect-select': { fontSize: 12.5, py: 0.25 }, ...props.sx }} />
);

/** Hàng chip thống kê: tổng khách, Nam/Nữ, số phòng từng loại, khách chưa xếp. */
export function GuestDashboard({ pax }: { pax: Passenger[] }) {
  const s = summarizeGuests(pax);
  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
      <Chip size="small" label={`${s.total} khách`} sx={{ bgcolor: 'rgba(20,150,140,0.15)', color: '#0d7a6a', fontWeight: 700 }} />
      <Chip size="small" variant="outlined" label={`Nam ${s.male} · Nữ ${s.female}${s.unspecifiedGender ? ` · ? ${s.unspecifiedGender}` : ''}`} />
      <Chip size="small" label={`${s.totalRooms} phòng`} sx={{ bgcolor: 'rgba(15,58,74,0.1)', color: '#0f3a4a', fontWeight: 700 }} />
      {ROOM_KEYS.map((k) => (s.roomsByRoom[k]
        ? <Chip key={k} size="small" variant="outlined" label={`${ROOM_LABELS[k]}: ${s.roomsByRoom[k]}`} /> : null))}
      {s.unassigned > 0 && (
        <Chip size="small" color="warning" variant="outlined" icon={<WarningAmberIcon />} label={`${s.unassigned} chưa xếp phòng`} />
      )}
    </Stack>
  );
}

type Props = {
  rows: Passenger[];
  onChange: (rows: Passenger[]) => void;
  mode: GuestMode;
  /** Nội dung hàng chi tiết (gập) — chỉ hiện khi cung cấp (mode visa). */
  renderExpanded?: (row: Passenger, patch: (p: Partial<Passenger>) => void) => ReactNode;
};

/** Bảng danh sách khách dùng chung cho báo giá & hồ sơ visa (template đẹp của báo giá). */
export function GuestListTable({ rows, onChange, mode, renderExpanded }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const isVisa = mode === 'visa';
  const hasExpand = !!renderExpanded;

  const upd = (id: string, patch: Partial<Passenger>) => onChange(rows.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const del = (id: string) => onChange(rows.filter((p) => p.id !== id));
  const toggle = (id: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Tự đồng bộ tên không dấu khi nó đang khớp tên cũ (hoặc còn trống) — mode visa.
  const updName = (p: Passenger, name: string) =>
    upd(p.id, !p.nameNoAccent || p.nameNoAccent === stripAccentsKeepCase(p.name)
      ? { name, nameNoAccent: stripAccentsKeepCase(name) }
      : { name });

  const colCount = (hasExpand ? 1 : 0) + 1 + (isVisa ? 11 : 12) + 1;

  return (
    <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
      <Table size="small" sx={{ minWidth: isVisa ? 1500 : 1300, '& td, & th': { borderColor: 'rgba(0,0,0,0.06)', ...cell } }}>
        <TableHead>
          <TableRow sx={{ '& th': { fontWeight: 800, bgcolor: 'rgba(20,150,140,0.06)', fontSize: 12, whiteSpace: 'nowrap' } }}>
            {hasExpand && <TableCell sx={{ width: 30 }} />}
            <TableCell sx={{ width: 28 }}>#</TableCell>
            <TableCell sx={{ minWidth: 150 }}>Họ và tên</TableCell>
            {isVisa && <TableCell sx={{ minWidth: 140 }}>Họ tên (không dấu)</TableCell>}
            <TableCell sx={{ width: 70 }}>Giới tính</TableCell>
            <TableCell sx={{ width: 110 }}>Ngày sinh</TableCell>
            {isVisa ? (
              <>
                <TableCell sx={{ minWidth: 110 }}>Số hộ chiếu</TableCell>
                <TableCell sx={{ width: 120 }}>Ngày cấp</TableCell>
                <TableCell sx={{ width: 120 }}>Hết hạn</TableCell>
                <TableCell sx={{ width: 110 }}>Tình trạng HS</TableCell>
                <TableCell sx={{ width: 100 }}>Kết quả</TableCell>
              </>
            ) : (
              <TableCell sx={{ width: 100 }}>Quốc tịch</TableCell>
            )}
            <TableCell sx={{ minWidth: 120 }}>Công ty</TableCell>
            <TableCell sx={{ width: 110 }}>Điện thoại</TableCell>
            <TableCell sx={{ minWidth: 110 }}>Khởi hành</TableCell>
            <TableCell sx={{ width: 90 }}>Phòng</TableCell>
            <TableCell sx={{ width: 70 }}>Ghép</TableCell>
            <TableCell sx={{ minWidth: 120 }}>Chuyến bay khác</TableCell>
            {!isVisa && <TableCell sx={{ minWidth: 120 }}>Ăn kiêng/Dị ứng</TableCell>}
            {!isVisa && <TableCell sx={{ minWidth: 120 }}>Liên hệ khẩn</TableCell>}
            <TableCell sx={{ width: 36 }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((p, i) => {
            const isOpen = expanded.has(p.id);
            return (
              <Fragment key={p.id}>
                <TableRow hover>
                  {hasExpand && (
                    <TableCell>
                      <IconButton size="small" onClick={() => toggle(p.id)}>
                        {isOpen ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
                      </IconButton>
                    </TableCell>
                  )}
                  <TableCell><Typography variant="caption" fontWeight={700}>{i + 1}</Typography></TableCell>
                  <TableCell><Inp fullWidth value={p.name}
                    onChange={(e) => (isVisa ? updName(p, e.target.value) : upd(p.id, { name: e.target.value }))}
                    placeholder="Nguyễn Văn A" /></TableCell>
                  {isVisa && (
                    <TableCell><Inp fullWidth value={p.nameNoAccent ?? ''} placeholder="Khong dau"
                      onChange={(e) => upd(p.id, { nameNoAccent: e.target.value })} /></TableCell>
                  )}
                  <TableCell><Inp select fullWidth value={p.gender ?? ''} onChange={(e) => upd(p.id, { gender: e.target.value as Passenger['gender'] })}>
                    <MenuItem value="">—</MenuItem><MenuItem value="M">Nam</MenuItem><MenuItem value="F">Nữ</MenuItem></Inp></TableCell>
                  <TableCell><Inp fullWidth type={isVisa ? 'date' : 'text'} value={p.dob ?? ''}
                    onChange={(e) => upd(p.id, { dob: e.target.value })} placeholder={isVisa ? undefined : '01/01/1990'} /></TableCell>
                  {isVisa ? (
                    <>
                      <TableCell><Inp fullWidth value={p.idNo ?? ''} placeholder="Số HC"
                        onChange={(e) => upd(p.id, { idNo: e.target.value, idType: 'passport' })} /></TableCell>
                      <TableCell><Inp fullWidth type="date" value={p.passportIssue ?? ''}
                        onChange={(e) => upd(p.id, { passportIssue: e.target.value })} /></TableCell>
                      <TableCell><Inp fullWidth type="date" value={p.passportExpiry ?? ''}
                        onChange={(e) => upd(p.id, { passportExpiry: e.target.value })} /></TableCell>
                      <TableCell><Inp select fullWidth value={p.docStatus ?? 'missing'}
                        onChange={(e) => upd(p.id, { docStatus: e.target.value as Passenger['docStatus'] })}>
                        {(Object.keys(APPLICANT_DOC_META) as NonNullable<Passenger['docStatus']>[]).map((k) => (
                          <MenuItem key={k} value={k} sx={{ color: APPLICANT_DOC_META[k].color }}>{APPLICANT_DOC_META[k].label}</MenuItem>))}
                      </Inp></TableCell>
                      <TableCell><Inp select fullWidth value={p.result ?? 'pending'}
                        onChange={(e) => upd(p.id, { result: e.target.value as Passenger['result'] })}>
                        {(Object.keys(APPLICANT_RESULT_META) as NonNullable<Passenger['result']>[]).map((k) => (
                          <MenuItem key={k} value={k} sx={{ color: APPLICANT_RESULT_META[k].color }}>{APPLICANT_RESULT_META[k].label}</MenuItem>))}
                      </Inp></TableCell>
                    </>
                  ) : (
                    <TableCell><Inp fullWidth value={p.nationality ?? ''} placeholder="Việt Nam"
                      onChange={(e) => upd(p.id, { nationality: e.target.value })} /></TableCell>
                  )}
                  <TableCell><Inp fullWidth value={p.company ?? ''} placeholder="Công ty"
                    onChange={(e) => upd(p.id, { company: e.target.value })} /></TableCell>
                  <TableCell><Inp fullWidth value={p.phone ?? ''} onChange={(e) => upd(p.id, { phone: e.target.value })} /></TableCell>
                  <TableCell><Inp fullWidth value={p.departurePoint ?? ''} placeholder="Hà Nội…"
                    onChange={(e) => upd(p.id, { departurePoint: e.target.value })} /></TableCell>
                  <TableCell><Inp select fullWidth value={p.roomType ?? ''}
                    onChange={(e) => upd(p.id, { roomType: e.target.value as Passenger['roomType'] })}>
                    {ROOM_OPTIONS.map((r) => <MenuItem key={r.v} value={r.v}>{r.label}</MenuItem>)}</Inp></TableCell>
                  <TableCell><Inp fullWidth value={p.roomNo ?? ''} placeholder="P1"
                    onChange={(e) => upd(p.id, { roomNo: e.target.value })} /></TableCell>
                  <TableCell><Inp fullWidth value={p.otherFlight ?? ''} placeholder="VN123 25/11…"
                    onChange={(e) => upd(p.id, { otherFlight: e.target.value })} /></TableCell>
                  {!isVisa && <TableCell><Inp fullWidth value={p.dietary ?? ''} placeholder="Chay / dị ứng…"
                    onChange={(e) => upd(p.id, { dietary: e.target.value })} /></TableCell>}
                  {!isVisa && <TableCell><Inp fullWidth value={p.emergency ?? ''} placeholder="Tên + SĐT"
                    onChange={(e) => upd(p.id, { emergency: e.target.value })} /></TableCell>}
                  <TableCell><Tooltip title="Xoá khách"><IconButton size="small" color="error" onClick={() => del(p.id)}>
                    <DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip></TableCell>
                </TableRow>
                {hasExpand && (
                  <TableRow>
                    <TableCell colSpan={colCount} sx={{ py: 0, border: 0 }}>
                      <Collapse in={isOpen} unmountOnExit>
                        <Box sx={{ p: 2, bgcolor: 'rgba(20,150,140,0.04)', borderRadius: 1, my: 1 }}>
                          {renderExpanded!(p, (patch) => upd(p.id, patch))}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </Paper>
  );
}
