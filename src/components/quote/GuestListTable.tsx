import { Fragment, useState, type ReactNode } from 'react';
import {
  Box, Chip, Collapse, IconButton, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import ViewColumnOutlinedIcon from '@mui/icons-material/ViewColumnOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  VISA_APPLICANT_STATUS_META, VISA_APPLICANT_STATUS_ORDER, deriveVisaStatus, legacyFromVisaStatus,
} from '../visa/constants';
import { ROOM_KEYS, ROOM_LABELS, summarizeGuests } from './guestStats';
import { ColumnChooserDialog } from '@/components/common/ColumnChooserDialog';
import { reconcileColumns } from '@/lib/tableColumnPrefs';
import { useTableColPrefStore } from '@/stores/tableColPrefStore';
import { useAuthStore } from '@/stores/authStore';
import type { Passenger, VisaApplicantStatus } from '@/types';

/** Tình trạng visa hiển thị của khách (suy từ dữ liệu cũ nếu chưa đặt). */
const visaStatusOf = (p: Passenger): VisaApplicantStatus => deriveVisaStatus(p);
/** Đổi tình trạng visa → đồng bộ ngược docStatus/result cho các chỗ cũ. */
const patchVisaStatus = (s: VisaApplicantStatus): Partial<Passenger> => ({ visaStatus: s, ...legacyFromVisaStatus(s) });

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

/** Ngữ cảnh render 1 ô (helper cập nhật hàng). */
type CellCtx = {
  isVisa: boolean;
  upd: (id: string, patch: Partial<Passenger>) => void;
  updName: (p: Passenger, name: string) => void;
};

/** Cấu hình 1 cột — config-driven để ẩn/hiện + sắp xếp theo user. */
type GuestCol = {
  key: string;
  label: string;
  visaOnly?: boolean;
  tourOnly?: boolean;
  sx?: Record<string, unknown>;
  render: (p: Passenger, i: number, ctx: CellCtx) => ReactNode;
};

