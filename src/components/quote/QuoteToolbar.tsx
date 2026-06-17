import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  AppBar, Box, Button, Divider, ListItemIcon, ListItemText, Menu, MenuItem,
  Stack, Tab, Tabs, TextField, Toolbar, Tooltip, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
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
import { exportExcelQuote } from '@/lib/exports/exportExcel';
import { importExcelQuote } from '@/lib/exports/importExcel';
import { exportPDFQuote } from '@/lib/exports/exportPDF';
import { exportDMCPDF } from '@/lib/exports/exportDMCPDF';
import { exportPDFImage } from '@/lib/exports/exportPDFImage';
import { emptyContract } from '@/components/contract/constants';
import { QuotePrintable } from './QuotePrintable';
import { FxRatesPanel } from './FxRatesPanel';
import { QuoteLinksModal } from './QuoteLinksModal';
import { ContractInfoModal } from './ContractInfoModal';
import { useAuthStore } from '@/stores/authStore';
import { hasPerm } from '@/auth/PERMISSIONS';
import { ROLE_RANK } from '@/auth/ROLES';
import { fmtOutput } from '@/lib/currency';
import { useUndoRedoShortcuts } from '@/lib/useUndoRedoShortcuts';
import { UndoRedoButtons } from '@/components/common/UndoRedoButtons';
import { computeTotals, fmtVND } from './calc';
import { InvoiceModal } from './InvoiceModal';
import { HotelModal } from '@/components/rates/HotelModal';
import { VisaModal } from '@/components/rates/VisaModal';
import { RateCardModal } from '@/components/rates/RateCardModal';
import { RATE_CATEGORIES, isRateCategoryVisible } from '@/components/rates/constants';
import { TEMPLATES, QUOTE_STATUS_META, QUOTE_STATUS_ORDER } from './constants';
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

