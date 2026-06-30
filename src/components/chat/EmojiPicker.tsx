import { useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';

// Bộ emoji gọn, phân nhóm — không phụ thuộc thư viện ngoài (tránh phình bundle).
const GROUPS: { label: string; icon: string; list: string[] }[] = [
  { label: 'Hay dùng', icon: '⭐', list: ['👍', '❤️', '😂', '🎉', '✅', '🙏', '🔥', '😮', '😢', '👏', '💯', '🤝', '👌', '😍', '🥳', '😅'] },
  { label: 'Mặt cười', icon: '😀', list: ['😀', '😁', '😄', '😊', '🙂', '😉', '😌', '😍', '🥰', '😘', '😎', '🤩', '🤔', '🤨', '😐', '😴', '😪', '😋', '😜', '🤪', '😝', '🤗', '🤭', '😏'] },
  { label: 'Cảm xúc', icon: '😢', list: ['😢', '😭', '😤', '😠', '😡', '🥺', '😞', '😔', '😟', '😩', '😫', '😰', '😨', '😱', '😳', '🤯', '😬', '🙄', '😶', '😇', '🤥', '🤒', '🤕', '🥶'] },
  { label: 'Cử chỉ', icon: '👍', list: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤙', '👏', '🙌', '🙏', '💪', '👋', '🤝', '✍️', '👀', '🫶', '👇', '👆', '👉', '👈', '✊', '👊', '🫡', '🤲'] },
  { label: 'Tim', icon: '❤️', list: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️'] },
  { label: 'Vật & việc', icon: '🎉', list: ['🎉', '🎊', '🎁', '🏆', '🥇', '⭐', '🌟', '✨', '⚡', '🔥', '💯', '✅', '❌', '⚠️', '❓', '❗', '💡', '📌', '📎', '📅', '⏰', '💰', '📈', '🚀'] },
  { label: 'Đồ ăn', icon: '🍵', list: ['☕', '🍵', '🍺', '🍻', '🥂', '🍷', '🍰', '🎂', '🍪', '🍫', '🍬', '🍎', '🍌', '🍔', '🍕', '🍜', '🍚', '🍱', '🍣', '🥗', '🍦', '🍩', '🧋', '🍇'] },
  { label: 'Du lịch', icon: '✈️', list: ['✈️', '🚌', '🚐', '🚗', '🚆', '🚢', '⛴️', '🏝️', '🏖️', '🏔️', '🗺️', '🧳', '🛎️', '🏨', '🏛️', '🗽', '🎡', '🎢', '📷', '🧭', '🌅', '🌍', '⛱️', '🚉'] },
];

/** Bảng chọn emoji gọn để chèn vào tin / thả cảm xúc. */
export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [tab, setTab] = useState(0);
  return (
    <Box sx={{ width: 296, p: 0.5 }}>
      <Box sx={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.08)', mb: 0.5 }}>
        {GROUPS.map((g, i) => (
          <Tooltip key={g.label} title={g.label}>
            <IconButton size="small" onClick={() => setTab(i)}
              sx={{ fontSize: 18, borderRadius: 1, opacity: tab === i ? 1 : 0.55,
                borderBottom: tab === i ? '2px solid' : '2px solid transparent', borderColor: 'primary.main' }}>
              {g.icon}
            </IconButton>
          </Tooltip>
        ))}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', maxHeight: 192, overflowY: 'auto' }}>
        {GROUPS[tab].list.map((e, i) => (
          <Box key={e + i} component="button" onClick={() => onPick(e)}
            sx={{ fontSize: 20, lineHeight: 1, p: 0.5, border: 0, bgcolor: 'transparent', cursor: 'pointer', borderRadius: 1,
              '&:hover': { bgcolor: 'rgba(0,0,0,0.06)' } }}>
            {e}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
