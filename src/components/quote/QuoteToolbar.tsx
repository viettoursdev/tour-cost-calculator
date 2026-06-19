import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  AppBar, Box, Button, Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem,
  Stack, TextField, Toolbar, Tooltip, Typography,
} from '@mui/material';
import { toast } from '@/stores/toastStore';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import TableChartIcon from '@mui/icons-material/TableChart';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import DescriptionIcon from '@mui/icons-material/Description';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ImageIcon from '@mui/icons-material/Image';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import DataObjectIcon from '@mui/icons-material/DataObject';
import { useQuoteStore } from '@/stores/quoteStore';
import type { QuoteViewKey } from '@/stores/quoteStore';
// Trình xuất (PDF/Excel) nạp ĐỘNG khi bấm — tránh kéo thư viện nặng vào bundle khởi động.
import { emptyContract } from '@/components/contract/constants';
import { QuotePrintable } from './QuotePrintable';
import { FxRatesPanel } from './FxRatesPanel';
import { QuoteLinksModal } from './QuoteLinksModal';
import { ContractInfoModal } from './ContractInfoModal';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { ROLE_RANK } from '@/auth/ROLES';
import { canSeePrices } from '@/auth/quotePerms';
import { fmtOutput } from '@/lib/currency';
import { useUndoRedoShortcuts } from '@/lib/useUndoRedoShortcuts';
import { UndoRedoButtons } from '@/components/common/UndoRedoButtons';
import { computeTotals, fmtVND } from './calc';
import { blockingIssues } from './lineValidation';
import { InvoiceModal } from './InvoiceModal';
import { HotelModal } from '@/components/rates/HotelModal';
import { VisaModal } from '@/components/rates/VisaModal';
import { RateCardModal } from '@/components/rates/RateCardModal';
import { RATE_CATEGORIES, isRateCategoryVisible } from '@/components/rates/constants';
import { TEMPLATES, QUOTE_STATUS_META, QUOTE_STATUS_ORDER, LOSS_STATUSES, promptLossReason } from './constants';
import { VTE_LOGO } from '@/lib/exports/vteLogo';
import { LEGACY } from '@/theme';
import type { Contract, OutputCurrency, QuoteStatus } from '@/types';

type RateModalState =
  | { kind: 'none' }
  | { kind: 'hotel' }
  | { kind: 'visa' }
  | { kind: 'other'; type: string; label: string };

type Props = {
  onOpenSelector: () => void;
  onOpenSaveCloud: () => void;
};

type NavItem = { v: QuoteViewKey; label: string };
type NavNode = NavItem | { group: string; items: NavItem[] };

/** Nút điều hướng phẳng (tab đơn). */
function NavTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <Button onClick={onClick} disableRipple
      sx={{ textTransform: 'none', fontSize: 13.5, fontWeight: active ? 800 : 600, minHeight: 44, px: 1.5, borderRadius: 0,
        color: active ? LEGACY.teal : 'rgba(15,58,74,0.6)', borderBottom: active ? `3px solid ${LEGACY.teal}` : '3px solid transparent',
        whiteSpace: 'nowrap', '&:hover': { bgcolor: 'rgba(20,150,140,0.06)' } }}>
      {label}
    </Button>
  );
}

