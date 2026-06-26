import { useEffect, useRef, useState } from 'react';
import { Autocomplete, TextField, type TextFieldProps } from '@mui/material';

type Props = {
  value: string;
  options: string[];
  onCommit: (v: string) => void;
  placeholder?: string;
  /** Độ trễ commit khi GÕ TAY (ms). Chọn từ danh sách thì commit ngay. */
  debounceMs?: number;
  textFieldSx?: TextFieldProps['sx'];
};

/**
 * Ô combo freeSolo (gõ tự do + gợi ý) giữ giá trị cục bộ, CHỈ đẩy ra store sau
 * khi ngừng gõ (debounce) hoặc khi blur / chọn từ danh sách. Có chốt focus: khi
 * đang gõ thì echo realtime KHÔNG đè giá trị — tránh nhảy con trỏ / mất chữ.
 * Dùng cho các ô như Châu lục / Quốc gia / Thành phố.
 */
export function DebouncedAutocomplete({
  value, options, onCommit, placeholder, debounceMs = 350, textFieldSx,
}: Props) {
  const [input, setInput] = useState(value);
  const committed = useRef(value);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Đồng bộ giá trị ngoài (reset/realtime) — nhưng không đè khi đang gõ.
  useEffect(() => {
    if (focused.current) return;
    if (value !== committed.current) { committed.current = value; setInput(value); }
  }, [value]);

  const flush = (v: string) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (v !== committed.current) { committed.current = v; onCommit(v); }
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <Autocomplete
      freeSolo
      size="small"
      options={options}
      inputValue={input}
      onInputChange={(_, v, reason) => {
        setInput(v);
        if (timer.current) clearTimeout(timer.current);
        // 'reset' = chọn từ danh sách → commit ngay; gõ tay → debounce.
        if (reason === 'reset') flush(v);
        else timer.current = setTimeout(() => flush(v), debounceMs);
      }}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; flush(input); }}
      renderInput={(params) => <TextField {...params} placeholder={placeholder} sx={textFieldSx} />}
    />
  );
}
