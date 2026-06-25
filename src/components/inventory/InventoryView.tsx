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
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { useInventoryStore, computeStock, itemOnHand, colorToCode, ASSET_STATUS } from '@/stores/inventoryStore';
import { useTourProfileStore } from '@/stores/tourProfileStore';
import { fmtVND } from '@/components/quote/calc';
import type { InventoryItem, InventoryCategory, StockRow, ReceiveLine, InventoryAsset, InventoryMovement, AssetStatus, AssetAction } from '@/types/inventory';

const TEAL = '#0d7a6a';

export function InventoryView() {
  const me = useAuthStore((s) => s.currentUser);
  const canManage = hasPerm(me, 'manageInventory');
  const categories = useInventoryStore((s) => s.categories);
  const items = useInventoryStore((s) => s.items);
  const lots = useInventoryStore((s) => s.lots);
  const movements = useInventoryStore((s) => s.movements);
  const assets = useInventoryStore((s) => s.assets);
  const loading = useInventoryStore((s) => s.loading);

  const [tab, setTab] = useState(0);
  const [catOpen, setCatOpen] = useState(false);
  const [itemDlg, setItemDlg] = useState<InventoryItem | 'new' | null>(null);
  const [modelDlg, setModelDlg] = useState<InventoryItem | 'new' | null>(null);
  const [receiveFor, setReceiveFor] = useState<InventoryItem | null>(null);
  const [issueFor, setIssueFor] = useState<InventoryItem | null>(null);

  const stock = useMemo(() => computeStock(lots), [lots]);
  const totalValue = useMemo(() => stock.reduce((a, s) => a + s.value, 0), [stock]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const isAssetItem = (it: InventoryItem) => catById.get(it.categoryId)?.kind === 'asset';
  const consumableItems = useMemo(() => items.filter((it) => !isAssetItem(it)), [items, catById]); // eslint-disable-line react-hooks/exhaustive-deps
  const assetItems = useMemo(() => items.filter((it) => isAssetItem(it)), [items, catById]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!canManage) {
    return <Box sx={{ p: 4 }}><Typography>Bạn không có quyền truy cập Quản lý kho.</Typography></Box>;
  }

  const consumableCats = categories.filter((c) => c.kind === 'consumable');
  const assetCats = categories.filter((c) => c.kind === 'asset');

  const doExport = async () => {
    const { exportInventoryExcel } = await import('@/lib/exports/exportInventoryExcel');
    await exportInventoryExcel({ categories, items, stock, assets, movements });
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
        <Inventory2OutlinedIcon sx={{ color: TEAL }} />
        <Typography fontWeight={900} fontSize={20}>Quản lý kho</Typography>
        <Box sx={{ flex: 1 }} />
        <Chip label={`Giá trị tồn: ${fmtVND(totalValue)}`} sx={{ fontWeight: 700, bgcolor: TEAL + '18', color: TEAL }} />
        <Button size="small" variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={() => void doExport()}>Excel</Button>
        <Button size="small" variant="outlined" startIcon={<CategoryOutlinedIcon />} onClick={() => setCatOpen(true)}>Loại SP</Button>
        {tab === 0 && (
          <Button size="small" variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: TEAL }}
            disabled={consumableCats.length === 0} onClick={() => setItemDlg('new')}>Sản phẩm</Button>
        )}
        {tab === 1 && (
          <Button size="small" variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: TEAL }}
            disabled={assetCats.length === 0} onClick={() => setModelDlg('new')}>Loại thiết bị</Button>
        )}
      </Stack>
      {tab === 0 && consumableCats.length === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Hãy tạo một <b>Loại sản phẩm</b> (kiểu Hàng tiêu hao, vd Áo đồng phục — mã AO) rồi mới thêm sản phẩm.
        </Typography>
      )}
      {tab === 1 && assetCats.length === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Hãy tạo một <b>Loại sản phẩm</b> kiểu <b>Tài sản</b> (vd Thiết bị — mã TB) rồi thêm model thiết bị.
        </Typography>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1.5, minHeight: 38 }}>
        <Tab label={`Tồn kho (${consumableItems.length})`} sx={{ minHeight: 38 }} />
        <Tab label={`Thiết bị / Tài sản (${assetItems.length})`} sx={{ minHeight: 38 }} />
        <Tab label="Lịch sử nhập/xuất" sx={{ minHeight: 38 }} />
        <Tab label="📊 Tổng quan" sx={{ minHeight: 38 }} />
      </Tabs>

      {tab === 0 && (
        loading ? <Typography color="text.secondary">Đang tải…</Typography> :
        consumableItems.length === 0 ? <Typography color="text.secondary">Chưa có sản phẩm nào.</Typography> :
        <Stack spacing={1}>
          {consumableItems.map((it) => (
            <ItemCard key={it.id} item={it} category={catById.get(it.categoryId)} stock={stock}
              onReceive={() => setReceiveFor(it)} onIssue={() => setIssueFor(it)} onEdit={() => setItemDlg(it)} />
          ))}
        </Stack>
      )}

      {tab === 1 && (
        loading ? <Typography color="text.secondary">Đang tải…</Typography> :
        assetItems.length === 0 ? <Typography color="text.secondary">Chưa có model thiết bị nào.</Typography> :
        <Stack spacing={1}>
          {assetItems.map((it) => (
            <AssetModelCard key={it.id} model={it} category={catById.get(it.categoryId)} onEditModel={() => setModelDlg(it)} />
          ))}
        </Stack>
      )}

      {tab === 2 && <MovementsTab />}

      {tab === 3 && (
        <InventoryDashboard categories={categories} items={items} stock={stock}
          assets={assets} movements={movements} totalValue={totalValue} catById={catById} isAssetItem={isAssetItem} />
      )}

      {catOpen && <CategoryManager onClose={() => setCatOpen(false)} />}
      {itemDlg && <ItemDialog item={itemDlg === 'new' ? null : itemDlg} categories={consumableCats} asset={false} onClose={() => setItemDlg(null)} />}
      {modelDlg && <ItemDialog item={modelDlg === 'new' ? null : modelDlg} categories={assetCats} asset onClose={() => setModelDlg(null)} />}
      {receiveFor && <ReceiveLotDialog item={receiveFor} onClose={() => setReceiveFor(null)} />}
      {issueFor && <IssueDialog item={issueFor} stock={stock} onClose={() => setIssueFor(null)} />}

      <Typography variant="caption" color="text.disabled" sx={{ mt: 2, display: 'block' }}>
        Hàng tiêu hao tính tồn theo lô (FIFO). Thiết bị quản lý theo từng cái có mã riêng. Mã sinh tự động theo loại.
      </Typography>
      {movements.length >= 1000 && tab === 2 && (
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
  const [kind, setKind] = useState<'consumable' | 'asset'>('consumable');

  const add = () => {
    if (!name.trim() || !code.trim()) { window.alert('Nhập tên loại và tiền tố mã.'); return; }
    if (categories.some((c) => c.code.toUpperCase() === code.trim().toUpperCase())) { window.alert('Tiền tố mã đã tồn tại.'); return; }
    void save({ name, code, kind });
    setName(''); setCode('');
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Loại sản phẩm</DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary">Tiền tố mã (vd AO, TK, TB) dùng để sinh mã sản phẩm tự động: AO-001, AO-002…</Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 2 }} flexWrap="wrap" useFlexGap>
          <TextField size="small" label="Tên loại" value={name} onChange={(e) => setName(e.target.value)} sx={{ flex: 1, minWidth: 160 }} />
          <TextField size="small" label="Tiền tố mã" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} sx={{ width: 110 }} inputProps={{ maxLength: 4 }} />
          <TextField select size="small" label="Kiểu" value={kind} onChange={(e) => setKind(e.target.value as 'consumable' | 'asset')} sx={{ width: 160 }}>
            <MenuItem value="consumable">Hàng tiêu hao</MenuItem>
            <MenuItem value="asset">Tài sản (từng cái)</MenuItem>
          </TextField>
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
                <Chip size="small" variant="outlined" label={c.kind === 'asset' ? 'Tài sản' : 'Tiêu hao'} />
                <Typography variant="caption" color="text.secondary">{used} SP</Typography>
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

// ── Thêm / sửa sản phẩm (hàng tiêu hao) hoặc model thiết bị (asset) ─────────────
function ItemDialog({ item, categories, asset, onClose }: { item: InventoryItem | null; categories: InventoryCategory[]; asset: boolean; onClose: () => void }) {
  const save = useInventoryStore((s) => s.saveItem);
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? categories[0]?.id ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [unit, setUnit] = useState(item?.unit ?? (asset ? 'cái' : 'cái'));
  const [sizesText, setSizesText] = useState((item?.sizes ?? []).join(', '));
  const [minStock, setMinStock] = useState(String(item?.minStock ?? 0));
  const [note, setNote] = useState(item?.note ?? '');

  const submit = () => {
    if (!name.trim()) { window.alert('Nhập tên.'); return; }
    if (!categoryId) { window.alert('Chọn loại.'); return; }
    const sizes = asset ? [] : sizesText.split(',').map((s) => s.trim()).filter(Boolean);
    void save({ id: item?.id, categoryId, name, unit, sizes, minStock: asset ? 0 : Number(minStock) || 0, note });
    onClose();
  };

  const title = asset
    ? (item ? `Sửa model · ${item.code}` : 'Thêm model thiết bị')
    : (item ? `Sửa sản phẩm · ${item.code}` : 'Thêm sản phẩm');

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField select size="small" label={asset ? 'Loại thiết bị' : 'Loại sản phẩm'} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={!!item}>
            {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.code} · {c.name}</MenuItem>)}
          </TextField>
          <TextField size="small" label={asset ? 'Tên model (vd Máy chiếu Epson EB-2042)' : 'Tên sản phẩm'} value={name} onChange={(e) => setName(e.target.value)} />
          {!asset && (
            <>
              <Stack direction="row" spacing={1}>
                <TextField size="small" label="Đơn vị tính" value={unit} onChange={(e) => setUnit(e.target.value)} sx={{ flex: 1 }} />
                <TextField size="small" label="Tồn tối thiểu" type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} sx={{ width: 140 }} />
              </Stack>
              <TextField size="small" label="Danh sách size (cách nhau dấu phẩy)" placeholder="S, M, L, XL" value={sizesText}
                onChange={(e) => setSizesText(e.target.value)} helperText="Để trống nếu sản phẩm không phân size (vd kit trọn gói)." />
            </>
          )}
          {asset && (
            <Typography variant="caption" color="text.secondary">
              Mỗi cái thiết bị sẽ có mã riêng (vd {(categories.find((c) => c.id === categoryId)?.code) ?? 'TB'}-001-001), thêm trong danh sách bên dưới sau khi lưu model.
            </Typography>
          )}
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
  const [tour, setTour] = useState<TourRef | null>(null);

  const submit = async () => {
    const n = Number(qty) || 0;
    if (n <= 0) { window.alert('Nhập số lượng xuất.'); return; }
    if (n > avail) { window.alert(`Vượt tồn (còn ${avail}).`); return; }
    if (!reason.trim()) { window.alert('Nhập lý do xuất.'); return; }
    try {
      await issue({ itemId: item.id, color, size, qty: n, reason, ref, occurredAt, tourProfileId: tour?.id, tourCode: tour?.code });
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
            <TourPicker value={tour} onChange={setTour} label="Gắn tour (tuỳ chọn)" />
            <TextField size="small" label="Lý do xuất" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="vd Cấp đồng phục tour NĐ.25.06.25.01" />
            <TextField size="small" label="Tham chiếu (người nhận)" value={ref} onChange={(e) => setRef(e.target.value)} />
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

// ── Bộ chọn hồ sơ tour (dùng chung cho xuất kho & cấp thiết bị) ─────────────────
type TourRef = { id: string; code: string; name: string };
function TourPicker({ value, onChange, label }: { value: TourRef | null; onChange: (t: TourRef | null) => void; label: string }) {
  const profiles = useTourProfileStore((s) => s.profiles);
  const options: TourRef[] = useMemo(
    () => profiles.filter((p) => p.status !== 'archived').map((p) => ({ id: p.id, code: p.code, name: p.name || p.customerName || '' })),
    [profiles],
  );
  return (
    <Autocomplete
      size="small" options={options} value={value} onChange={(_, v) => onChange(v)}
      getOptionLabel={(o) => `${o.code}${o.name ? ' · ' + o.name : ''}`}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      renderInput={(p) => <TextField {...p} label={label} placeholder="Mã/tên tour" />}
    />
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
                <TableCell><Typography variant="caption">{m.tourCode ? `🧳 ${m.tourCode} · ` : ''}{m.reason}{m.ref ? ` · ${m.ref}` : ''}</Typography></TableCell>
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

// ── Thẻ một model thiết bị + danh sách từng cái ────────────────────────────────
const ACTIONS: Record<AssetAction, { label: string; toStatus: AssetStatus; needHolder: boolean }> = {
  checkout:    { label: 'Cấp phát', toStatus: 'in_use', needHolder: true },
  checkin:     { label: 'Thu hồi', toStatus: 'available', needHolder: false },
  maintenance: { label: 'Đưa bảo trì', toStatus: 'maintenance', needHolder: false },
  retire:      { label: 'Thanh lý', toStatus: 'retired', needHolder: false },
  status:      { label: 'Báo mất/hỏng', toStatus: 'lost', needHolder: false },
};

function AssetModelCard({ model, category, onEditModel }: { model: InventoryItem; category?: InventoryCategory; onEditModel: () => void }) {
  const [open, setOpen] = useState(false);
  const assets = useInventoryStore((s) => s.assets);
  const removeModel = useInventoryStore((s) => s.deleteItem);
  const units = useMemo(() => assets.filter((a) => a.itemId === model.id).sort((a, b) => a.code.localeCompare(b.code)), [assets, model.id]);
  const [unitDlg, setUnitDlg] = useState<InventoryAsset | 'new' | null>(null);
  const [actFor, setActFor] = useState<{ asset: InventoryAsset; action: AssetAction } | null>(null);
  const [logsFor, setLogsFor] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const u of units) c[u.status] = (c[u.status] ?? 0) + 1;
    return c;
  }, [units]);

  return (
    <Paper variant="outlined" sx={{ p: 1.25, borderLeft: `4px solid #2563eb` }}>
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
        <IconButton size="small" onClick={() => setOpen((v) => !v)}>{open ? <ExpandMoreIcon /> : <ChevronRightIcon />}</IconButton>
        <Box sx={{ minWidth: 0 }}>
          <Typography fontWeight={800} fontSize={14} noWrap>
            {model.name} <Typography component="span" variant="caption" color="text.secondary">· {model.code}</Typography>
          </Typography>
          <Typography variant="caption" color="text.secondary">{category?.name ?? '—'}</Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Chip size="small" label={`${units.length} cái`} sx={{ fontWeight: 800 }} />
        {(['available', 'in_use', 'maintenance'] as AssetStatus[]).map((st) => counts[st] ? (
          <Chip key={st} size="small" label={`${ASSET_STATUS[st].label}: ${counts[st]}`} sx={{ fontWeight: 700, bgcolor: ASSET_STATUS[st].color + '22', color: ASSET_STATUS[st].color }} />
        ) : null)}
        <Button size="small" startIcon={<AddIcon />} sx={{ color: '#2563eb' }} onClick={() => setUnitDlg('new')}>Thêm cái</Button>
        <Tooltip title="Sửa model"><IconButton size="small" onClick={onEditModel}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="Xoá model">
          <IconButton size="small" disabled={units.length > 0}
            onClick={() => { if (window.confirm(`Xoá model "${model.name}"?`)) void removeModel(model.id); }}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Collapse in={open}>
        <Divider sx={{ my: 1 }} />
        {units.length === 0 ? <Typography variant="caption" color="text.disabled">Chưa có cái nào — bấm "Thêm cái".</Typography> : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Mã</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Serial</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Trạng thái</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Người giữ / Vị trí</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Thao tác</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {units.map((a) => (
                <TableRow key={a.id}>
                  <TableCell sx={{ fontWeight: 700 }}>{a.code}</TableCell>
                  <TableCell><Typography variant="caption">{a.serial || '—'}</Typography></TableCell>
                  <TableCell><Chip size="small" label={ASSET_STATUS[a.status].label} sx={{ fontWeight: 700, bgcolor: ASSET_STATUS[a.status].color + '22', color: ASSET_STATUS[a.status].color }} /></TableCell>
                  <TableCell><Typography variant="caption">{a.status === 'in_use' && a.holder ? `👤 ${a.holder}` : (a.location || '—')}</Typography></TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                      {a.status === 'available' && <Button size="small" sx={{ minWidth: 0 }} onClick={() => setActFor({ asset: a, action: 'checkout' })}>Cấp phát</Button>}
                      {a.status === 'in_use' && <Button size="small" sx={{ minWidth: 0 }} onClick={() => setActFor({ asset: a, action: 'checkin' })}>Thu hồi</Button>}
                      {(a.status === 'available' || a.status === 'in_use') && <Button size="small" color="warning" sx={{ minWidth: 0 }} onClick={() => setActFor({ asset: a, action: 'maintenance' })}>Bảo trì</Button>}
                      {a.status === 'maintenance' && <Button size="small" sx={{ minWidth: 0 }} onClick={() => setActFor({ asset: a, action: 'checkin' })}>Xong</Button>}
                      <Tooltip title="Lịch sử"><IconButton size="small" onClick={() => setLogsFor(logsFor === a.id ? null : a.id)}><Inventory2OutlinedIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Sửa"><IconButton size="small" onClick={() => setUnitDlg(a)}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>
                    </Stack>
                    <Collapse in={logsFor === a.id}><AssetLogList assetId={a.id} /></Collapse>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Collapse>
      {unitDlg && <AssetUnitDialog model={model} asset={unitDlg === 'new' ? null : unitDlg} onClose={() => setUnitDlg(null)} />}
      {actFor && <AssetActionDialog asset={actFor.asset} action={actFor.action} onClose={() => setActFor(null)} />}
    </Paper>
  );
}

function AssetLogList({ assetId }: { assetId: string }) {
  const logs = useInventoryStore((s) => s.assetLogs).filter((l) => l.assetId === assetId);
  if (logs.length === 0) return <Typography variant="caption" color="text.disabled" sx={{ display: 'block', py: 0.5 }}>Chưa có lịch sử.</Typography>;
  return (
    <Box sx={{ py: 0.5 }}>
      {logs.map((l) => (
        <Typography key={l.id} variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
          {new Date(l.occurredAt).toLocaleDateString('vi-VN')} · {ACTIONS[l.action]?.label ?? l.action}
          {l.holder ? ` → ${l.holder}` : ''}{l.reason ? ` · ${l.reason}` : ''}{l.ref ? ` (${l.ref})` : ''} · {l.createdBy}
        </Typography>
      ))}
    </Box>
  );
}

// ── Thêm / sửa một cái thiết bị ────────────────────────────────────────────────
function AssetUnitDialog({ model, asset, onClose }: { model: InventoryItem; asset: InventoryAsset | null; onClose: () => void }) {
  const save = useInventoryStore((s) => s.saveAsset);
  const remove = useInventoryStore((s) => s.deleteAsset);
  const [serial, setSerial] = useState(asset?.serial ?? '');
  const [purchaseCost, setPurchaseCost] = useState(String(asset?.purchaseCost ?? ''));
  const [purchasedAt, setPurchasedAt] = useState(asset?.purchasedAt ?? '');
  const [location, setLocation] = useState(asset?.location ?? '');
  const [condition, setCondition] = useState(asset?.condition ?? 'Tốt');
  const [note, setNote] = useState(asset?.note ?? '');

  const submit = () => {
    void save({ id: asset?.id, itemId: model.id, serial, purchaseCost: Number(purchaseCost) || 0,
      purchasedAt: purchasedAt || undefined, location, condition, note });
    onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{asset ? `Sửa thiết bị · ${asset.code}` : `Thêm cái · ${model.name}`}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {asset && <Chip label={`Trạng thái: ${ASSET_STATUS[asset.status].label}`} sx={{ alignSelf: 'flex-start', bgcolor: ASSET_STATUS[asset.status].color + '22', color: ASSET_STATUS[asset.status].color, fontWeight: 700 }} />}
          <TextField size="small" label="Số serial" value={serial} onChange={(e) => setSerial(e.target.value)} />
          <Stack direction="row" spacing={1}>
            <TextField size="small" label="Nguyên giá" type="number" value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)}
              sx={{ flex: 1 }} InputProps={{ endAdornment: <InputAdornment position="end">đ</InputAdornment> }} />
            <TextField size="small" label="Ngày mua" type="date" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} sx={{ width: 170 }} InputLabelProps={{ shrink: true }} />
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField size="small" label="Vị trí" value={location} onChange={(e) => setLocation(e.target.value)} sx={{ flex: 1 }} />
            <TextField select size="small" label="Tình trạng" value={condition} onChange={(e) => setCondition(e.target.value)} sx={{ width: 150 }}>
              {['Tốt', 'Khá', 'Trung bình', 'Hỏng'].map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField size="small" label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        {asset && <Button color="error" onClick={() => { if (window.confirm(`Xoá thiết bị ${asset.code}?`)) { void remove(asset.id); onClose(); } }}>Xoá</Button>}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="contained" sx={{ bgcolor: TEAL }} onClick={submit}>Lưu</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Thao tác tài sản (cấp phát/thu hồi/bảo trì/thanh lý) ────────────────────────
function AssetActionDialog({ asset, action, onClose }: { asset: InventoryAsset; action: AssetAction; onClose: () => void }) {
  const doAction = useInventoryStore((s) => s.assetAction);
  const cfg = ACTIONS[action];
  const [holder, setHolder] = useState('');
  const [reason, setReason] = useState('');
  const [ref, setRef] = useState('');
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [tour, setTour] = useState<TourRef | null>(null);

  const submit = async () => {
    if (cfg.needHolder && !holder.trim()) { window.alert('Nhập người nhận.'); return; }
    try {
      await doAction({ assetId: asset.id, action, toStatus: cfg.toStatus, holder, reason, ref, occurredAt, tourProfileId: tour?.id, tourCode: tour?.code });
      onClose();
    } catch { /* lỗi đã báo */ }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{cfg.label} · {asset.code}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {cfg.needHolder && <TextField size="small" label="Người nhận" value={holder} onChange={(e) => setHolder(e.target.value)} autoFocus />}
          {action === 'checkout' && <TourPicker value={tour} onChange={setTour} label="Gắn tour (tuỳ chọn)" />}
          <TextField size="small" label="Lý do / Ghi chú" value={reason} onChange={(e) => setReason(e.target.value)} multiline minRows={2} />
          <TextField size="small" label="Tham chiếu (dự án)" value={ref} onChange={(e) => setRef(e.target.value)} />
          <TextField size="small" label="Thời gian" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} InputLabelProps={{ shrink: true }} />
          {action === 'retire' && <Typography variant="caption" color="error">Thiết bị sẽ chuyển sang trạng thái Thanh lý.</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="contained" sx={{ bgcolor: cfg.toStatus === 'retired' || cfg.toStatus === 'lost' ? '#dc3250' : TEAL }} onClick={() => void submit()}>{cfg.label}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Tổng quan kho ──────────────────────────────────────────────────────────────
function InventoryDashboard({ categories, items, stock, assets, movements, totalValue, catById, isAssetItem }: {
  categories: InventoryCategory[];
  items: InventoryItem[];
  stock: StockRow[];
  assets: InventoryAsset[];
  movements: InventoryMovement[];
  totalValue: number;
  catById: Map<string, InventoryCategory>;
  isAssetItem: (it: InventoryItem) => boolean;
}) {
  const consumable = items.filter((it) => !isAssetItem(it));
  const lowItems = consumable.filter((it) => it.minStock > 0 && itemOnHand(it.id, stock) < it.minStock);

  // Chi phí kho theo tour: gộp giá vốn các lần XUẤT có gắn tour.
  const byTour = useMemo(() => {
    const m = new Map<string, { code: string; value: number; qty: number }>();
    for (const mv of movements) {
      if (mv.type !== 'out' || !mv.tourCode) continue;
      const row = m.get(mv.tourCode) ?? { code: mv.tourCode, value: 0, qty: 0 };
      row.value += mv.qty * mv.unitCost;
      row.qty += mv.qty;
      m.set(mv.tourCode, row);
    }
    return Array.from(m.values()).sort((a, b) => b.value - a.value);
  }, [movements]);

  // Giá trị tồn theo từng sản phẩm → top 5.
  const valueByItem = new Map<string, number>();
  for (const s of stock) valueByItem.set(s.itemId, (valueByItem.get(s.itemId) ?? 0) + s.value);
  const topItems = consumable
    .map((it) => ({ it, value: valueByItem.get(it.id) ?? 0, onHand: itemOnHand(it.id, stock) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const assetByStatus = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of assets) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [assets]);
  const assetValue = assets.reduce((a, x) => a + x.purchaseCost, 0);

  const Kpi = ({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) => (
    <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 150, borderTop: `3px solid ${color}` }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography fontWeight={900} fontSize={20} sx={{ color }}>{value}</Typography>
      {sub && <Typography variant="caption" color="text.disabled">{sub}</Typography>}
    </Paper>
  );

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
        <Kpi label="Giá trị tồn (hàng tiêu hao)" value={fmtVND(totalValue)} color={TEAL} />
        <Kpi label="Sản phẩm tiêu hao" value={String(consumable.length)} color="#2563eb" sub={`${categories.filter((c) => c.kind === 'consumable').length} loại`} />
        <Kpi label="Sắp hết (dưới tối thiểu)" value={String(lowItems.length)} color={lowItems.length ? '#dc3250' : '#6b7280'} />
        <Kpi label="Thiết bị / tài sản" value={String(assets.length)} color="#7c3aed" sub={`Nguyên giá ${fmtVND(assetValue)}`} />
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Typography fontWeight={800} fontSize={14} sx={{ mb: 1 }}>🏆 Top sản phẩm theo giá trị tồn</Typography>
          {topItems.length === 0 ? <Typography variant="caption" color="text.disabled">Chưa có tồn.</Typography> : (
            <Stack spacing={0.75}>
              {topItems.map(({ it, value, onHand }) => (
                <Stack key={it.id} direction="row" alignItems="center" spacing={1}>
                  <Typography fontSize={13} sx={{ flex: 1 }} noWrap>{it.name} <Typography component="span" variant="caption" color="text.secondary">{onHand} {it.unit}</Typography></Typography>
                  <Typography fontSize={13} fontWeight={700} sx={{ color: TEAL }}>{fmtVND(value)}</Typography>
                </Stack>
              ))}
            </Stack>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Typography fontWeight={800} fontSize={14} sx={{ mb: 1 }}>🔧 Tài sản theo trạng thái</Typography>
          {assets.length === 0 ? <Typography variant="caption" color="text.disabled">Chưa có thiết bị.</Typography> : (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {(Object.keys(ASSET_STATUS) as (keyof typeof ASSET_STATUS)[]).map((st) => (
                <Chip key={st} label={`${ASSET_STATUS[st].label}: ${assetByStatus[st] ?? 0}`}
                  sx={{ fontWeight: 700, bgcolor: ASSET_STATUS[st].color + '22', color: ASSET_STATUS[st].color }} />
              ))}
            </Stack>
          )}
        </Paper>
      </Box>

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Typography fontWeight={800} fontSize={14} sx={{ mb: 1 }}>🧳 Chi phí kho theo tour</Typography>
        {byTour.length === 0 ? (
          <Typography variant="caption" color="text.disabled">Chưa có lần xuất nào gắn tour. Khi xuất kho, chọn "Gắn tour" để thống kê tại đây.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Mã tour</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Số lượng xuất</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Giá trị (FIFO)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {byTour.map((t) => (
                <TableRow key={t.code}>
                  <TableCell sx={{ fontWeight: 700 }}>{t.code}</TableCell>
                  <TableCell align="right">{t.qty}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: TEAL }}>{fmtVND(t.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      {lowItems.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5, borderLeft: '4px solid #dc3250' }}>
          <Typography fontWeight={800} fontSize={14} sx={{ mb: 1, color: '#dc3250' }}>⚠ Sản phẩm cần nhập thêm</Typography>
          <Stack spacing={0.5}>
            {lowItems.map((it) => (
              <Typography key={it.id} fontSize={13}>
                {it.name} ({it.code}) — còn <b>{itemOnHand(it.id, stock)}</b> {it.unit}, tối thiểu {it.minStock}
                <Typography component="span" variant="caption" color="text.secondary"> · {catById.get(it.categoryId)?.name ?? ''}</Typography>
              </Typography>
            ))}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