/** Nút nhóm điều hướng (mở menu các mục con). */
function NavGroup({ label, items, view, onSelect }: { label: string; items: NavItem[]; view: QuoteViewKey; onSelect: (v: QuoteViewKey) => void }) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const activeItem = items.find((i) => i.v === view);
  return (
    <>
      <Button onClick={(e) => setAnchor(e.currentTarget)} disableRipple endIcon={<ArrowDropDownIcon />}
        sx={{ textTransform: 'none', fontSize: 13.5, fontWeight: activeItem ? 800 : 600, minHeight: 44, px: 1.5, borderRadius: 0,
          color: activeItem ? LEGACY.teal : 'rgba(15,58,74,0.6)', borderBottom: activeItem ? `3px solid ${LEGACY.teal}` : '3px solid transparent',
          whiteSpace: 'nowrap', '&:hover': { bgcolor: 'rgba(20,150,140,0.06)' } }}>
        {activeItem ? activeItem.label : label}
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {items.map((i) => (
          <MenuItem key={i.v} selected={i.v === view} onClick={() => { onSelect(i.v); setAnchor(null); }}
            sx={{ fontWeight: 600, fontSize: 14, color: i.v === view ? LEGACY.teal : undefined }}>
            {i.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/** Translucent "glass pill" used in the teal header band (legacy style). */
function HeaderPill({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <Stack
      direction="row" alignItems="center" spacing={0.5}
      sx={{ background: 'rgba(255,255,255,0.12)', borderRadius: 1, px: 1, py: 0.3 }}
    >
      <Box component="span" sx={{ opacity: 0.8, fontSize: 12 }}>{icon}</Box>
      {children}
    </Stack>
  );
}

/** White inline number input for the header band. */
function WhiteNum({ value, min, onChange }: { value: number; min: number; onChange: (v: number) => void }) {
  return (
    <TextField
      variant="standard" type="number" value={value}
      onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))}
      slotProps={{
        input: { disableUnderline: true },
        htmlInput: { min, style: { width: 28, color: '#fff', fontWeight: 800, fontSize: 14, textAlign: 'center', padding: 0 } },
      }}
    />
  );
}

export function QuoteToolbar({ onOpenSelector, onOpenSaveCloud }: Props) {
  const info = useQuoteStore((s) => s.draft.info);
  const pax = useQuoteStore((s) => s.draft.pax);
  const rates = useQuoteStore((s) => s.draft.rates);
  const view = useQuoteStore((s) => s.view);
  const patchInfo = useQuoteStore((s) => s.patchInfo);
  const setPax = useQuoteStore((s) => s.setPax);
  const setView = useQuoteStore((s) => s.setView);
  const exportJSON = useQuoteStore((s) => s.exportJSON);
  const importJSON = useQuoteStore((s) => s.importJSON);
  const applyImport = useQuoteStore((s) => s.applyImport);

  const template = useQuoteStore((s) => s.draft.template);
  const outputCurrency = (useQuoteStore((s) => s.draft.outputCurrency) ?? 'USD') as OutputCurrency;

  const draft = useQuoteStore((s) => s.draft);
  const status = useQuoteStore((s) => s.draft.status) ?? 'in_progress';
  const setStatus = useQuoteStore((s) => s.setStatus);
  const currentUser = useAuthStore((s) => s.currentUser);

  const isDMC = template === 'dmc';
  const canExport = !!(template && template !== 'dmc' && currentUser);
  const totals = computeTotals(draft);
  const totalCost = totals.totalCost;

  const cloudDirty = useQuoteStore((s) => s.cloudDirty);
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);
  const [rateAnchor, setRateAnchor] = useState<HTMLElement | null>(null);
  const [rateModal, setRateModal] = useState<RateModalState>({ kind: 'none' });
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [contractModal, setContractModal] = useState<Contract | null>(null);
  const [linksOpen, setLinksOpen] = useState(false);
  const [statusAnchor, setStatusAnchor] = useState<HTMLElement | null>(null);
  const undoDraft = useQuoteStore((s) => s.undoDraft);
  const redoDraft = useQuoteStore((s) => s.redoDraft);
  const canUndo = useQuoteStore((s) => s.draftPast.length > 0);
  const canRedo = useQuoteStore((s) => s.draftFuture.length > 0);
  useUndoRedoShortcuts(undoDraft, redoDraft);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const excelInput = useRef<HTMLInputElement | null>(null);
  const printRef = useRef<HTMLDivElement | null>(null);
  const printRefPkg = useRef<HTMLDivElement | null>(null);

  const openRate = (key: string, label: string) => {
    // Blur menu item đang focus trước khi mở Dialog để tránh cảnh báo aria-hidden
    // (MUI ẩn popover của Menu trong khi item vẫn giữ focus).
    (document.activeElement as HTMLElement | null)?.blur();
    if (key === 'hotel') setRateModal({ kind: 'hotel' });
    else if (key === 'visa') setRateModal({ kind: 'visa' });
    else setRateModal({ kind: 'other', type: key, label });
    setRateAnchor(null);
  };

  // Hỏi xác nhận nếu báo giá còn dòng BẬT mà đơn giá = 0 (trước khi xuất/lưu cho khách).
  const confirmIfBlocking = (action: () => void) => {
    const issues = blockingIssues(useQuoteStore.getState().draft.items);
    if (issues.length) {
      const list = issues.slice(0, 8).map((n) => `• ${n}`).join('\n');
      const more = issues.length > 8 ? `\n…và ${issues.length - 8} dòng khác` : '';
      if (!window.confirm(`⚠ Báo giá còn ${issues.length} dòng đang BẬT nhưng đơn giá = 0:\n\n${list}${more}\n\nVẫn tiếp tục?`)) return;
    }
    action();
  };

  const handleExport = () => {
    const json = exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safe = (info.name || 'baogia').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `Viettours_${safe}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => fileInput.current?.click();

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const raw = String(ev.target?.result ?? '');
      const result = importJSON(raw);
      if (!result.ok) alert('⚠ ' + result.error);
      else toast('✅ Nhập báo giá thành công!');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = await (await import('@/lib/exports/importExcel')).importExcelQuote(file);
      applyImport(data);
      toast('✅ Đã nhập báo giá từ Excel!');
    } catch (err) {
      alert('❌ ' + (err as Error).message);
    }
  };

  const runPDFImage = async (node: HTMLElement | null, prefix: string) => {
    if (!node || !template || template === 'dmc') return;
    const safe = (info.name || 'Tour').replace(/[^a-zA-Z0-9_À-ỹ]/g, '_');
    const dateStr = new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');
    try {
      await (await import('@/lib/exports/exportPDFImage')).exportPDFImage(node, `${prefix}_${safe}_${dateStr}.pdf`);
    } catch (err) {
      alert('❌ Lỗi xuất PDF ảnh: ' + (err as Error).message);
    }
  };
  const handleExportPDFImage = () => runPDFImage(printRef.current, 'BaoGiaAnh');
  const handleExportPDFImagePkg = () => runPDFImage(printRefPkg.current, 'BaoGiaAnhTronGoi');

  const handleExportContract = () => {
    if (!currentUser || !template || template === 'dmc') return;
    const pricePerPax = totals.roundedPPax;
    const c = emptyContract(currentUser.name);
    setContractModal({
      ...c,
      tourName: info.name || c.tourName,
      tourDest: info.dest || c.tourDest,
      tourDays: info.days,
      tourNights: info.nights,
      contractPax: pax,
      pricePerPax,
      ...(draft.inclusions && draft.inclusions.length ? { includes: draft.inclusions.filter((s) => s.trim()) } : {}),
      ...(draft.exclusions && draft.exclusions.length ? { excludes: draft.exclusions.filter((s) => s.trim()) } : {}),
      ...(draft.payments && draft.payments.length
        ? {
            payments: draft.payments.map((p) => ({
              id: p.id, label: p.label, amount: p.amount, dueDate: '',
              note: p.note, status: 'pending' as const,
            })),
          }
        : {}),
    });
  };

  const endDateStr = (() => {
    if (!info.startDate) return '';
    const d = new Date(info.startDate);
    d.setDate(d.getDate() + Math.max(0, info.days - 1));
    return d.toLocaleDateString('vi-VN');
  })();

  const tpl = template ? TEMPLATES[template] : null;
  // Pill button in the teal hero band (Trang chủ).
  // Unified nav tabs (legacy order + icons). DMC shows only Breakdown + history.
  const canContract = hasPerm(currentUser, 'manageContracts') || hasPerm(currentUser, 'viewContracts');
  const canCust = hasPerm(currentUser, 'manageCustomers');
  const canNcc = hasPerm(currentUser, 'manageNCC');
  const isMgr = !!currentUser && ROLE_RANK[currentUser.role] >= ROLE_RANK['Trưởng Phòng'];
  // Phòng HDV bị ẩn giá: bỏ luôn các tab thuần về giá/tài chính & thẻ giá ở header.
  const hidePrice = !canSeePrices(currentUser);
  const PRICE_ONLY_VIEWS = new Set<QuoteViewKey>(['summary', 'dashboard', 'payboard', 'payment']);
  const item = (v: QuoteViewKey, label: string) => ({ v, label });
  // Điều hướng gom nhóm: ít tab phẳng + các menu nhóm (giảm rối khi nhiều mục).
  const NAV: NavNode[] = isDMC
    ? [item('cost', '📊 Bảng chi phí Breakdown'), item('history', '🕐 Lịch sử Breakdown')]
    : [
        item('home', '🏠 Hôm nay'),
        item('cost', '📊 Báo giá'),
        { group: '💼 Bán hàng', items: [
          item('summary', '💰 Tổng kết'),
          item('pipeline', '🧲 Pipeline bán hàng'),
          item('salesanalytics', '📊 Phân tích bán hàng'),
          item('history', '🕐 Lịch sử báo giá'),
        ] },
        { group: '🗂️ Vận hành', items: [
          item('workflow', '🗂️ Quy trình vận hành'),
          item('passengers', '👥 Khách đoàn'),
          item('opsboard', '🧭 Điều phối'),
          item('departures', '📅 Lịch khởi hành'),
          item('payboard', '💰 Công nợ tổng'),
          item('payment', '🧾 Quản lý thanh toán'),
          item('flights', '✈️ Chuyến bay'),
          item('dashboard', '📈 Dashboard biên lợi'),
          ...(isMgr ? [item('audit', '📋 Nhật ký')] : []),
        ] },
        { group: '📇 Danh mục', items: [
          ...(canContract ? [item('contract', '📜 Hợp đồng')] : []),
          ...(canCust ? [item('customer', '👥 Khách hàng')] : []),
          ...(canNcc ? [item('ncc', '🏢 Nhà Cung Cấp')] : []),
          ...(canNcc ? [item('nccProducts', '📦 Sản phẩm NCC')] : []),
        ] },
      ]
        .map((n) => (hidePrice && 'group' in n
          ? { ...n, items: n.items.filter((it) => !PRICE_ONLY_VIEWS.has(it.v)) }
          : n))
        .filter((n) => (hidePrice && !('group' in n) ? !PRICE_ONLY_VIEWS.has(n.v) : true))
        .filter((n) => !('group' in n) || n.items.length > 0);

  return (
    <AppBar
      position="sticky"
      color="default"
      elevation={0}
      sx={{
        background: LEGACY.glassBg,
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(20,150,140,0.15)',
      }}
    >
      {/* ── Tour info header band (legacy style) ── */}
      <Box sx={{ background: LEGACY.headerGradient, color: '#fff', px: 3, py: 0.85 }}>
        <Stack direction="row" spacing={2.5} alignItems="center" flexWrap="wrap" useFlexGap rowGap={1}>
          {/* COL1: logo (bấm = về Trang chủ) + template badge (legacy hero) */}
          <Stack alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>
            <Tooltip title="Về Trang chủ">
              <Box
                component="img" src={VTE_LOGO} alt="Về Trang chủ" role="button" tabIndex={0}
                onClick={onOpenSelector}
                onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenSelector(); } }}
                sx={{ height: 42, width: 'auto', display: 'block', filter: 'brightness(0) invert(1)', cursor: 'pointer',
                  transition: 'opacity .15s, transform .15s', '&:hover': { opacity: 0.82, transform: 'scale(1.03)' } }}
              />
            </Tooltip>
            {tpl && (
              <Box sx={{
                background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.35)',
                borderRadius: 5, px: 1.5, py: 0.4, fontSize: 10, fontWeight: 800,
                letterSpacing: 1, textTransform: 'uppercase', whiteSpace: 'nowrap',
              }}>
                {tpl.icon} {tpl.label}
              </Box>
            )}
          </Stack>

          {/* COL2: tour name/dest + meta pills + actions */}
          <Stack spacing={1} sx={{ minWidth: 220 }}>
            {/* Tour name → destination */}
            <Stack direction="row" alignItems="center" spacing={1.25} sx={{ flexWrap: 'wrap' }}>
              <TextField
                variant="standard" value={info.name}
                onChange={(e) => patchInfo({ name: e.target.value })}
                placeholder="Tên báo giá..."
                slotProps={{ input: { disableUnderline: true } }}
                sx={{ '& input': { color: '#fff', fontSize: 22, fontWeight: 900, p: 0, '&::placeholder': { color: 'rgba(255,255,255,0.6)', opacity: 1 } } }}
              />
              <Box sx={{ color: 'rgba(255,255,255,0.45)', fontSize: 18 }}>→</Box>
              <TextField
                variant="standard" value={info.dest}
                onChange={(e) => patchInfo({ dest: e.target.value })}
                placeholder="Điểm đến..."
                slotProps={{ input: { disableUnderline: true } }}
                sx={{ '& input': { color: LEGACY.gold, fontSize: 16, fontWeight: 700, p: 0, '&::placeholder': { color: 'rgba(255,224,130,0.6)', opacity: 1 } } }}
              />
            </Stack>

            {/* Meta pills + actions */}
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap rowGap={0.75}>
              <HeaderPill icon="🗓️">
                <WhiteNum value={info.days} min={1} onChange={(v) => patchInfo({ days: v, nights: Math.max(0, v - 1) })} />
                <Typography component="span" sx={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>ngày</Typography>
              </HeaderPill>
              <HeaderPill icon="🌙">
                <WhiteNum value={info.nights} min={0} onChange={(v) => patchInfo({ nights: v })} />
                <Typography component="span" sx={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>đêm</Typography>
              </HeaderPill>
              <HeaderPill icon="👥">
                <WhiteNum value={pax} min={1} onChange={(v) => setPax(v)} />
                <Typography component="span" sx={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>khách</Typography>
              </HeaderPill>
              <HeaderPill icon="✈️">
                <Box
                  component="input" type="date" value={info.startDate ?? ''}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => patchInfo({ startDate: e.target.value || null })}
                  sx={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none', colorScheme: 'dark', fontWeight: 600, width: 108 }}
                />
              </HeaderPill>
              {info.startDate && (
                <Typography sx={{ color: LEGACY.gold, fontSize: 12, fontWeight: 600 }}>→ {endDateStr}</Typography>
              )}
            </Stack>
          </Stack>

          <Box sx={{ flexGrow: 1 }} />

          {/* RIGHT: price summary cards (ẩn với phòng HDV) */}
          {hidePrice ? null : isDMC ? (
            <Stack direction="row" gap={1.25} alignItems="stretch">
              <Box
                sx={{
                  background: 'rgba(255,255,255,0.13)', border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: 1.75, px: 2.25, py: 1, textAlign: 'right', minWidth: 140,
                }}
              >
                <Typography color="rgba(255,255,255,0.7)" fontSize={11} fontWeight={600} mb={0.25}>Tổng breakdown</Typography>
                <Typography color={LEGACY.gold} fontWeight={800} fontSize={18}>
                  {fmtOutput(totalCost, outputCurrency, rates)}
                </Typography>
              </Box>
              <Box
                sx={{
                  background: '#fff', borderRadius: 1.75, px: 2.25, py: 1, textAlign: 'right',
                  minWidth: 160, boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
                }}
              >
                <Typography color="#0f3a4a" fontSize={11} fontWeight={800} letterSpacing={0.5} textTransform="uppercase" mb={0.25}>📊 Per pax</Typography>
                <Typography color="#0f3a4a" fontWeight={900} fontSize={22} lineHeight={1}>
                  {pax > 0 ? fmtOutput(totalCost / pax, outputCurrency, rates) : '–'}
                </Typography>
                <Typography color="rgba(15,58,74,0.45)" fontSize={11} mt={0.25}>{pax} khách · {outputCurrency}</Typography>
              </Box>
            </Stack>
          ) : (
            <Stack direction="row" gap={1.25} alignItems="stretch">
              <Box
                sx={{
                  background: 'rgba(255,255,255,0.13)', border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: 1.75, px: 2.25, py: 1, textAlign: 'right', minWidth: 130,
                }}
              >
                <Typography color="rgba(255,255,255,0.7)" fontSize={11} fontWeight={600} mb={0.25}>Giá vốn / khách</Typography>
                <Typography color="#fff" fontWeight={800} fontSize={18}>
                  {fmtVND(pax > 0 ? totals.totalCost / pax : 0)}
                </Typography>
              </Box>
              <Box
                sx={{
                  background: '#fff', borderRadius: 1.75, px: 2.25, py: 1, textAlign: 'right',
                  minWidth: 160, boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
                }}
              >
                <Typography color="#dc3250" fontSize={11} fontWeight={800} letterSpacing={0.5} textTransform="uppercase" mb={0.25}>Giá bán / khách</Typography>
                <Typography color="#dc3250" fontWeight={900} fontSize={22} lineHeight={1}>
                  {fmtVND(totals.roundedPPax)}
                </Typography>
                <Typography color="rgba(15,58,74,0.45)" fontSize={11} mt={0.25}>Đoàn: {fmtVND(totals.grandTotal)}</Typography>
              </Box>
            </Stack>
          )}
        </Stack>
      </Box>

      {/* ── Thanh điều hướng + nút thao tác trên CÙNG một hàng ── */}
      <Toolbar sx={{ flexWrap: 'wrap', gap: 0.75, py: 0.75, px: 1.5, minHeight: 'auto', borderBottom: '1px solid rgba(20,150,140,0.12)' }}>
        <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 0.25, overflowX: 'auto', minWidth: 0, '&::-webkit-scrollbar': { height: 0 } }}>
          {NAV.map((n, i) => ('group' in n
            ? <NavGroup key={`g${i}`} label={n.group} items={n.items} view={view} onSelect={(v) => setView(v)} />
            : <NavTab key={n.v} label={n.label} active={view === n.v} onClick={() => setView(n.v)} />
          ))}
        </Box>
        <Box sx={{ flexGrow: 1 }} />

        {/* Rate Card dropdown (legacy "📋 Rate Card") */}
        <Tooltip title="Rate Card">
          <IconButton size="small" onClick={(e) => setRateAnchor(e.currentTarget)}
            sx={{ color: '#d18a13', border: '1px solid rgba(245,166,35,0.5)', borderRadius: 1.5, px: 0.75,
              '&:hover': { borderColor: '#d18a13', background: 'rgba(245,166,35,0.08)' } }}>
            <Box component="span" sx={{ fontSize: 15 }}>📋</Box>
          </IconButton>
        </Tooltip>
        <Menu anchorEl={rateAnchor} open={!!rateAnchor} onClose={() => setRateAnchor(null)} disableRestoreFocus>
          {RATE_CATEGORIES.filter((c) => isRateCategoryVisible(c.key, template)).map((c) => (
            <MenuItem key={c.key} onClick={() => openRate(c.key, c.label)}>
              <Box component="span" sx={{ mr: 1 }}>{c.icon}</Box> {c.label}
            </MenuItem>
          ))}
        </Menu>

        <Tooltip title="Báo giá mới">
          <IconButton size="small" onClick={onOpenSelector}
            sx={{ border: '1px solid rgba(20,150,140,0.4)', borderRadius: 1.5, color: '#0d7a6a' }}>
            <AddCircleOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {/* Export dropdown */}
        <Tooltip title="Xuất (PDF / Word / Excel…)">
          <IconButton size="small" onClick={(e) => setExportAnchor(e.currentTarget)}
            sx={{ border: '1px solid rgba(15,58,74,0.25)', borderRadius: 1.5, color: '#0f3a4a' }}>
            <FileDownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={exportAnchor}
          open={!!exportAnchor}
          onClose={() => setExportAnchor(null)}
          disableRestoreFocus
          slotProps={{ paper: { sx: { minWidth: 268, borderRadius: 2, mt: 0.5, boxShadow: '0 12px 30px rgba(15,58,74,0.18)', '& .MuiMenuItem-root': { py: 1, fontWeight: 600, color: LEGACY.navy }, '& .MuiListItemIcon-root': { color: LEGACY.teal, minWidth: 34 } } } }}
        >
          {/* Excel & data files */}
          <MenuItem onClick={() => {
            if (template && currentUser) void import('@/lib/exports/exportExcel').then((m) => m.exportExcelQuote({ draft, savedBy: { name: currentUser.name, role: currentUser.role } }));
            setExportAnchor(null);
          }}>
            <ListItemIcon><TableChartIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{isDMC ? 'Excel breakdown DMC' : 'Excel báo giá'}</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { excelInput.current?.click(); setExportAnchor(null); }}>
            <ListItemIcon><UploadFileIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Nhập file Excel</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { handleImportClick(); setExportAnchor(null); }}>
            <ListItemIcon><DataObjectIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Nhập file JSON</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { handleExport(); setExportAnchor(null); }}>
            <ListItemIcon><FileDownloadIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Xuất file JSON</ListItemText>
          </MenuItem>
          <Divider />
          {/* PDF outputs */}
          {isDMC ? (
            <MenuItem onClick={() => {
              setExportAnchor(null);
              confirmIfBlocking(() => { if (currentUser) void import('@/lib/exports/exportDMCPDF').then((m) => m.exportDMCPDF({ draft, savedBy: { name: currentUser.name, role: currentUser.role, email: currentUser.email, phone: currentUser.phone } })); });
            }}>
              <ListItemIcon><PictureAsPdfIcon fontSize="small" /></ListItemIcon>
              <ListItemText>PDF breakdown DMC</ListItemText>
            </MenuItem>
          ) : (
            <>
              <MenuItem onClick={() => { setExportAnchor(null); confirmIfBlocking(() => void handleExportPDFImage()); }}>
                <ListItemIcon><ImageIcon fontSize="small" /></ListItemIcon>
                <ListItemText>PDF Ảnh</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => { setExportAnchor(null); confirmIfBlocking(() => void handleExportPDFImagePkg()); }}>
                <ListItemIcon><PhotoLibraryIcon fontSize="small" /></ListItemIcon>
                <ListItemText>PDF Ảnh (Tour trọn gói)</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => {
                setExportAnchor(null);
                confirmIfBlocking(() => { if (canExport && currentUser) void import('@/lib/exports/exportPDF').then((m) => m.exportPDFQuote({ draft, savedBy: { name: currentUser.name, role: currentUser.role, email: currentUser.email, phone: currentUser.phone } })); });
              }}>
                <ListItemIcon><PictureAsPdfIcon fontSize="small" /></ListItemIcon>
                <ListItemText>PDF Báo Giá</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => {
                setExportAnchor(null);
                confirmIfBlocking(() => { if (canExport && currentUser) void import('@/lib/exports/exportPDF').then((m) => m.exportPDFQuote({ draft, savedBy: { name: currentUser.name, role: currentUser.role, email: currentUser.email, phone: currentUser.phone }, mode: 'package' })); });
              }}>
                <ListItemIcon><Inventory2Icon fontSize="small" /></ListItemIcon>
                <ListItemText>PDF Báo giá trọn gói</ListItemText>
              </MenuItem>
            </>
          )}
          <Divider />
          {/* Documents */}
          <MenuItem onClick={() => { setInvoiceOpen(true); setExportAnchor(null); }} disabled={!canExport}>
            <ListItemIcon><ReceiptLongIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Invoice</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { handleExportContract(); setExportAnchor(null); }} disabled={!canExport}>
            <ListItemIcon><DescriptionIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Hợp đồng</ListItemText>
          </MenuItem>
        </Menu>
        <input
          ref={fileInput} type="file" accept="application/json"
          hidden onChange={handleImportFile}
        />
        <input
          ref={excelInput} type="file" accept=".xlsx"
          hidden onChange={handleImportExcel}
        />
        {template && template !== 'dmc' && currentUser && (
          <Box sx={{ position: 'fixed', left: -99999, top: 0, zIndex: -1, pointerEvents: 'none' }} aria-hidden>
            <QuotePrintable
              ref={printRef}
              draft={draft}
              savedBy={{ name: currentUser.name, role: currentUser.role, email: currentUser.email, phone: currentUser.phone }}
            />
            <QuotePrintable
              ref={printRefPkg}
              pkg
              draft={draft}
              savedBy={{ name: currentUser.name, role: currentUser.role, email: currentUser.email, phone: currentUser.phone }}
            />
          </Box>
        )}
        <Tooltip title="Trạng thái báo giá">
          <Button
            size="small" variant="contained"
            onClick={(e) => setStatusAnchor(e.currentTarget)}
            endIcon={<ExpandMoreIcon />}
            sx={{ fontWeight: 800, color: '#fff', bgcolor: QUOTE_STATUS_META[status].color, '&:hover': { bgcolor: QUOTE_STATUS_META[status].color, filter: 'brightness(0.93)' } }}
          >
            ● {QUOTE_STATUS_META[status].label}
          </Button>
        </Tooltip>
        <Menu anchorEl={statusAnchor} open={!!statusAnchor} onClose={() => setStatusAnchor(null)}>
          {QUOTE_STATUS_ORDER.map((st: QuoteStatus) => (
            <MenuItem
              key={st} selected={st === status}
              onClick={() => {
                if (LOSS_STATUSES.includes(st)) {
                  const reason = promptLossReason(draft.lossReason);
                  if (reason === null) { setStatusAnchor(null); return; }
                  setStatus(st, reason);
                } else setStatus(st);
                setStatusAnchor(null);
              }}
              sx={{ fontWeight: 700, color: QUOTE_STATUS_META[st].color }}
            >
              ● {QUOTE_STATUS_META[st].label}
            </MenuItem>
          ))}
        </Menu>
        <UndoRedoButtons undo={undoDraft} redo={redoDraft} canUndo={canUndo} canRedo={canRedo} />
        {/* Trạng thái đồng bộ cloud được gộp thẳng vào nút Lưu (chấm màu): cam = chưa
            lưu, xanh = đã đồng bộ — bỏ dòng chữ "Chưa lưu/Đã lưu" rời rạc cho gọn. */}
        <Tooltip title={cloudDirty ? 'Có thay đổi chưa lưu lên cloud' : 'Đã đồng bộ cloud'}>
          <Button
            size="small" variant="contained" startIcon={<CloudUploadIcon />}
            // Blur first so the trigger isn't a focused descendant of #root when the
            // dialog applies aria-hidden (avoids the a11y "aria-hidden on focused" warning).
            onClick={(e) => { e.currentTarget.blur(); confirmIfBlocking(onOpenSaveCloud); }}
            endIcon={<Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: cloudDirty ? '#f5a623' : '#27ae60', boxShadow: '0 0 0 2px rgba(255,255,255,0.35)' }} />}
            sx={{ fontWeight: 800, background: LEGACY.headerGradient }}
          >
            {cloudDirty ? 'Lưu' : 'Đã lưu'}
          </Button>
        </Tooltip>
        <Tooltip title="Liên kết">
          <IconButton size="small" onClick={(e) => { e.currentTarget.blur(); setLinksOpen(true); }}
            sx={{ border: '1px solid rgba(15,58,74,0.25)', borderRadius: 1.5 }}>
            <Box component="span" sx={{ fontSize: 15 }}>🔗</Box>
          </IconButton>
        </Tooltip>
      </Toolbar>

      <QuoteLinksModal open={linksOpen} onClose={() => setLinksOpen(false)} />

      {(template === 'domestic' || template === 'intl' || template === 'dmc') && (
        <Box sx={{ mx: 2, mt: 0.75, mb: 1 }}>
          <FxRatesPanel />
        </Box>
      )}
      {invoiceOpen && currentUser && draft.template && draft.template !== 'dmc' && (
        <InvoiceModal
          open={invoiceOpen}
          onClose={() => setInvoiceOpen(false)}
          draft={draft}
          totals={totals}
          user={currentUser}
        />
      )}

      {/* Rate Card management modals (opened from the Rate Card dropdown) */}
      <HotelModal
        open={rateModal.kind === 'hotel'}
        onClose={() => setRateModal({ kind: 'none' })}
        template={template ?? undefined}
      />
      <VisaModal open={rateModal.kind === 'visa'} onClose={() => setRateModal({ kind: 'none' })} />
      {contractModal && (
        <ContractInfoModal
          open
          baseContract={contractModal}
          onClose={() => setContractModal(null)}
        />
      )}
      {rateModal.kind === 'other' && (
        <RateCardModal
          open
          onClose={() => setRateModal({ kind: 'none' })}
          type={rateModal.type}
          label={rateModal.label}
        />
      )}
    </AppBar>
  );
}
