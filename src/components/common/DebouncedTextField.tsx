import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { TextField, type TextFieldProps } from '@mui/material';

type Props = Omit<TextFieldProps, 'value' | 'onChange'> & {
  value: string;
  onCommit: (v: string) => void;
  /** Độ trễ commit ra store (ms). Mặc định 350ms. */
  debounceMs?: number;
};

/**
 * `TextField` giữ giá trị cục bộ và CHỈ đẩy ra store sau khi ngừng gõ (debounce)
 * hoặc khi blur. Tránh re-render toàn bộ cây (vd: cả lịch trình) theo từng phím —
 * dùng cho khối nhập liệu vận hành cho mượt, không bị giựt.
 */
export function DebouncedTextField({ value, onCommit, debounceMs = 350, ...rest }: Props) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committed = useRef(value);
  const focused = useRef(false);

  // Đồng bộ khi prop đổi từ bên ngoài (reset/undo/realtime echo) — nhưng TUYỆT
  // ĐỐI không đè khi ô đang được gõ, kẻo echo trễ ghi đè ký tự/xuống-dòng đang
  // nhập (nhảy con trỏ, dính dòng). Giá trị ngoài sẽ được áp khi rời ô (blur).
  useEffect(() => {
    if (focused.current) return;
    if (value !== committed.current) {
      committed.current = value;
      setLocal(value);
    }
  }, [value]);

  const flush = (v: string) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (v !== committed.current) { committed.current = v; onCommit(v); }
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLocal(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(v), debounceMs);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <TextField
      {...rest}
      value={local}
      onChange={onChange}
      onFocus={(e) => { focused.current = true; rest.onFocus?.(e); }}
      onBlur={(e) => { focused.current = false; flush(local); rest.onBlur?.(e); }}
    />
  );
}
