import { Box } from '@mui/material';
import type { ReactNode } from 'react';

/** Hiển thị "icon + text" cho renderValue của Select lọc (đồng bộ style icon MUI). */
export function iconValue(icon: ReactNode, text: string): ReactNode {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, '& svg': { fontSize: 16, color: 'rgba(15,58,74,0.5)' } }}>
      {icon}{text}
    </Box>
  );
}