const GUEST_COLS: GuestCol[] = [
  {
    key: 'stt', label: '#', sx: { width: 28 },
    render: (_p, i) => <Typography variant="caption" fontWeight={700}>{i + 1}</Typography>,
  },
  {
    key: 'name', label: 'Họ và tên', sx: { minWidth: 150 },
    render: (p, _i, { isVisa, upd, updName }) => (
      <Inp fullWidth value={p.name}
        onChange={(e) => (isVisa ? updName(p, e.target.value) : upd(p.id, { name: e.target.value }))}
        placeholder="Nguyễn Văn A" />
    ),
  },
  {
    key: 'nameNoAccent', label: 'Họ tên (không dấu)', visaOnly: true, sx: { minWidth: 140 },
    render: (p, _i, { upd }) => (
      <Inp fullWidth value={p.nameNoAccent ?? ''} placeholder="Khong dau"
        onChange={(e) => upd(p.id, { nameNoAccent: e.target.value })} />
    ),
  },
  {
    key: 'gender', label: 'Giới tính', sx: { width: 70 },
    render: (p, _i, { upd }) => (
      <Inp select fullWidth value={p.gender ?? ''} onChange={(e) => upd(p.id, { gender: e.target.value as Passenger['gender'] })}>
        <MenuItem value="">—</MenuItem><MenuItem value="M">Nam</MenuItem><MenuItem value="F">Nữ</MenuItem></Inp>
    ),
  },
  {
    key: 'dob', label: 'Ngày sinh', sx: { width: 110 },
    render: (p, _i, { isVisa, upd }) => (
      <Inp fullWidth type={isVisa ? 'date' : 'text'} value={p.dob ?? ''}
        onChange={(e) => upd(p.id, { dob: e.target.value })} placeholder={isVisa ? undefined : '01/01/1990'} />
    ),
  },
  {
    key: 'idNo', label: 'Số hộ chiếu', visaOnly: true, sx: { minWidth: 110 },
    render: (p, _i, { upd }) => (
      <Inp fullWidth value={p.idNo ?? ''} placeholder="Số HC"
        onChange={(e) => upd(p.id, { idNo: e.target.value, idType: 'passport' })} />
    ),
  },
  {
    key: 'passportIssue', label: 'Ngày cấp', visaOnly: true, sx: { width: 120 },
    render: (p, _i, { upd }) => (
      <Inp fullWidth type="date" value={p.passportIssue ?? ''}
        onChange={(e) => upd(p.id, { passportIssue: e.target.value })} />
    ),
  },
  {
    key: 'passportExpiry', label: 'Hết hạn', visaOnly: true, sx: { width: 120 },
    render: (p, _i, { upd }) => (
      <Inp fullWidth type="date" value={p.passportExpiry ?? ''}
        onChange={(e) => upd(p.id, { passportExpiry: e.target.value })} />
    ),
  },
  {
    key: 'visaStatus', label: 'Tình trạng visa', visaOnly: true, sx: { width: 150 },
    render: (p, _i, { upd }) => (
      <Inp select fullWidth value={visaStatusOf(p)}
        onChange={(e) => upd(p.id, patchVisaStatus(e.target.value as VisaApplicantStatus))}
        sx={{ '& .MuiInputBase-input': { color: VISA_APPLICANT_STATUS_META[visaStatusOf(p)].color, fontWeight: 700 } }}>
        {VISA_APPLICANT_STATUS_ORDER.map((k) => (
          <MenuItem key={k} value={k} sx={{ color: VISA_APPLICANT_STATUS_META[k].color }}>{VISA_APPLICANT_STATUS_META[k].label}</MenuItem>))}
      </Inp>
    ),
  },
  {
    key: 'nationality', label: 'Quốc tịch', tourOnly: true, sx: { width: 100 },
    render: (p, _i, { upd }) => (
      <Inp fullWidth value={p.nationality ?? ''} placeholder="Việt Nam"
        onChange={(e) => upd(p.id, { nationality: e.target.value })} />
    ),
  },
  {
    key: 'company', label: 'Công ty', sx: { minWidth: 120 },
    render: (p, _i, { upd }) => (
      <Inp fullWidth value={p.company ?? ''} placeholder="Công ty"
        onChange={(e) => upd(p.id, { company: e.target.value })} />
    ),
  },
  {
    key: 'phone', label: 'Điện thoại', sx: { width: 110 },
    render: (p, _i, { upd }) => (
      <Inp fullWidth value={p.phone ?? ''} onChange={(e) => upd(p.id, { phone: e.target.value })} />
    ),
  },
  {
    key: 'departurePoint', label: 'Khởi hành', sx: { minWidth: 110 },
    render: (p, _i, { upd }) => (
      <Inp fullWidth value={p.departurePoint ?? ''} placeholder="Hà Nội…"
        onChange={(e) => upd(p.id, { departurePoint: e.target.value })} />
    ),
  },
  {
    key: 'roomType', label: 'Phòng', sx: { width: 90 },
    render: (p, _i, { upd }) => (
      <Inp select fullWidth value={p.roomType ?? ''}
        onChange={(e) => upd(p.id, { roomType: e.target.value as Passenger['roomType'] })}>
        {ROOM_OPTIONS.map((r) => <MenuItem key={r.v} value={r.v}>{r.label}</MenuItem>)}</Inp>
    ),
  },
  {
    key: 'roomNo', label: 'Ghép', sx: { width: 70 },
    render: (p, _i, { upd }) => (
      <Inp fullWidth value={p.roomNo ?? ''} placeholder="P1"
        onChange={(e) => upd(p.id, { roomNo: e.target.value })} />
    ),
  },
  {
    key: 'otherFlight', label: 'Chuyến bay khác', sx: { minWidth: 120 },
    render: (p, _i, { upd }) => (
      <Inp fullWidth value={p.otherFlight ?? ''} placeholder="VN123 25/11…"
        onChange={(e) => upd(p.id, { otherFlight: e.target.value })} />
    ),
  },
  {
    key: 'dietary', label: 'Ăn kiêng/Dị ứng', tourOnly: true, sx: { minWidth: 120 },
    render: (p, _i, { upd }) => (
      <Inp fullWidth value={p.dietary ?? ''} placeholder="Chay / dị ứng…"
        onChange={(e) => upd(p.id, { dietary: e.target.value })} />
    ),
  },
  {
    key: 'emergency', label: 'Liên hệ khẩn', tourOnly: true, sx: { minWidth: 120 },
    render: (p, _i, { upd }) => (
      <Inp fullWidth value={p.emergency ?? ''} placeholder="Tên + SĐT"
        onChange={(e) => upd(p.id, { emergency: e.target.value })} />
    ),
  },
];

