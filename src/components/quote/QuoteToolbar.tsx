import { useRef, useState } from 'react';
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
import { useQuoteStore } from '@/stores/quoteStore';
import { exportExcelQuote } from '@/lib/exports/exportExcel';
import { exportPDFQuote } from '@/lib/exports/exportPDF';
import { useAuthStore } from '@/stores/authStore';
import { fmtOutput } from '@/lib/currency';
import { computeTotals } from './calc';
import type { OutputCurrency } from '@/types';

type Props = {
  onOpenSelector: () => void;
  onOpenSaveCloud: () => void;
};

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
  const totalCost = computeTotals(draft).totalCost;

  const [showRates, setShowRates] = useState(false);
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

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

  return (
    <AppBar position="sticky" color="default" elevation={1}>
      <Toolbar sx={{ flexWrap: 'wrap', gap: 2, py: 1 }}>
        <TextField
          size="small" label="Tên báo giá" value={info.name}
          onChange={(e) => patchInfo({ name: e.target.value })}
          sx={{ minWidth: 220 }}
        />
        <TextField
          size="small" label="Điểm đến" value={info.dest}
          onChange={(e) => patchInfo({ dest: e.target.value })}
          sx={{ minWidth: 180 }}
        />
        <TextField
          size="small" label="Số ngày" type="number" value={info.days}
          onChange={(e) => patchInfo({ days: Math.max(1, Number(e.target.value) || 1) })}
          slotProps={{ htmlInput: { min: 1, style: { width: 60 } } }}
        />
        <TextField
          size="small" label="Số đêm" type="number" value={info.nights}
          onChange={(e) => patchInfo({ nights: Math.max(0, Number(e.target.value) || 0) })}
          slotProps={{ htmlInput: { min: 0, style: { width: 60 } } }}
        />
        <TextField
          size="small" label="Ngày khởi hành" type="date"
          value={info.startDate ?? ''}
          onChange={(e) => patchInfo({ startDate: e.target.value || null })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          size="small" label="Khách (pax)" type="number" value={pax}
          onChange={(e) => setPax(Math.max(1, Number(e.target.value) || 1))}
          slotProps={{ htmlInput: { min: 1, style: { width: 70 } } }}
        />

        <Box sx={{ flexGrow: 1 }} />

        {isDMC && (
          <Stack direction="row" gap={1.25} alignItems="stretch">
            <Box
              sx={{
                background: 'rgba(255,255,255,0.13)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 1.75,
                px: 2.5, py: 1.5,
                textAlign: 'right',
                minWidth: 150,
              }}
            >
              <Typography color="rgba(255,255,255,0.65)" fontSize={11} fontWeight={600} letterSpacing={0.5} mb={0.5}>
                Tổng breakdown
              </Typography>
              <Typography color="#ffe082" fontWeight={800} fontSize={20}>
                {fmtOutput(totalCost, outputCurrency, rates)}
              </Typography>
            </Box>
            <Box
              sx={{
                background: 'linear-gradient(135deg, #fff 0%, #fff8e1 100%)',
                borderRadius: 1.75,
                px: 2.5, py: 1.5,
                textAlign: 'right',
                minWidth: 180,
                boxShadow: '0 6px 20px rgba(0,0,0,0.2)',
              }}
            >
              <Typography color="#8e44ad" fontSize={11} fontWeight={800} letterSpacing={1} textTransform="uppercase" mb={0.5}>
                📊 Per pax
              </Typography>
              <Typography color="#8e44ad" fontWeight={900} fontSize={24} lineHeight={1}>
                {pax > 0 ? fmtOutput(totalCost / pax, outputCurrency, rates) : '–'}
              </Typography>
              <Typography color="rgba(15,58,74,0.45)" fontSize={11} mt={0.5}>
                {pax} khách · {outputCurrency}
              </Typography>
            </Box>
          </Stack>
        )}

        <ToggleButtonGroup
          size="small" exclusive value={view}
          onChange={(_, v) => v && setView(v)}
        >
          <ToggleButton value="cost">Chi phí</ToggleButton>
          <ToggleButton value="summary">Tổng kết</ToggleButton>
          <ToggleButton value="dashboard">Dashboard</ToggleButton>
          <ToggleButton value="history">Lịch sử</ToggleButton>
        </ToggleButtonGroup>

        <Button size="small" startIcon={<AddCircleOutlineIcon />} onClick={onOpenSelector}>
          Báo giá mới
        </Button>
        {/* Export dropdown */}
        <Button
          size="small"
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
          <Divider />
          <MenuItem onClick={() => { handleExport(); setExportAnchor(null); }}>
            <ListItemIcon><FileDownloadIcon fontSize="small" /></ListItemIcon>
            <ListItemText>📋 JSON (backup)</ListItemText>
          </MenuItem>
        </Menu>
        <Button size="small" startIcon={<FileUploadIcon />} onClick={handleImportClick}>
          Nhập JSON
        </Button>
        <input
          ref={fileInput} type="file" accept="application/json"
          hidden onChange={handleImportFile}
        />
        <Button size="small" startIcon={<CloudUploadIcon />} onClick={onOpenSaveCloud}>
          Lưu cloud
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
    </AppBar>
  );
}
