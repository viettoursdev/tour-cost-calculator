import { useState } from 'react';
import { Button, Menu, MenuItem } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { DMC_CURRENCIES, CURRENCY_FLAGS } from '@/lib/currency';
import type { OutputCurrency } from '@/types';

type Props = {
  value: OutputCurrency;
  onChange: (cur: OutputCurrency) => void;
};

export function CurrencySelector({ value, onChange }: Props) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const pick = (cur: OutputCurrency) => {
    onChange(cur);
    setAnchorEl(null);
  };

  return (
    <>
      <Button
        size="small"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        endIcon={<KeyboardArrowDownIcon />}
        sx={{
          background: 'linear-gradient(135deg, #0f3a4a, #14617a)',
          color: '#fff',
          fontWeight: 700,
          fontSize: 13,
          textTransform: 'none',
          px: 1.5,
          py: 0.5,
          borderRadius: 1.5,
          '&:hover': { background: 'linear-gradient(135deg, #0a2a38, #0f3a4a)' },
        }}
      >
        💱 {value}
      </Button>
      <Menu anchorEl={anchorEl} open={open} onClose={() => setAnchorEl(null)}>
        {DMC_CURRENCIES.map((c) => (
          <MenuItem
            key={c}
            selected={c === value}
            onClick={() => pick(c)}
            sx={{
              fontWeight: c === value ? 700 : 400,
              color: c === value ? '#0f3a4a' : 'inherit',
              fontSize: 13,
              minWidth: 140,
            }}
          >
            {CURRENCY_FLAGS[c]} {c}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
