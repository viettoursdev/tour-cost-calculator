import { Box } from '@mui/material';

type Props = {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
};

/**
 * 5-star clickable rating widget.
 * Source: public/legacy.html:7240-7245.
 */
export function StarRating({ value, onChange, size = 15 }: Props) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', gap: '1px', alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Box
          key={n}
          component="span"
          title={onChange ? `${n} sao` : undefined}
          onClick={onChange ? (e: React.MouseEvent) => { e.stopPropagation(); onChange(n === value ? 0 : n); } : undefined}
          sx={{
            cursor: onChange ? 'pointer' : 'default',
            fontSize: size,
            color: n <= (value || 0) ? '#f5a623' : 'rgba(15,58,74,0.18)',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          ★
        </Box>
      ))}
    </Box>
  );
}
