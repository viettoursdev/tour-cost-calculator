import { useCallback, useRef, useState } from 'react';
import {
  canRedo as cr, canUndo as cu, initHistory, pushHistory, redoHistory, undoHistory,
  type History,
} from './history';

export interface UseHistoryState<T> {
  state: T;
  set: (value: T | ((prev: T) => T)) => void;
  reset: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Như `useState<T>` nhưng có undo/redo (gộp thao tác gõ nhanh). `set` nhận
 * value | updater. `reset` đặt giá trị mới & xoá lịch sử (khi mở entity khác).
 */
export function useHistoryState<T>(initial: T): UseHistoryState<T> {
  const [h, setH] = useState<History<T>>(() => initHistory(initial));
  const hRef = useRef(h);
  hRef.current = h;

  const set = useCallback((value: T | ((prev: T) => T)) => {
    setH((cur) => {
      const next = typeof value === 'function' ? (value as (p: T) => T)(cur.present) : value;
      return pushHistory(cur, next);
    });
  }, []);

  const reset = useCallback((next: T) => { setH(initHistory(next)); }, []);
  const undo = useCallback(() => setH((cur) => undoHistory(cur)), []);
  const redo = useCallback(() => setH((cur) => redoHistory(cur)), []);

  return { state: h.present, set, reset, undo, redo, canUndo: cu(h), canRedo: cr(h) };
}
