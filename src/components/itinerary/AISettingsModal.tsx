import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography,
} from '@mui/material';
import { getAIWorker, setAIWorker } from '@/lib/aiWorker';

type Props = { open: boolean; onClose: () => void };

export function AISettingsModal({ open, onClose }: Props) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (open) setUrl(getAIWorker());
  }, [open]);

  const handleSave = () => {
    setAIWorker(url.trim());
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ background: 'linear-gradient(135deg,#8e44ad,#9b59b6)', color: '#fff' }}>
        <Typography variant="h6" fontWeight={800}>⚙️ Cấu hình AI Worker</Typography>
        <Typography variant="caption" sx={{ opacity: 0.85 }}>
          Cloudflare Worker proxy cho Claude + Google Maps
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            label="Worker URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://viettours-ai.xxx.workers.dev"
            fullWidth size="small" autoFocus
          />
          <Alert severity="info" sx={{ fontSize: 12 }}>
            <strong>Hướng dẫn:</strong>
            <Box component="ol" sx={{ pl: 2, m: 0, mt: 0.5 }}>
              <li>Deploy Cloudflare Worker (code &amp; guide gửi riêng)</li>
              <li>Set 2 secret: <code>ANTHROPIC_API_KEY</code>, <code>GOOGLE_MAPS_API_KEY</code></li>
              <li>Dán URL Worker vào ô trên → Lưu</li>
              <li>Dùng ✨ (thuyết minh AI) &amp; 📍 (khoảng cách)</li>
            </Box>
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Huỷ</Button>
        <Button variant="contained" onClick={handleSave}
          sx={{ background: 'linear-gradient(135deg,#8e44ad,#9b59b6)' }}>
          💾 Lưu cấu hình
        </Button>
      </DialogActions>
    </Dialog>
  );
}
