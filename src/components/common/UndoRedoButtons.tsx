import { IconButton, Stack, Tooltip } from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';

type Props = {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** màu icon (cho header tối) */
  color?: string;
  size?: 'small' | 'medium';
};

/** Cặp nút Undo/Redo dùng chung cho mọi trang nhập liệu. */
export function UndoRedoButtons({ undo, redo, canUndo, canRedo, color, size = 'small' }: Props) {
  const sx = color ? { color, '&.Mui-disabled': { color: 'rgba(255,255,255,0.3)' } } : undefined;
  return (
    <Stack direction="row" spacing={0.25}>
      <Tooltip title="Hoàn tác (Ctrl/⌘ + Z)">
        <span>
          <IconButton size={size} onClick={undo} disabled={!canUndo} sx={sx}><UndoIcon fontSize="inherit" /></IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Làm lại (Ctrl/⌘ + Y)">
        <span>
          <IconButton size={size} onClick={redo} disabled={!canRedo} sx={sx}><RedoIcon fontSize="inherit" /></IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
}
