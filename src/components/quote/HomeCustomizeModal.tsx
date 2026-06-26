import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import { SortableList } from '@/components/itinerary/SortableList';
import {
  isHidden, reorderSection, setRowsPer, setDocsDays, setTourDays, toggleHidden,
  ROWS_OPTIONS, DOCS_DAYS_OPTIONS, TOUR_DAYS_OPTIONS, type HomeLayout,
} from './homeLayout';
import {
  addPreset, renamePreset, deletePreset, switchPreset, MAX_PRESETS, type PresetState,
} from './homePresets';

const ROWS_LABEL = (n: number) => (n >= 9999 ? 'Tất cả' : `${n} dòng`);

type Props = {
  open: boolean;
  onClose: () => void;
  /** Nhãn hiển thị cho mỗi id thẻ. */
  labels: Record<string, string>;
  layout: HomeLayout;
  onChange: (layout: HomeLayout) => void;
  onReset: () => void;
  presetState: PresetState;
  onPresetChange: (state: PresetState) => void;
};

export function HomeCustomizeModal({ open, onClose, labels, layout, onChange, onReset, presetState, onPresetChange }: Props) {
  const { presets, activeId } = presetState;
  const addNew = () => {
    const name = window.prompt('Tên bố cục mới:', `Bố cục ${presets.length + 1}`);
    if (name != null) onPresetChange(addPreset(presetState, name));
  };
  const rename = (id: string, cur: string) => {
    const name = window.prompt('Đổi tên bố cục:', cur);
    if (name != null) onPresetChange(renamePreset(presetState, id, name));
  };
  const remove = (id: string, name: string) => {
    if (window.confirm(`Xoá bố cục "${name}"?`)) onPresetChange(deletePreset(presetState, id));
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        ⚙️ Tùy chỉnh trang Hôm nay
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Kéo-thả để đổi thứ tự các thẻ. Bấm 👁 để ẩn/hiện thẻ không cần. Thay đổi tự lưu cho riêng bạn.
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1, mb: 1.5, p: 1, border: '1px solid rgba(13,122,106,0.25)', borderRadius: 2, bgcolor: 'rgba(13,122,106,0.03)' }}>
          <Stack direction="row" alignItems="center" sx={{ mb: 0.5 }}>
            <Typography fontWeight={800} fontSize={13} sx={{ flex: 1, color: '#0d7a6a' }}>Bố cục đặt tên</Typography>
            <Button size="small" startIcon={<AddIcon />} onClick={addNew} disabled={presets.length >= MAX_PRESETS}>Thêm</Button>
          </Stack>
          <Stack spacing={0.5}>
            {presets.map((p) => {
              const active = p.id === activeId;
              return (
                <Stack key={p.id} direction="row" alignItems="center" spacing={0.5}
                  sx={{ px: 1, py: 0.5, borderRadius: 1.5, cursor: active ? 'default' : 'pointer',
                    bgcolor: active ? 'rgba(13,122,106,0.12)' : '#fff', border: '1px solid', borderColor: active ? 'rgba(13,122,106,0.4)' : 'rgba(0,0,0,0.08)' }}
                  onClick={() => { if (!active) onPresetChange(switchPreset(presetState, p.id)); }}>
                  <Typography fontSize={13} fontWeight={active ? 800 : 600} sx={{ flex: 1, minWidth: 0 }} noWrap>
                    {active ? '● ' : ''}{p.name}
                  </Typography>
                  <Tooltip title="Đổi tên"><IconButton size="small" onClick={(e) => { e.stopPropagation(); rename(p.id, p.name); }}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title={presets.length <= 1 ? 'Cần giữ ít nhất 1 bố cục' : 'Xoá'}>
                    <span><IconButton size="small" disabled={presets.length <= 1} onClick={(e) => { e.stopPropagation(); remove(p.id, p.name); }}><DeleteOutlineIcon fontSize="small" /></IconButton></span>
                  </Tooltip>
                </Stack>
              );
            })}
          </Stack>
        </Box>
        <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 0.5, flexWrap: 'wrap', gap: 1 }}>
          <TextField select size="small" label="Số dòng mỗi thẻ" value={layout.rowsPer}
            onChange={(e) => onChange(setRowsPer(layout, Number(e.target.value)))} sx={{ minWidth: 150 }}>
            {ROWS_OPTIONS.map((n) => <MenuItem key={n} value={n}>{ROWS_LABEL(n)}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Giấy tờ hết hạn ≤" value={layout.docsDays}
            onChange={(e) => onChange(setDocsDays(layout, Number(e.target.value)))} sx={{ minWidth: 140 }}>
            {DOCS_DAYS_OPTIONS.map((n) => <MenuItem key={n} value={n}>{n} ngày</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Tour khởi hành ≤" value={layout.tourDays}
            onChange={(e) => onChange(setTourDays(layout, Number(e.target.value)))} sx={{ minWidth: 140 }}>
            {TOUR_DAYS_OPTIONS.map((n) => <MenuItem key={n} value={n}>{n} ngày</MenuItem>)}
          </TextField>
        </Stack>
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
