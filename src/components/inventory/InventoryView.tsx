import { useMemo, useState } from 'react';
import {
  Box, Paper, Stack, Typography, Button, IconButton, Chip, Tooltip, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  Table, TableHead, TableBody, TableRow, TableCell, Collapse, Tabs, Tab,
  Autocomplete, InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import InputOutlinedIcon from '@mui/icons-material/InputOutlined';
import OutputOutlinedIcon from '@mui/icons-material/OutputOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { useInventoryStore, computeStock, itemOnHand, colorToCode } from '@/stores/inventoryStore';
import { fmtVND } from '@/components/quote/calc';
import type { InventoryItem, InventoryCategory, StockRow, ReceiveLine } from '@/types/inventory';

const TEAL = '#0d7a6a';

export function InventoryView() {
  const me = useAuthStore((s) => s.currentUser);
  const canManage = hasPerm(me, 'manageInventory');
  const categories = useInventoryStore((s) => s.categories);
  const items = useInventoryStore((s) => s.items);
  const lots = useInventoryStore((s) => s.lots);
  const movements = useInventoryStore((s) => s.movements);
  const loading = useInventoryStore((s) => s.loading);

  const [tab, setTab] = useState(0);
  const [catOpen, setCatOpen] = useState(false);
  const [itemDlg, setItemDlg] = useState<InventoryItem | 'new' | null>(null);
  const [receiveFor, setReceiveFor] = useState<InventoryItem | null>(null);
  const [issueFor, setIssueFor] = useState<InventoryItem | null>(null);

  const stock = useMemo(() => computeStock(lots), [lots]);
  const totalValue = useMemo(() => stock.reduce((a, s) => a + s.value, 0), [stock]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  if (!canManage) {
    return <Box sx={{ p: 4 }}><Typography>Bạn không có quyền truy cập Quản lý kho.</Typography></Box>;
  }

  const consumableCats = categories.filter((c) => c.kind === 'consumable');

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
        <Inventory2OutlinedIcon sx={{ color: TEAL }} />
        <Typography fontWeight={900} fontSize={20}>Quản lý kho</Typography>
        <Box sx={{ flex: 1 }} />
        <Chip label={`${items.length} sản phẩm`} sx={{ fontWeight: 700 }} />
        <Chip label={`Giá trị tồn: ${fmtVND(totalValue)}`} sx={{ fontWeight: 700, bgcolor: TEAL + '18', color: TEAL }} />
        <Button size="small" variant="outlined" startIcon={<CategoryOutlinedIcon />} onClick={() => setCatOpen(true)}>Loại SP</Button>
        <Button size="small" variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: TEAL }}
          disabled={consumableCats.length === 0} onClick={() => setItemDlg('new')}>Sản phẩm</Button>
      </Stack>
      {consumableCats.length === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Hãy tạo một <b>Loại sản phẩm</b> trước (vd Áo đồng phục — mã AO) rồi mới thêm sản phẩm.
        </Typography>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1.5, minHeight: 38 }}>
        <Tab label="Tồn kho" sx={{ minHeight: 38 }} />
        <Tab label="Lịch sử nhập/xuất" sx={{ minHeight: 38 }} />
      </Tabs>

      {tab === 0 && (
        loading ? <Typography color="text.secondary">Đang tải…</Typography> :
        items.length === 0 ? <Typography color="text.secondary">Chưa có sản phẩm nào.</Typography> :
        <Stack spacing={1}>
          {items.map((it) => (
            <ItemCard key={it.id} item={it} category={catById.get(it.categoryId)} stock={stock}
              onReceive={() => setReceiveFor(it)} onIssue={() => setIssueFor(it)} onEdit={() => setItemDlg(it)} />
          ))}
        </Stack>
      )}

      {tab === 1 && <MovementsTab />}

      {catOpen && <CategoryManager onClose={() => setCatOpen(false)} />}
      {itemDlg && <ItemDialog item={itemDlg === 'new' ? null : itemDlg} categories={consumableCats} onClose={() => setItemDlg(null)} />}
      {receiveFor && <ReceiveLotDialog item={receiveFor} onClose={() => setReceiveFor(null)} />}
      {issueFor && <IssueDialog item={issueFor} stock={stock} onClose={() => setIssueFor(null)} />}

      <Typography variant="caption" color="text.disabled" sx={{ mt: 2, display: 'block' }}>
        Tồn tính theo lô (FIFO) — xuất trừ lô nhập trước. Mã sản phẩm sinh tự động theo loại.
      </Typography>
      {movements.length >= 1000 && tab === 1 && (
        <Typography variant="caption" color="text.disabled">Chỉ hiển thị 1000 dòng gần nhất.</Typography>
      )}
    </Box>
  );
}

