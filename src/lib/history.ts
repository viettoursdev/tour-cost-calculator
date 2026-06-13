/**
 * Lõi undo/redo thuần (không phụ thuộc React) — dùng cho `useHistoryState`.
 * Gộp các thao tác gõ nhanh: trong cùng một "cụm chỉnh sửa" (cách nhau < coalesceMs)
 * không tạo bước undo mới → mỗi lần ngừng tay là 1 bước undo.
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** thời điểm commit gần nhất (ms) — để gộp thao tác liên tiếp */
  lastTs: number;
}

export const MAX_HISTORY = 50;
export const COALESCE_MS = 500;

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastTs: 0 };
}

/** Ghi một giá trị mới vào lịch sử (đẩy giá trị hiện tại vào past trừ khi đang gộp). */
export function pushHistory<T>(h: History<T>, next: T, now = Date.now(), coalesceMs = COALESCE_MS): History<T> {
  if (Object.is(next, h.present)) return h;
  const coalesce = h.past.length > 0 && now - h.lastTs < coalesceMs;
  const past = coalesce ? h.past : [...h.past, h.present].slice(-MAX_HISTORY);
  return { past, present: next, future: [], lastTs: now };
}

export function undoHistory<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  const prev = h.past[h.past.length - 1];
  return {
    past: h.past.slice(0, -1),
    present: prev,
    future: [h.present, ...h.future].slice(0, MAX_HISTORY),
    lastTs: 0,
  };
}

export function redoHistory<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  const nxt = h.future[0];
  return {
    past: [...h.past, h.present].slice(-MAX_HISTORY),
    present: nxt,
    future: h.future.slice(1),
    lastTs: 0,
  };
}

export const canUndo = <T>(h: History<T>): boolean => h.past.length > 0;
export const canRedo = <T>(h: History<T>): boolean => h.future.length > 0;
