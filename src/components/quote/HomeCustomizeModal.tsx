import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Tooltip, Typography,
} from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { SortableList } from '@/components/itinerary/SortableList';
import { isHidden, reorderSection, toggleHidden, type HomeLayout } from './homeLayout';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Nhãn hiển thị cho mỗi id thẻ. */
  labels: Record<string, string>;
  layout: HomeLayout;
  onChange: (layout: HomeLayout) => void;
  onReset: () => void;
};

export function HomeCustomizeModal({ open, onClose, labels, layout, onChange, onReset }: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        ⚙️ Tùy chỉnh trang Hôm nay
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Kéo-thả để đổi thứ tự các thẻ. Bấm 👁 để ẩn/hiện thẻ không cần. Thay đổi tự lưu cho riêng bạn.
        </Typography>
      </DialogTitle>
      <DialogContent>
        <SortableList
          handle=".home-drag-handle"
          deps={[layout.order.join(',')]}
          sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}
          onReorder={(from, to) => onChange(reorderSection(layout, from, to))}
        >
          {layout.order.map((id) => {
            const off = isHidden(layout, id);
            return (
              <Stack
                key={id}
                direction="row"
                alignItems="center"
                spacing={0.75}
                sx={{
                  px: 1, py: 0.75, borderRadius: 1.5,
                  bgcolor: off ? 'rgba(0,0,0,0.03)' : '#fff',
                  border: '1px solid', borderColor: off ? 'rgba(0,0,0,0.1)' : 'rgba(20,150,140,0.3)',
                  boxShadow: off ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                <Box className="home-drag-handle" sx={{ display: 'flex', cursor: 'grab', color: 'text.disabled' }}>
                  <DragIndicatorIcon fontSize="small" />
                </Box>
                <Typography
                  fontSize={13.5}
                  fontWeight={700}
                  sx={{ flex: 1, minWidth: 0, color: off ? 'text.disabled' : 'text.primary', textDecoration: off ? 'line-through' : 'none' }}
                  noWrap
                >
                  {labels[id] ?? id}
                </Typography>
                <Tooltip title={off ? 'Hiện lại' : 'Ẩn'}>
                  <IconButton size="small" onClick={() => onChange(toggleHidden(layout, id))} sx={{ color: off ? 'text.disabled' : '#0d7a6a' }}>
                    {off ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
              </Stack>
            );
          })}
        </SortableList>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
        <Button onClick={onReset} startIcon={<RestartAltIcon />} color="inherit">
          Khôi phục mặc định
        </Button>
        <Button onClick={onClose} variant="contained">Xong</Button>
      </DialogActions>
    </Dialog>
  );
}
