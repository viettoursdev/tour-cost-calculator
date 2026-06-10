import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  AppBar, Box, Button, Chip, Divider, ListItemIcon, ListItemText, Menu, MenuItem,
  Stack, TextField, ToggleButton, ToggleButtonGroup, Toolbar, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import TableChartIcon from '@mui/icons-material/TableChart';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { useQuoteStore } from '@/stores/quoteStore';
import { exportExcelQuote } from '@/lib/exports/exportExcel';
import { exportPDFQuote } from '@/lib/exports/exportPDF';
import { useAuthStore } from '@/stores/authStore';
import { fmtOutput } from '@/lib/currency';
import { computeTotals, fmtVND } from './calc';
import { InvoiceModal } from './InvoiceModal';
import { HotelModal } from '@/components/rates/HotelModal';
import { VisaModal } from '@/components/rates/VisaModal';
import { RateCardModal } from '@/components/rates/RateCardModal';
import { RATE_CATEGORIES, isRateCategoryVisible } from '@/components/rates/constants';
import { LEGACY } from '@/theme';
import type { OutputCurrency } from '@/types';

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
  const setRate = useQuoteStore((s) => s.setRate);
  const setView = useQuoteStore((s) => s.setView);
  const exportJSON = useQuoteStore((s) => s.exportJSON);
  const importJSON = useQuoteStore((s) => s.importJSON);

  const template = useQuoteStore((s) => s.draft.template);
  const outputCurrency = (useQuoteStore((s) => s.draft.outputCurrency) ?? 'USD') as OutputCurrency;

  const draft = useQuoteStore((s) => s.draft);
  const currentUser = useAuthStore((s) => s.currentUser);

  const isDMC = template === 'dmc';
  const totals = computeTotals(draft);
  const totalCost = totals.totalCost;

  const [showRates, setShowRates] = useState(false);
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);
  const [rateAnchor, setRateAnchor] = useState<HTMLElement | null>(null);
  const [rateModal, setRateModal] = useState<RateModalState>({ kind: 'none' });
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const openRate = (key: string, label: string) => {
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

  const endDateStr = (() => {
    if (!info.startDate) return '';
    const d = new Date(info.startDate);
    d.setDate(d.getDate() + Math.max(0, info.days - 1));
    return d.toLocaleDateString('vi-VN');
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
      <Box sx={{ background: LEGACY.headerGradient, color: '#fff', px: 3, py: 1.5 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap rowGap={1.25}>
          {/* LEFT: tour info (name/dest + meta pills) */}
          <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap" useFlexGap rowGap={1.25}>
            {/* Tour name → destination */}
            <Stack direction="row" alignItems="center" spacing={1.25} sx={{ flexWrap: 'wrap', minWidth: 200 }}>
              <TextField
                variant="standard" value={info.name}
                onChange={(e) => patchInfo({ name: e.target.value })}
                placeholder="Tên báo giá..."
                slotProps={{ input: { disableUnderline: true } }}
                sx={{ '& input': { color: '#fff', fontSize: 20, fontWeight: 900, p: 0, '&::placeholder': { color: 'rgba(255,255,255,0.6)', opacity: 1 } } }}
              />
              <Box sx={{ color: 'rgba(255,255,255,0.45)', fontSize: 18 }}>→</Box>
              <TextField
                variant="standard" value={info.dest}
                onChange={(e) => patchInfo({ dest: e.target.value })}
                placeholder="Điểm đến..."
                slotProps={{ input: { disableUnderline: true } }}
                sx={{ '& input': { color: LEGACY.gold, fontSize: 15, fontWeight: 700, p: 0, '&::placeholder': { color: 'rgba(255,224,130,0.6)', opacity: 1 } } }}
              />
            </Stack>

            {/* Meta pills */}
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
                <Typography color="#8e44ad" fontSize={11} fontWeight={800} letterSpacing={0.5} textTransform="uppercase" mb={0.25}>📊 Per pax</Typography>
                <Typography color="#8e44ad" fontWeight={900} fontSize={22} lineHeight={1}>
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

      <Toolbar sx={{ flexWrap: 'wrap', gap: 1.5, py: 1 }}>
        <ToggleButtonGroup
          size="small" exclusive value={view}
          onChange={(_, v) => v && setView(v)}
          sx={{
            '& .MuiToggleButton-root.Mui-selected': {
              background: LEGACY.headerGradient,
              color: '#fff',
              '&:hover': { background: LEGACY.headerGradient },
            },
          }}
        >
          <ToggleButton value="cost">{isDMC ? 'Breakdown' : 'Chi phí'}</ToggleButton>
          {!isDMC && <ToggleButton value="summary">Tổng kết &amp; Định giá</ToggleButton>}
          {!isDMC && <ToggleButton value="dashboard">Dashboard</ToggleButton>}
          {!isDMC && <ToggleButton value="payment">Thanh toán</ToggleButton>}
          <ToggleButton value="history">Lịch sử</ToggleButton>
        </ToggleButtonGroup>

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
        <Menu anchorEl={rateAnchor} open={!!rateAnchor} onClose={() => setRateAnchor(null)}>
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
        >
          <MenuItem onClick={() => {
            if (draft.template && draft.template !== 'dmc' && currentUser) {
              void exportExcelQuote({ draft, savedBy: { name: currentUser.name, role: currentUser.role } });
            }
            setExportAnchor(null);
          }}>
            <ListItemIcon><TableChartIcon fontSize="small" /></ListItemIcon>
            <ListItemText>📊 Excel báo giá</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => {
            if (draft.template && draft.template !== 'dmc' && currentUser) {
              exportPDFQuote({ draft, savedBy: { name: currentUser.name, role: currentUser.role } });
            }
            setExportAnchor(null);
          }}>
            <ListItemIcon><PictureAsPdfIcon fontSize="small" /></ListItemIcon>
            <ListItemText>📄 PDF báo giá</ListItemText>
          </MenuItem>
          {draft.template && draft.template !== 'dmc' && currentUser && (
            <MenuItem onClick={() => { setInvoiceOpen(true); setExportAnchor(null); }}>
              <ListItemIcon><ReceiptLongIcon fontSize="small" /></ListItemIcon>
              <ListItemText>🧾 Invoice</ListItemText>
            </MenuItem>
          )}
          <Divider />
          <MenuItem onClick={() => { handleExport(); setExportAnchor(null); }}>
            <ListItemIcon><FileDownloadIcon fontSize="small" /></ListItemIcon>
            <ListItemText>📋 JSON (backup)</ListItemText>
          </MenuItem>
        </Menu>
        <Button size="small" variant="outlined" startIcon={<FileUploadIcon />} onClick={handleImportClick}>
          Nhập JSON
        </Button>
        <input
          ref={fileInput} type="file" accept="application/json"
          hidden onChange={handleImportFile}
        />
        <Button
          size="small" variant="contained" startIcon={<CloudUploadIcon />} onClick={onOpenSaveCloud}
          sx={{ fontWeight: 800, background: LEGACY.headerGradient }}
        >
          Lưu
        </Button>
      </Toolbar>

      <Box sx={{ px: 2, pb: 1 }}>
        <Button
          size="small"
          startIcon={showRates ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          onClick={() => setShowRates((v) => !v)}
        >
          💱 Tỷ giá quy đổi (→ VND)
        </Button>
        {showRates && (
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }} useFlexGap>
            {Object.entries(rates)
              .filter(([c]) => c !== 'VND')
              .map(([c, r]) => (
                <Chip
                  key={c}
                  variant="outlined"
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="caption" fontWeight={700}>1 {c}</Typography>
                      <TextField
                        size="small" type="number" value={r}
                        onChange={(e) => setRate(c, Number(e.target.value) || 0)}
                        slotProps={{ htmlInput: { min: 0, step: 0.01, style: { width: 90 } } }}
                        variant="standard"
                      />
                      <Typography variant="caption">₫</Typography>
                    </Box>
                  }
                  sx={{ height: 'auto', py: 0.5 }}
                />
              ))}
          </Stack>
        )}
      </Box>
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