/** Translucent "glass pill" used in the teal header band (legacy style). */
function HeaderPill({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <Stack
      direction="row" alignItems="center" spacing={0.75}
      sx={{ background: 'rgba(255,255,255,0.12)', borderRadius: 1.25, px: 1.5, py: 0.6 }}
    >
      <Box component="span" sx={{ opacity: 0.8, fontSize: 13 }}>{icon}</Box>
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
        htmlInput: { min, style: { width: 34, color: '#fff', fontWeight: 800, fontSize: 15, textAlign: 'center', padding: 0 } },
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
      else alert('✅ Nhập báo giá thành công!');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = await importExcelQuote(file);
      applyImport(data);
      alert('✅ Đã nhập báo giá từ Excel!');
    } catch (err) {
      alert('❌ ' + (err as Error).message);
    }
  };

  const runPDFImage = async (node: HTMLElement | null, prefix: string) => {
    if (!node || !template || template === 'dmc') return;
    const safe = (info.name || 'Tour').replace(/[^a-zA-Z0-9_À-ỹ]/g, '_');
    const dateStr = new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');
    try {
      await exportPDFImage(node, `${prefix}_${safe}_${dateStr}.pdf`);
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
  const heroBtnSx = {
    color: '#fff', textTransform: 'none', fontSize: 12.5, fontWeight: 700,
    background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 1.25, px: 1.5, py: 0.4, minWidth: 0,
    '&:hover': { background: 'rgba(255,255,255,0.26)' },
  } as const;

  // Unified nav tabs (legacy order + icons). DMC shows only Breakdown + history.
  const canContract = hasPerm(currentUser, 'manageContracts') || hasPerm(currentUser, 'viewContracts');
  const TAB_DEFS: { v: QuoteViewKey; label: string }[] = isDMC
    ? [
        { v: 'cost', label: '📊 Bảng chi phí Breakdown' },
        { v: 'history', label: '🕐 Lịch sử Breakdown' },
      ]
    : [
        { v: 'cost', label: '📊 Bảng báo giá' },
        { v: 'summary', label: '💰 Tổng kết & Định giá' },
        { v: 'dashboard', label: '📈 Dashboard biên lợi' },
        { v: 'payment', label: '🧾 Quản lý thanh toán' },
        { v: 'workflow', label: '🗂️ Quy trình vận hành' },
        { v: 'pipeline', label: '🧲 Pipeline' },
        { v: 'opsboard', label: '🧭 Điều phối' },
        { v: 'departures', label: '📅 Lịch khởi hành' },
        { v: 'payboard', label: '💰 Công nợ tổng' },
        { v: 'flights', label: '✈️ Chuyến bay' },
        { v: 'history', label: '🕐 Lịch sử báo giá' },
        ...(canContract ? [{ v: 'contract' as QuoteViewKey, label: '📜 Hợp đồng' }] : []),
        ...(hasPerm(currentUser, 'manageCustomers') ? [{ v: 'customer' as QuoteViewKey, label: '👥 Khách hàng' }] : []),
        ...(hasPerm(currentUser, 'manageNCC') ? [{ v: 'ncc' as QuoteViewKey, label: '🏢 Nhà Cung Cấp' }] : []),
        ...(hasPerm(currentUser, 'manageNCC') ? [{ v: 'nccProducts' as QuoteViewKey, label: '📦 Sản phẩm NCC' }] : []),
        ...(currentUser && ROLE_RANK[currentUser.role] >= ROLE_RANK['Trưởng Phòng'] ? [{ v: 'audit' as QuoteViewKey, label: '📋 Nhật ký' }] : []),
      ];
  const tabValue = TAB_DEFS.some((t) => t.v === view) ? view : false;

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
          {/* COL1: logo + template badge (legacy hero) */}
          <Stack alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>
            <Box component="img" src={VTE_LOGO} alt="Viettours" sx={{ height: 42, width: 'auto', display: 'block', filter: 'brightness(0) invert(1)' }} />
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
            <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap rowGap={1}>
              <HeaderPill icon="🗓️">
                <WhiteNum value={info.days} min={1} onChange={(v) => patchInfo({ days: v, nights: Math.max(0, v - 1) })} />
                <Typography component="span" sx={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>ngày</Typography>
              </HeaderPill>
              <HeaderPill icon="🌙">
                <WhiteNum value={info.nights} min={0} onChange={(v) => patchInfo({ nights: v })} />
                <Typography component="span" sx={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>đêm</Typography>
              </HeaderPill>
              <HeaderPill icon="👥">
                <WhiteNum value={pax} min={1} onChange={(v) => setPax(v)} />
                <Typography component="span" sx={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>khách</Typography>
              </HeaderPill>
              <HeaderPill icon="🚀">
                <Box
                  component="input" type="date" value={info.startDate ?? ''}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => patchInfo({ startDate: e.target.value || null })}
                  sx={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none', colorScheme: 'dark', fontWeight: 600 }}
                />
              </HeaderPill>
              {info.startDate && (
                <Typography sx={{ color: LEGACY.gold, fontSize: 13, fontWeight: 600 }}>→ {endDateStr}</Typography>
              )}

              {/* Action: Trang chủ */}
              <Button onClick={onOpenSelector} startIcon={<ArrowBackIcon />} sx={heroBtnSx}>
                Trang chủ
              </Button>
            </Stack>
          </Stack>

          <Box sx={{ flexGrow: 1 }} />

          {/* RIGHT: price summary cards */}
          {isDMC ? (
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

      {/* ── Unified nav tab bar (legacy style: icons, underline, spacious) ── */}
      <Tabs
        value={tabValue}
        onChange={(_, v) => setView(v as QuoteViewKey)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          px: 2,
          minHeight: 48,
          borderBottom: '1px solid rgba(20,150,140,0.12)',
          '& .MuiTab-root': {
            textTransform: 'none',
            fontSize: 14,
            fontWeight: 600,
            minHeight: 48,
            px: 2.25,
            color: 'rgba(15,58,74,0.6)',
          },
          '& .MuiTab-root.Mui-selected': { color: LEGACY.teal, fontWeight: 800 },
          '& .MuiTabs-indicator': {
            height: 3,
            borderRadius: '3px 3px 0 0',
            backgroundColor: LEGACY.teal,
          },
        }}
      >
        {TAB_DEFS.map((t) => (
          <Tab key={t.v} value={t.v} label={t.label} />
        ))}
      </Tabs>

      <Toolbar sx={{ flexWrap: 'wrap', gap: 1.5, py: 1, minHeight: 'auto' }}>
        <Box sx={{ flexGrow: 1 }} />

        {/* Rate Card dropdown (legacy "📋 Rate Card") */}
        <Button
          size="small" variant="outlined"
          startIcon={<Box component="span">📋</Box>}
          endIcon={<ExpandMoreIcon />}
          onClick={(e) => setRateAnchor(e.currentTarget)}
          sx={{
            color: '#d18a13', borderColor: 'rgba(245,166,35,0.5)',
            '&:hover': { borderColor: '#d18a13', background: 'rgba(245,166,35,0.08)' },
          }}
        >
          Rate Card
        </Button>
        <Menu anchorEl={rateAnchor} open={!!rateAnchor} onClose={() => setRateAnchor(null)} disableRestoreFocus>
          {RATE_CATEGORIES.filter((c) => isRateCategoryVisible(c.key, template)).map((c) => (
            <MenuItem key={c.key} onClick={() => openRate(c.key, c.label)}>
              <Box component="span" sx={{ mr: 1 }}>{c.icon}</Box> {c.label}
            </MenuItem>
          ))}
        </Menu>

        <Button size="small" variant="outlined" startIcon={<AddCircleOutlineIcon />} onClick={onOpenSelector}>
          Báo giá mới
        </Button>
        {/* Export dropdown */}
        <Button
          size="small"
          variant="outlined"
          startIcon={<FileDownloadIcon />}
          endIcon={<ExpandMoreIcon />}
          onClick={(e) => setExportAnchor(e.currentTarget)}
        >
          Xuất
        </Button>
        <Menu
          anchorEl={exportAnchor}
          open={!!exportAnchor}
          onClose={() => setExportAnchor(null)}
          disableRestoreFocus
          slotProps={{ paper: { sx: { minWidth: 268, borderRadius: 2, mt: 0.5, boxShadow: '0 12px 30px rgba(15,58,74,0.18)', '& .MuiMenuItem-root': { py: 1, fontWeight: 600, color: LEGACY.navy }, '& .MuiListItemIcon-root': { color: LEGACY.teal, minWidth: 34 } } } }}
        >
          {/* Excel & data files */}
          <MenuItem onClick={() => {
            if (template && currentUser) void exportExcelQuote({ draft, savedBy: { name: currentUser.name, role: currentUser.role } });
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
              if (currentUser) exportDMCPDF({ draft, savedBy: { name: currentUser.name, role: currentUser.role, email: currentUser.email, phone: currentUser.phone } });
              setExportAnchor(null);
            }}>
              <ListItemIcon><PictureAsPdfIcon fontSize="small" /></ListItemIcon>
              <ListItemText>PDF breakdown DMC</ListItemText>
            </MenuItem>
          ) : (
            <>
              <MenuItem onClick={() => { void handleExportPDFImage(); setExportAnchor(null); }}>
                <ListItemIcon><ImageIcon fontSize="small" /></ListItemIcon>
                <ListItemText>PDF Ảnh</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => { void handleExportPDFImagePkg(); setExportAnchor(null); }}>
                <ListItemIcon><PhotoLibraryIcon fontSize="small" /></ListItemIcon>
                <ListItemText>PDF Ảnh (Tour trọn gói)</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => {
                if (canExport && currentUser) exportPDFQuote({ draft, savedBy: { name: currentUser.name, role: currentUser.role, email: currentUser.email, phone: currentUser.phone } });
                setExportAnchor(null);
              }}>
                <ListItemIcon><PictureAsPdfIcon fontSize="small" /></ListItemIcon>
                <ListItemText>PDF Báo Giá</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => {
                if (canExport && currentUser) exportPDFQuote({ draft, savedBy: { name: currentUser.name, role: currentUser.role, email: currentUser.email, phone: currentUser.phone }, mode: 'package' });
                setExportAnchor(null);
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
              onClick={() => { setStatus(st); setStatusAnchor(null); }}
              sx={{ fontWeight: 700, color: QUOTE_STATUS_META[st].color }}
            >
              ● {QUOTE_STATUS_META[st].label}
            </MenuItem>
          ))}
        </Menu>
        <UndoRedoButtons undo={undoDraft} redo={redoDraft} canUndo={canUndo} canRedo={canRedo} />
        <Button
          size="small" variant="contained" startIcon={<CloudUploadIcon />}
          // Blur first so the trigger isn't a focused descendant of #root when the
          // dialog applies aria-hidden (avoids the a11y "aria-hidden on focused" warning).
          onClick={(e) => { e.currentTarget.blur(); onOpenSaveCloud(); }}
          sx={{ fontWeight: 800, background: LEGACY.headerGradient }}
        >
          Lưu
        </Button>
        <Button
          size="small" variant="outlined" startIcon={<span>🔗</span>}
          onClick={(e) => { e.currentTarget.blur(); setLinksOpen(true); }}
          sx={{ fontWeight: 700 }}
        >
          Liên kết
        </Button>
      </Toolbar>

      <QuoteLinksModal open={linksOpen} onClose={() => setLinksOpen(false)} />

      {(template === 'domestic' || template === 'intl' || template === 'dmc') && (
        <Box sx={{ mx: 2, mb: 1.5 }}>
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
