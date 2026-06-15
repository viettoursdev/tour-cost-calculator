import { useMemo, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogContent, DialogTitle, IconButton, Link, Menu, MenuItem,
  Paper, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField,
  Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import HistoryIcon from '@mui/icons-material/History';
import PaymentsIcon from '@mui/icons-material/Payments';
import { useAuthStore } from '@/stores/authStore';
import { useNccProductsStore, priceToVND } from '@/stores/nccProductsStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { usePaymentStore } from '@/stores/paymentStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { canViewAll } from '@/auth/ROLES';
import { filterRank } from '@/lib/search';
import { workerFileUrl } from '@/lib/aiWorker';
import { CATS } from '@/components/quote/constants';
import { slugifyTourKey } from '@/components/quote/paymentUtils';
import { NccProductEditor } from './NccProductEditor';
import type { CategoryId, CustomCostItem, NccPrice, NccProduct } from '@/types';

const CAT_BY = Object.fromEntries(CATS.map((c) => [c.id, c])) as Record<CategoryId, (typeof CATS)[number]>;
const catMeta = (id: CategoryId) => CAT_BY[id] ?? { icon: '🧩', label: id, color: '#95a5a6' };
const fmtMoney = (n: number, cur: string) => `${Math.round(n).toLocaleString('vi-VN')} ${cur}`;
const fmtDt = (s?: string) => (s ? new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export function NccProductView() {
  const products = useNccProductsStore((s) => s.products);
  const loading = useNccProductsStore((s) => s.loading);
  const remove = useNccProductsStore((s) => s.remove);
  const currentUser = useAuthStore((s) => s.currentUser);
  const canEdit = !!currentUser && hasPerm(currentUser, 'manageNCC');
  const viewAll = !!currentUser && canViewAll(currentUser.role, 'ncc');

  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState<'category' | 'ncc'>('category');
  const [filterCat, setFilterCat] = useState('');
  const [filterNcc, setFilterNcc] = useState('');
  const [editing, setEditing] = useState<NccProduct | null>(null);
  const [fileHistOpen, setFileHistOpen] = useState(false);
  const [payPicker, setPayPicker] = useState<{ el: HTMLElement; product: NccProduct } | null>(null);

  const draftRates = useQuoteStore((s) => s.draft.rates);
  const draftName = useQuoteStore((s) => s.draft.info.name);

  // Thêm 1 dòng chi phí (theo hạng mục + NCC) vào tab Quản lý thanh toán của tour hiện tại.
  const linkToPayment = (p: NccProduct, price?: NccPrice) => {
    const tourName = (draftName ?? '').trim();
    if (!tourName) { window.alert('Báo giá chưa có tên tour — hãy đặt tên báo giá trước khi liên kết Thanh toán.'); return; }
    const tourKey = slugifyTourKey(tourName);
    const cm = catMeta(p.category);
    const amountVND = price ? priceToVND(price.amount, price.cur, draftRates) : 0;
    const key = 'custom_' + Date.now();
    const item: CustomCostItem = {
      key, catId: p.category, catLabel: cm.label, catIcon: cm.icon, catColor: cm.color,
      name: `${p.name}${p.nccName ? ' — ' + p.nccName : ''}`, amount: amountVND,
    };
    const store = usePaymentStore.getState();
    store.ensureSubscribed(tourKey);
    // Chờ snapshot ban đầu của tour về (tránh ghi đè dữ liệu thanh toán đã có) rồi mới nối thêm.
    window.setTimeout(() => {
      const cur = store.getTour(tourKey);
      store.setCustomItems(tourKey, [...cur.customItems, item]);
      store.setPayments(tourKey, { ...cur.payments, [key]: { supplier: p.nccName, installments: [], note: '' } });
      store.releaseSubscription(tourKey);
      window.alert(`✅ Đã thêm "${item.name}"${amountVND ? ` (${amountVND.toLocaleString('vi-VN')} ₫)` : ''} vào tab Quản lý thanh toán.`);
    }, 700);
  };

  const onClickPay = (el: HTMLElement, p: NccProduct) => {
    const rows = p.prices ?? [];
    if (rows.length > 1) setPayPicker({ el, product: p });
    else linkToPayment(p, rows[0]);
  };

  const visible = useMemo(() => {
    const base = products.filter((p) => {
      if (!viewAll && p.createdBy !== currentUser?.name) return false;
      if (filterCat && p.category !== filterCat) return false;
      if (filterNcc && p.nccName !== filterNcc) return false;
      return true;
    });
    const text = (p: NccProduct) => [p.name, p.nccName, catMeta(p.category).label, p.description, p.note,
      ...(p.prices ?? []).map((pr) => pr.label)].filter(Boolean).join(' ');
    return filterRank(base, search, text);
  }, [products, viewAll, currentUser?.name, filterCat, filterNcc, search]);

  const nccNames = useMemo(() => [...new Set(products.map((p) => p.nccName).filter(Boolean))].sort(), [products]);

  const groups = useMemo(() => {
    const m = new Map<string, NccProduct[]>();
    for (const p of visible) {
      const key = groupBy === 'category' ? catMeta(p.category).label : (p.nccName || '(Chưa rõ NCC)');
      (m.get(key) ?? m.set(key, []).get(key)!).push(p);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi'));
  }, [visible, groupBy]);

  const fileHistory = useMemo(() => {
    const rows = visible.flatMap((p) => (p.files ?? []).map((f) => ({ ...f, product: p.name, ncc: p.nccName })));
    return rows.sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''));
  }, [visible]);

  const onDelete = (p: NccProduct) => {
    if (!window.confirm(`Xoá sản phẩm "${p.name}"?`)) return;
    void remove(p.id);
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1150, mx: 'auto' }}>
      <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap sx={{ mb: 2 }} alignItems="center">
        <TextField size="small" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Tìm sản phẩm, NCC, hạng mục…" sx={{ maxWidth: 300, flex: 1 }} />
        <Select size="small" value={groupBy} onChange={(e) => setGroupBy(e.target.value as 'category' | 'ncc')}>
          <MenuItem value="category">Nhóm theo: Hạng mục</MenuItem>
          <MenuItem value="ncc">Nhóm theo: NCC</MenuItem>
        </Select>
        <Select size="small" displayEmpty value={filterCat} onChange={(e) => setFilterCat(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="">Mọi hạng mục</MenuItem>
          {CATS.map((c) => <MenuItem key={c.id} value={c.id}>{c.icon} {c.label}</MenuItem>)}
        </Select>
        <Select size="small" displayEmpty value={filterNcc} onChange={(e) => setFilterNcc(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value="">Mọi NCC</MenuItem>
          {nccNames.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
        </Select>
        <Button size="small" variant="outlined" startIcon={<HistoryIcon />} onClick={() => setFileHistOpen(true)}>
          Lịch sử file
        </Button>
        <Box sx={{ flex: 1 }} />
        {canEdit && (
          <Button variant="contained" startIcon={<AddIcon />}
            onClick={() => setEditing({ id: '', nccId: null, nccName: '', category: 'hotel', name: '', prices: [], files: [], createdAt: '', createdBy: '' })}
            sx={{ background: 'linear-gradient(135deg,#0d7a6a,#14a08c)' }}>
            Thêm sản phẩm
          </Button>
        )}
      </Stack>

      {loading ? (
        <Typography color="text.secondary">Đang tải…</Typography>
      ) : visible.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', color: 'text.disabled' }}>
          {products.length === 0 ? 'Chưa có sản phẩm NCC nào. Bấm “Thêm sản phẩm”.' : 'Không có sản phẩm khớp lọc.'}
        </Paper>
      ) : (
        <Stack spacing={3}>
          {groups.map(([groupLabel, items]) => (
            <Box key={groupLabel}>
              <Typography fontWeight={800} sx={{ mb: 1, color: '#0f3a4a' }}>
                {groupLabel} <Typography component="span" variant="caption" color="text.secondary">({items.length})</Typography>
              </Typography>
              <Stack spacing={1.25}>
                {items.map((p) => {
                  const cm = catMeta(p.category);
                  return (
                    <Paper key={p.id} variant="outlined" sx={{ p: 1.75, borderLeft: `4px solid ${cm.color}` }}>
                      <Stack direction="row" alignItems="flex-start" spacing={1.5} flexWrap="wrap" useFlexGap>
                        <Box sx={{ flex: 1, minWidth: 240 }}>
                          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                            <Typography fontWeight={800} fontSize={15}>{p.name || '(Chưa đặt tên)'}</Typography>
                            <Chip size="small" label={`${cm.icon} ${cm.label}`} sx={{ bgcolor: cm.color + '22', color: cm.color, fontWeight: 700 }} />
                            {p.nccName && <Chip size="small" variant="outlined" label={`🏢 ${p.nccName}`} />}
                          </Stack>
                          {p.description && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{p.description}</Typography>}

                          {(p.prices?.length ?? 0) > 0 && (
                            <Table size="small" sx={{ mt: 1, maxWidth: 560 }}>
                              <TableHead>
                                <TableRow sx={{ '& th': { fontWeight: 700, color: 'text.secondary', py: 0.25 } }}>
                                  <TableCell>Mức giá</TableCell>
                                  <TableCell align="right">Đơn giá</TableCell>
                                  <TableCell>Đơn vị</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {p.prices.map((pr) => (
                                  <TableRow key={pr.id} sx={{ '& td': { py: 0.25 } }}>
                                    <TableCell>{pr.label || '—'}</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700, color: '#0d7a6a' }}>{fmtMoney(pr.amount, pr.cur)}</TableCell>
                                    <TableCell>{pr.unit}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}

                          {(p.files?.length ?? 0) > 0 && (
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                              {p.files.map((f) => (
                                <Link key={f.key} href={workerFileUrl(f.key)} target="_blank" rel="noreferrer" variant="caption"
                                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
                                  📎 {f.name}
                                </Link>
                              ))}
                            </Stack>
                          )}
                        </Box>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Tooltip title="Liên kết sang tab Quản lý thanh toán">
                            <Button size="small" variant="outlined" startIcon={<PaymentsIcon />}
                              onClick={(e) => onClickPay(e.currentTarget, p)} sx={{ fontWeight: 700, color: '#0d7a6a', borderColor: 'rgba(20,150,140,0.5)' }}>
                              Thanh toán
                            </Button>
                          </Tooltip>
                          {canEdit && (
                            <>
                              <Tooltip title="Sửa"><IconButton size="small" color="primary" onClick={() => setEditing(p)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                              <Tooltip title="Xoá"><IconButton size="small" color="error" onClick={() => onDelete(p)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                            </>
                          )}
                        </Stack>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      <Dialog open={fileHistOpen} onClose={() => setFileHistOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>
          🕐 Lịch sử file báo giá NCC
          <IconButton onClick={() => setFileHistOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {fileHistory.length === 0 ? (
            <Typography color="text.disabled">Chưa có file nào.</Typography>
          ) : (
            <Stack spacing={1}>
              {fileHistory.map((f) => (
                <Box key={f.key} sx={{ borderBottom: '1px solid rgba(0,0,0,0.06)', pb: 0.75 }}>
                  <Link href={workerFileUrl(f.key)} target="_blank" rel="noreferrer" fontWeight={700} sx={{ wordBreak: 'break-all' }}>📎 {f.name}</Link>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {f.product} · {f.ncc || '—'} · {fmtDt(f.uploadedAt)}{f.uploadedBy ? ` · ${f.uploadedBy}` : ''}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <Menu anchorEl={payPicker?.el} open={!!payPicker} onClose={() => setPayPicker(null)}>
        <Typography variant="caption" sx={{ px: 2, py: 0.5, display: 'block', color: 'text.secondary' }}>Chọn mức giá đưa sang Thanh toán:</Typography>
        {(payPicker?.product.prices ?? []).map((pr) => (
          <MenuItem key={pr.id} onClick={() => { const p = payPicker!.product; setPayPicker(null); linkToPayment(p, pr); }}>
            {pr.label || '(mức giá)'} — <b style={{ marginLeft: 4, color: '#0d7a6a' }}>{fmtMoney(pr.amount, pr.cur)}</b>{pr.unit ? ` / ${pr.unit}` : ''}
          </MenuItem>
        ))}
      </Menu>

      {editing && <NccProductEditor product={editing} onClose={() => setEditing(null)} />}
    </Box>
  );
}
