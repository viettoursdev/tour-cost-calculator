import {
  Box, Button, Chip, Dialog, DialogContent, DialogTitle, Divider, IconButton, Stack,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import DashboardCustomizeOutlinedIcon from '@mui/icons-material/DashboardCustomizeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import SettingsBrightnessOutlinedIcon from '@mui/icons-material/SettingsBrightnessOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import type { Density, ThemeMode } from '@/lib/uiPrefs';
import { useAuthStore } from '@/stores/authStore';
import { useHomePrefStore } from '@/stores/homePrefStore';
import { useNavPrefStore } from '@/stores/navPrefStore';
import { useQuoteStore } from '@/stores/quoteStore';
import { useUiPrefStore } from '@/stores/uiPrefStore';
import { LEGACY } from '@/theme';

type Props = { open: boolean; onClose: () => void };

/** Tiêu đề nhóm trong hộp thoại Cài đặt cá nhân. */
function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
      <Box sx={{ color: LEGACY.teal, display: 'flex' }}>{icon}</Box>
      <Typography variant="subtitle2" fontWeight={800}>{children}</Typography>
    </Stack>
  );
}

/**
 * ⚙️ Cài đặt cá nhân — gom MỌI tùy chỉnh giao diện về một chỗ (mở từ header):
 * chế độ sáng/tối + mật độ (uiPrefStore) · tùy biến thanh điều hướng (navPrefStore)
 * · bố cục trang "Hôm nay" (homePrefStore). Tất cả đồng bộ theo tài khoản qua
 * Supabase `user_prefs` — đổi máy/trình duyệt vẫn giữ nguyên.
 */
export function SettingsDialog({ open, onClose }: Props) {
  const me = useAuthStore((s) => s.currentUser);
  const prefs = useUiPrefStore((s) => s.prefs);
  const savePrefs = (patch: Partial<typeof prefs>) =>
    useUiPrefStore.getState().save(me?.u, { ...prefs, ...patch });

  const template = useQuoteStore((s) => s.draft.template);
  // Nav tùy biến & trang Hôm nay nằm trong scaffolding báo giá thường —
  // DMC bị khoá view (cost/history), các template "alt" có UI riêng.
  const canCustomizeNav = template === 'domestic' || template === 'intl';

  const openNavCustomize = () => {
    useNavPrefStore.getState().setCustomizeOpen(true);
    onClose();
  };

  const openHomeCustomize = () => {
    const st = useQuoteStore.getState();
    if (st.draft.template === null) st.newDraft('domestic');
    st.setView('home');
    useHomePrefStore.getState().setCustomizeOpen(true);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pr: 6, fontWeight: 800 }}>
        ⚙️ Cài đặt cá nhân
        <Typography variant="caption" display="block" color="text.secondary" sx={{ fontWeight: 400 }}>
          Chỉ áp dụng cho tài khoản của bạn — không ảnh hưởng người khác.
        </Typography>
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {/* ── Giao diện ── */}
        <SectionTitle icon={<SettingsBrightnessOutlinedIcon fontSize="small" />}>
          Giao diện
        </SectionTitle>
        <Stack spacing={1.25} sx={{ mb: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Chế độ màu <Chip label="Tối: beta" size="small" sx={{ ml: 0.5, height: 16, fontSize: 10 }} />
            </Typography>
            <ToggleButtonGroup
              exclusive size="small" fullWidth value={prefs.mode}
              onChange={(_, v: ThemeMode | null) => { if (v) savePrefs({ mode: v }); }}
            >
              <ToggleButton value="light"><LightModeOutlinedIcon sx={{ fontSize: 16, mr: 0.5 }} />Sáng</ToggleButton>
              <ToggleButton value="dark"><DarkModeOutlinedIcon sx={{ fontSize: 16, mr: 0.5 }} />Tối</ToggleButton>
              <ToggleButton value="system"><SettingsBrightnessOutlinedIcon sx={{ fontSize: 16, mr: 0.5 }} />Hệ thống</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Mật độ hiển thị
            </Typography>
            <ToggleButtonGroup
              exclusive size="small" fullWidth value={prefs.density}
              onChange={(_, v: Density | null) => { if (v) savePrefs({ density: v }); }}
            >
              <ToggleButton value="comfortable">Thoải mái</ToggleButton>
              <ToggleButton value="compact">Gọn (nhiều dòng hơn)</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Stack>

        <Divider sx={{ my: 1.5 }} />

        {/* ── Thanh điều hướng ── */}
        <SectionTitle icon={<TuneOutlinedIcon fontSize="small" />}>Thanh điều hướng</SectionTitle>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Kéo-thả sắp xếp, gom nhóm hoặc ẩn bớt tab cho gọn theo việc của bạn.
        </Typography>
        <Tooltip title={canCustomizeNav ? '' : 'Mở một báo giá nội địa/quốc tế để tùy chỉnh thanh điều hướng.'}>
          <span>
            <Button
              variant="outlined" size="small" startIcon={<TuneOutlinedIcon />}
              disabled={!canCustomizeNav} onClick={openNavCustomize}
            >
              Tùy chỉnh thanh điều hướng…
            </Button>
          </span>
        </Tooltip>

        <Divider sx={{ my: 1.5 }} />

        {/* ── Trang Hôm nay ── */}
        <SectionTitle icon={<DashboardCustomizeOutlinedIcon fontSize="small" />}>
          Trang «Hôm nay»
        </SectionTitle>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Sắp xếp/ẩn thẻ, số dòng hiển thị, ngưỡng cảnh báo và các bố cục đặt tên.
        </Typography>
        <Tooltip title={template === 'dmc' ? 'Không khả dụng trong báo giá DMC.' : ''}>
          <span>
            <Button
              variant="outlined" size="small" startIcon={<DashboardCustomizeOutlinedIcon />}
              disabled={template === 'dmc'} onClick={openHomeCustomize}
            >
              Tùy chỉnh trang Hôm nay…
            </Button>
          </span>
        </Tooltip>

        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 2 }}>
          <CloudDoneOutlinedIcon sx={{ fontSize: 16, color: LEGACY.teal }} />
          <Typography variant="caption" color="text.secondary">
            Mọi tùy chỉnh được đồng bộ theo tài khoản — đổi máy vẫn giữ nguyên.
          </Typography>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
