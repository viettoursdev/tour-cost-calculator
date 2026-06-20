import { useState, type KeyboardEvent } from 'react';
import { Box } from '@mui/material';
import { parseAmountVN } from '@/lib/numParse';
import { LEGACY } from '@/theme';

/**
 * Ô nhập số kiểu "tab tính giá": hiển thị định dạng 1.500.000; bấm để sửa, hiểu
 * cú pháp gọn 1500k / 1tr5 / 1.500.000 (parseAmountVN); Enter/blur lưu, Esc huỷ.
 */
export function InlineNumberField({
  value, onChange, min = 0, width = 90, align = 'right', bold, color, placeholder, disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  width?: number;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  color?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const commit = () => {
    const n = parseAmountVN(draft);
    onChange(Math.max(min, Number.isFinite(n) ? n : min));
    setEditing(false);
  };
  if (disabled) {
    return (
      <Box component="span" sx={{ px: 0.5, display: 'inline-block', textAlign: align, minWidth: width, fontWeight: bold ? 700 : 400, fontSize: 13, color: color ?? 'inherit' }}>
        {value ? value.toLocaleString('vi-VN') : (placeholder ?? '0')}
      </Box>
    );
  }
  if (editing) {
    return (
      <Box
        component="input" autoFocus inputMode="decimal" value={draft}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') setEditing(false);
        }}
        sx={{
          width, textAlign: align, background: '#fff', border: '1.5px solid #14a08c',
          borderRadius: '6px', color: LEGACY.navy, outline: 'none', padding: '2px 6px',
          fontFamily: 'inherit', fontSize: 13, fontWeight: bold ? 700 : 400,
        }}
      />
    );
  }
  return (
    <Box
      component="span" role="button" tabIndex={0}
      onClick={() => { setDraft(value ? String(value) : ''); setEditing(true); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDraft(value ? String(value) : ''); setEditing(true); } }}
      sx={{
        cursor: 'pointer', borderRadius: '4px', px: 0.5, display: 'inline-block',
        textAlign: align, minWidth: width, fontWeight: bold ? 700 : 400, fontSize: 13,
        color: value ? (color ?? 'inherit') : 'rgba(15,58,74,0.4)',
        '&:hover': { background: 'rgba(20,150,140,0.1)' },
      }}
    >
      {value ? value.toLocaleString('vi-VN') : (placeholder ?? '0')}
    </Box>
  );
}
