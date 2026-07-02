import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  AppBar, Badge, Box, Button, Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem,
  Stack, TextField, Toolbar, Tooltip, Typography,
} from '@mui/material';
import { toast } from '@/stores/toastStore';
import { useHomeBadgeStore } from '@/stores/homeBadgeStore';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import AddTaskOutlinedIcon from '@mui/icons-material/AddTaskOutlined';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import LayersClearOutlinedIcon from '@mui/icons-material/LayersClearOutlined';
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
import { buildContractFromQuote } from './contractFromDraft';
import { canMakeContract } from './dealStage';
import { useCustomerStore } from '@/stores/customerStore';
import { QuotePrintable } from './QuotePrintable';
import { FxRatesPanel } from './FxRatesPanel';
import { QuoteLinksModal } from './QuoteLinksModal';
import { VersionHistoryModal } from './VersionHistoryModal';
import HistoryIcon from '@mui/icons-material/History';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import FlightTakeoffOutlinedIcon from '@mui/icons-material/FlightTakeoffOutlined';
import TravelExploreOutlinedIcon from '@mui/icons-material/TravelExploreOutlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import EngineeringOutlinedIcon from '@mui/icons-material/EngineeringOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import RouteOutlinedIcon from '@mui/icons-material/RouteOutlined';
import ConnectingAirportsOutlinedIcon from '@mui/icons-material/ConnectingAirportsOutlined';
import RestaurantMenuOutlinedIcon from '@mui/icons-material/RestaurantMenuOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import { TPL_ACCENT } from './templateStyle';
import { NavCustomizeModal } from './NavCustomizeModal';
import { useNavPrefStore } from '@/stores/navPrefStore';
import {
  GROUP_IDS, GROUP_LABELS, reconcileLayout,
  type GroupId, type NavCatalogEntry, type NavLayout, type PlaceableContainer,
} from './navLayout';
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
import { SharePublicQuoteModal } from './SharePublicQuoteModal';
import { TodoModal } from '@/components/todo/TodoModal';
import { HotelModal } from '@/components/rates/HotelModal';
import { VisaModal } from '@/components/rates/VisaModal';
import { RateCardModal } from '@/components/rates/RateCardModal';
import { RATE_CATEGORIES, isRateCategoryVisible } from '@/components/rates/constants';
import { TEMPLATES, QUOTE_STATUS_META, QUOTE_STATUS_ORDER, LOSS_STATUSES } from './constants';
import { LossReasonDialog } from './LossReasonDialog';
import { LEGACY } from '@/theme';
import type { Contract, OutputCurrency, QuoteStatus, Todo } from '@/types';

type RateModalState =
  | { kind: 'none' }
  | { kind: 'hotel' }
  | { kind: 'visa' }
  | { kind: 'other'; type: string; label: string };

type Props = {
  onOpenSelector: () => void;
  onOpenNewQuote: () => void;
  onOpenSaveCloud: () => void;
};

type NavItem = { v?: QuoteViewKey; label: string; icon?: ReactNode; action?: () => void };
type NavNode = NavItem | { group: string; icon?: ReactNode; items: NavItem[] };

const navBtnSx = (active: boolean) => ({
  textTransform: 'none' as const, fontSize: 13, fontWeight: active ? 800 : 600, minHeight: 40, px: 1, borderRadius: 0,
  color: active ? LEGACY.teal : 'rgba(15,58,74,0.6)', borderBottom: active ? `3px solid ${LEGACY.teal}` : '3px solid transparent',
  whiteSpace: 'nowrap', minWidth: 0, '&:hover': { bgcolor: 'rgba(20,150,140,0.06)' },
  '& .MuiButton-startIcon svg': { fontSize: 17 }, '& .MuiButton-startIcon': { mr: 0.4 },
  '& .MuiButton-endIcon': { ml: 0.2 },
});

/** Nút điều hướng phẳng (tab đơn). `badge` > 0 hiện số nhắc việc (vd tab Hôm nay). */
function NavTab({ label, icon, active, onClick, badge }: { label: string; icon?: ReactNode; active: boolean; onClick: () => void; badge?: number }) {
  const start = badge && badge > 0
    ? <Badge badgeContent={badge} color="error" max={99} sx={{ '& .MuiBadge-badge': { fontSize: 9, height: 15, minWidth: 15 } }}>{icon}</Badge>
    : icon;
  return (
    <Button onClick={onClick} disableRipple startIcon={start} sx={navBtnSx(active)}>
      {label}
    </Button>
  );
}

