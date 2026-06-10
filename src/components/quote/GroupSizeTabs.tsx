import { Box, Button, Chip, Stack, Tooltip, Typography } from '@mui/material';
import GroupsIcon from '@mui/icons-material/Groups';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import { useQuoteStore } from '@/stores/quoteStore';
import { LEGACY } from '@/theme';

const MAX_GROUPS = 4;

/** Tab bar for multi group-size quoting. Each group has its own cost table. */
export function GroupSizeTabs() {
  const groups = useQuoteStore((s) => s.draft.groups);
  const activeGroupId = useQuoteStore((s) => s.draft.activeGroupId);
  const pax = useQuoteStore((s) => s.draft.pax);
  const addGroup = useQuoteStore((s) => s.addGroup);
  const switchGroup = useQuoteStore((s) => s.switchGroup);
  const renameGroup = useQuoteStore((s) => s.renameGroup);
  const removeGroup = useQuoteStore((s) => s.removeGroup);

  // Single-group mode: offer to enable multi group-size.
  if (!groups || groups.length === 0) {
    return (
      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 1.75 }} flexWrap="wrap" useFlexGap>
        <Button
          size="small" variant="outlined" startIcon={<GroupsIcon />}
          onClick={addGroup}
          sx={{ borderColor: 'rgba(20,150,140,0.4)', color: LEGACY.teal, fontWeight: 700 }}
        >
          Báo giá nhiều mức khách
        </Button>
        <Typography fontSize={12} color="rgba(15,58,74,0.5)">
          Tạo 2–4 bảng chi phí cho các mức số khách khác nhau.
        </Typography>
      </Stack>
    );
  }

  const rename = (id: string, current: string) => {
    const v = window.prompt('Tên mức khách:', current);
    if (v != null && v.trim()) renameGroup(id, v.trim());
  };
  const remove = (id: string, label: string) => {
    if (window.confirm(`Xoá mức "${label}"? Bảng chi phí của mức này sẽ mất.`)) removeGroup(id);
  };

  return (
    <Box sx={{ mb: 1.75, p: 1, borderRadius: 2, background: 'rgba(168,230,221,0.18)', border: '1px solid rgba(20,150,140,0.18)' }}>
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
        <GroupsIcon fontSize="small" sx={{ color: LEGACY.teal }} />
        <Typography fontSize={12} fontWeight={700} color="rgba(15,58,74,0.6)" sx={{ mr: 0.5 }}>
          Mức khách:
        </Typography>
        {groups.map((g) => {
          const active = g.id === activeGroupId;
          return (
            <Chip
              key={g.id}
              size="small"
              label={
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <span>{g.label}</span>
                  {active && (
                    <EditIcon
                      sx={{ fontSize: 13, opacity: 0.7 }}
                      onClick={(e) => { e.stopPropagation(); rename(g.id, g.label); }}
                    />
                  )}
                </Stack>
              }
              onClick={() => !active && switchGroup(g.id)}
              onDelete={groups.length > 1 ? () => remove(g.id, g.label) : undefined}
              deleteIcon={<CloseIcon />}
              sx={{
                fontWeight: active ? 800 : 600,
                color: active ? '#fff' : LEGACY.navy,
                background: active ? LEGACY.headerGradient : '#fff',
                border: '1px solid',
                borderColor: active ? 'transparent' : 'rgba(20,150,140,0.25)',
                '& .MuiChip-deleteIcon': { color: active ? 'rgba(255,255,255,0.8)' : 'rgba(15,58,74,0.4)' },
                cursor: active ? 'default' : 'pointer',
              }}
            />
          );
        })}
        {groups.length < MAX_GROUPS && (
          <Tooltip title="Thêm mức khách (clone bảng hiện tại)">
            <Button size="small" startIcon={<AddIcon />} onClick={addGroup} sx={{ color: LEGACY.teal, fontWeight: 700 }}>
              Thêm mức
            </Button>
          </Tooltip>
        )}
        <Box sx={{ flex: 1 }} />
        <Typography fontSize={11} color="rgba(15,58,74,0.5)">
          Đang sửa: <strong>{pax} khách</strong>
        </Typography>
      </Stack>
    </Box>
  );
}
