import { useRef, useState } from 'react';
import {
  AppBar, Box, Button, Chip, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Toolbar, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { useQuoteStore } from '@/stores/quoteStore';

type Props = { onOpenSelector: () => void };

export function QuoteToolbar({ onOpenSelector }: Props) {
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

  const [showRates, setShowRates] = useState(false);
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

        <ToggleButtonGroup
          size="small" exclusive value={view}
          onChange={(_, v) => v && setView(v)}
        >
          <ToggleButton value="cost">Chi phí</ToggleButton>
          <ToggleButton value="summary">Tổng kết</ToggleButton>
        </ToggleButtonGroup>

        <Button size="small" startIcon={<AddCircleOutlineIcon />} onClick={onOpenSelector}>
          Báo giá mới
        </Button>
        <Button size="small" startIcon={<FileDownloadIcon />} onClick={handleExport}>
          Xuất JSON
        </Button>
        <Button size="small" startIcon={<FileUploadIcon />} onClick={handleImportClick}>
          Nhập JSON
        </Button>
        <input
          ref={fileInput} type="file" accept="application/json"
          hidden onChange={handleImportFile}
        />
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