// ── Thẻ một sản phẩm + bảng tồn theo màu/size ──────────────────────────────────
function ItemCard({ item, category, stock, onReceive, onIssue, onEdit }: {
  item: InventoryItem; category?: InventoryCategory; stock: StockRow[];
  onReceive: () => void; onIssue: () => void; onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const remove = useInventoryStore((s) => s.deleteItem);
  const rows = stock.filter((s) => s.itemId === item.id).sort((a, b) => a.color.localeCompare(b.color) || a.size.localeCompare(b.size));
  const onHand = itemOnHand(item.id, stock);
  const low = item.minStock > 0 && onHand < item.minStock;

  return (
    <Paper variant="outlined" sx={{ p: 1.25, borderLeft: low ? '4px solid #dc3250' : `4px solid ${TEAL}` }}>
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
        <IconButton size="small" onClick={() => setOpen((v) => !v)}>{open ? <ExpandMoreIcon /> : <ChevronRightIcon />}</IconButton>
        <Box sx={{ minWidth: 0 }}>
          <Typography fontWeight={800} fontSize={14} noWrap>
            {item.name} <Typography component="span" variant="caption" color="text.secondary">· {item.code}</Typography>
          </Typography>
          <Typography variant="caption" color="text.secondary">{category?.name ?? '—'} · ĐVT: {item.unit}</Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Chip size="small" label={`Tồn: ${onHand} ${item.unit}`} sx={{ fontWeight: 800, bgcolor: low ? '#dc325022' : TEAL + '18', color: low ? '#dc3250' : TEAL }} />
        {low && <Chip size="small" label={`⚠ < ${item.minStock}`} sx={{ fontWeight: 700, bgcolor: '#dc3250', color: '#fff' }} />}
        <Tooltip title="Nhập lô"><IconButton size="small" sx={{ color: TEAL }} onClick={onReceive}><InputOutlinedIcon fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="Xuất kho"><IconButton size="small" sx={{ color: '#dc3250' }} onClick={onIssue}><OutputOutlinedIcon fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="Sửa sản phẩm"><IconButton size="small" onClick={onEdit}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="Xoá sản phẩm">
          <IconButton size="small" onClick={() => { if (window.confirm(`Xoá sản phẩm "${item.name}"? Toàn bộ lô & lịch sử của nó sẽ mất.`)) void remove(item.id); }}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Collapse in={open}>
        <Divider sx={{ my: 1 }} />
        {rows.length === 0 ? <Typography variant="caption" color="text.disabled">Chưa có tồn — bấm Nhập lô để thêm hàng.</Typography> : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Màu</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Size</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Tồn</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Giá trị (FIFO)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.color}|${r.size}`}>
                  <TableCell>{r.color || '—'}</TableCell>
                  <TableCell>{r.size || '—'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{r.onHand}</TableCell>
                  <TableCell align="right">{fmtVND(r.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {item.note && <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>📝 {item.note}</Typography>}
      </Collapse>
    </Paper>
  );
}

// ── Quản lý loại sản phẩm ──────────────────────────────────────────────────────
function CategoryManager({ onClose }: { onClose: () => void }) {
  const categories = useInventoryStore((s) => s.categories);
  const items = useInventoryStore((s) => s.items);
  const save = useInventoryStore((s) => s.saveCategory);
  const remove = useInventoryStore((s) => s.deleteCategory);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const add = () => {
    if (!name.trim() || !code.trim()) { window.alert('Nhập tên loại và tiền tố mã.'); return; }
    if (categories.some((c) => c.code.toUpperCase() === code.trim().toUpperCase())) { window.alert('Tiền tố mã đã tồn tại.'); return; }
    void save({ name, code, kind: 'consumable' });
    setName(''); setCode('');
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Loại sản phẩm</DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary">Tiền tố mã (vd AO, TK, TB) dùng để sinh mã sản phẩm tự động: AO-001, AO-002…</Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 2 }}>
          <TextField size="small" label="Tên loại" value={name} onChange={(e) => setName(e.target.value)} sx={{ flex: 1 }} />
          <TextField size="small" label="Tiền tố mã" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} sx={{ width: 120 }} inputProps={{ maxLength: 4 }} />
          <Button variant="contained" sx={{ bgcolor: TEAL }} onClick={add}>Thêm</Button>
        </Stack>
        <Stack spacing={0.75}>
          {categories.length === 0 && <Typography variant="caption" color="text.disabled">Chưa có loại nào.</Typography>}
          {categories.map((c) => {
            const used = items.filter((it) => it.categoryId === c.id).length;
            return (
              <Paper key={c.id} variant="outlined" sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip size="small" label={c.code} sx={{ fontWeight: 800, bgcolor: TEAL + '18', color: TEAL }} />
                <Typography fontSize={14} sx={{ flex: 1 }}>{c.name}</Typography>
                <Typography variant="caption" color="text.secondary">{used} SP · STT mã: {c.seq}</Typography>
                <IconButton size="small" disabled={used > 0}
                  onClick={() => { if (window.confirm(`Xoá loại "${c.name}"?`)) void remove(c.id); }}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Paper>
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Đóng</Button></DialogActions>
    </Dialog>
  );
}

// ── Thêm / sửa sản phẩm ────────────────────────────────────────────────────────
function ItemDialog({ item, categories, onClose }: { item: InventoryItem | null; categories: InventoryCategory[]; onClose: () => void }) {
  const save = useInventoryStore((s) => s.saveItem);
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? categories[0]?.id ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [unit, setUnit] = useState(item?.unit ?? 'cái');
  const [sizesText, setSizesText] = useState((item?.sizes ?? []).join(', '));
  const [minStock, setMinStock] = useState(String(item?.minStock ?? 0));
  const [note, setNote] = useState(item?.note ?? '');

  const submit = () => {
    if (!name.trim()) { window.alert('Nhập tên sản phẩm.'); return; }
    if (!categoryId) { window.alert('Chọn loại sản phẩm.'); return; }
    const sizes = sizesText.split(',').map((s) => s.trim()).filter(Boolean);
    void save({ id: item?.id, categoryId, name, unit, sizes, minStock: Number(minStock) || 0, note });
    onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{item ? `Sửa sản phẩm · ${item.code}` : 'Thêm sản phẩm'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField select size="small" label="Loại sản phẩm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={!!item}>
            {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.code} · {c.name}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Tên sản phẩm" value={name} onChange={(e) => setName(e.target.value)} />
          <Stack direction="row" spacing={1}>
            <TextField size="small" label="Đơn vị tính" value={unit} onChange={(e) => setUnit(e.target.value)} sx={{ flex: 1 }} />
            <TextField size="small" label="Tồn tối thiểu" type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} sx={{ width: 140 }} />
          </Stack>
          <TextField size="small" label="Danh sách size (cách nhau dấu phẩy)" placeholder="S, M, L, XL" value={sizesText}
            onChange={(e) => setSizesText(e.target.value)} helperText="Để trống nếu sản phẩm không phân size (vd thiết bị, kit trọn gói)." />
          <TextField size="small" label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="contained" sx={{ bgcolor: TEAL }} onClick={submit}>Lưu</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Nhập lô (theo màu, nhiều size) ─────────────────────────────────────────────
function ReceiveLotDialog({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const receiveLot = useInventoryStore((s) => s.receiveLot);
  const lots = useInventoryStore((s) => s.lots);
  const knownColors = useMemo(() => Array.from(new Set(lots.filter((l) => l.itemId === item.id).map((l) => l.color))).filter(Boolean), [lots, item.id]);
  const sizeList = item.sizes.length ? item.sizes : [''];
  const [color, setColor] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [supplier, setSupplier] = useState('');
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [qtys, setQtys] = useState<Record<string, string>>({});

  const total = sizeList.reduce((a, s) => a + (Number(qtys[s]) || 0), 0);
  const submit = () => {
    if (item.sizes.length && !color.trim()) { window.alert('Nhập màu của lô.'); return; }
    const lines: ReceiveLine[] = sizeList.map((s) => ({ size: s, qty: Number(qtys[s]) || 0 })).filter((l) => l.qty > 0);
    if (lines.length === 0) { window.alert('Nhập số lượng cho ít nhất một size.'); return; }
    void receiveLot({ itemId: item.id, color, unitCost: Number(unitCost) || 0, supplier, receivedAt, note, lines });
    onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Nhập lô · {item.name} <Typography component="span" variant="caption" color="text.secondary">({item.code})</Typography></DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Stack direction="row" spacing={1}>
            <Autocomplete freeSolo options={knownColors} value={color} onInputChange={(_, v) => setColor(v)} sx={{ flex: 1 }}
              renderInput={(p) => <TextField {...p} size="small" label="Màu" placeholder="vd Đỏ" />} />
            <TextField size="small" label="Mã màu" value={colorToCode(color)} sx={{ width: 110 }} InputProps={{ readOnly: true }} helperText="tự sinh" />
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField size="small" label="Đơn giá nhập / cái" type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)}
              sx={{ flex: 1 }} InputProps={{ endAdornment: <InputAdornment position="end">đ</InputAdornment> }} />
            <TextField size="small" label="Ngày nhập" type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} sx={{ width: 170 }} InputLabelProps={{ shrink: true }} />
          </Stack>
          <TextField size="small" label="Nhà cung cấp" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          <Box>
            <Typography variant="caption" color="text.secondary">Số lượng theo size</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1, mt: 0.5 }}>
              {sizeList.map((s) => (
                <TextField key={s} size="small" label={s || 'SL'} type="number" value={qtys[s] ?? ''}
                  onChange={(e) => setQtys((q) => ({ ...q, [s]: e.target.value }))} />
              ))}
            </Box>
          </Box>
          <TextField size="small" label="Ghi chú lô" value={note} onChange={(e) => setNote(e.target.value)} />
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            Tổng nhập: {total} {item.unit} · Giá trị: {fmtVND(total * (Number(unitCost) || 0))}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="contained" sx={{ bgcolor: TEAL }} onClick={submit}>Nhập kho</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Xuất kho (FIFO) ────────────────────────────────────────────────────────────
function IssueDialog({ item, stock, onClose }: { item: InventoryItem; stock: StockRow[]; onClose: () => void }) {
  const issue = useInventoryStore((s) => s.issue);
  const rows = useMemo(() => stock.filter((s) => s.itemId === item.id && s.onHand > 0), [stock, item.id]);
  const colors = useMemo(() => Array.from(new Set(rows.map((r) => r.color))), [rows]);
  const [color, setColor] = useState(colors[0] ?? '');
  const sizesForColor = rows.filter((r) => r.color === color);
  const [size, setSize] = useState(sizesForColor[0]?.size ?? '');
  const avail = rows.find((r) => r.color === color && r.size === size)?.onHand ?? 0;
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [ref, setRef] = useState('');
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));

  const submit = async () => {
    const n = Number(qty) || 0;
    if (n <= 0) { window.alert('Nhập số lượng xuất.'); return; }
    if (n > avail) { window.alert(`Vượt tồn (còn ${avail}).`); return; }
    if (!reason.trim()) { window.alert('Nhập lý do xuất.'); return; }
    try {
      await issue({ itemId: item.id, color, size, qty: n, reason, ref, occurredAt });
      onClose();
    } catch { /* lỗi đã báo trong store */ }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Xuất kho · {item.name} <Typography component="span" variant="caption" color="text.secondary">({item.code})</Typography></DialogTitle>
      <DialogContent>
        {rows.length === 0 ? <Typography color="text.secondary" sx={{ mt: 1 }}>Sản phẩm chưa có tồn để xuất.</Typography> : (
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Stack direction="row" spacing={1}>
              <TextField select size="small" label="Màu" value={color} sx={{ flex: 1 }}
                onChange={(e) => { setColor(e.target.value); const first = rows.find((r) => r.color === e.target.value); setSize(first?.size ?? ''); }}>
                {colors.map((c) => <MenuItem key={c} value={c}>{c || '—'}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="Size" value={size} onChange={(e) => setSize(e.target.value)} sx={{ flex: 1 }}>
                {sizesForColor.map((r) => <MenuItem key={r.size} value={r.size}>{(r.size || '—')} (tồn {r.onHand})</MenuItem>)}
              </TextField>
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField size="small" label={`Số lượng (tồn ${avail})`} type="number" value={qty} onChange={(e) => setQty(e.target.value)} sx={{ flex: 1 }} inputProps={{ max: avail, min: 1 }} />
              <TextField size="small" label="Ngày xuất" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} sx={{ width: 170 }} InputLabelProps={{ shrink: true }} />
            </Stack>
            <TextField size="small" label="Lý do xuất" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="vd Cấp đồng phục tour NĐ.25.06.25.01" />
            <TextField size="small" label="Tham chiếu (tour / người nhận)" value={ref} onChange={(e) => setRef(e.target.value)} />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="contained" color="error" disabled={rows.length === 0} onClick={() => void submit()}>Xuất kho</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Lịch sử nhập/xuất ──────────────────────────────────────────────────────────
function MovementsTab() {
  const movements = useInventoryStore((s) => s.movements);
  const items = useInventoryStore((s) => s.items);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [filter, setFilter] = useState('');
  const list = movements.filter((m) => {
    if (!filter) return true;
    const it = itemById.get(m.itemId);
    const hay = `${it?.name ?? ''} ${it?.code ?? ''} ${m.color} ${m.size} ${m.reason} ${m.ref}`.toLowerCase();
    return hay.includes(filter.toLowerCase());
  });
  const label = (t: string) => t === 'in' ? 'Nhập' : t === 'out' ? 'Xuất' : 'Điều chỉnh';
  const color = (t: string) => t === 'in' ? TEAL : t === 'out' ? '#dc3250' : '#f5a623';

  return (
    <Box>
      <TextField size="small" fullWidth placeholder="Tìm theo sản phẩm, màu, lý do…" value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ mb: 1 }} />
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Thời gian</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Loại</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Sản phẩm</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Màu / Size</TableCell>
            <TableCell sx={{ fontWeight: 700 }} align="right">SL</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Lý do / Tham chiếu</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Người</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {list.map((m) => {
            const it = itemById.get(m.itemId);
            return (
              <TableRow key={m.id}>
                <TableCell>{new Date(m.occurredAt).toLocaleDateString('vi-VN')}</TableCell>
                <TableCell><Chip size="small" label={label(m.type)} sx={{ bgcolor: color(m.type) + '22', color: color(m.type), fontWeight: 700 }} /></TableCell>
                <TableCell>{it?.name ?? '—'} <Typography component="span" variant="caption" color="text.secondary">{it?.code}</Typography></TableCell>
                <TableCell>{(m.color || '—')} / {(m.size || '—')}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: color(m.type) }}>{m.type === 'out' ? '−' : '+'}{m.qty}</TableCell>
                <TableCell><Typography variant="caption">{m.reason}{m.ref ? ` · ${m.ref}` : ''}</Typography></TableCell>
                <TableCell><Typography variant="caption">{m.createdBy}</Typography></TableCell>
              </TableRow>
            );
          })}
          {list.length === 0 && <TableRow><TableCell colSpan={7}><Typography variant="caption" color="text.disabled">Chưa có giao dịch.</Typography></TableCell></TableRow>}
        </TableBody>
      </Table>
    </Box>
  );
}
