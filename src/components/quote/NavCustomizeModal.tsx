import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Tooltip, Typography,
} from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { SortableList } from '@/components/itinerary/SortableList';
import {
  GROUP_IDS, GROUP_LABELS, hideItem, moveItem, reorder, unhideItem,
  type ContainerId, type NavCatalogEntry, type NavLayout,
} from './navLayout';

type Props = {
  open: boolean;
  onClose: () => void;
  catalog: NavCatalogEntry[];
  labels: Record<string, string>;
  layout: NavLayout;
  onChange: (layout: NavLayout) => void;
  onReset: () => void;
  /** Tên phòng ban của user (hiện các nút preset phòng). */
  deptLabel?: string;
  /** User chưa tự chỉnh → đang hiển thị theo bố cục mặc định của phòng. */
  usingDeptDefault?: boolean;
  /** Chép bố cục phòng thành bản cá nhân (undefined = phòng chưa đặt preset). */
  onApplyDeptPreset?: () => void;
  /** Lưu bố cục hiện tại làm MẶC ĐỊNH của phòng (chỉ Trưởng/Phó Phòng). */
  onSaveDeptPreset?: () => void | Promise<void>;
};

const SECTIONS: { id: ContainerId; title: string; hint?: string }[] = [
  { id: 'top', title: 'Thanh chính (tab phẳng)', hint: 'Hiển thị ngang, luôn thấy ngay' },
  { id: 'grp:sales', title: `Nhóm: ${GROUP_LABELS['grp:sales']}` },
  { id: 'grp:ops', title: `Nhóm: ${GROUP_LABELS['grp:ops']}` },
  { id: 'grp:catalog', title: `Nhóm: ${GROUP_LABELS['grp:catalog']}` },
  { id: 'hidden', title: 'Đã ẩn', hint: 'Không hiển thị trên thanh điều hướng' },
];

export function NavCustomizeModal({
  open, onClose, catalog, labels, layout, onChange, onReset,
  deptLabel, usingDeptDefault, onApplyDeptPreset, onSaveDeptPreset,
}: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        ⚙️ Tùy chỉnh thanh điều hướng
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Kéo-thả để đổi thứ tự, dồn vào nhóm hoặc tách ra tab chính. Bấm 👁 để ẩn/hiện. Thay đổi tự lưu cho riêng bạn.
        </Typography>
        {usingDeptDefault && deptLabel && (
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: '#0d7a6a', fontWeight: 600 }}>
            🏢 Đang dùng bố cục mặc định của phòng {deptLabel} — chỉnh bất kỳ mục nào sẽ tạo bản riêng của bạn.
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 1 }}>
          {SECTIONS.map((sec) => {
            const ids = layout[sec.id];
            const isHidden = sec.id === 'hidden';
            return (
              <Box
                key={sec.id}
                sx={{
                  border: '1px solid', borderColor: isHidden ? 'rgba(0,0,0,0.12)' : 'rgba(20,150,140,0.3)',
                  borderRadius: 2, p: 1.25, bgcolor: isHidden ? 'rgba(0,0,0,0.02)' : 'rgba(20,150,140,0.03)',
                  display: 'flex', flexDirection: 'column',
                }}
              >
                <Typography fontWeight={800} fontSize={13} sx={{ color: isHidden ? 'text.secondary' : '#0d7a6a' }}>
                  {sec.title}
                </Typography>
                {sec.hint && (
                  <Typography variant="caption" color="text.disabled" sx={{ mb: 0.5 }}>{sec.hint}</Typography>
                )}
                <SortableList
                  group="navcfg"
                  listId={sec.id}
                  handle=".nav-drag-handle"
                  sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minHeight: 36, flex: 1, pt: 0.25 }}
                  onReorder={(from, to) => onChange(reorder(layout, sec.id, from, to))}
                  onCrossMove={(fromList, fromIdx, toList, toIdx) => {
                    const id = layout[fromList as ContainerId]?.[fromIdx];
                    if (id) onChange(moveItem(layout, id, toList as ContainerId, toIdx));
                  }}
                >
                  {ids.length === 0 && (
                    <Box sx={{ py: 1.25, textAlign: 'center', color: 'text.disabled', fontSize: 12, fontStyle: 'italic', border: '1px dashed rgba(0,0,0,0.15)', borderRadius: 1.5 }}>
                      Kéo mục vào đây
                    </Box>
                  )}
                  {ids.map((id) => (
                    <Stack
                      key={id}
                      direction="row"
                      alignItems="center"
                      spacing={0.75}
                      sx={{
                        px: 0.75, py: 0.5, borderRadius: 1.5, bgcolor: 'var(--vte-surface)',
                        border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      }}
                    >
                      <Box className="nav-drag-handle" sx={{ display: 'flex', cursor: 'grab', color: 'text.disabled' }}>
                        <DragIndicatorIcon fontSize="small" />
                      </Box>
                      <Typography fontSize={13} fontWeight={600} sx={{ flex: 1, minWidth: 0, color: isHidden ? 'text.secondary' : 'text.primary' }} noWrap>
                        {labels[id] ?? id}
                      </Typography>
                      <Tooltip title={isHidden ? 'Hiện lại' : 'Ẩn'}>
                        <IconButton
                          size="small"
                          onClick={() => onChange(isHidden ? unhideItem(layout, catalog, id) : hideItem(layout, id))}
                          sx={{ color: isHidden ? '#0d7a6a' : 'text.disabled' }}
                        >
                          {isHidden ? <VisibilityOutlinedIcon fontSize="small" /> : <VisibilityOffOutlinedIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  ))}
                </SortableList>
              </Box>
            );
          })}
        </Box>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1.5 }}>
          Lưu ý: các mục bạn không có quyền sẽ không xuất hiện ở đây. Nhóm hiển thị dạng menu thả xuống theo thứ tự
          {' '}{GROUP_IDS.map((g) => GROUP_LABELS[g]).join(' · ')}.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2, flexWrap: 'wrap', gap: 0.5 }}>
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          <Button onClick={onReset} startIcon={<RestartAltIcon />} color="inherit">
            Khôi phục mặc định
          </Button>
          {onApplyDeptPreset && deptLabel && (
            <Tooltip title={`Chép bố cục mặc định của phòng ${deptLabel} thành bản riêng của bạn (rồi chỉnh tiếp tuỳ ý).`}>
              <Button onClick={onApplyDeptPreset} color="inherit">🏢 Áp bố cục phòng</Button>
            </Tooltip>
          )}
          {onSaveDeptPreset && deptLabel && (
            <Tooltip title={`Đặt bố cục đang hiển thị làm MẶC ĐỊNH cho mọi người phòng ${deptLabel} (ai đã tự tùy chỉnh sẽ giữ bản riêng).`}>
              <Button onClick={() => void onSaveDeptPreset()} sx={{ color: '#0d7a6a', fontWeight: 700 }}>
                💾 Lưu làm mặc định phòng
              </Button>
            </Tooltip>
          )}
        </Stack>
        <Button onClick={onClose} variant="contained">Xong</Button>
      </DialogActions>
    </Dialog>
  );
}