/** Nút nhóm điều hướng (mở menu các mục con). */
function NavGroup({ label, icon, items, view, onSelect }: { label: string; icon?: ReactNode; items: NavItem[]; view: QuoteViewKey; onSelect: (v: QuoteViewKey) => void }) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const activeItem = items.find((i) => i.v && i.v === view);
  return (
    <>
      <Button onClick={(e) => setAnchor(e.currentTarget)} disableRipple startIcon={icon} endIcon={<ArrowDropDownIcon />}
        sx={navBtnSx(!!activeItem)}>
        {activeItem ? activeItem.label : label}
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {items.map((i) => (
          <MenuItem key={i.v ?? i.label} selected={!!i.v && i.v === view}
            onClick={() => { if (i.action) i.action(); else if (i.v) onSelect(i.v); setAnchor(null); }}
            sx={{ fontWeight: 600, fontSize: 14, gap: 1, color: i.v === view ? LEGACY.teal : undefined, '& svg': { fontSize: 18 } }}>
            {i.icon}{i.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/** Translucent "glass pill" used in the teal header band (legacy style). */
function HeaderPill({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Stack
      direction="row" alignItems="center" spacing={0.5}
      sx={{ background: 'rgba(255,255,255,0.12)', borderRadius: 1, px: 1, py: 0.3, '& svg': { fontSize: 15, opacity: 0.9 } }}
    >
      {icon}
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

export function QuoteToolbar({ onOpenSelector, onOpenNewQuote, onOpenSaveCloud }: Props) {
  const info = useQuoteStore((s) => s.draft.info);
  const pax = useQuoteStore((s) => s.draft.pax);
  const rates = useQuoteStore((s) => s.draft.rates);
  const view = useQuoteStore((s) => s.view);
  const homeBadge = useHomeBadgeStore((s) => s.count);
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

  // Tùy biến thanh điều hướng theo từng user (lưu localStorage).
  const navRaw = useNavPrefStore((s) => s.raw);
  const loadNavPref = useNavPrefStore((s) => s.load);
  const navCustomizeOpen = useNavPrefStore((s) => s.customizeOpen);
  const setNavCustomizeOpen = useNavPrefStore((s) => s.setCustomizeOpen);
  const username = currentUser?.u;
  useEffect(() => { loadNavPref(username); }, [username, loadNavPref]);

  const isDMC = template === 'dmc';
  const canExport = !!(template && template !== 'dmc' && currentUser);
  const totals = computeTotals(draft);
  const totalCost = totals.totalCost;

  const cloudDirty = useQuoteStore((s) => s.cloudDirty);
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);
  const [rateAnchor, setRateAnchor] = useState<HTMLElement | null>(null);
  const [rateModal, setRateModal] = useState<RateModalState>({ kind: 'none' });
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [todoPrefill, setTodoPrefill] = useState<Partial<Todo> | null>(null);
  const [contractModal, setContractModal] = useState<Contract | null>(null);
  const [linksOpen, setLinksOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [statusAnchor, setStatusAnchor] = useState<HTMLElement | null>(null);
  const [lossPending, setLossPending] = useState<QuoteStatus | null>(null);
  const currentQuoteId = useQuoteStore((s) => s.draft.currentQuoteId);
  const undoDraft = useQuoteStore((s) => s.undoDraft);
  const redoDraft = useQuoteStore((s) => s.redoDraft);
  const clearItems = useQuoteStore((s) => s.clearItems);
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

  // Tạo việc (To-Do) gắn sẵn link tới báo giá/thanh toán đang mở.
  const openTodo = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    const link = currentQuoteId
      ? { kind: (view === 'payment' ? 'payment' : 'quote') as 'quote' | 'payment', id: currentQuoteId, label: info.name || 'Báo giá' }
      : undefined;
    setTodoPrefill(link ? { link } : {});
  };

  const handleExportContract = () => {
    if (!currentUser || !template || template === 'dmc') return;
    // Cổng chặn: báo giá nên đã CHỐT (won) trước khi lập hợp đồng. Cảnh báo mềm —
    // người dùng vẫn được phép tiếp tục nếu xác nhận.
    const gate = canMakeContract({ status });
    if (!gate.ok && !window.confirm(`⚠️ ${gate.reason}\n\nVẫn lập hợp đồng ngay bây giờ?`)) return;
    const customer = draft.customerId
      ? useCustomerStore.getState().customers.find((c) => c.id === draft.customerId) ?? null
      : null;
    setContractModal(
      buildContractFromQuote(emptyContract(currentUser.name), {
        quoteId: currentQuoteId,
        name: info.name,
        dest: info.dest,
        days: info.days,
        nights: info.nights,
        pax,
        pricePerPax: totals.roundedPPax,
        startDateISO: info.startDate,
        inclusions: draft.inclusions,
        exclusions: draft.exclusions,
        payments: draft.payments,
        customer,
      }),
    );
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
  const canNcc = hasPerm(currentUser, 'manageNCC');
  const isMgr = !!currentUser && ROLE_RANK[currentUser.role] >= ROLE_RANK['Trưởng Phòng'];
  const isCEO = currentUser?.role === 'CEO';
  // Phòng HDV bị ẩn giá: bỏ luôn các tab thuần về giá/tài chính & thẻ giá ở header.
  const hidePrice = !canSeePrices(currentUser);
  const PRICE_ONLY_VIEWS = new Set<QuoteViewKey>(['summary', 'dashboard', 'payboard', 'payment', 'settlement']);
  // Mở app Chương trình tour / Thực đơn (template riêng) từ dropdown Vận hành.
  const gotoApp = (tpl: 'itinerary' | 'menu' | 'guideschedule') => {
    const what = tpl === 'itinerary' ? 'Chương trình tour' : tpl === 'menu' ? 'Thực đơn' : 'Lịch đi tour HDV';
    if (!window.confirm(`Rời báo giá để mở ${what}? Thay đổi chưa lưu của báo giá có thể mất.`)) return;
    useQuoteStore.setState((s) => ({ draft: { ...s.draft, template: tpl }, view: 'cost' }));
  };
  const item = (v: QuoteViewKey, label: string, icon?: ReactNode) => ({ v, label, icon });

  // ── Thanh điều hướng tùy biến theo user ──
  // Catalog = mọi mục khả dụng (đã lọc quyền) + container mặc định + id ổn định.
  type CatItem = NavCatalogEntry & { label: string; icon?: ReactNode; v?: QuoteViewKey; action?: () => void };
  const GROUP_ICONS: Record<GroupId, ReactNode> = {
    'grp:sales': <StorefrontOutlinedIcon />,
    'grp:ops': <EngineeringOutlinedIcon />,
    'grp:catalog': <CategoryOutlinedIcon />,
  };
  const cat = (id: string, container: PlaceableContainer, label: string, opts: Partial<CatItem> = {}): CatItem =>
    ({ id, container, label, ...opts });
  const navCatalog: CatItem[] = isDMC ? [] : (() => {
    const c: CatItem[] = [
      cat('home', 'top', 'Hôm nay', { v: 'home', icon: <TodayOutlinedIcon /> }),
      cat('cockpit', 'top', 'Hồ sơ tour', { v: 'cockpit', icon: <RouteOutlinedIcon /> }),
      cat('cost', 'top', 'Báo giá', { v: 'cost', icon: <RequestQuoteOutlinedIcon /> }),
      cat('history', 'top', 'Lịch sử', { v: 'history', icon: <HistoryIcon /> }),
      cat('summary', 'grp:sales', 'Tổng kết', { v: 'summary' }),
      cat('payboard', 'grp:sales', 'Công nợ tổng', { v: 'payboard' }),
      cat('payment', 'grp:sales', 'Quản lý thanh toán', { v: 'payment' }),
      cat('dashboard', 'grp:sales', 'Dashboard bán hàng', { v: 'dashboard' }),
      ...(isCEO ? [
        cat('execboard', 'grp:sales', 'Tổng quan điều hành', { v: 'execboard' }),
        cat('pipeline', 'grp:sales', 'Pipeline bán hàng', { v: 'pipeline' }),
        cat('salesanalytics', 'grp:sales', 'Phân tích bán hàng', { v: 'salesanalytics' }),
      ] : []),
      cat('todo', 'grp:ops', 'Việc cần làm', { v: 'todo' }),
      cat('workflow', 'grp:ops', 'Quy trình điều hành', { v: 'workflow' }),
      cat('passengers', 'grp:ops', 'Khách đoàn', { v: 'passengers' }),
      cat('opsboard', 'grp:ops', 'Điều phối', { v: 'opsboard' }),
      cat('departures', 'grp:ops', 'Lịch khởi hành', { v: 'departures' }),
      cat('flights', 'grp:ops', 'Chuyến bay', { v: 'flights' }),
      cat('flightsearch', 'grp:ops', 'Tìm chuyến bay', { v: 'flightsearch', icon: <TravelExploreOutlinedIcon /> }),
      // Visa của tour: chỉ báo giá nước ngoài.
      ...(template === 'intl' ? [cat('tourvisa', 'grp:ops', 'Visa của tour', { v: 'tourvisa', icon: <BadgeOutlinedIcon /> })] : []),
      ...(isMgr ? [cat('audit', 'grp:ops', 'Nhật ký', { v: 'audit' })] : []),
      cat('app:itinerary', 'grp:ops', 'Chương trình tour', { icon: <RouteOutlinedIcon />, action: () => gotoApp('itinerary') }),
      cat('app:menu', 'grp:ops', 'Thực đơn', { icon: <RestaurantMenuOutlinedIcon />, action: () => gotoApp('menu') }),
      cat('app:guideschedule', 'grp:ops', 'Lịch đi tour HDV', { icon: <ConnectingAirportsOutlinedIcon />, action: () => gotoApp('guideschedule') }),
      cat('advsettle', 'grp:catalog', 'Tạm ứng - Quyết toán', { v: 'advsettle' }),
      ...(canContract ? [cat('contract', 'grp:catalog', 'Hợp đồng', { v: 'contract' })] : []),
      ...(canNcc ? [cat('nccProducts', 'grp:catalog', 'Sản phẩm NCC', { v: 'nccProducts' })] : []),
    ];
    // Phòng HDV ẩn giá: loại hẳn các view thuần tài chính khỏi catalog.
    return hidePrice ? c.filter((it) => !(it.v && PRICE_ONLY_VIEWS.has(it.v))) : c;
  })();

  const navLayout: NavLayout = reconcileLayout(navCatalog, navRaw);
  const navLabels: Record<string, string> = Object.fromEntries(navCatalog.map((c) => [c.id, c.label] as const));

  // Dựng NavNode[] từ layout: tab phẳng (top) trước, rồi các nhóm theo thứ tự cố định.
  const NAV: NavNode[] = (() => {
    if (isDMC) return [item('cost', 'Breakdown', <BarChartOutlinedIcon />), item('history', 'Lịch sử', <HistoryIcon />)];
    const byId = new Map(navCatalog.map((c) => [c.id, c]));
    const toItem = (id: string): NavItem | null => {
      const c = byId.get(id);
      return c ? { v: c.v, label: c.label, icon: c.icon, action: c.action } : null;
    };
    const nodes: NavNode[] = navLayout.top.map(toItem).filter((x): x is NavItem => !!x);
    for (const gid of GROUP_IDS) {
      const items = navLayout[gid].map(toItem).filter((x): x is NavItem => !!x);
      if (items.length) nodes.push({ group: GROUP_LABELS[gid], icon: GROUP_ICONS[gid], items });
    }
    return nodes;
  })();

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
          {/* COL1: template badge (logo Về Trang chủ giờ nằm ở header chung — AppShell). */}
          <Stack alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>
            {tpl && template && (() => { const Ic = TPL_ACCENT[template].Icon; return (
              <Stack direction="row" alignItems="center" spacing={0.6} sx={{
                background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.35)',
                borderRadius: 5, px: 1.25, py: 0.4, fontSize: 10, fontWeight: 800,
                letterSpacing: 1, textTransform: 'uppercase', whiteSpace: 'nowrap',
                '& svg': { fontSize: 14 },
              }}>
                <Ic />
                <span>{tpl.label}</span>
              </Stack>
            ); })()}
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
              <HeaderPill icon={<CalendarMonthOutlinedIcon />}>
                <WhiteNum value={info.days} min={1} onChange={(v) => patchInfo({ days: v, nights: Math.max(0, v - 1) })} />
                <Typography component="span" sx={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>ngày</Typography>
              </HeaderPill>
              <HeaderPill icon={<DarkModeOutlinedIcon />}>
                <WhiteNum value={info.nights} min={0} onChange={(v) => patchInfo({ nights: v })} />
                <Typography component="span" sx={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>đêm</Typography>
              </HeaderPill>
              <HeaderPill icon={<GroupsOutlinedIcon />}>
                <WhiteNum value={pax} min={1} onChange={(v) => setPax(v)} />
                <Typography component="span" sx={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>khách</Typography>
              </HeaderPill>
              <HeaderPill icon={<FlightTakeoffOutlinedIcon />}>
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
            ? <NavGroup key={`g${i}`} label={n.group} icon={n.icon} items={n.items} view={view} onSelect={(v) => setView(v)} />
            : <NavTab key={n.v ?? n.label} label={n.label} icon={n.icon} active={view === n.v}
                badge={n.v === 'home' ? homeBadge : undefined}
                onClick={() => { if (n.action) n.action(); else if (n.v) setView(n.v); }} />
          ))}
        </Box>
        <Box sx={{ flexGrow: 1 }} />

        {/* Rate Card dropdown (legacy "📋 Rate Card") */}
        <Tooltip title="Rate Card">
          <IconButton size="small" onClick={(e) => setRateAnchor(e.currentTarget)}
            sx={{ color: '#d18a13', border: '1px solid rgba(245,166,35,0.5)', borderRadius: 1.5, px: 0.75,
              '&:hover': { borderColor: '#d18a13', background: 'rgba(245,166,35,0.08)' } }}>
            <ListAltOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Menu anchorEl={rateAnchor} open={!!rateAnchor} onClose={() => setRateAnchor(null)} disableRestoreFocus>
          {RATE_CATEGORIES.filter((c) => isRateCategoryVisible(c.key, template)).map((c) => (
            <MenuItem key={c.key} onClick={() => openRate(c.key, c.label)}>
              <Box component="span" sx={{ mr: 1 }}>{c.icon}</Box> {c.label}
            </MenuItem>
          ))}
        </Menu>

        <Tooltip title={template === 'domestic' || template === 'intl' ? 'Tạo báo giá và tour mới' : 'Báo giá mới'}>
          <IconButton size="small"
            onClick={template === 'domestic' || template === 'intl' ? onOpenNewQuote : onOpenSelector}
            sx={{ border: '1px solid rgba(20,150,140,0.4)', borderRadius: 1.5, color: '#0d7a6a' }}>
            <AddCircleOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {/* Reset báo giá: xoá hết hạng mục & đơn giá của báo giá đang mở (totals = 0). */}
        {(template === 'domestic' || template === 'intl' || isDMC) && (
          <Tooltip title="Reset báo giá (xoá hết hạng mục & đơn giá về 0)">
            <IconButton size="small"
              onClick={() => {
                if (window.confirm('Xoá HẾT hạng mục & đơn giá của báo giá đang mở? Tất cả về 0.\n(Có thể hoàn tác bằng Hoàn tác/Ctrl+Z.)')) {
                  clearItems();
                }
              }}
              sx={{ border: '1px solid rgba(220,50,80,0.4)', borderRadius: 1.5, color: '#dc3250' }}>
              <LayersClearOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {/* Share to customer (regular quotes only) */}
        {canExport && (
          <Tooltip title="Chia sẻ báo giá cho khách (link)">
            <IconButton size="small" onClick={() => setShareOpen(true)}
              sx={{ border: '1px solid rgba(3,105,161,0.4)', borderRadius: 1.5, color: '#0369a1' }}>
              <ShareOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {/* Tạo việc (To-Do) gắn link báo giá đang mở */}
        {canExport && (
          <Tooltip title="Tạo việc cần làm (gắn báo giá này)">
            <IconButton size="small" onClick={openTodo}
              sx={{ border: '1px solid rgba(142,68,173,0.4)', borderRadius: 1.5, color: '#8e44ad' }}>
              <AddTaskOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
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
        <Tooltip title="Trạng thái báo giá">
          <Button
            size="small" variant="contained"
            onClick={(e) => setStatusAnchor(e.currentTarget)}
            endIcon={<ExpandMoreIcon />}
            sx={{
              fontWeight: 700, fontSize: 12, textTransform: 'none', lineHeight: 1.4,
              py: 0.25, px: 1, minWidth: 0, color: '#fff', bgcolor: QUOTE_STATUS_META[status].color,
              '& .MuiButton-endIcon': { ml: 0.2 }, '& .MuiButton-endIcon svg': { fontSize: 16 },
              '&:hover': { bgcolor: QUOTE_STATUS_META[status].color, filter: 'brightness(0.93)' },
            }}
          >
            ● {QUOTE_STATUS_META[status].short}
          </Button>
        </Tooltip>
        <Menu anchorEl={statusAnchor} open={!!statusAnchor} onClose={() => setStatusAnchor(null)}>
          {QUOTE_STATUS_ORDER.map((st: QuoteStatus) => (
            <MenuItem
              key={st} selected={st === status}
              onClick={() => {
                if (LOSS_STATUSES.includes(st)) {
                  setLossPending(st);
                } else setStatus(st);
                setStatusAnchor(null);
              }}
              sx={{ fontWeight: 700, color: QUOTE_STATUS_META[st].color }}
            >
              ● {QUOTE_STATUS_META[st].label}
            </MenuItem>
          ))}
        </Menu>
        <LossReasonDialog
          open={!!lossPending}
          current={draft.lossReason}
          onClose={() => setLossPending(null)}
          onConfirm={(reason) => { if (lossPending) setStatus(lossPending, reason); setLossPending(null); }}
        />
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
        {currentQuoteId && (
          <Tooltip title="Lịch sử phiên bản (các lần lưu trước)">
            <IconButton size="small" onClick={(e) => { e.currentTarget.blur(); setVersionsOpen(true); }}
              sx={{ border: '1px solid rgba(15,58,74,0.25)', borderRadius: 1.5, color: '#0f3a4a' }}>
              <HistoryIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Liên kết">
          <IconButton size="small" onClick={(e) => { e.currentTarget.blur(); setLinksOpen(true); }}
            sx={{ border: '1px solid rgba(15,58,74,0.25)', borderRadius: 1.5 }}>
            <Box component="span" sx={{ fontSize: 15 }}>🔗</Box>
          </IconButton>
        </Tooltip>
      </Toolbar>

      {/* Bản in ẩn (chụp ảnh để xuất PDF). Bọc trong khung 0×0 + overflow:hidden:
          AppBar có `backdrop-filter` nên trở thành containing block của phần tử
          `position: fixed` này → nếu để khung cao thật, bản in sẽ cộng vào chiều cao
          cuộn của trang và sinh khoảng trắng cuộn thừa. Khung 0×0 cắt hết nội dung
          khỏi luồng cuộn; html2canvas vẫn chụp đúng vì đọc thẳng node bản in bên trong. */}
      {template && template !== 'dmc' && currentUser && (
        <Box sx={{ position: 'fixed', left: -99999, top: 0, width: 0, height: 0, overflow: 'hidden', zIndex: -1, pointerEvents: 'none' }} aria-hidden>
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

      <QuoteLinksModal open={linksOpen} onClose={() => setLinksOpen(false)} />
      <VersionHistoryModal open={versionsOpen} onClose={() => setVersionsOpen(false)} />

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
      {shareOpen && <SharePublicQuoteModal open={shareOpen} onClose={() => setShareOpen(false)} />}
      {todoPrefill && <TodoModal todo={null} prefill={todoPrefill} onClose={() => setTodoPrefill(null)} />}

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
      {navCustomizeOpen && !isDMC && (
        <NavCustomizeModal
          open
          onClose={() => setNavCustomizeOpen(false)}
          catalog={navCatalog}
          labels={navLabels}
          layout={navLayout}
          onChange={(l) => useNavPrefStore.getState().save(username, l)}
          onReset={() => useNavPrefStore.getState().reset(username)}
        />
      )}
    </AppBar>
  );
}