/** Cột khoá đầu bảng — luôn hiển thị, không đổi chỗ. */
const GUEST_LOCKED_START = ['stt', 'name'];

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
  const [colChooserOpen, setColChooserOpen] = useState(false);
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
  const ctx: CellCtx = { isVisa, upd, updName };

  // Ẩn/hiện + sắp cột theo user (nút cột ở góc phải header) — lưu riêng theo mode.
  const username = useAuthStore((s) => s.currentUser?.u);
  const colTableId = isVisa ? 'guestlist_visa' : 'guestlist_tour';
  const colPref = useTableColPrefStore((s) => s.prefs[colTableId]);
  const modeCols = GUEST_COLS.filter((c) => (isVisa ? !c.tourOnly : !c.visaOnly));
  const colByKey = new Map(modeCols.map((c) => [c.key, c]));
  const { order: colOrder, hidden: colHidden } = reconcileColumns(
    modeCols.map((c) => c.key), colPref, { start: GUEST_LOCKED_START },
  );
  const visibleCols = colOrder.filter((k) => !colHidden.has(k)).map((k) => colByKey.get(k)!).filter(Boolean);

  const colCount = (hasExpand ? 1 : 0) + visibleCols.length + 1;

  return (
    <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
      <Table size="small" sx={{ minWidth: Math.max(700, visibleCols.length * 95), '& td, & th': { borderColor: 'rgba(0,0,0,0.06)', ...cell } }}>
        <TableHead>
          <TableRow sx={{ '& th': { fontWeight: 800, bgcolor: 'rgba(20,150,140,0.06)', fontSize: 12, whiteSpace: 'nowrap' } }}>
            {hasExpand && <TableCell sx={{ width: 30 }} />}
            {visibleCols.map((c) => <TableCell key={c.key} sx={c.sx}>{c.label}</TableCell>)}
            <TableCell sx={{ width: 36, textAlign: 'right' }}>
              <Tooltip title="Cột hiển thị (ẩn/hiện, đổi thứ tự — lưu cho riêng bạn)">
                <IconButton size="small" onClick={() => setColChooserOpen(true)}>
                  <ViewColumnOutlinedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </TableCell>
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
                  {visibleCols.map((c) => <TableCell key={c.key}>{c.render(p, i, ctx)}</TableCell>)}
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
      {colChooserOpen && (
        <ColumnChooserDialog
          open
          onClose={() => setColChooserOpen(false)}
          title="Cột hiển thị — Danh sách khách"
          columns={colOrder
            .filter((k) => !GUEST_LOCKED_START.includes(k))
            .map((k) => ({ key: k, label: colByKey.get(k)?.label ?? k }))}
          lockedLabels={['#', 'Họ và tên']}
          hidden={colHidden}
          onChange={(pref) => useTableColPrefStore.getState().save(username, colTableId, pref)}
          onReset={() => useTableColPrefStore.getState().reset(username, colTableId)}
        />
      )}
    </Paper>
  );
}
